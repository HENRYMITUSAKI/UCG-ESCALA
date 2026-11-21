import {
  staffPost, fugulinScore, fugulinCategory, FUGULIN_CATEGORIES, BEDS, POST_A, POST_B, HOME_ROOMS, TRANSITION_A, TRANSITION_B,
  bathApplies, bedInfo, canAttend, generateSchedule, redistributeDepartingPatients, statistics, validateSchedule, bathLimit, techCount, ESCALA_1_BEDS
} from './engine.js';
import { nurseCount, nurseRoles, nurseNames, groupedBeds, generateNurseAssignment, normalizeStaffSlots, remapAssignment, remapStaffAfterRemoval, addStaffMember, MAX_TEAM_MEMBERS, printScaleForPage } from './planning.js';

const STORAGE='escala-enfermagem-diaria-v1';
const OPTIONS={
  occupied:'Ocupado',vacant:'Vago',blocked:'Bloqueado',
  'isolation-blocked':'Bloq. por isolamento'
};
const ISOLATIONS={none:'Sem isolamento',contact:'Contato',droplet:'Gotículas',airborne:'Aerossóis'};
const ROLES={tech:'Técnico(a)',support:'Técnico(a) de apoio',nurse:'Enfermeiro(a) de cobertura'};
const PCR_ROLES=['A','B','C','D'];
const VIEWS={schedule:['▦','Escala do plantão'],edit:['✎','Revisar para impressão'],beds:['▤','Mapa de leitos'],staff:['♧','Equipe'],history:['◷','Histórico'],rules:['⚙','Regras e dados']};
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
function today(){const t=new Date();return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;}
function dateBR(s){if(!s)return '—';const p=s.split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s;}
function clone(x){return JSON.parse(JSON.stringify(x));}
function statusLabel(s){return OPTIONS[s]||'Desconhecido';}
function safeLocalStore(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch(e){ui.storageProblem=true;}}
function pcrRole(value){return PCR_ROLES.includes(value)?value:'';}
function supportStaff(value){return (Array.isArray(value)?value:[{}]).map((s,i)=>({id:i+1,
  name:typeof s?.name==='string'?s.name.slice(0,85):'',duty:typeof s?.duty==='string'?s.duty.slice(0,160):'',pcrRole:pcrRole(s?.pcrRole)}));}
// Persist text on input as well as change. Opening a dialog or choosing a PCR
// role must not discard text that the user has just entered on a touch screen.
function saveTextField(x){
  if(x.dataset.support!==undefined&&['name','duty'].includes(x.dataset.supportField)){
    const row=state.supportStaff[Number(x.dataset.support)];if(!row)return false;
    row[x.dataset.supportField]=x.value.slice(0,x.dataset.supportField==='name'?85:160);
  }else if(x.dataset.nurseName)state.nurses[x.dataset.nurseName]=x.value.slice(0,85);
  else if(x.dataset.staff&&['name','duty'].includes(x.dataset.staffField)){
    const person=state.staff.find(s=>s.slot===Number(x.dataset.staff));if(!person)return false;
    person[x.dataset.staffField]=x.value.slice(0,x.dataset.staffField==='name'?85:160);
  }else if(['responsible','printTitle','printNotes'].includes(x.dataset.global)){
    const limit={responsible:90,printTitle:100,printNotes:650}[x.dataset.global];state[x.dataset.global]=x.value.slice(0,limit);
  }else return false;
  safeLocalStore();return true;
}
function pcrSelect(value,attributes,label){return `<label class="label-field pcr-field">Função na PCR<select class="mini-select" ${attributes} aria-label="${esc(label)}"><option value="">Não definida</option>${PCR_ROLES.map(role=>`<option value="${role}" ${value===role?'selected':''}>${role}</option>`).join('')}</select></label>`;}
function pcrBadge(value){return pcrRole(value)?`<span class="pcr-badge pcr-${value}">PCR · ${value}</span>`:'';}
function defaultStaff(count=9){return Array.from({length:count},(_,i)=>({
  post:[1,2,3,4,9].includes(i+1)?'A':'B',slot:i+1,name:`Profissional ${i+1}`,active:i<7,role:'tech',
  pcrRole:'',duty:'',
  woman:[2,5,6].includes(i+1),sex:[2,5,6].includes(i+1)?'female':'male',canBedridden:i+1!==3,canEnteral:i+1!==3
}));}
function defaultBeds(demo=true){
  const vacant=new Set(['201B','204B','208B','210B','212A','214B','217B','220B','224A']);
  const blocked=new Set(['205B','216A']);
  const isolationBlocked=new Set(['218B','223B']);
  const bedridden=new Set(['202A','207B','209A','211B','215B','219A','221B','224B']);
  const enteral=new Set(['206B','209B','220A']);
  const womenOnly=new Set(['202B']);
  const iso=new Set(['211A','221A']);
  return BEDS.map(x=>({id:x.id,sexRestriction:demo&&womenOnly.has(x.id)?'female':'any',status:!demo?'vacant':vacant.has(x.id)?'vacant':blocked.has(x.id)?'blocked':isolationBlocked.has(x.id)?'isolation-blocked':'occupied',
    bedridden:demo&&bedridden.has(x.id),enteral:demo&&enteral.has(x.id),surgicalPrep:false,womenOnly:demo&&womenOnly.has(x.id),
    isolation:demo&&iso.has(x.id)?'contact':'none',bath:'auto',fugulin:null}));
}
function defaultState(demo=true){return {
  version:1,manualOverride:false,printTitle:'Escala diária de enfermagem',printNotes:'',includeVacancies:true,date:today(),shift:'day',staff:defaultStaff(),beds:defaultBeds(demo),
  nurseCount:4,nurses:nurseNames(),nurseOverrides:{},supportStaff:supportStaff(),
  assignment:{},history:[],stale:true,generatedAt:null,demo,responsible:'',lastError:[]
};}
function loadState(){
  try {
    const raw=JSON.parse(localStorage.getItem(STORAGE));
    if(!raw||raw.version!==1||!Array.isArray(raw.beds)||!Array.isArray(raw.staff))return defaultState();
    const d=defaultState();const savedBeds=new Map(raw.beds.map(x=>[x.id,x]));
    const savedStaff=new Map(raw.staff.map(x=>[Number(x.slot),x]));
    const lastSlot=Math.max(9,...[...savedStaff.keys()].filter(slot=>Number.isInteger(slot)&&slot>0&&slot<=MAX_TEAM_MEMBERS));
    const normalized=normalizeStaffSlots(defaultStaff(lastSlot).map(s=>{const old=savedStaff.get(s.slot)||{};return {...s,...old,sex:old.sex || (old.woman?'female':'male'),slot:s.slot,pcrRole:pcrRole(old.pcrRole),duty:typeof old.duty==='string'?old.duty.slice(0,160):''};}));
    return {...d,...raw,
      nurseCount:nurseCount(raw.nurseCount),nurses:nurseNames(raw.nurses),
      nurseOverrides:raw.nurseOverrides&&typeof raw.nurseOverrides==='object'&&!Array.isArray(raw.nurseOverrides)?raw.nurseOverrides:{},
      beds:d.beds.map(b=>{const old=savedBeds.get(b.id)||{};return {...b,...old,surgicalPrep:old.surgicalPrep===true,sexRestriction:old.sexRestriction || (old.womenOnly?'female':'any')};}),
      staff:normalized.staff,supportStaff:supportStaff(raw.supportStaff),
      history:Array.isArray(raw.history)?raw.history.slice(0,20):[],
      assignment:remapAssignment(raw.assignment,normalized.slotMap),
      lastError:Array.isArray(raw.lastError)?raw.lastError:[]
    };
  }catch(e){return defaultState();}
}
let state=loadState();
const ui={view:'schedule',modal:null,filter:'',bedFilter:'all',toast:null,storageProblem:false,draftAssignment:null,draftDirty:false,selectedBed:null,selectedNurseBed:null,selectedBeds:new Set(),openBeds:new Set()};
function record(action,reason=''){
  state.history.unshift({id:Date.now()+Math.random(),when:new Date().toISOString(),action,reason,
    state:{date:state.date,shift:state.shift,staff:clone(state.staff),beds:clone(state.beds),
      nurseCount:state.nurseCount,nurses:clone(state.nurses),nurseOverrides:clone(state.nurseOverrides),supportStaff:clone(state.supportStaff),
      assignment:clone(state.assignment),generatedAt:state.generatedAt,stale:state.stale,manualOverride:state.manualOverride,responsible:state.responsible,printTitle:state.printTitle,printNotes:state.printNotes,includeVacancies:state.includeVacancies}});
  state.history=state.history.slice(0,20);
}
function commit(){safeLocalStore();render();}
function toast(message,error=false){ui.toast={message,error};render();clearTimeout(toast.timer);toast.timer=setTimeout(()=>{ui.toast=null;render();},4300);}
function occupied(){return state.beds.filter(b=>b.status==='occupied');}
function nurseRows(){
  const assignment=generateNurseAssignment(state.beds,state.nurseCount,state.nurseOverrides);
  return nurseRoles(state.nurseCount).map(role=>{
    const beds=state.beds.filter(b=>assignment[b.id]===role.id);
    return {...role,name:state.nurses[role.id]||'',patients:beds.filter(b=>b.status==='occupied').map(b=>b.id),
      vacancies:beds.filter(b=>b.status==='vacant').map(b=>b.id),load:beds.length};
  });
}
function getStats(assignment=state.assignment){return statistics(assignment,state.beds,state.staff,state.shift);}
function totals(){const all=state.beds,active=state.staff.filter(s=>s.active);
  return {occupied:occupied().length,vacant:all.filter(b=>b.status==='vacant').length,
    blocked:all.filter(b=>b.status==='blocked').length,
    isolationBlocked:all.filter(b=>b.status==='isolation-blocked').length,
    baths:occupied().filter(b=>bathApplies(b,state.shift)).length,
    surgicalPreps:occupied().filter(b=>b.surgicalPrep).length,
    workers:active.length,
    unassigned:occupied().filter(b=>!active.some(s=>s.slot===Number(state.assignment[b.id]))).length};
}
function shiftLabel(){return state.shift==='day'?'Diurno · quartos pares':'Noturno · quartos ímpares';}
function statusText(){
  if(state.stale)return ['pill-amber','Escala precisa ser recalculada'];
  const v=validateSchedule(state,state.assignment,{manual:!!state.manualOverride});
  if(v.errors.length)return ['pill-red','Distribuição pendente'];
  if(state.manualOverride)return ['pill-amber','Personalização manual — conferir'];
  if(v.warnings.length)return ['pill-amber','Revisão recomendada'];
  return ['pill-green','Distribuição sem alertas'];
}
function header(){const [cls,status]=statusText();return `
  <div class="topline"><span class="crumb">Enfermagem / Organização do plantão</span><span class="demo-flag">${state.demo?'Demonstração · dados fictícios':'Escala diária'} <b>v1.9</b></span></div>
  <div class="page-header"><div><p class="eyebrow">Gestão assistencial</p><h1>Escala de enfermagem</h1><p class="subtitle">Equipe, pacientes e cuidados em uma visão do plantão.</p></div><span class="pill ${cls}">${esc(status)}</span></div>
  <div class="control-bar no-print"><div class="controls-left">
    <label class="label-field">Data do plantão<input class="control" type="date" data-global="date" value="${esc(state.date)}"></label>
    <label class="label-field">Turno<select class="control" data-global="shift"><option value="day" ${state.shift==='day'?'selected':''}>Diurno</option><option value="night" ${state.shift==='night'?'selected':''}>Noturno</option></select></label>
    <label class="label-field responsible-field">Enfermeiro(a) responsável<input class="control" type="text" data-global="responsible" maxlength="90" value="${esc(state.responsible)}" placeholder="Nome para impressão"></label>
  </div></div>
  <div class="action-bar no-print"><div class="toolbar-actions"><button class="btn btn-primary" data-action="resize-modal">Redimensionamento</button><button class="btn" data-action="generate">Gerar escala</button><button class="btn btn-quiet" data-action="preserve">Redistribuir</button></div><div class="toolbar-actions"><button class="btn btn-dark" data-action="print">Revisar / imprimir</button><button class="btn btn-quiet" data-action="csv">Exportar CSV</button></div></div>`;}

function metrics(){const t=totals(),values=[
 ['Pacientes',t.occupied,`${t.vacant} vagos · ${t.blocked+t.isolationBlocked} bloqueados`],
 ['Equipe presente',t.workers,'profissionais na distribuição'],
 ['Banhos previstos',t.baths,`${t.surgicalPreps} preparos cirúrgicos no turno`],
 ['Aguardando atribuição',t.unassigned,t.unassigned?'leitos destacados para revisão':'todos os pacientes com responsável']
];return `<section class="metrics no-print">${values.map(([label,num,foot],i)=>`<article class="metric ${i===3&&t.unassigned?'metric-pending':''}"><span class="metric-head">${esc(label)}</span><strong class="metric-value">${num}</strong><span class="metric-foot">${esc(foot)}</span></article>`).join('')}</section>`;}

function alerts(){
  const checked=validateSchedule(state,state.assignment,{manual:!!state.manualOverride});
  const messages=[...new Set([...(state.lastError||[]),...checked.errors,...checked.warnings])];
  const missing=totals().unassigned;
  const title=state.stale?'A distribuição precisa ser atualizada':missing?`${missing} paciente${missing===1?'':'s'} aguardando atribuição`:messages.length?'Há pontos para conferir na escala':'';
  let html=title?`<div class="notice warning"><span class="notice-icon">!</span><div><strong>${esc(title)}</strong><p>${state.stale?'Gere a escala ou use o redimensionamento para aplicar as alterações.':missing?'Os leitos pendentes estão destacados na distribuição para ajuste manual.':'A distribuição foi aproveitada. Confira as observações antes de imprimir.'}</p>${messages.length?`<details class="alert-details"><summary>Ver motivos e alertas (${messages.length})</summary><ul>${messages.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}</div></div>`:'';
  if(ui.storageProblem)html+=`<div class="notice warning"><strong>Não foi possível salvar neste navegador. Exporte o backup JSON.</strong></div>`;
  return html;
}

function bedTags(ids,team='tech'){
  const button=(id,short=false)=>{
  const b=state.beds.find(x=>x.id===id);
  const flags=[b?.bedridden?'Acamado':null,b?.surgicalPrep?'Preparo cirúrgico':null,b?.enteral?'SNE/SNG':null,b?.sexRestriction==='female'?'Somente profissional mulher':b?.sexRestriction==='male'?'Somente profissional homem':null,b?.isolation!=='none'?'Em isolamento':null].filter(Boolean);
  const selected=team==='nurse'?ui.selectedNurseBed:ui.selectedBed;
  return `<button class="bed-tag ${b?.isolation!=='none'&&b?.status==='occupied'?'bed-iso':''} ${b?.surgicalPrep&&b?.status==='occupied'?'bed-prep':''} ${short?'bed-suffix':''} no-print-action" draggable="true" data-team="${team}" data-action="${team==='nurse'?'select-nurse-bed':'select-bed'}" aria-label="Leito ${esc(id)}${team==='nurse'?' · enfermeiro':''}" aria-pressed="${selected===id}" data-id="${esc(id)}" title="${esc(id+' · '+(flags.join(' · ')||'Clique para trocar o responsável'))}">${esc(short?id.slice(3):id)}${b?.isolation!=='none'&&b?.status==='occupied'?' ◈':''}${b?.surgicalPrep&&b?.status==='occupied'?' <small class="prep-marker">PC</small>':''}</button>`;
  };
  return ids.length?groupedBeds(ids).map(label=>label.endsWith('AB')?
    `<span class="room-bed-group"><span class="room-bed-number">${label.slice(0,3)}</span>${button(label.slice(0,3)+'A',true)}${button(label.slice(0,3)+'B',true)}</span>`:button(label)).join(''):'<span class="text-muted">—</span>';
}
function nursePanel(){const rows=nurseRows();return `<section class="panel nurse-panel" id="nurse-panel"><div class="panel-header"><div><h2>Enfermeiros do plantão</h2><p class="panel-subtitle">Pacientes e possíveis admissões por área de cobertura.</p></div><div class="row-actions"><label class="label-field">Enfermeiros presentes<select class="mini-select" data-global="nurseCount">${[2,3,4].map(n=>`<option value="${n}" ${state.nurseCount===n?'selected':''}>${n} enfermeiros</option>`).join('')}</select></label><button class="btn btn-sm" data-action="nurse-rebalance">Reequilibrar</button></div></div>
  <div class="nurse-grid" style="--nurse-columns:${rows.length}">${rows.map(r=>`<article class="nurse-card" data-drop-nurse="${r.id}"><div class="nurse-card-heading"><button class="destination nurse-destination" data-action="move-nurse-bed" data-nurse-id="${r.id}">${esc(r.label)}</button><span class="coverage-count">${r.load} leitos</span></div><input class="text-input nurse-name-input" aria-label="Nome do ${esc(r.label.toLowerCase())}" data-nurse-name="${r.id}" maxlength="85" value="${esc(r.name)}" placeholder="Nome do enfermeiro"><div class="nurse-bed-section"><small>${r.patients.length} pacientes</small><div class="assignments">${bedTags(r.patients,'nurse')}</div></div><details class="nurse-vacancies"><summary>${r.vacancies.length} vagos / possíveis admissões</summary><div class="assignments">${bedTags(r.vacancies,'nurse')}</div></details></article>`).join('')}</div><div class="nurse-help form-note">${ui.selectedNurseBed?`Leito ${esc(ui.selectedNurseBed)} selecionado: clique no enfermeiro de destino.`:'Para transferir, arraste um leito ou selecione o leito e o enfermeiro de destino.'}</div></section>`;}

function schedulePanel(assignment=state.assignment){const rows=getStats(assignment),t=totals();const occupiedById=occupied();const assignedIds=new Set(Object.keys(assignment).filter(id=>state.staff.some(s=>s.active&&s.slot===Number(assignment[id]))));
  const missing=occupiedById.filter(b=>!assignedIds.has(b.id)).map(b=>b.id);
  const body=rows.map(r=>{
    const a=r.beds.filter(id=>bedInfo(id).post==='A');const b=r.beds.filter(id=>bedInfo(id).post==='B');
    return `<tr data-drop-slot="${r.slot}" class="drop-row"><td><button class="person-title destination" data-action="move-selected" data-slot="${r.slot}">${esc(r.name)}</button><span class="person-meta">Escala ${r.slot} · Posto ${staffPost(state.staff.find(s=>s.slot===r.slot))}</span>
    ${r.role!=='tech'?`<span class="pill pill-amber">${esc(ROLES[r.role])}</span>`:''}${pcrBadge(state.staff.find(s=>s.slot===r.slot)?.pcrRole)}${ui.view==='edit'?pcrSelect(state.staff.find(s=>s.slot===r.slot)?.pcrRole,`data-staff="${r.slot}" data-staff-field="pcrRole"`,`PCR da Escala ${r.slot}`):''}</td>
    <td class="schedule-beds">${a.length?`<div class="post-bed-line"><span class="post-letter">A</span><div class="assignments">${bedTags(a)}</div></div>`:''}${b.length?`<div class="post-bed-line"><span class="post-letter">B</span><div class="assignments">${bedTags(b)}</div></div>`:''}${!a.length&&!b.length?'<span class="text-muted">—</span>':''}</td>
    <td><span class="num">${r.patients}</span> ${r.posts.A>0&&r.posts.B>0?'<span class="pill pill-teal">Compartilhado</span>':''}</td>
    <td><span class="num">${r.baths}</span>${r.baths>3?' <span class="pill pill-amber">exceção</span>':r.baths===3?' <span class="pill">padrão</span>':''}</td>
    <td><span class="num">${r.bedridden}</span></td><td><span class="num">${r.surgicalPreps}</span></td></tr>`;
  }).join('');
  return `<section class="panel print-panel" id="schedule-panel">
    <div class="panel-header"><div><h2>Distribuição por profissional</h2>
      <p class="panel-subtitle">Selecione o leito e o profissional de destino para ajustar. Os totais acompanham cada transferência.</p></div>
      <span class="pill ${missing.length?'pill-amber':'pill-teal'}">${missing.length?`${missing.length} sem responsável`:`${t.occupied} pacientes contabilizados`}</span></div>
    ${rows.length?`<div class="table-wrap"><table aria-label="Distribuição dos pacientes"><thead><tr>
      <th>Profissional / Escala</th><th>Leitos por posto</th><th>Pacientes</th><th>Banhos</th><th>Acamados</th><th>Preparo cirúrgico</th>
    </tr></thead><tbody>${body}</tbody></table></div>`:`<div class="empty"><strong>Nenhum profissional ativo</strong>Ative a equipe antes de distribuir pacientes.</div>`}
    ${missing.length?`<div class="panel-body"><div class="pending-assignment"><span>!</span><div><strong>Leitos ocupados sem responsável</strong>
      <div>${bedTags(missing)}</div></div></div></div>`:''}
    <div class="panel-body no-print"><div class="split-sum"><span class="section-kicker">Legenda</span>
      <span class="bed-tag">202A</span><span class="text-muted">Leito ocupado</span>
      <span class="bed-tag bed-iso">211A ◈</span><span class="text-muted">Paciente em isolamento (revisar precauções)</span>
      <span class="bed-tag bed-prep">PC</span><span class="text-muted">Preparo cirúrgico</span><span class="pill pill-teal">Compartilhado</span><span class="text-muted">Atende ambos os postos</span></div></div>
  </section>`;}
function reportPanel(){
  const postItems=post=>{
    const list=state.beds.filter(b=>bedInfo(b.id).post===post);
    const lines=[['vacant','Leitos vagos',list.filter(b=>b.status==='vacant')],
      ['blocked','Leitos bloqueados',list.filter(b=>b.status==='blocked')],
      ['isolation','Bloqueados por isolamento',list.filter(b=>b.status==='isolation-blocked')]];
    return `<div class="report-col"><h3>Posto ${post} <span class="pill">${post==='A'?26:20} leitos físicos</span></h3>
      ${lines.map(([cls,title,values])=>`<div class="report-line ${cls}"><strong>${esc(title)} (${values.length})</strong>
      <div class="ids">${values.length?esc(values.map(v=>v.id).join(' · ')):'Nenhum'}</div></div>`).join('')}</div>`;
  };
  return `<section class="panel print-panel" id="report-panel"><div class="panel-header"><div><h2>Relação de leitos indisponíveis e vagos</h2>
    <p class="panel-subtitle">Listagem escrita por posto. Leitos vagos, bloqueados e bloqueados por isolamento não entram na escala.</p></div>
    <span class="pill pill-teal">Atualização automática</span></div>
    <div class="panel-body"><div class="report-grid">${postItems('A')}${postItems('B')}</div></div></section>`;
}
function supportPanel(){
  if(ui.view==='schedule'){
    const rows=state.supportStaff.filter(s=>s.name.trim()||s.duty.trim()||s.pcrRole);
    return `<section class="panel support-panel"><div class="panel-header"><h2>Técnicos de apoio</h2><button class="btn btn-sm" data-view="staff">Editar na equipe</button></div><div class="support-summary">${rows.length?rows.map(s=>`<div><strong>${esc(s.name||'Nome não preenchido')}</strong><span>${esc(s.duty||'Função em branco')}</span>${pcrBadge(s.pcrRole)}</div>`).join(''):'<p class="form-note">Os apoios podem ser preenchidos na Equipe ou na revisão da impressão.</p>'}</div></section>`;
  }
  return `<section class="panel support-panel" id="support-panel"><div class="panel-header"><div><h2>Técnicos de apoio</h2><p class="panel-subtitle">Preencha o nome e a função livremente. Estes apoios constam na impressão e não recebem pacientes automaticamente.</p></div><button class="btn btn-sm" data-action="support-add">Adicionar apoio</button></div><div class="panel-body"><div class="support-list">
  ${state.supportStaff.map((s,i)=>`<div class="support-row"><label class="label-field">Nome do técnico<input class="text-input" data-support="${i}" data-support-field="name" maxlength="85" value="${esc(s.name)}" placeholder="Nome do técnico de apoio"></label><label class="label-field">Função<input class="text-input" data-support="${i}" data-support-field="duty" maxlength="160" value="${esc(s.duty)}" placeholder="Preencha a função"></label>${pcrSelect(s.pcrRole,`data-support="${i}" data-support-field="pcrRole"`,`PCR do apoio ${i+1}`)}<button class="btn btn-sm" data-action="support-remove" data-index="${i}" aria-label="Remover apoio ${i+1}">Remover</button></div>`).join('')||'<p class="form-note">Nenhum técnico de apoio cadastrado.</p>'}
  </div></div></section>`;}
function scheduleView(){return `${metrics()}${alerts()}<div class="row-actions no-print review-cta"><button class="btn btn-primary" data-action="edit-open">✎ Personalizar escala antes de imprimir</button></div>${schedulePanel()}${nursePanel()}${supportPanel()}`;}
function editorView(){
  const check=validateSchedule(state,state.assignment,{manual:true});
  return `<div class="no-print review-actions"><button class="btn btn-primary" data-action="finalize-print">⎙ Imprimir / salvar em PDF</button><span class="form-note">Uma folha A4 em paisagem, com ajuste automático para toda a equipe e os apoios. ${ui.selectedBed?`Leito ${esc(ui.selectedBed)} selecionado — clique na escala de destino.`:'Movimentos salvos automaticamente.'}</span></div>
    ${alerts()}${nursePanel()}${schedulePanel()}${supportPanel()}
    <details class="panel no-print"><summary>Alertas para conferir (${check.warnings.length})</summary><div class="panel-body">${check.warnings.length?check.warnings.map(x=>`<p>${esc(x)}</p>`).join(''):'Sem alertas.'}</div></details>
    <details class="panel no-print"><summary>Título e observações da impressão</summary><div class="panel-body print-editor-fields">
    <label class="label-field">Título<input class="text-input" data-global="printTitle" value="${esc(state.printTitle)}" maxlength="100"></label>
    <label class="label-field">Observações<textarea class="text-input" data-global="printNotes" maxlength="650">${esc(state.printNotes)}</textarea></label>
    <label><input type="checkbox" data-global="includeVacancies" ${state.includeVacancies?'checked':''}> Incluir vagos e bloqueados</label></div></details>`;
}
function fugulinPanel(){
  return `<section class="panel print-panel"><div class="panel-header"><h2>Pacientes por classificação de Fugulin</h2></div><div class="panel-body">${FUGULIN_CATEGORIES.map(c=>{const beds=occupied().filter(b=>fugulinCategory(b)===c);return `<p><strong>${c} (${beds.length}):</strong> ${beds.map(b=>b.id).join(', ')||'Nenhum'}</p>`;}).join('')}</div></section>`;
}

function printedBeds(ids){
  const groups=new Map();
  for(const id of ids){const bed=state.beds.find(b=>b.id===id);const suffix=(bed?.isolation!=='none'?'*':'')+(bed?.surgicalPrep?' (PC)':'');if(!groups.has(suffix))groups.set(suffix,[]);groups.get(suffix).push(id);}
  return [...groups].flatMap(([suffix,list])=>groupedBeds(list).map(id=>id+suffix))
    .sort((a,b)=>parseInt(a)-parseInt(b)||a.localeCompare(b)).join(' · ')||'—';
}
function printSheet(){
  const printOrder=['A','A2','AB','B','B2'];
  const rows=getStats(),nurses=nurseRows().sort((a,b)=>printOrder.indexOf(a.id)-printOrder.indexOf(b.id)),t=totals();
  const missing=occupied().filter(b=>!state.staff.some(s=>s.active&&s.slot===Number(state.assignment[b.id]))).map(b=>b.id);
  const byPost=ids=>['A','B'].map(post=>{const list=ids.filter(id=>bedInfo(id).post===post);return list.length?`<span><b>${post}:</b> ${esc(printedBeds(list))}</span>`:'';}).filter(Boolean).join('');
  const unavailable=post=>['vacant','blocked','isolation-blocked'].map(status=>{
    const ids=state.beds.filter(b=>bedInfo(b.id).post===post&&b.status===status).map(b=>b.id);
    return `<div><b>${status==='vacant'?'Vagos':status==='blocked'?'Bloqueados':'Bloq. isolamento'} (${ids.length}):</b> ${esc(groupedBeds(ids).join(' · ')||'Nenhum')}</div>`;
  }).join('');
  return `<section class="print-sheet" id="print-sheet" aria-hidden="true"><div class="print-content">
    <header class="sheet-header"><div><h1>${esc(state.printTitle||'Escala diária de enfermagem')}</h1><p><strong>${esc(dateBR(state.date))}</strong> · ${state.shift==='day'?'Diurno':'Noturno'} · ${t.occupied} pacientes · ${rows.length} técnicos / apoios · ${nurses.length} enfermeiros${state.demo?' · DEMONSTRAÇÃO':''}</p></div><div class="sheet-responsible"><b>Enfermeiro(a) responsável</b><span>${esc(state.responsible||'________________________________')}</span></div></header>
    <section class="sheet-box sheet-nurses"><h2>Enfermeiros do plantão</h2><div class="sheet-nurse-grid" style="grid-template-columns:repeat(${nurses.length},minmax(0,1fr))">
    ${nurses.map(n=>`<article class="sheet-nurse"><div class="sheet-role">${esc(n.label)} · ${n.patients.length} pacientes / ${n.vacancies.length} vagos</div><strong class="sheet-name">${esc(n.name||'Nome não informado')}</strong>
      <div class="sheet-bed-lines"><b>Pacientes</b> ${byPost(n.patients)||'—'}</div><div class="sheet-nurse-vacant"><b>Vagos</b> ${esc(groupedBeds(n.vacancies).join(' · ')||'Nenhum')}</div></article>`).join('')}</div></section>
    <section class="sheet-box sheet-tech"><h2>Distribuição dos técnicos e apoios</h2><table aria-label="Escala para impressão"><colgroup><col style="width:5%"><col style="width:25%"><col style="width:40%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:6%"></colgroup><thead><tr><th>Esc.</th><th>Nome</th><th>Leitos por posto</th><th>Pac.</th><th>Banhos</th><th>Acam.</th><th>Prep.</th><th>PCR</th></tr></thead><tbody>
    ${rows.map(r=>{const person=state.staff.find(s=>s.slot===r.slot);return `<tr><td class="sheet-slot">${r.slot}</td><td><strong class="sheet-name">${esc(r.name)}</strong>${r.role!=='tech'?`<small>${esc(ROLES[r.role])}${person.duty?` · ${esc(person.duty)}`:''}</small>`:''}</td><td class="sheet-assigned">${byPost(r.beds)||'—'}</td><td>${r.patients}</td><td>${r.baths}</td><td>${r.bedridden}</td><td>${r.surgicalPreps}</td><td class="sheet-pcr">${esc(pcrRole(person.pcrRole))}</td></tr>`;}).join('')||'<tr><td colspan="8">Nenhum técnico ou apoio ativo.</td></tr>'}</tbody></table>
    ${missing.length?`<div class="sheet-pending"><b>Sem técnico (${missing.length}):</b> ${esc(printedBeds(missing))}</div>`:''}</section>
    ${state.supportStaff.length?`<section class="sheet-box sheet-support"><h2>Técnicos de apoio</h2><table aria-label="Técnicos de apoio para impressão"><colgroup><col style="width:38%"><col style="width:54%"><col style="width:8%"></colgroup><thead><tr><th>Nome do técnico</th><th>Função</th><th>PCR</th></tr></thead><tbody>${state.supportStaff.map(s=>`<tr><td>${esc(s.name)||'<span class="sheet-blank"></span>'}</td><td>${esc(s.duty)||'<span class="sheet-blank"></span>'}</td><td class="sheet-pcr">${esc(s.pcrRole)}</td></tr>`).join('')}</tbody></table></section>`:''}
    <div class="sheet-summaries ${state.includeVacancies?'':'sheet-only-fugulin'}"><section class="sheet-box sheet-fugulin"><h2>Fugulin · leitos ocupados</h2>${FUGULIN_CATEGORIES.map(c=>{const ids=occupied().filter(b=>fugulinCategory(b)===c).map(b=>b.id);return `<div><b>${esc(c)} (${ids.length}):</b> ${esc(groupedBeds(ids).join(' · ')||'Nenhum')}</div>`;}).join('')}</section>
    ${state.includeVacancies?`<section class="sheet-box sheet-vacancies"><h2>Vagos e bloqueados por posto</h2><div class="sheet-vacancy-grid">${['A','B'].map(post=>`<div><h3>Posto ${post}</h3>${unavailable(post)}</div>`).join('')}</div></section>`:''}</div>
    ${state.printNotes?.trim()?`<section class="sheet-box sheet-notes"><b>Observações:</b> ${esc(state.printNotes.trim())}</section>`:''}
    <footer class="sheet-footer"><div>* Precaução adicional · PC: preparo cirúrgico · PCR: função A/B/C/D definida pelo enfermeiro. ${state.manualOverride?'Distribuição ajustada manualmente. ':''}${state.stale?'Distribuição alterada: conferir atualização. ':''}${state.lastError?.length?'Distribuição com pendências: revisar. ':''}Escala sujeita à conferência do enfermeiro responsável.</div><div class="sheet-signatures"><span>Conferido por: ___________________________________</span><span>Assinatura: ___________________________________</span><span>${esc(new Date().toLocaleString('pt-BR'))}</span></div></footer>
  </div></section>`;
}
function fitPrintSheet(){
  const sheet=$('#print-sheet');if(!sheet)return;
  const content=sheet.querySelector('.print-content');if(!content)return;
  // Leave a physical reserve inside A4 landscape; only the complete measured
  // sheet is scaled. CSS transform keeps screen and print layout consistent.
  sheet.style.width='280mm';sheet.style.height='190mm';
  const width=(sheet.clientWidth||280*96/25.4)-3,height=(sheet.clientHeight||190*96/25.4)-6;
  sheet.style.setProperty('--print-scale','1');sheet.style.setProperty('--print-row-extra','0px');
  const measure=naturalWidth=>{content.style.width=`${naturalWidth}px`;return {width:Math.max(content.scrollWidth||0,content.offsetWidth||naturalWidth),height:Math.max(content.scrollHeight,content.offsetHeight||0)};};
  const scale=Math.floor(printScaleForPage(width,height,measure)*100000)/100000;
  content.style.width=`${width/scale}px`;
  const rows=content.querySelectorAll('.sheet-tech tbody tr').length,spare=height/scale-content.scrollHeight;
  if(spare>0&&rows)sheet.style.setProperty('--print-row-extra',`${Math.min(3,spare/(rows*2))}px`);
  if(content.scrollHeight*scale>height)sheet.style.setProperty('--print-row-extra','0px');
  sheet.style.setProperty('--print-scale',String(scale));
}

function roomCards(post){
  const rooms=(post==='A'?POST_A:POST_B);
  const filter=ui.filter.trim().toLowerCase();
  return rooms.filter(room=>{
    const list=state.beds.filter(x=>Number(x.id.slice(0,3))===room);
    if(filter&&!list.some(x=>x.id.toLowerCase().includes(filter)))return false;
    if(ui.bedFilter==='all')return true;
    return list.some(b=>b.status===ui.bedFilter);
  }).map(room=>{
    const two=state.beds.filter(x=>Number(x.id.slice(0,3))===room);
    const occupiedCount=two.filter(b=>b.status==='occupied').length;
    const inner=two.map(b=>{
      const active=b.status==='occupied';
      return `<div class="bed-editor ${active?'':b.status==='isolation-blocked'?'isolated-locked':'hollow'}">
        <div class="bed-editor-top"><strong>${esc(b.id)}</strong>
          <label class="batch-check"><input type="checkbox" data-select-bed="${b.id}" ${ui.selectedBeds.has(b.id)?'checked':''} aria-label="Selecionar ${b.id}"> Selecionar</label></div>
          <div class="status-buttons">${Object.entries(OPTIONS).map(([key,label])=>`<button class="status-choice ${b.status===key?'chosen':''}" data-action="bed-status" data-id="${b.id}" data-status="${key}" aria-pressed="${b.status===key}">${label}</button>`).join('')}</div>
        ${active?`<div class="bed-details">
          <div class="flag-grid">
            <label class="label-field">Fugulin (9–36)<input type="number" class="mini-select" min="9" max="36" step="1" data-bed="${b.id}" data-bed-field="fugulin" value="${fugulinScore(b)??''}" placeholder="Não informado"><small>${fugulinCategory(b)}</small></label>
            <label class="checkline"><input type="checkbox" data-bed="${esc(b.id)}" data-bed-field="bedridden" ${b.bedridden?'checked':''}> Acamado</label>
            <label class="checkline"><input type="checkbox" data-bed="${esc(b.id)}" data-bed-field="enteral" ${b.enteral?'checked':''}> Sonda enteral</label>
            <label class="checkline"><input type="checkbox" data-bed="${esc(b.id)}" data-bed-field="surgicalPrep" ${b.surgicalPrep?'checked':''}> Preparo cirúrgico</label>
          </div><details class="bed-extra" data-detail-bed="${b.id}" ${ui.openBeds.has(b.id)?'open':''}><summary>Mais opções${b.sexRestriction!=='any'?' · Restrição por sexo':''}${b.isolation!=='none'?' · '+ISOLATIONS[b.isolation]:''}${b.bath!=='auto'?' · Banho manual':''}</summary><div class="flag-grid">
            <label class="label-field" style="grid-column:1 / -1">Restrição por sexo do profissional<select class="mini-select" data-bed="${esc(b.id)}" data-bed-field="sexRestriction"><option value="any" ${b.sexRestriction==='any'?'selected':''}>Sem restrição</option><option value="female" ${b.sexRestriction==='female'?'selected':''}>Somente mulher</option><option value="male" ${b.sexRestriction==='male'?'selected':''}>Somente homem</option></select></label>
          </div>
          <div class="inline-fields"><label class="label-field">Banho neste turno
            <select class="mini-select" data-bed="${esc(b.id)}" data-bed-field="bath">
              <option value="auto" ${b.bath==='auto'?'selected':''}>Automático (${bathApplies(b,state.shift)?'sim':'não'})</option>
              <option value="yes" ${b.bath==='yes'?'selected':''}>Sim — exceção</option>
              <option value="no" ${b.bath==='no'?'selected':''}>Não — exceção</option>
            </select></label>
            <label class="label-field">Precaução adicional
            <select class="mini-select" data-bed="${esc(b.id)}" data-bed-field="isolation">
              ${Object.entries(ISOLATIONS).map(([key,label])=>`<option value="${key}" ${b.isolation===key?'selected':''}>${esc(label)}</option>`).join('')}
            </select></label></div></details>
        </div>`:`<div class="form-note">${b.status==='vacant'?'Sem paciente — não contabilizado':b.status==='blocked'?'Leito indisponível para admissão':'Leito bloqueado por necessidade de isolamento — não distribuir'}</div>`}
      </div>`;
    }).join('');
    return `<article class="room-card"><div class="room-heading"><h4>Quarto ${room}</h4><small>${occupiedCount} / 2 ocupado(s)</small></div>${inner}</article>`;
  }).join('');
}
function bedsView(){return `${metrics()}<div class="notice"><span>ⓘ</span><div><strong>Diferença importante:</strong> “Bloqueado por isolamento” significa que aquele leito não pode receber paciente e não é distribuído. Para um paciente internado sob precaução, mantenha o leito como <strong>ocupado</strong> e selecione a precaução adicional. Os banhos padrão são previstos pelos quartos pares no diurno e ímpares no noturno.</div></div>
  <div class="batch-toolbar no-print"><strong>${ui.selectedBeds.size} selecionados</strong>
  ${['A','B','all'].map(p=>`<button class="btn btn-sm" data-action="select-post" data-post="${p}">${p==='all'?'Selecionar todos':'Selecionar Posto '+p}</button>`).join('')}
  <button class="btn btn-sm" data-action="clear-selection">Limpar seleção</button>
  <div class="row-actions">${Object.entries(OPTIONS).map(([key,label])=>`<button class="btn btn-sm" data-action="bulk-status" data-status="${key}" ${ui.selectedBeds.size?'':'disabled'}>${label}</button>`).join('')}
  <button class="btn btn-sm" data-action="bulk-flag" data-field="bedridden" data-value="true">Acamados</button><button class="btn btn-sm" data-action="bulk-flag" data-field="bedridden" data-value="false">Não acamados</button>
  <button class="btn btn-sm" data-action="bulk-flag" data-field="surgicalPrep" data-value="true">Preparo cirúrgico</button><button class="btn btn-sm" data-action="bulk-flag" data-field="surgicalPrep" data-value="false">Sem preparo cirúrgico</button></div></div>
  <div class="beds-toolbar no-print"><input id="bed-search" class="text-input" type="search" placeholder="Filtrar leito, ex.: 220A" value="${esc(ui.filter)}" />
    <select id="bed-status-filter" class="control"><option value="all" ${ui.bedFilter==='all'?'selected':''}>Todos os status</option>
    ${Object.entries(OPTIONS).map(([key,value])=>`<option value="${key}" ${ui.bedFilter===key?'selected':''}>${esc(value)}</option>`).join('')}</select>
    <button class="btn btn-sm" data-action="clear-filter">Limpar filtro</button></div>
  ${[['A',26],['B',20]].map(([post,count])=>`<section class="panel"><div class="panel-header"><div><h2>Posto ${post} — ${count} leitos</h2>
    <p class="panel-subtitle">${post==='A'?'Quartos 201–208 e 220–224':'Quartos 209–212 e 214–219 (quarto 213 excluído)'}</p></div>
    <span class="pill">${state.beds.filter(b=>bedInfo(b.id).post===post&&b.status==='occupied').length} pacientes</span></div>
    <div class="panel-body"><div class="room-grid">${roomCards(post)||'<div class="empty">Nenhum quarto atende ao filtro.</div>'}</div></div></section>`).join('')}`;}
function staffView(){const items=state.staff.map(s=>`<div class="staff-card ${s.active?'':'inactive'}">
    <div class="staff-number"><small>Escala</small>${s.slot}</div>
    <div class="staff-controls">
      <label class="label-field">Identificação do profissional <input class="text-input" data-staff="${s.slot}" data-staff-field="name" type="text" maxlength="85" value="${esc(s.name)}" /></label>
      <label class="label-field">Posto de referência<select class="mini-select" data-staff="${s.slot}" data-staff-field="post"><option value="A" ${staffPost(s)==='A'?'selected':''}>Posto A</option><option value="B" ${staffPost(s)==='B'?'selected':''}>Posto B</option></select></label>
      <span class="form-note">Área usual: ${esc((HOME_ROOMS[s.slot]||(staffPost(s)==='A'?POST_A:POST_B)).join(' · '))}</span>
    </div>
    <label class="label-field">Categoria / cobertura
      <select class="mini-select" data-staff="${s.slot}" data-staff-field="role">
      ${Object.entries(ROLES).map(([value,label])=>`<option value="${value}" ${s.role===value?'selected':''}>${esc(label)}</option>`).join('')}
      </select>${s.role==='support'?`<input class="text-input" aria-label="Função do apoio na Escala ${s.slot}" data-staff="${s.slot}" data-staff-field="duty" maxlength="160" value="${esc(s.duty)}" placeholder="Preencha a função">`:''}</label>
    <div class="staff-rules">
      <label class="label-field">Sexo do profissional<select class="mini-select" data-staff="${s.slot}" data-staff-field="sex"><option value="female" ${s.sex==='female'?'selected':''}>Mulher</option><option value="male" ${s.sex==='male'?'selected':''}>Homem</option></select></label>
      <label class="checkline"><input type="checkbox" data-staff="${s.slot}" data-staff-field="canEnteral" ${s.canEnteral?'checked':''}> Pode assumir sonda enteral</label>
      <label class="checkline"><input type="checkbox" data-staff="${s.slot}" data-staff-field="canBedridden" ${s.canBedridden?'checked':''}> Pode assumir pacientes acamados</label>
      <label class="status-toggle"><input type="checkbox" data-staff="${s.slot}" data-staff-field="active" ${s.active?'checked':''}> Presente no plantão</label>
      ${pcrSelect(s.pcrRole,`data-staff="${s.slot}" data-staff-field="pcrRole"`,`PCR da Escala ${s.slot}`)}
    </div>
    <div class="staff-actions">${s.active?`<button class="btn btn-sm btn-danger" data-action="remove-modal" data-slot="${s.slot}">↪ Retirar</button>`:`<span class="pill">Ausente</span>`}</div>
  </div>`).join('');
  return `${metrics()}<div class="notice"><span>ⓘ</span><div>Ative somente os profissionais presentes. Os campos de restrição representam a elegibilidade definida e verificada pela instituição. Se um técnico não puder assumir pacientes acamados ou com sonda enteral, desmarque a competência correspondente. Para incluir alguém durante o plantão, use Adicionar técnico ou Redimensionamento.</div></div>
    ${nursePanel()}<section class="panel"><div class="panel-header"><div><h2>Cadastro e presença dos técnicos e apoios</h2>
      <p class="panel-subtitle">Os profissionais têm restrições independentes; selecione o enfermeiro de cobertura ou técnico de apoio quando necessário.</p></div>
      <div class="row-actions"><button class="btn btn-primary btn-sm" data-action="add-modal">Adicionar técnico</button><button class="btn btn-sm" data-action="resize-modal">Redimensionar equipe</button></div></div><div class="panel-body"><div class="staff-list">${items}</div></div></section>${supportPanel()}`;}
function historyView(){return `<section class="panel"><div class="panel-header"><div><h2>Histórico de versões</h2><p class="panel-subtitle">Snapshots locais antes de gerar, revisar ou alterar a distribuição. Até 20 versões.</p></div>
    <button class="btn btn-sm" data-action="json">↓ Exportar dados JSON</button></div><div class="panel-body">
    ${state.history.length?`<div class="timeline">${state.history.map((h,i)=>`<div class="timeline-item"><div>
      <strong>${esc(h.action)}</strong><span>${esc(new Date(h.when).toLocaleString('pt-BR'))} · ${esc(dateBR(h.state.date))} · ${h.state.shift==='day'?'Diurno':'Noturno'}
      ${h.reason?` · ${esc(h.reason)}`:''}</span></div>
      <button class="btn btn-sm" data-action="restore" data-index="${i}">Restaurar</button></div>`).join('')}</div>`:'<div class="empty"><strong>Sem versões anteriores</strong>As revisões e remanejamentos ficarão registrados aqui, neste navegador.</div>'}
    </div></section>`;}
function rulesView(){const rules=[
  ['Território e aproximação','O posto cadastrado na aba Equipe é obrigatório na geração automática; apenas Escalas 4 e 7 podem atender ambos. Posto A: 201–208, 220–224. Posto B: 209–212, 214–219. Quarto 213 não integra a escala. O mapa de proximidade é heurístico, conforme as orientações fornecidas.'],
  ['Máximo por profissional','Na geração automática, até 7 pacientes. Banho: até 3 por padrão; com menos de 8 técnicos, permitir 4 quando 3 não forem suficientes. Manualmente, esses limites geram alertas, mas não bloqueiam.'],
  ['Escala 1 — rotina e pacientes extras','Na geração automática, recebe normalmente os leitos habituais dos quartos 201–205; caso precise de leitos extras, somente 223A/B ou 224A/B. Na personalização manual, pode receber qualquer leito, com alerta de exceção.'],
  ['Banhos por turno','Diurno: quartos de numeração par. Noturno: quartos de numeração ímpar. Exceções podem ser registradas por leito.'],
  ['Equilíbrio dos cuidados','Distribuir banhos, acamados e preparos cirúrgicos entre os técnicos do mesmo posto. Considerar a soma dessas demandas para evitar concentrá-las em uma pessoa. O equilíbrio tem prioridade sobre a proximidade dos quartos e sobre manter a distribuição anterior; restrições e limites obrigatórios continuam valendo.'],
  ['Acamados e complexidade','Evitar uma escala exclusivamente com acamados quando houver alternativa permitida. Fugulin é complementar, sem alterar elegibilidade, limites, postos ou o equilíbrio dos cuidados.'],
  ['Restrições dos profissionais','Cada leito pode exigir atendimento exclusivamente por homem ou exclusivamente por mulher; elegibilidade é obrigatória, além das competências cadastradas.'],
  ['Compartilhamento','Na geração automática, com número par de técnicos ninguém divide postos; com número ímpar e pacientes nos dois postos, somente a Escala 4 e/ou a Escala 7 podem dividir, preferindo apenas uma e usando ambas quando necessário para a proporcionalidade. Na edição manual, qualquer divisão é permitida e sinalizada.'],
  ['Proximidade e poucos quartos','Manter leitos A/B juntos sempre que viável e reduzir circulação. Não substituir precauções e protocolos de controle de infecção.'],
  ['Bloqueio e isolamento','Vago, bloqueado e bloqueado por isolamento são estados distintos de leitos não ocupados. Pacientes isolados permanecem “ocupados” com precaução registrada.'],
  ['Imprevistos no plantão','Saída por falta, doença, remanejamento ou saída antecipada: preservar atribuições existentes sempre que possível. Registrar no histórico.']
];return `<section class="panel"><div class="panel-header"><div><h2>Regras utilizadas pelo protótipo</h2><p class="panel-subtitle">Prioridades de segurança e preferências de distribuição.</p></div>
  <span class="pill pill-amber">Validação humana obrigatória</span></div><div class="panel-body"><div class="rule-list">
  ${rules.map(([title,body])=>`<div class="rule-item"><strong>${esc(title)}</strong><p>${esc(body)}</p></div>`).join('')}</div></div></section>
  <section class="panel"><div class="panel-header"><h2>Dados, testes e privacidade</h2></div><div class="panel-body">
  <p class="form-note">Esta versão salva as informações no armazenamento local do navegador, sem login, banco de dados, criptografia de aplicação ou sincronização. Não registre nomes nem dados identificadores de pacientes. Não use o protótipo como sistema assistencial oficial sem validação institucional, segurança da informação e testes operacionais.</p>
  <div class="row-actions" style="margin-top:15px">
    <button class="btn" data-action="json">↓ Fazer backup (JSON)</button>
    <label class="btn" for="import-json" style="cursor:pointer">↑ Importar backup</label>
    <input id="import-json" type="file" accept="application/json,.json" hidden />
    <button class="btn" data-action="reset-demo">Recarregar demonstração</button>
    <button class="btn btn-danger" data-action="reset-empty">Limpar ocupação</button>
  </div></div></section>`;}
function footer(){return `<p class="footer-note no-print">Protótipo de demonstração · Não substitui supervisão do enfermeiro, dimensionamento institucional ou precauções de prevenção de infecção.<br />
    Dados armazenados apenas neste navegador; utilize o JSON para cópias de segurança. Sem dados identificadores de pacientes.</p>`;}
function removalPreview(slot){
  const active=state.staff.filter(s=>s.active),removed=active.find(s=>s.slot===Number(slot));
  const last=active.sort((a,b)=>b.slot-a.slot)[0];
  if(!removed)return `A equipe permanece com <strong>${active.length} profissionais</strong>. A opção automática recalcula toda a distribuição.`;
  return last.slot===removed.slot?`Sai ${esc(removed.name)}, da última Escala ${last.slot}. As demais posições serão mantidas.`
    :`Sai ${esc(removed.name)}, da Escala ${removed.slot}. <strong>${esc(last.name)} passa da Escala ${last.slot} para a Escala ${removed.slot}.</strong> As demais posições serão mantidas e a última fica inativa. A equipe passa de ${active.length} para ${active.length-1}, com numeração contínua.`;
}
function incomingProfile(existingSlot=0){
  const person=state.staff.find(s=>!s.active&&s.slot===Number(existingSlot));
  const active=state.staff.filter(s=>s.active),a=active.filter(s=>staffPost(s)==='A').length,b=active.length-a;
  return person?{name:person.name,post:staffPost(person),sex:person.sex||'',canEnteral:person.canEnteral,canBedridden:person.canBedridden,pcrRole:pcrRole(person.pcrRole)}
    :{name:'',post:a<=b?'A':'B',sex:'',canEnteral:true,canBedridden:true,pcrRole:''};
}
function openResizeModal(slot=0,mode='all',options={}){
  if(ui.draftDirty&&ui.draftAssignment)applyDraft();
  const operation=options.operation||(slot?'remove':'keep');
  ui.modal={type:'resize',slot:Number(slot)||0,mode,operation,existingSlot:Number(options.existingSlot)||0,
    added:incomingProfile(options.existingSlot),reason:operation==='add'?'Entrada de técnico':'Remanejamento para outro setor'};render();
}
function resizeDialog(m){
  const active=state.staff.filter(s=>s.active),inactive=state.staff.filter(s=>!s.active),adding=m.operation==='add',removing=m.operation==='remove'||m.slot>0;
  const after=active.length+(adding?1:removing&&m.slot?-1:0),person=m.added;
  return `<div class="modal-overlay" role="presentation"><div class="modal resize-modal" role="dialog" aria-modal="true" aria-label="Redimensionamento da equipe"><div class="modal-head"><div><p class="eyebrow">Equipe do plantão</p><h2>Redimensionar equipe</h2></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></div><div class="modal-body">
    <label class="label-field">O que mudou na equipe?<select class="control" id="resize-operation"><option value="keep" ${m.operation==='keep'?'selected':''}>Apenas recalcular a equipe atual</option><option value="add" ${adding?'selected':''}>Adicionar técnico</option><option value="remove" ${removing?'selected':''}>Retirar técnico</option></select></label>
    <div class="team-change-summary"><div><span>Equipe atual</span><strong>${active.length}</strong></div><div><span>Após o ajuste</span><strong>${after}</strong></div><p>${adding?`Entrada na Escala ${active.length+1}`:removing?'A numeração permanece contínua':'A presença dos profissionais será mantida'}</p></div>
    ${adding?`${inactive.length?`<label class="label-field">Profissional<select class="control" id="incoming-person"><option value="0">Cadastrar novo técnico</option>${inactive.map(s=>`<option value="${s.slot}" ${m.existingSlot===s.slot?'selected':''}>${esc(s.name)} · cadastrado e ausente</option>`).join('')}</select></label>`:''}
      <div class="incoming-fields"><label class="label-field incoming-name">Nome do técnico<input class="control" data-resize-add="name" maxlength="85" value="${esc(person.name)}" placeholder="Nome de quem está entrando"></label>
      <label class="label-field">Posto de referência<select class="control" data-resize-add="post"><option value="A" ${person.post==='A'?'selected':''}>Posto A</option><option value="B" ${person.post==='B'?'selected':''}>Posto B</option></select></label>
      <label class="label-field">Sexo do profissional<select class="control" data-resize-add="sex"><option value="">Selecione</option><option value="female" ${person.sex==='female'?'selected':''}>Mulher</option><option value="male" ${person.sex==='male'?'selected':''}>Homem</option></select></label>
      <label class="checkline"><input type="checkbox" data-resize-add="canEnteral" ${person.canEnteral?'checked':''}>Pode assumir sonda enteral</label><label class="checkline"><input type="checkbox" data-resize-add="canBedridden" ${person.canBedridden?'checked':''}>Pode assumir acamados</label>
      ${pcrSelect(person.pcrRole,'data-resize-add="pcrRole"','PCR do técnico que está entrando')}</div>`:
      `<label class="label-field">Profissional que está saindo<select id="removed-slot" class="control"><option value="0" ${!m.slot?'selected':''}>Ninguém — manter a equipe atual</option>${active.map(s=>`<option value="${s.slot}" ${m.slot===s.slot?'selected':''}>Escala ${s.slot} · ${esc(s.name)}</option>`).join('')}</select></label>${m.slot?`<p class="removal-preview" id="removal-preview">${removalPreview(m.slot)}</p>`:''}`}
    <fieldset class="resize-options"><legend>Como deseja redistribuir os pacientes?</legend>
      <label class="resize-option ${m.mode==='all'?'chosen':''}"><input type="radio" name="redistribution-mode" data-resize-mode value="all" ${m.mode==='all'?'checked':''}><span><strong>Redistribuição automática da escala</strong><small>${adding?'Inclui o novo técnico e reequilibra os pacientes.':'Recalcula os pacientes entre os profissionais presentes.'}</small></span></label>
      <label class="resize-option ${m.mode===(adding?'keep':'departing')?'chosen':''}"><input type="radio" name="redistribution-mode" data-resize-mode value="${adding?'keep':'departing'}" ${m.mode===(adding?'keep':'departing')?'checked':''}><span><strong>${adding?'Manter os pacientes para ajuste manual':'Apenas pacientes do técnico que está saindo'}</strong><small>${adding?'Adiciona o técnico sem transferir os pacientes atuais.':'Mantém os pacientes dos demais técnicos com seus responsáveis.'}</small></span></label>
    </fieldset>
    <label class="label-field">Motivo<select id="removed-reason" class="control">${['Entrada de técnico','Remanejamento para outro setor','Falta','Doença / afastamento','Saída antecipada','Outro motivo'].map(reason=>`<option value="${reason}" ${m.reason===reason?'selected':''}>${reason}</option>`).join('')}</select></label>
    <p class="form-note">A escala e a impressão são atualizadas juntas. Pacientes pendentes ficam disponíveis para revisão.</p></div><div class="modal-foot"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="resize-confirm">Aplicar redimensionamento</button></div></div></div>`;
}
function modalHtml(){const m=ui.modal;if(!m)return '';
  if(m.type==='resize')return resizeDialog(m);
  if(m.type==='assign'){
    const bed=state.beds.find(x=>x.id===m.id);const staff=state.staff.filter(s=>s.active);
    const chosen=state.assignment[m.id];
    return `<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="Atribuição manual de paciente">
      <div class="modal-head"><div><p class="eyebrow">Ajuste manual</p><h2>Leito ${esc(m.id)}</h2></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></div>
      <div class="modal-body"><p class="modal-help">${esc([bed?.bedridden?'Paciente acamado':null,bed?.enteral?'Sonda enteral':null,bed?.sexRestriction==='female'?'Somente profissional mulher':bed?.sexRestriction==='male'?'Somente profissional homem':null,bed?.isolation!=='none'?'Precaução adicional':null].filter(Boolean).join(' · ')||'Paciente sem restrições cadastradas')}</p>
      <label class="label-field">Novo responsável <select id="manual-slot" class="control" style="width:100%">
        ${staff.map(s=>`<option value="${s.slot}" ${chosen===s.slot?'selected':''}>Escala ${s.slot} · ${esc(s.name)}${canAttend(bed,s)?'':' (exceção — conferir)'}</option>`).join('')}</select></label>
      <div class="notice warning"><span>ⓘ</span><div>Ajuste manual livre: as regras da geração automática podem ser ultrapassadas, mas serão sinalizadas como alertas e exigem conferência do enfermeiro responsável.</div></div></div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="assign-confirm">Salvar ajuste</button></div></div></div>`;
  }
  return '';
}
function render(){const [ic,title]=VIEWS[ui.view];
  const screen={schedule:scheduleView,edit:editorView,beds:bedsView,staff:staffView,history:historyView,rules:rulesView}[ui.view]();
  $('#app').innerHTML=`<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-icon">E</div>
    <div><strong>Escala Assistencial</strong><span>Distribuição diária · v1.9</span></div></div>
    <p class="nav-title">Espaço de trabalho</p><nav class="nav" aria-label="Navegação principal">
      ${Object.entries(VIEWS).map(([id,[icon,label]])=>`<button class="nav-btn ${ui.view===id?'active':''}" data-view="${id}"><span class="nav-icon">${icon}</span>${esc(label)}</button>`).join('')}</nav>
    <div class="sidebar-foot"><strong>Escala do plantão</strong><p>Alterações salvas neste dispositivo. Faça seu backup em Regras e dados.</p></div>
  </aside><main class="workspace">${header()}${screen}${fugulinPanel()}${state.includeVacancies?reportPanel():''}${state.printNotes?.trim()?`<section class="panel print-panel print-observations"><div class="panel-header"><h2>Observações do plantão</h2></div><div class="panel-body">${esc(state.printNotes)}</div></section>`:''}
    ${state.manualOverride?`<div class="print-only print-manual-note"><strong>ATENÇÃO — ESCALA PERSONALIZADA MANUALMENTE.</strong> As atribuições foram ajustadas pelo usuário e podem contrariar as regras da distribuição automática; conferir proximidade, banhos, atribuições, restrições de atendimento e divisão dos postos antes do uso assistencial.</div>`:''}
    <div class="print-only print-foot">Conferido por: ____________________________________ &nbsp;&nbsp; Assinatura: ____________________________<p>Escala provisória, sujeita à conferência e validação do(a) enfermeiro(a) responsável. Data/hora de impressão: ${esc(new Date().toLocaleString('pt-BR'))}.</p></div>
    ${footer()}</main></div>${printSheet()}${modalHtml()}${ui.toast?`<div class="toast ${ui.toast.error?'error':''}" role="status">${esc(ui.toast.message)}</div>`:''}`;
  fitPrintSheet();
}
function tryGenerate(preserve=false){
  const out=generateSchedule(state,{preserve});
  record(preserve?'Antes da redistribuição':'Antes da geração',preserve?'Preservar distribuição anterior':'Nova distribuição');
  applyDistribution(out);
  const missing=totals().unassigned;
  toast(missing?`${occupied().length-missing} pacientes distribuídos; ${missing} aguardam ajuste na revisão.`:out.ok?'Escala gerada. Confira a distribuição.':'Distribuição aplicada. Confira as pendências na revisão.',missing>0);
  return out;
}
function applyDistribution(out,manual=false){
  state.assignment=out.assignment||{};state.stale=false;state.manualOverride=manual;state.generatedAt=new Date().toISOString();state.lastError=out.ok?[]:out.errors||[];
  ui.draftAssignment=clone(state.assignment);ui.draftDirty=false;ui.selectedBed=null;ui.selectedNurseBed=null;commit();
}
function recalcAfterChange(){state.stale=true;state.demo=false;state.lastError=[];commit();}
function removePerson(slot,reason,mode='all'){
  const s=state.staff.find(x=>x.slot===slot);
  if(!s||!s.active)return;
  const moved=remapStaffAfterRemoval(state.staff,slot);
  record('Saída de profissional e redimensionamento',`Escala ${slot} · ${s.name} · ${reason} · ${mode==='departing'?'Somente pacientes de quem saiu':'Redistribuição automática'}${moved.replacementSlot?` · Escala ${moved.replacementSlot} assume a ${slot}`:''}`);
  const old=clone(state.assignment);
  const departingBeds=occupied().filter(b=>Number(old[b.id])===slot).map(b=>b.id),wasManual=state.manualOverride;
  state.staff=moved.staff;
  state.assignment=remapAssignment(old,moved.slotMap);
  const out=mode==='departing'?redistributeDepartingPatients(state,departingBeds):generateSchedule(state);
  ui.modal=null;ui.view='schedule';
  applyDistribution(out,mode==='departing'&&wasManual);
  const missing=totals().unassigned;
  toast(`Equipe atualizada para ${state.staff.filter(s=>s.active).length} profissionais. ${mode==='departing'?'Pacientes dos demais técnicos mantidos. ':''}${missing?`${missing} pacientes aguardam ajuste na revisão.`:'Confira a escala atualizada.'}`,missing>0);
  return out;
}
function addPerson(details,{existingSlot=0,redistribute=true,reason='Entrada de técnico'}={}){
  const added=addStaffMember(state.staff,details,{existingSlot:existingSlot||null});
  if(!added.ok){toast(added.error,true);return added;}
  record('Entrada de técnico e redimensionamento',`${details.name} · Escala ${added.addedSlot} · ${reason} · ${redistribute?'Redistribuição automática':'Ajuste manual'}`);
  state.staff=added.staff;state.assignment=remapAssignment(state.assignment,added.slotMap);
  const checked=validateSchedule(state);
  const out=redistribute?generateSchedule(state):{ok:checked.errors.length===0,assignment:clone(state.assignment),errors:checked.errors,warnings:checked.warnings};
  ui.modal=null;ui.view='schedule';state.demo=false;applyDistribution(out,!redistribute);
  toast(`Técnico adicionado na Escala ${added.addedSlot}. Equipe com ${state.staff.filter(s=>s.active).length} profissionais. ${redistribute?'Distribuição atualizada.':'Pacientes mantidos para ajuste manual.'}`);
  return {...out,addedSlot:added.addedSlot};
}
function openEditor(){
  ui.view='edit';ui.draftAssignment=clone(state.assignment);ui.draftDirty=false;render();
}
function applyDraft(){
  if(!ui.draftAssignment)return toast('Nenhum rascunho para salvar.',true);
  const validation=validateSchedule(state,ui.draftAssignment,{manual:true});
  record('Antes da personalização para impressão','Revisão manual da distribuição');
  state.assignment=clone(ui.draftAssignment);state.stale=false;state.manualOverride=true;state.generatedAt=new Date().toISOString();state.lastError=[];
  ui.draftDirty=false;commit();toast(validation.warnings.length?'Personalização salva. Revise os alertas antes de imprimir.':'Personalização salva e validada.');
}
function printConfirmed(){
  if(ui.draftDirty && ui.draftAssignment) applyDraft();
  ui.view='edit';safeLocalStore();render();fitPrintSheet();window.print();
}

function manualAssignNurse(id,roleId){
  const bed=state.beds.find(b=>b.id===id),role=nurseRoles(state.nurseCount).find(r=>r.id===roleId);
  if(!bed||!['occupied','vacant'].includes(bed.status)||!role)return;
  if(role.post!=='AB'&&role.post!==bedInfo(id).post)return toast(`O ${role.label} atende somente o Posto ${role.post}.`,true);
  record('Antes do ajuste dos enfermeiros',`Leito ${id} → ${role.label}`);
  state.nurseOverrides[id]=roleId;ui.selectedNurseBed=null;commit();toast('Leito transferido entre enfermeiros.');
}

function manualAssign(id,slot){
  const bed=state.beds.find(x=>x.id===id),person=state.staff.find(s=>s.active&&s.slot===slot);
  if(!bed||bed.status!=='occupied'||!person)return toast('Escolha um leito ocupado e uma escala com profissional ativo.',true);
  const draft={...state.assignment,[id]:slot};
  const v=validateSchedule(state,draft,{manual:true});
  record('Antes do ajuste manual',`Leito ${id}: Escala ${state.assignment[id]||'sem responsável'} → ${slot}`);
  state.assignment=draft;state.stale=false;state.manualOverride=true;state.generatedAt=new Date().toISOString();state.lastError=[];ui.modal=null;ui.selectedBed=null;ui.draftAssignment=clone(state.assignment);ui.draftDirty=false;commit();
  const checked=validateSchedule(state,draft,{manual:true});toast(checked.warnings.length?'Ajuste salvo. Confira a proporcionalidade.':'Atribuição atualizada.');
}
function download(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvField(value){return '"'+String(value??'').replaceAll('"','""')+'"';}
function exportCsv(){const nurseAssignment=generateNurseAssignment(state.beds,state.nurseCount,state.nurseOverrides);let out=[['Data',state.date],['Turno',state.shift==='day'?'Diurno':'Noturno'],['Enfermeiro responsável',state.responsible],[],
    ['Posto','Leito','Situação','Escala','Profissional','Enfermeiro do leito','Posto do enfermeiro','Banho','Acamado','Preparo cirúrgico','Sonda enteral','Restrição por sexo','Precaução adicional','Fugulin','Classificação Fugulin','PCR do técnico']];
  for(const b of state.beds){const info=bedInfo(b.id),s=state.staff.find(s=>s.slot===Number(state.assignment[b.id]));
    out.push([info.post,b.id,statusLabel(b.status),b.status==='occupied'?(s?.slot||'Pendente'):'',
      b.status==='occupied'?s?.name||'Pendente':'',nurseAssignment[b.id]?state.nurses[nurseAssignment[b.id]]||'Nome não informado':'',nurseRoles(state.nurseCount).find(n=>n.id===nurseAssignment[b.id])?.post||'',b.status==='occupied'?(bathApplies(b,state.shift)?'Sim':'Não'):'',
      b.status==='occupied'?(b.bedridden?'Sim':'Não'):'',b.status==='occupied'?(b.surgicalPrep?'Sim':'Não'):'',b.status==='occupied'?(b.enteral?'Sim':'Não'):'',
      b.status==='occupied'?({female:'Somente mulher',male:'Somente homem',any:'Sem restrição'}[b.sexRestriction]||'Sem restrição'):'',b.status==='occupied'?ISOLATIONS[b.isolation]:'',b.status==='occupied'?(fugulinScore(b)??''):'',b.status==='occupied'?fugulinCategory(b):'',b.status==='occupied'?pcrRole(s?.pcrRole):'']);
  }
  for(const post of ['A','B'])for(const status of ['vacant','blocked','isolation-blocked']){
    out.push([]);out.push([`Posto ${post} - ${statusLabel(status)}`,state.beds.filter(b=>bedInfo(b.id).post===post&&b.status===status).map(x=>x.id).join(', ')]);
  }
  out.push([],['Equipe do plantão'],['Escala','Nome','Categoria','Função','PCR']);
  for(const s of state.staff.filter(s=>s.active))out.push([s.slot,s.name,ROLES[s.role],s.duty||'',pcrRole(s.pcrRole)]);
  out.push([],['Técnicos de apoio'],['Nome do técnico','Função','PCR']);
  for(const s of state.supportStaff)out.push([s.name,s.duty,s.pcrRole]);
  download(`escala-${state.date}-${state.shift}.csv`,'\ufeff'+out.map(r=>r.map(csvField).join(';')).join('\r\n'),'text/csv;charset=utf-8');toast('Arquivo CSV exportado.');}
function exportJSON(){download(`backup-escala-${state.date}-${state.shift}.json`,JSON.stringify(state,null,2),'application/json;charset=utf-8');toast('Backup JSON exportado.');}
async function importJSON(file){try{
  if(file.size>2_500_000)throw Error('Arquivo muito grande.');
  const data=JSON.parse(await file.text());
  if(data.version!==1||!Array.isArray(data.beds)||!Array.isArray(data.staff)||data.beds.length!==46||(data.staff.length<9||data.staff.length>MAX_TEAM_MEMBERS))throw Error('Backup incompatível.');
  if(new Set(data.staff.map(s=>s.slot)).size!==data.staff.length||data.staff.some(s=>!Number.isInteger(s.slot)||s.slot<1||s.slot>MAX_TEAM_MEMBERS))throw Error('Posições de equipe inválidas.');
  const ids=new Set(data.beds.map(x=>x.id));
  if(BEDS.some(b=>!ids.has(b.id)))throw Error('A lista de leitos não corresponde ao setor.');
  if(!confirm('Importar o backup substituirá os dados atuais deste navegador. Continuar?'))return;
  localStorage.setItem(STORAGE,JSON.stringify(data));state=loadState();ui.view='schedule';ui.filter='';ui.bedFilter='all';commit();toast('Backup importado com sucesso.');
}catch(e){toast(`Falha na importação: ${e.message}`,true);}}

$('#app').addEventListener('click',e=>{
  const tab=e.target.closest('[data-view]');if(tab){if(ui.view==='edit'&&ui.draftDirty&&tab.dataset.view!=='edit'&&!confirm('Há alterações não salvas no rascunho. Deseja descartá-las?'))return;if(tab.dataset.view==='edit')openEditor();else{ui.draftDirty=false;ui.draftAssignment=null;ui.view=tab.dataset.view;render();}return;}
  const b=e.target.closest('[data-action]');if(!b)return;
  const action=b.dataset.action;
  if(action==='support-add'){record('Antes de adicionar técnico de apoio');state.supportStaff.push({id:Date.now(),name:'',duty:'',pcrRole:''});commit();return;}
  if(action==='support-remove'){record('Antes de retirar técnico de apoio');state.supportStaff.splice(Number(b.dataset.index),1);commit();return;}
  if(action==='select-nurse-bed'){ui.selectedNurseBed=ui.selectedNurseBed===b.dataset.id?null:b.dataset.id;render();return;}
  if(action==='move-nurse-bed'){if(ui.selectedNurseBed)manualAssignNurse(ui.selectedNurseBed,b.dataset.nurseId);else toast('Clique primeiro no leito que deseja transferir entre enfermeiros.');return;}
  if(action==='nurse-rebalance'){record('Antes de reequilibrar enfermeiros');state.nurseOverrides={};ui.selectedNurseBed=null;commit();toast('Divisão dos enfermeiros reequilibrada, incluindo possíveis admissões.');return;}
  if(action==='select-bed'){ui.selectedBed=ui.selectedBed===b.dataset.id?null:b.dataset.id;render();return;}
  if(action==='move-selected'){if(ui.selectedBed)manualAssign(ui.selectedBed,Number(b.dataset.slot));else toast('Clique primeiro no leito que deseja mover.');return;}
  if(action==='select-post'){state.beds.filter(x=>b.dataset.post==='all'||bedInfo(x.id).post===b.dataset.post).forEach(x=>ui.selectedBeds.add(x.id));render();return;}
  if(action==='clear-selection'){ui.selectedBeds.clear();render();return;}
  if(action==='bed-status'||action==='bulk-status'||action==='bulk-flag'){
    const targets=state.beds.filter(x=>action==='bed-status'?x.id===b.dataset.id:ui.selectedBeds.has(x.id));
    if(!targets.length)return;
    record('Antes da atualização de leitos');
    targets.forEach(x=>{if(action==='bulk-flag'){if(x.status==='occupied')x[b.dataset.field]=b.dataset.value==='true';}else{if(x.status!==b.dataset.status){Object.assign(x,{status:b.dataset.status,bedridden:false,enteral:false,surgicalPrep:false,sexRestriction:'any',womenOnly:false,isolation:'none',bath:'auto',fugulin:null});delete state.assignment[x.id];delete state.nurseOverrides[x.id];}}});
    recalcAfterChange();return;
  }
  if(action==='close-modal'){ui.modal=null;render();return;}
  if(action==='edit-open'){openEditor();return;}
  if(action==='edit-check'){render();return;}
  if(action==='edit-reset'){ui.draftAssignment=clone(state.assignment);ui.draftDirty=false;render();return;}
  if(action==='edit-apply'){applyDraft();return;}
  if(action==='edit-add'){
    const bed=$('#quick-bed')?.value,slot=Number($('#quick-slot')?.value);
    if(!occupied().some(b=>b.id===bed)||!state.staff.some(s=>s.active&&s.slot===slot))return toast('Escolha um leito ocupado e um profissional ativo.',true);
    ui.draftAssignment ||= clone(state.assignment);
    ui.draftAssignment[bed]=slot;ui.draftDirty=true;render();
    toast(`Leito ${bed} acrescentado à Escala ${slot} no rascunho. Salve antes de imprimir.`);return;
  }
  if(action==='finalize-print'){printConfirmed();return;}
  if(action==='generate'){if(ui.view==='edit'&&ui.draftDirty&&!confirm('As alterações não salvas serão descartadas ao gerar outra escala. Continuar?'))return;ui.draftDirty=false;ui.view='schedule';tryGenerate(false);return;}
  if(action==='preserve'){if(ui.view==='edit'&&ui.draftDirty&&!confirm('As alterações não salvas serão descartadas ao redistribuir. Continuar?'))return;ui.draftDirty=false;ui.view='schedule';tryGenerate(true);return;}
  if(action==='add-modal'){openResizeModal(0,'all',{operation:'add'});return;}
  if(action==='remove-modal'||action==='resize-modal'){
    openResizeModal(Number(b.dataset.slot)||0,b.dataset.slot?'departing':'all');return;
  }
  if(action==='remove-confirm'||action==='resize-confirm'){
    if(ui.modal?.type!=='resize')return;
    if(ui.modal.operation==='add'){addPerson(ui.modal.added,{existingSlot:ui.modal.existingSlot,redistribute:ui.modal.mode!=='keep',reason:ui.modal.reason});return;}
    const slot=Number($('#removed-slot')?.value??ui.modal.slot),reason=$('#removed-reason')?.value||ui.modal.reason,mode=ui.modal.mode;
    if(mode==='departing'&&!slot)return toast('Selecione o técnico que está saindo para redistribuir apenas os pacientes dele.',true);
    if(slot)removePerson(slot,reason,mode);
    else{ui.modal=null;ui.view='schedule';tryGenerate(false);}return;
  }
  if(action==='assign-modal'){ui.modal={type:'assign',id:b.dataset.id};render();return;}
  if(action==='assign-confirm'){
    if(!$('#manual-slot'))return;
    manualAssign(ui.modal.id,Number($('#manual-slot').value));return;
  }
  if(action==='print'){openEditor();return;}
  if(action==='csv'){exportCsv();return;}
  if(action==='json'){exportJSON();return;}
  if(action==='clear-filter'){ui.filter='';ui.bedFilter='all';render();return;}
  if(action==='restore'){
    const snapshot=state.history[Number(b.dataset.index)];if(!snapshot)return;
    if(!confirm(`Restaurar a versão "${snapshot.action}" de ${new Date(snapshot.when).toLocaleString('pt-BR')}?`))return;
    const before=clone(snapshot.state);record('Antes da restauração',`Versão de ${snapshot.when}`);
    Object.assign(state,before);state.supportStaff=supportStaff(before.supportStaff);
    const normalized=normalizeStaffSlots(state.staff.map(s=>({...s,pcrRole:pcrRole(s.pcrRole),duty:s.duty||''})));
    state.staff=normalized.staff;state.assignment=remapAssignment(state.assignment,normalized.slotMap);
    ui.draftAssignment=null;ui.draftDirty=false;ui.view='schedule';commit();toast('Versão restaurada. Confira a escala.');return;
  }
  if(action==='reset-demo'||action==='reset-empty'){
    if(!confirm(action==='reset-demo'?'Substituir todos os dados atuais pelo cenário fictício?':'Marcar todos os leitos como vagos e apagar a distribuição atual?'))return;
    record('Antes da reinicialização');
    const original=defaultState(action==='reset-demo');
    state={...original,history:state.history,date:state.date,shift:state.shift};ui.view='schedule';commit();toast('Dados reinicializados.');return;
  }
});
$('#app').addEventListener('change',e=>{
  const x=e.target;
  if(saveTextField(x))return;
  if(x.id==='resize-operation'){if(ui.modal?.type==='resize'){ui.modal.operation=x.value;ui.modal.slot=0;ui.modal.mode='all';ui.modal.reason=x.value==='add'?'Entrada de técnico':'Remanejamento para outro setor';render();}return;}
  if(x.id==='incoming-person'){if(ui.modal?.type==='resize'){ui.modal.existingSlot=Number(x.value);ui.modal.added=incomingProfile(x.value);render();}return;}
  if(x.dataset.resizeAdd){if(ui.modal?.type==='resize')ui.modal.added[x.dataset.resizeAdd]=x.type==='checkbox'?x.checked:x.value;return;}
  if(x.dataset.resizeMode!==undefined){if(ui.modal?.type==='resize'){ui.modal.mode=x.value;render();}return;}
  if(x.id==='removed-reason'){if(ui.modal?.type==='resize')ui.modal.reason=x.value;return;}
  if(x.dataset.support!==undefined){const s=state.supportStaff[Number(x.dataset.support)],field=x.dataset.supportField;if(!s||!['name','duty','pcrRole'].includes(field))return;s[field]=field==='pcrRole'?pcrRole(x.value):x.value.slice(0,field==='name'?85:160);if(field==='pcrRole')commit();else safeLocalStore();return;}
  if(x.dataset.nurseName){state.nurses[x.dataset.nurseName]=x.value.slice(0,85);safeLocalStore();return;}
  if(x.id==='removed-slot'){if(ui.modal){ui.modal.slot=Number(x.value);ui.modal.operation=ui.modal.slot?'remove':'keep';render();}return;}
  if(x.dataset.selectBed){if(x.checked)ui.selectedBeds.add(x.dataset.selectBed);else ui.selectedBeds.delete(x.dataset.selectBed);render();return;}
  if(x.dataset.editBed){ui.draftAssignment ||= clone(state.assignment);if(x.value)ui.draftAssignment[x.dataset.editBed]=Number(x.value);else delete ui.draftAssignment[x.dataset.editBed];ui.draftDirty=true;const badge=$('#draft-state');if(badge){badge.textContent='Alterações não salvas';badge.className='pill pill-amber';}return;}
  if(x.dataset.global){const k=x.dataset.global;
    if(k==='nurseCount'){record('Antes de alterar a quantidade de enfermeiros');state.nurseCount=nurseCount(x.value);state.nurseOverrides={};ui.selectedNurseBed=null;commit();return;}
    state[k]=x.type==='checkbox'?x.checked:x.value;
    if(k==='date'||k==='shift')recalcAfterChange();else if(x.type==='checkbox')commit();else safeLocalStore();return;}
  if(x.dataset.bed){const b=state.beds.find(z=>z.id===x.dataset.bed);if(!b)return;
    const field=x.dataset.bedField;
    if(field==='fugulin' && x.value!=='' && (!Number.isInteger(Number(x.value)) || Number(x.value)<9 || Number(x.value)>36)){toast('Informe Fugulin inteiro de 9 a 36, ou deixe vazio.',true);return;}
    b[field]=field==='fugulin'?(x.value===''?null:Number(x.value)):x.type==='checkbox'?x.checked:x.value;
    recalcAfterChange();return;}
  if(x.dataset.staff){const s=state.staff.find(z=>z.slot===Number(x.dataset.staff));if(!s)return;
    const field=x.dataset.staffField;
    if(field==='active'&&s.active&&!x.checked){openResizeModal(s.slot,'departing');return;}
    if(field==='active'&&!s.active&&x.checked){openResizeModal(0,'all',{operation:'add',existingSlot:s.slot});return;}
    if(field==='active')record('Antes de alterar presença na equipe');
    s[field]=field==='pcrRole'?pcrRole(x.value):x.type==='checkbox'?x.checked:x.value;
    if(field==='active'){
      const normalized=normalizeStaffSlots(state.staff);state.staff=normalized.staff;state.assignment=remapAssignment(state.assignment,normalized.slotMap);
      ui.draftAssignment=null;ui.draftDirty=false;
    }
    if(['name','duty'].includes(field))safeLocalStore();else if(field==='pcrRole')commit();else recalcAfterChange();return;}
  if(x.id==='bed-status-filter'){ui.bedFilter=x.value;render();return;}
  if(x.id==='import-json'&&x.files?.[0]){importJSON(x.files[0]);return;}
});
$('#app').addEventListener('input',e=>{
  if(e.target.dataset.resizeAdd){if(ui.modal?.type==='resize')ui.modal.added[e.target.dataset.resizeAdd]=e.target.type==='checkbox'?e.target.checked:e.target.value;return;}
  if(saveTextField(e.target))return;
  if(e.target.id==='bed-search'){
    const selectionStart=e.target.selectionStart;ui.filter=e.target.value;render();
    const field=$('#bed-search');field?.focus();try{field?.setSelectionRange(selectionStart,selectionStart);}catch(_){/* search inputs */}
  }
});
$('#app').addEventListener('keydown',e=>{
  if(e.target.dataset.bedField!=='fugulin'||!['Enter','Tab'].includes(e.key))return;
  const fields=[...document.querySelectorAll('[data-bed-field="fugulin"]')];
  const index=fields.indexOf(e.target),next=fields[index+(e.shiftKey?-1:1)]?.dataset.bed;
  if(!next&&e.key==='Tab')return;
  e.preventDefault();e.target.dispatchEvent(new Event('change',{bubbles:true}));
  if(next){const input=document.querySelector(`[data-bed="${next}"][data-bed-field="fugulin"]`);input?.focus();input?.select();}
});
$('#app').addEventListener('dragstart',e=>{const b=e.target.closest('[draggable][data-id]');if(!b)return;e.dataTransfer.setData('text/plain',b.dataset.id);e.dataTransfer.setData('application/x-escala-team',b.dataset.team||'tech');e.dataTransfer.effectAllowed='move';});
$('#app').addEventListener('dragover',e=>{if(e.target.closest('[data-drop-slot], [data-drop-nurse]')){e.preventDefault();e.dataTransfer.dropEffect='move';}});
$('#app').addEventListener('drop',e=>{const r=e.target.closest('[data-drop-slot], [data-drop-nurse]');if(!r)return;e.preventDefault();const team=e.dataTransfer.getData('application/x-escala-team'),id=e.dataTransfer.getData('text/plain');if(r.dataset.dropNurse){if(team==='nurse')manualAssignNurse(id,r.dataset.dropNurse);}else if(team!=='nurse')manualAssign(id,Number(r.dataset.dropSlot));});
$('#app').addEventListener('toggle',e=>{if(!e.target.isConnected)return;const id=e.target.dataset.detailBed;if(id){if(e.target.open)ui.openBeds.add(id);else ui.openBeds.delete(id);}},true);
window.addEventListener('beforeprint',()=>{if(ui.draftDirty&&ui.draftAssignment)applyDraft();render();fitPrintSheet();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ui.modal){ui.modal=null;render();}});
render();
