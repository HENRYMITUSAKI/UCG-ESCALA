import {
  BEDS, POST_A, POST_B, HOME_ROOMS, TRANSITION_A, TRANSITION_B,
  bathApplies, bedInfo, canAttend, generateSchedule, statistics, validateSchedule, bathLimit, techCount, ESCALA_1_BEDS
} from './engine.js';

const STORAGE='escala-enfermagem-diaria-v1';
const OPTIONS={
  occupied:'Ocupado',vacant:'Vago',blocked:'Bloqueado',
  'isolation-blocked':'Bloq. por isolamento'
};
const ISOLATIONS={none:'Sem isolamento',contact:'Contato',droplet:'Gotículas',airborne:'Aerossóis'};
const ROLES={tech:'Técnico(a)',support:'Técnico(a) de apoio',nurse:'Enfermeiro(a) de cobertura'};
const VIEWS={schedule:['▦','Escala do plantão'],edit:['✎','Revisar para impressão'],beds:['▤','Mapa de leitos'],staff:['♧','Equipe'],history:['◷','Histórico'],rules:['⚙','Regras e dados']};
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
function today(){const t=new Date();return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;}
function dateBR(s){if(!s)return '—';const p=s.split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s;}
function clone(x){return JSON.parse(JSON.stringify(x));}
function statusLabel(s){return OPTIONS[s]||'Desconhecido';}
function safeLocalStore(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch(e){ui.storageProblem=true;}}
function defaultStaff(){return Array.from({length:9},(_,i)=>({
  slot:i+1,name:`Profissional ${i+1}`,active:i<7,role:'tech',
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
    bedridden:demo&&bedridden.has(x.id),enteral:demo&&enteral.has(x.id),womenOnly:demo&&womenOnly.has(x.id),
    isolation:demo&&iso.has(x.id)?'contact':'none',bath:'auto'}));
}
function defaultState(demo=true){return {
  version:1,printTitle:'Escala diária de enfermagem',printNotes:'',includeVacancies:true,date:today(),shift:'day',staff:defaultStaff(),beds:defaultBeds(demo),
  assignment:{},history:[],stale:true,generatedAt:null,demo,responsible:'',lastError:[]
};}
function loadState(){
  try {
    const raw=JSON.parse(localStorage.getItem(STORAGE));
    if(!raw||raw.version!==1||!Array.isArray(raw.beds)||!Array.isArray(raw.staff))return defaultState();
    const d=defaultState();const savedBeds=new Map(raw.beds.map(x=>[x.id,x]));
    const savedStaff=new Map(raw.staff.map(x=>[Number(x.slot),x]));
    return {...d,...raw,
      beds:d.beds.map(b=>{const old=savedBeds.get(b.id)||{};return {...b,...old,sexRestriction:old.sexRestriction || (old.womenOnly?'female':'any')};}),
      staff:d.staff.map(s=>{const old=savedStaff.get(s.slot)||{};return {...s,...old,sex:old.sex || (old.woman?'female':'male'),slot:s.slot};}),
      history:Array.isArray(raw.history)?raw.history.slice(0,20):[],
      assignment:raw.assignment&&typeof raw.assignment==='object'?raw.assignment:{},
      lastError:Array.isArray(raw.lastError)?raw.lastError:[]
    };
  }catch(e){return defaultState();}
}
let state=loadState();
const ui={view:'schedule',modal:null,filter:'',bedFilter:'all',toast:null,storageProblem:false,draftAssignment:null,draftDirty:false};
function record(action,reason=''){
  state.history.unshift({id:Date.now()+Math.random(),when:new Date().toISOString(),action,reason,
    state:{date:state.date,shift:state.shift,staff:clone(state.staff),beds:clone(state.beds),
      assignment:clone(state.assignment),generatedAt:state.generatedAt,stale:state.stale,responsible:state.responsible,printTitle:state.printTitle,printNotes:state.printNotes,includeVacancies:state.includeVacancies}});
  state.history=state.history.slice(0,20);
}
function commit(){safeLocalStore();render();}
function toast(message,error=false){ui.toast={message,error};render();clearTimeout(toast.timer);toast.timer=setTimeout(()=>{ui.toast=null;render();},4300);}
function occupied(){return state.beds.filter(b=>b.status==='occupied');}
function getStats(assignment=state.assignment){return statistics(assignment,state.beds,state.staff,state.shift);}
function totals(){const all=state.beds,active=state.staff.filter(s=>s.active);
  return {occupied:occupied().length,vacant:all.filter(b=>b.status==='vacant').length,
    blocked:all.filter(b=>b.status==='blocked').length,
    isolationBlocked:all.filter(b=>b.status==='isolation-blocked').length,
    baths:occupied().filter(b=>bathApplies(b,state.shift)).length,
    workers:active.length,
    unassigned:occupied().filter(b=>!active.some(s=>s.slot===Number(state.assignment[b.id]))).length};
}
function shiftLabel(){return state.shift==='day'?'Diurno · quartos pares':'Noturno · quartos ímpares';}
function statusText(){
  if(state.stale)return ['pill-amber','Escala precisa ser recalculada'];
  const v=validateSchedule(state);
  if(v.errors.length)return ['pill-red','Distribuição pendente'];
  if(v.warnings.length)return ['pill-amber','Revisão recomendada'];
  return ['pill-green','Distribuição sem alertas'];
}
function header(){const [cls,status]=statusText();return `
  <div class="topline"><span class="crumb">Operação assistencial &nbsp;/&nbsp; <strong>Distribuição diária</strong></span>
    <span class="demo-flag">${state.demo?'● DADOS FICTÍCIOS / DEMONSTRAÇÃO':'● PROTÓTIPO LOCAL'}</span></div>
  <div class="page-header">
    <div><p class="eyebrow">Gestão do plantão</p><h1>Escala de enfermagem</h1>
      <p class="subtitle">Distribuição territorial e proporcional dos pacientes, com checagem de banhos, restrições individuais e postos compartilhados.</p></div>
    <div class="toolbar-actions no-print">
      <button class="btn" data-action="remove-modal">↺&nbsp; Remanejamento</button>
      <button class="btn" data-action="preserve">⟳&nbsp; Redistribuir</button>
      <button class="btn btn-primary" data-action="generate">✦&nbsp; Gerar escala</button>
    </div>
  </div>
  <div class="print-only"><div class="print-meta"><strong>${esc(state.printTitle||'Escala diária de enfermagem')}</strong> · Plantão: ${esc(dateBR(state.date))} · ${esc(shiftLabel())} · Enfermeiro(a): ${esc(state.responsible||'Não informado')} · Status: ${esc(statusText()[1])} · ${state.demo?'CENÁRIO FICTÍCIO · ':''}Emitido em ${esc(new Date().toLocaleString('pt-BR'))}</div></div>
  <div class="control-bar no-print"><div class="controls-left">
    <label class="label-field">Data do plantão <input class="control" type="date" data-global="date" value="${esc(state.date)}" /></label>
    <label class="label-field">Turno <select class="control" data-global="shift">
       <option value="day" ${state.shift==='day'?'selected':''}>☀ Diurno</option>
       <option value="night" ${state.shift==='night'?'selected':''}>☾ Noturno</option></select></label>
    <label class="label-field">Enfermeiro(a) responsável <input class="control" type="text" data-global="responsible" maxlength="90" value="${esc(state.responsible)}" placeholder="Nome para impressão" /></label>
  </div><div class="row-actions"><span class="pill ${cls}">${esc(status)}</span>
    <button class="btn btn-sm" data-action="print">✎ Revisar / imprimir</button>
    <button class="btn btn-sm" data-action="csv">↓ CSV</button></div></div>`;}
function metrics(){const t=totals(),values=[
  ['▣','Pacientes ocupando leitos',t.occupied,'de 46 leitos físicos'],
  ['◻','Leitos vagos',t.vacant,'sem paciente'],
  ['▥','Leitos bloqueados',t.blocked+t.isolationBlocked,`${t.isolationBlocked} por isolamento`],
  ['♧','Equipe ativa',t.workers,'de até 9 escalas'],
  ['◉','Banhos previstos',t.baths,shiftLabel()]
];return `<section class="metrics no-print">${values.map(([icon,label,num,foot])=>`
  <div class="metric"><div class="metric-head"><span>${esc(label)}</span><span class="metric-icon">${icon}</span></div>
    <div class="metric-value">${num}</div><div class="metric-foot">${esc(foot)}</div></div>`).join('')}</section>`;}
function alerts(){const items=[];
  if(state.stale){items.push({kind:'warning',title:'Distribuição ainda não atualizada.',text:'Após alterar os leitos, a equipe, a data ou o turno, clique em “Gerar escala” ou “Redistribuir”. Os valores apresentados podem ser de uma versão anterior.'});}
  if(state.lastError?.length)items.push({kind:'error',title:'Não foi possível gerar uma escala completa.',bullets:state.lastError});
  if(state.generatedAt&&!state.stale){const v=validateSchedule(state);
    if(v.errors.length)items.push({kind:'error',title:'Pendências que impedem uma distribuição válida.',bullets:v.errors.slice(0,10)});
    if(v.warnings.length)items.push({kind:'warning',title:'Alertas para revisão do enfermeiro.',bullets:v.warnings.slice(0,10)});
  }
  if(ui.storageProblem)items.push({kind:'warning',title:'Não foi possível salvar neste navegador.',text:'Exporte um arquivo JSON para não perder os dados.'});
  return items.map(x=>`<div class="notice ${x.kind}"><span>ⓘ</span><div><strong>${esc(x.title)}</strong>${x.text?`<div>${esc(x.text)}</div>`:''}
    ${x.bullets?`<ul>${x.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`:''}</div></div>`).join('');
}
function bedTags(ids){return ids.length?ids.map(id=>{
  const b=state.beds.find(x=>x.id===id);
  const flags=[b?.bedridden?'Acamado':null,b?.enteral?'SNE/SNG':null,b?.sexRestriction==='female'?'Somente profissional mulher':b?.sexRestriction==='male'?'Somente profissional homem':null,b?.isolation!=='none'?'Em isolamento':null].filter(Boolean);
  return `<button class="bed-tag ${b?.isolation!=='none'?'bed-iso':''} no-print-action" data-action="assign-modal" data-id="${esc(id)}" title="${esc(flags.join(' · ')||'Clique para trocar o responsável')}">${esc(id)}${b?.isolation!=='none'?' ◈':''}</button>`;
}).join(''):'<span class="text-muted">—</span>';}
function schedulePanel(assignment=state.assignment){const rows=getStats(assignment),t=totals();const occupiedById=occupied();const assignedIds=new Set(Object.keys(assignment).filter(id=>state.staff.some(s=>s.active&&s.slot===Number(assignment[id]))));
  const missing=occupiedById.filter(b=>!assignedIds.has(b.id)).map(b=>b.id);
  const body=rows.map(r=>{
    const a=r.beds.filter(id=>bedInfo(id).post==='A');const b=r.beds.filter(id=>bedInfo(id).post==='B');
    return `<tr><td><span class="person-title">Escala ${r.slot}</span><span class="person-meta">${esc(r.name)}</span>
    ${r.role!=='tech'?`<span class="pill pill-amber">${esc(ROLES[r.role])}</span>`:''}</td>
    <td><div class="assignments">${bedTags(a)}</div></td><td><div class="assignments">${bedTags(b)}</div></td>
    <td><span class="num">${r.patients}</span> ${r.posts.A>0&&r.posts.B>0?'<span class="pill pill-teal">Compartilhado</span>':''}</td>
    <td><span class="num">${r.baths}</span>${r.baths>3?' <span class="pill pill-amber">exceção</span>':r.baths===3?' <span class="pill">padrão</span>':''}</td>
    <td><span class="num">${r.bedridden}</span></td></tr>`;
  }).join('');
  return `<section class="panel print-panel" id="schedule-panel">
    <div class="panel-header"><div><h2>Distribuição por profissional</h2>
      <p class="panel-subtitle">Confira os leitos por profissional e use “Revisar para impressão” para personalizar toda a distribuição.</p></div>
      <span class="pill ${missing.length?'pill-amber':'pill-teal'}">${missing.length?`${missing.length} sem responsável`:`${t.occupied} pacientes contabilizados`}</span></div>
    ${rows.length?`<div class="table-wrap"><table aria-label="Distribuição dos pacientes"><thead><tr>
      <th>Escala / Profissional</th><th>Posto A</th><th>Posto B</th><th>Pacientes</th><th>Banhos</th><th>Acamados</th>
    </tr></thead><tbody>${body}</tbody></table></div>`:`<div class="empty"><strong>Nenhum profissional ativo</strong>Ative a equipe antes de distribuir pacientes.</div>`}
    ${missing.length?`<div class="panel-body"><div class="notice error"><span>!</span><div><strong>Leitos ocupados sem responsável</strong>
      <div>${esc(missing.join(', '))}. Faça a redistribuição ou atribua manualmente após resolver os impedimentos.</div></div></div></div>`:''}
    <div class="panel-body no-print"><div class="split-sum"><span class="section-kicker">Legenda</span>
      <span class="bed-tag">202A</span><span class="text-muted">Leito ocupado</span>
      <span class="bed-tag bed-iso">211A ◈</span><span class="text-muted">Paciente em isolamento (revisar precauções)</span>
      <span class="pill pill-teal">Compartilhado</span><span class="text-muted">Atende ambos os postos</span></div></div>
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
function scheduleView(){return `${metrics()}${alerts()}<div class="row-actions no-print review-cta"><button class="btn btn-primary" data-action="edit-open">✎ Personalizar escala antes de imprimir</button></div>${schedulePanel()}`;}
function editorView(){
  const draft=ui.draftAssignment || state.assignment;
  const active=state.staff.filter(s=>s.active);
  const check=validateSchedule(state,draft);
  const lines=post=>occupied().filter(b=>bedInfo(b.id).post===post).sort((a,b)=>a.id.localeCompare(b.id,'pt-BR',{numeric:true}));
  const opts=bed=>`<option value="">— Sem responsável —</option>`+active.filter(s=>canAttend(bed,s)).map(s=>`<option value="${s.slot}" ${Number(draft[bed.id])===s.slot?'selected':''}>Escala ${s.slot} · ${esc(s.name)}</option>`).join('');
  const row=bed=>`<tr><td><strong>${esc(bed.id)}</strong></td><td><span class="pill">Posto ${bedInfo(bed.id).post}</span></td>
    <td>${esc([bed.bedridden?'Acamado':null,bed.enteral?'Enteral':null,bed.sexRestriction==='male'?'Somente homem':bed.sexRestriction==='female'?'Somente mulher':null,bed.isolation!=='none'?'Precaução':null].filter(Boolean).join(' · ')||'Sem restrições')}</td>
    <td>${bathApplies(bed,state.shift)?'Sim':'Não'}</td>
    <td><select class="mini-select edit-select" data-edit-bed="${esc(bed.id)}" aria-label="Responsável pelo leito ${esc(bed.id)}">${opts(bed)}</select></td></tr>`;
  const validation=check.errors.length?`<div class="notice error"><span>!</span><div><strong>${check.errors.length} impedimento(s) no rascunho</strong><ul>${check.errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>`:
    `<div class="notice ${check.warnings.length?'warning':''}"><span>✓</span><div><strong>${check.warnings.length?'Distribuição sem impedimentos, com alertas para conferência.':'Rascunho sem impedimentos obrigatórios.'}</strong>${check.warnings.length?`<ul>${check.warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div></div>`;
  return `${metrics()}<div class="notice"><span>✎</span><div><strong>Personalização antes do documento:</strong> modifique os responsáveis na tabela, clique em <strong>Salvar alterações</strong>, confira a prévia e só então <strong>Imprimir / salvar PDF</strong>. Uma troca pode exigir várias mudanças antes de salvar. A Escala 1 aceita apenas 223A/B e 224A/B. O limite habitual é de 3 banhos; com menos de 8 técnicos, o quarto banho é uma exceção.</div></div>
    <section class="panel no-print"><div class="panel-header"><div><h2>1. Personalizar distribuição</h2><p class="panel-subtitle">Alterações podem ser feitas em lote; regras obrigatórias são verificadas ao salvar.</p></div>
      <span class="pill ${ui.draftDirty?'pill-amber':'pill-teal'}" id="draft-state">${ui.draftDirty?'Alterações não salvas':'Sem alterações pendentes'}</span></div>
      <div class="panel-body"><div class="row-actions review-actions"><button class="btn btn-primary" data-action="edit-apply">✓ Salvar alterações e validar</button>
      <button class="btn" data-action="edit-check">Conferir rascunho</button><button class="btn" data-action="edit-reset">Descartar alterações</button></div>
      ${ui.draftDirty?'<p class="form-note">As opções abaixo foram alteradas. Salve para atualizar a prévia e liberar a impressão.</p>':''}
      ${validation}
      <div class="table-wrap"><table class="edit-table"><thead><tr><th>Leito</th><th>Posto</th><th>Características</th><th>Banho</th><th>Profissional (editável)</th></tr></thead><tbody>
      ${[...lines('A'),...lines('B')].map(row).join('')}</tbody></table></div></div></section>
    <section class="panel no-print"><div class="panel-header"><div><h2>2. Personalizar documento</h2><p class="panel-subtitle">Essas informações aparecem no impresso e no PDF do navegador.</p></div></div>
      <div class="panel-body"><div class="print-editor-fields"><label class="label-field">Título do documento<input type="text" class="text-input" data-global="printTitle" maxlength="100" value="${esc(state.printTitle)}" /></label>
      <label class="label-field">Observações para o plantão<textarea class="text-input" rows="3" data-global="printNotes" maxlength="650" placeholder="Ex.: observações operacionais da escala; evite dados pessoais de pacientes">${esc(state.printNotes)}</textarea></label>
      <label class="checkline"><input type="checkbox" data-global="includeVacancies" ${state.includeVacancies?'checked':''} /> Incluir leitos vagos e bloqueados na impressão</label></div></div></section>
    <div class="no-print review-actions"><button class="btn btn-primary" data-action="finalize-print">⎙ Imprimir / salvar em PDF</button>
    <span class="form-note">O documento só será liberado se o rascunho estiver salvo e sem impedimentos.</span></div>
    <section class="panel no-print"><div class="panel-header"><div><h2>3. Prévia do documento</h2><p class="panel-subtitle">Distribuição atual${ui.draftDirty?' (prévia do rascunho, ainda não salva)':''}.</p></div></div></section>
    ${schedulePanel(draft)}`;
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
          <select class="mini-select" data-bed="${esc(b.id)}" data-bed-field="status" aria-label="Status ${esc(b.id)}">
            ${Object.keys(OPTIONS).map(key=>`<option value="${key}" ${b.status===key?'selected':''}>${esc(statusLabel(key))}</option>`).join('')}</select></div>
        ${active?`<div class="bed-details">
          <div class="flag-grid">
            <label class="checkline"><input type="checkbox" data-bed="${esc(b.id)}" data-bed-field="bedridden" ${b.bedridden?'checked':''}> Acamado</label>
            <label class="checkline"><input type="checkbox" data-bed="${esc(b.id)}" data-bed-field="enteral" ${b.enteral?'checked':''}> Sonda enteral</label>
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
            </select></label></div>
        </div>`:`<div class="form-note">${b.status==='vacant'?'Sem paciente — não contabilizado':b.status==='blocked'?'Leito indisponível para admissão':'Leito bloqueado por necessidade de isolamento — não distribuir'}</div>`}
      </div>`;
    }).join('');
    return `<article class="room-card"><div class="room-heading"><h4>Quarto ${room}</h4><small>${occupiedCount} / 2 ocupado(s)</small></div>${inner}</article>`;
  }).join('');
}
function bedsView(){return `${metrics()}<div class="notice"><span>ⓘ</span><div><strong>Diferença importante:</strong> “Bloqueado por isolamento” significa que aquele leito não pode receber paciente e não é distribuído. Para um paciente internado sob precaução, mantenha o leito como <strong>ocupado</strong> e selecione a precaução adicional. Os banhos padrão são previstos pelos quartos pares no diurno e ímpares no noturno.</div></div>
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
      <span class="form-note">Área usual: ${esc(HOME_ROOMS[s.slot].join(' · '))}</span>
    </div>
    <label class="label-field">Categoria / cobertura
      <select class="mini-select" data-staff="${s.slot}" data-staff-field="role">
      ${Object.entries(ROLES).map(([value,label])=>`<option value="${value}" ${s.role===value?'selected':''}>${esc(label)}</option>`).join('')}
      </select></label>
    <div class="staff-rules">
      <label class="label-field">Sexo do profissional<select class="mini-select" data-staff="${s.slot}" data-staff-field="sex"><option value="female" ${s.sex==='female'?'selected':''}>Mulher</option><option value="male" ${s.sex==='male'?'selected':''}>Homem</option></select></label>
      <label class="checkline"><input type="checkbox" data-staff="${s.slot}" data-staff-field="canEnteral" ${s.canEnteral?'checked':''}> Pode assumir sonda enteral</label>
      <label class="checkline"><input type="checkbox" data-staff="${s.slot}" data-staff-field="canBedridden" ${s.canBedridden?'checked':''}> Pode assumir pacientes acamados</label>
      <label class="status-toggle"><input type="checkbox" data-staff="${s.slot}" data-staff-field="active" ${s.active?'checked':''}> Presente no plantão</label>
    </div>
    <div class="staff-actions">${s.active?`<button class="btn btn-sm btn-danger" data-action="remove-modal" data-slot="${s.slot}">↪ Retirar</button>`:`<span class="pill">Ausente</span>`}</div>
  </div>`).join('');
  return `${metrics()}<div class="notice"><span>ⓘ</span><div>Ative somente os profissionais presentes. Os campos de restrição representam a elegibilidade definida e verificada pela instituição. Se um técnico não puder assumir pacientes acamados ou com sonda enteral, desmarque a competência correspondente. O limite é de até 9 posições de escala nesta versão.</div></div>
    <section class="panel"><div class="panel-header"><div><h2>Cadastro e presença dos profissionais</h2>
      <p class="panel-subtitle">Os profissionais têm restrições independentes; selecione o enfermeiro de cobertura ou técnico de apoio quando necessário.</p></div>
      <button class="btn btn-sm" data-action="remove-modal">Registrar intercorrência</button></div><div class="panel-body"><div class="staff-list">${items}</div></div></section>`;}
function historyView(){return `<section class="panel"><div class="panel-header"><div><h2>Histórico de versões</h2><p class="panel-subtitle">Snapshots locais antes de gerar, revisar ou alterar a distribuição. Até 20 versões.</p></div>
    <button class="btn btn-sm" data-action="json">↓ Exportar dados JSON</button></div><div class="panel-body">
    ${state.history.length?`<div class="timeline">${state.history.map((h,i)=>`<div class="timeline-item"><div>
      <strong>${esc(h.action)}</strong><span>${esc(new Date(h.when).toLocaleString('pt-BR'))} · ${esc(dateBR(h.state.date))} · ${h.state.shift==='day'?'Diurno':'Noturno'}
      ${h.reason?` · ${esc(h.reason)}`:''}</span></div>
      <button class="btn btn-sm" data-action="restore" data-index="${i}">Restaurar</button></div>`).join('')}</div>`:'<div class="empty"><strong>Sem versões anteriores</strong>As revisões e remanejamentos ficarão registrados aqui, neste navegador.</div>'}
    </div></section>`;}
function rulesView(){const rules=[
  ['Território e aproximação','Posto A: 201–208, 220–224. Posto B: 209–212, 214–219. Quarto 213 não integra a escala. O mapa de proximidade é heurístico, conforme as orientações fornecidas.'],
  ['Máximo por profissional','Até 7 pacientes. Banho: até 3 por padrão; com menos de 8 técnicos, permitir 4 somente quando 3 não forem suficientes.'],
  ['Escala 1 — limite absoluto','Escala 1 somente pode assumir 223A, 223B, 224A e 224B, independentemente do número de profissionais ou da quantidade de pacientes.'],
  ['Banhos por turno','Diurno: quartos de numeração par. Noturno: quartos de numeração ímpar. Exceções podem ser registradas por leito.'],
  ['Acamados e complexidade','Evitar concentração de acamados e distribuição exclusivamente de pacientes acamados, equilibrando a carga assistencial entre elegíveis.'],
  ['Restrições dos profissionais','Cada leito pode exigir atendimento exclusivamente por homem ou exclusivamente por mulher; elegibilidade é obrigatória, além das competências cadastradas.'],
  ['Compartilhamento','Com número par de técnicos, ninguém divide postos. Com número ímpar e pacientes nos dois postos, um ou dois técnicos podem dividir os postos, com proximidade e proporcionalidade. Escala 1 nunca divide.'],
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
function modalHtml(){const m=ui.modal;if(!m)return '';
  if(m.type==='remove'){
    const active=state.staff.filter(s=>s.active);
    return `<div class="modal-overlay" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-label="Remanejamento de emergência">
      <div class="modal-head"><div><p class="eyebrow">Intercorrência no plantão</p><h2>Retirar profissional da escala</h2></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></div>
      <div class="modal-body"><p class="modal-help">O sistema tentará redistribuir os pacientes sem mexer nas atribuições que puderem ser preservadas. O histórico guardará a versão anterior.</p>
      <label class="label-field">Profissional que saiu <select id="removed-slot" class="control" style="width:100%">${active.map(s=>`<option value="${s.slot}" ${m.slot===s.slot?'selected':''}>Escala ${s.slot} · ${esc(s.name)}</option>`).join('')}</select></label>
      <label class="label-field">Motivo da intercorrência <select id="removed-reason" class="control" style="width:100%">
      <option value="Remanejamento para outro setor">Remanejamento para outro setor</option>
      <option value="Falta">Falta</option><option value="Doença / afastamento">Doença / afastamento</option>
      <option value="Saída antecipada">Saída antecipada</option><option value="Outro motivo">Outro motivo</option></select></label></div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-danger" data-action="remove-confirm">Retirar e redistribuir</button></div></div></div>`;
  }
  if(m.type==='assign'){
    const bed=state.beds.find(x=>x.id===m.id);const staff=state.staff.filter(s=>s.active);
    const chosen=state.assignment[m.id];
    return `<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="Atribuição manual de paciente">
      <div class="modal-head"><div><p class="eyebrow">Ajuste manual</p><h2>Leito ${esc(m.id)}</h2></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></div>
      <div class="modal-body"><p class="modal-help">${esc([bed?.bedridden?'Paciente acamado':null,bed?.enteral?'Sonda enteral':null,bed?.sexRestriction==='female'?'Somente profissional mulher':bed?.sexRestriction==='male'?'Somente profissional homem':null,bed?.isolation!=='none'?'Precaução adicional':null].filter(Boolean).join(' · ')||'Paciente sem restrições cadastradas')}</p>
      <label class="label-field">Novo responsável <select id="manual-slot" class="control" style="width:100%">
        ${staff.map(s=>`<option value="${s.slot}" ${chosen===s.slot?'selected':''} ${!canAttend(bed,s)?'disabled':''}>Escala ${s.slot} · ${esc(s.name)}${canAttend(bed,s)?'':' (restrição incompatível)'}</option>`).join('')}</select></label>
      <div class="notice warning"><span>ⓘ</span><div>O ajuste respeita 7 pacientes, 3 banhos (ou 4 excepcionalmente com menos de 8 técnicos), a Escala 1 exclusiva para 223/224 e postos separados com técnicos em número par.</div></div></div>
      <div class="modal-foot"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="assign-confirm">Salvar ajuste</button></div></div></div>`;
  }
  return '';
}
function render(){const [ic,title]=VIEWS[ui.view];
  const screen={schedule:scheduleView,edit:editorView,beds:bedsView,staff:staffView,history:historyView,rules:rulesView}[ui.view]();
  $('#app').innerHTML=`<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-icon">✚</div>
    <div><strong>Escala Assistencial</strong><span>Distribuição inteligente · v1.1</span></div></div>
    <p class="nav-title">Espaço de trabalho</p><nav class="nav" aria-label="Navegação principal">
      ${Object.entries(VIEWS).map(([id,[icon,label]])=>`<button class="nav-btn ${ui.view===id?'active':''}" data-view="${id}"><span class="nav-icon">${icon}</span>${esc(label)}</button>`).join('')}</nav>
    <div class="sidebar-foot"><strong>● Armazenamento local</strong><p>Projeto estático para GitHub Pages. Não use dados identificadores de pacientes neste protótipo.</p></div>
  </aside><main class="workspace">${header()}${screen}${state.includeVacancies?reportPanel():''}${state.printNotes?.trim()?`<section class="panel print-panel print-observations"><div class="panel-header"><h2>Observações do plantão</h2></div><div class="panel-body">${esc(state.printNotes)}</div></section>`:''}
    <div class="print-only print-foot">Conferido por: ____________________________________ &nbsp;&nbsp; Assinatura: ____________________________<p>Escala provisória, sujeita à conferência e validação do(a) enfermeiro(a) responsável. Data/hora de impressão: ${esc(new Date().toLocaleString('pt-BR'))}.</p></div>
    ${footer()}</main></div>${modalHtml()}${ui.toast?`<div class="toast ${ui.toast.error?'error':''}" role="status">${esc(ui.toast.message)}</div>`:''}`;
}
function tryGenerate(preserve=false){
  const backup=clone(state.assignment);
  const out=generateSchedule(state,{preserve});
  if(out.ok){
    record(preserve?'Antes da redistribuição':'Antes da geração',preserve?'Preservar distribuição anterior':'Nova distribuição');
    state.assignment=out.assignment;state.stale=false;state.generatedAt=new Date().toISOString();state.lastError=[];
    commit();const v=validateSchedule(state);
    toast(v.errors.length?'Escala gerada com pendências de conferência.':v.warnings.length?'Escala gerada. Revise os alertas.':'Escala gerada e validada quanto às regras cadastradas.',!!v.errors.length);
  } else {
    state.assignment=backup;state.lastError=out.errors;state.stale=true;commit();toast('Não foi possível completar a distribuição. Consulte os alertas.',true);
  }
}
function recalcAfterChange(){state.stale=true;state.demo=false;state.lastError=[];commit();}
function removePerson(slot,reason){
  const s=state.staff.find(x=>x.slot===slot);
  if(!s||!s.active)return;
  record('Saída de profissional',`Escala ${slot} · ${s.name} · ${reason}`);
  const old=clone(state.assignment);
  s.active=false;
  state.assignment=Object.fromEntries(Object.entries(state.assignment).filter(([bed,person])=>Number(person)!==slot));
  // Mantém dados anteriores ao remanejamento para preservar atribuições no novo cálculo.
  const out=generateSchedule({...state,assignment:old},{preserve:true});
  ui.modal=null;ui.view='schedule';
  if(out.ok){state.assignment=out.assignment;state.stale=false;state.generatedAt=new Date().toISOString();state.lastError=[];
    commit();toast(`Escala ${slot} retirada. Pacientes redistribuídos. Revise os alertas.`);
  } else {state.lastError=out.errors;state.stale=true;commit();toast(`Profissional retirado, mas não foi possível redistribuir todos os pacientes.`,true);}
}
function openEditor(){
  ui.view='edit';ui.draftAssignment=clone(state.assignment);ui.draftDirty=false;render();
}
function applyDraft(){
  if(!ui.draftAssignment)return toast('Nenhum rascunho para salvar.',true);
  const validation=validateSchedule(state,ui.draftAssignment);
  if(validation.errors.length){render();return toast(`A escala contém ${validation.errors.length} impedimento(s). Corrija antes de salvar.`,true);}
  record('Antes da personalização para impressão','Revisão manual da distribuição');
  state.assignment=clone(ui.draftAssignment);state.stale=false;state.generatedAt=new Date().toISOString();state.lastError=[];state.demo=false;
  ui.draftDirty=false;commit();toast(validation.warnings.length?'Personalização salva. Revise os alertas antes de imprimir.':'Personalização salva e validada.');
}
function printConfirmed(){
  if(ui.draftDirty)return toast('Salve ou descarte as alterações na distribuição antes de imprimir.',true);
  const validation=validateSchedule(state);
  if(state.stale || validation.errors.length)return toast('Escala pendente ou com impedimentos: gere, personalize e salve antes de imprimir.',true);
  render();window.print();
}
function manualAssign(id,slot){
  const bed=state.beds.find(x=>x.id===id),person=state.staff.find(s=>s.active&&s.slot===slot);
  if(!bed||bed.status!=='occupied'||!person||!canAttend(bed,person))return toast('Profissional incompatível com as restrições do paciente.',true);
  const draft={...state.assignment,[id]:slot};
  const v=validateSchedule(state,draft);
  if(v.errors.length)return toast(`Ajuste recusado: ${v.errors[0]} Utilize “Revisar para impressão” para trocar vários leitos juntos.`,true);
  record('Antes do ajuste manual',`Leito ${id}: Escala ${state.assignment[id]||'sem responsável'} → ${slot}`);
  state.assignment=draft;state.stale=false;state.generatedAt=new Date().toISOString();state.lastError=[];ui.modal=null;commit();
  const checked=validateSchedule(state);toast(checked.warnings.length?'Ajuste salvo. Confira a proporcionalidade.':'Atribuição atualizada.');
}
function download(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvField(value){return '"'+String(value??'').replaceAll('"','""')+'"';}
function exportCsv(){let out=[['Data',state.date],['Turno',state.shift==='day'?'Diurno':'Noturno'],['Enfermeiro responsável',state.responsible],[],
    ['Posto','Leito','Situação','Escala','Profissional','Banho','Acamado','Sonda enteral','Restrição por sexo','Precaução adicional']];
  for(const b of state.beds){const info=bedInfo(b.id),s=state.staff.find(s=>s.slot===Number(state.assignment[b.id]));
    out.push([info.post,b.id,statusLabel(b.status),b.status==='occupied'?(s?.slot||'Pendente'):'',
      b.status==='occupied'?s?.name||'Pendente':'',b.status==='occupied'?(bathApplies(b,state.shift)?'Sim':'Não'):'',
      b.status==='occupied'?(b.bedridden?'Sim':'Não'):'',b.status==='occupied'?(b.enteral?'Sim':'Não'):'',
      b.status==='occupied'?({female:'Somente mulher',male:'Somente homem',any:'Sem restrição'}[b.sexRestriction]||'Sem restrição'):'',b.status==='occupied'?ISOLATIONS[b.isolation]:'']);
  }
  for(const post of ['A','B'])for(const status of ['vacant','blocked','isolation-blocked']){
    out.push([]);out.push([`Posto ${post} - ${statusLabel(status)}`,state.beds.filter(b=>bedInfo(b.id).post===post&&b.status===status).map(x=>x.id).join(', ')]);
  }
  download(`escala-${state.date}-${state.shift}.csv`,'\ufeff'+out.map(r=>r.map(csvField).join(';')).join('\r\n'),'text/csv;charset=utf-8');toast('Arquivo CSV exportado.');}
function exportJSON(){download(`backup-escala-${state.date}-${state.shift}.json`,JSON.stringify(state,null,2),'application/json;charset=utf-8');toast('Backup JSON exportado.');}
async function importJSON(file){try{
  if(file.size>2_500_000)throw Error('Arquivo muito grande.');
  const data=JSON.parse(await file.text());
  if(data.version!==1||!Array.isArray(data.beds)||!Array.isArray(data.staff)||data.beds.length!==46||data.staff.length!==9)throw Error('Backup incompatível.');
  const ids=new Set(data.beds.map(x=>x.id));
  if(BEDS.some(b=>!ids.has(b.id)))throw Error('A lista de leitos não corresponde ao setor.');
  if(!confirm('Importar o backup substituirá os dados atuais deste navegador. Continuar?'))return;
  localStorage.setItem(STORAGE,JSON.stringify(data));state=loadState();ui.view='schedule';ui.filter='';ui.bedFilter='all';commit();toast('Backup importado com sucesso.');
}catch(e){toast(`Falha na importação: ${e.message}`,true);}}

$('#app').addEventListener('click',e=>{
  const tab=e.target.closest('[data-view]');if(tab){if(ui.view==='edit'&&ui.draftDirty&&tab.dataset.view!=='edit'&&!confirm('Há alterações não salvas no rascunho. Deseja descartá-las?'))return;if(tab.dataset.view==='edit')openEditor();else{ui.draftDirty=false;ui.draftAssignment=null;ui.view=tab.dataset.view;render();}return;}
  const b=e.target.closest('[data-action]');if(!b)return;
  const action=b.dataset.action;
  if(action==='close-modal'){ui.modal=null;render();return;}
  if(action==='edit-open'){openEditor();return;}
  if(action==='edit-check'){render();return;}
  if(action==='edit-reset'){ui.draftAssignment=clone(state.assignment);ui.draftDirty=false;render();return;}
  if(action==='edit-apply'){applyDraft();return;}
  if(action==='finalize-print'){printConfirmed();return;}
  if(action==='generate'){if(ui.view==='edit'&&ui.draftDirty&&!confirm('As alterações não salvas serão descartadas ao gerar outra escala. Continuar?'))return;ui.draftDirty=false;ui.view='schedule';tryGenerate(false);return;}
  if(action==='preserve'){if(ui.view==='edit'&&ui.draftDirty&&!confirm('As alterações não salvas serão descartadas ao redistribuir. Continuar?'))return;ui.draftDirty=false;ui.view='schedule';tryGenerate(true);return;}
  if(action==='remove-modal'){
    const active=state.staff.filter(s=>s.active);
    if(!active.length)return toast('Não há profissionais ativos para retirar.',true);
    ui.modal={type:'remove',slot:Number(b.dataset.slot)||active[0].slot};render();return;
  }
  if(action==='remove-confirm'){
    const slot=Number($('#removed-slot')?.value),reason=$('#removed-reason')?.value||'Não informado';
    removePerson(slot,reason);return;
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
    Object.assign(state,before);ui.view='schedule';commit();toast('Versão restaurada. Confira a escala.');return;
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
  if(x.dataset.editBed){ui.draftAssignment ||= clone(state.assignment);if(x.value)ui.draftAssignment[x.dataset.editBed]=Number(x.value);else delete ui.draftAssignment[x.dataset.editBed];ui.draftDirty=true;const badge=$('#draft-state');if(badge){badge.textContent='Alterações não salvas';badge.className='pill pill-amber';}return;}
  if(x.dataset.global){const k=x.dataset.global;state[k]=x.type==='checkbox'?x.checked:x.value;
    if(k==='date'||k==='shift')recalcAfterChange();else commit();return;}
  if(x.dataset.bed){const b=state.beds.find(z=>z.id===x.dataset.bed);if(!b)return;
    const field=x.dataset.bedField;b[field]=x.type==='checkbox'?x.checked:x.value;
    recalcAfterChange();return;}
  if(x.dataset.staff){const s=state.staff.find(z=>z.slot===Number(x.dataset.staff));if(!s)return;
    const field=x.dataset.staffField;s[field]=x.type==='checkbox'?x.checked:x.value;
    recalcAfterChange();return;}
  if(x.id==='bed-status-filter'){ui.bedFilter=x.value;render();return;}
  if(x.id==='import-json'&&x.files?.[0]){importJSON(x.files[0]);return;}
});
$('#app').addEventListener('input',e=>{
  if(e.target.id==='bed-search'){
    const selectionStart=e.target.selectionStart;ui.filter=e.target.value;render();
    const field=$('#bed-search');field?.focus();try{field?.setSelectionRange(selectionStart,selectionStart);}catch(_){/* search inputs */}
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ui.modal){ui.modal=null;render();}});
render();
