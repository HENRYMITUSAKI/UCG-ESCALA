import { BEDS, bedInfo } from './engine.js';

export const NURSE_IDS = ['A', 'A2', 'B', 'B2', 'AB'];
export const MAX_TEAM_MEMBERS = BEDS.length;
export function nurseCount(value) { return [2,3,4].includes(Number(value)) ? Number(value) : 4; }
export function nurseRoles(value) {
  const count=nurseCount(value);
  if(count===2) return [{id:'A',post:'A',label:'Enfermeiro A'},{id:'B',post:'B',label:'Enfermeiro B'}];
  if(count===3) return [{id:'A',post:'A',label:'Enfermeiro A'},{id:'B',post:'B',label:'Enfermeiro B'},{id:'AB',post:'AB',label:'Enfermeiro AB'}];
  return [{id:'A',post:'A',label:'Enfermeiro A1'},{id:'A2',post:'A',label:'Enfermeiro A2'},
    {id:'B',post:'B',label:'Enfermeiro B1'},{id:'B2',post:'B',label:'Enfermeiro B2'}];
}
export function nurseNames(value) {
  return Object.fromEntries(NURSE_IDS.map(id=>[id,typeof value?.[id]==='string'?value[id].slice(0,85):'']));
}
export function groupedBeds(ids) {
  const rooms=new Map();
  for(const id of new Set(ids)) {
    if(!bedInfo(id)) continue;
    const room=id.slice(0,3);
    if(!rooms.has(room)) rooms.set(room,new Set());
    rooms.get(room).add(id.slice(3));
  }
  return [...rooms].sort(([a],[b])=>Number(a)-Number(b)).map(([room,suffixes])=>room+[...suffixes].sort().join(''));
}

// Find the largest readable scale that fits the complete measured content.
// measure receives the unscaled width, so line wrapping is included in fitting.
export function printScaleForPage(width,height,measure) {
  const fits=scale=>{const size=measure(width/scale);return size.height*scale<=height&&size.width*scale<=width+.5;};
  if(fits(1))return 1;
  let low=.001,high=1;
  for(let i=0;i<16;i++){
    const candidate=(low+high)/2;
    if(fits(candidate))low=candidate;else high=candidate;
  }
  return low;
}

// One occupied bed and one vacant bed each count as one place to cover.
// Thus a nurse with more possible admissions receives fewer current patients.
// Keep rooms together when the difference in coverage is at most two places.
export function generateNurseAssignment(beds,value,overrides={}) {
  const count=nurseCount(value),roles=nurseRoles(count);
  const eligible=beds.filter(b=>bedInfo(b.id)&&['occupied','vacant'].includes(b.status));
  const byId=new Map(eligible.map(b=>[b.id,b]));
  const orderA=count===3?[201,202,203,204,205,206,207,208,224,223,222,221,220]
    :[201,202,203,204,205,224,223,206,207,208,220,221,222];
  const orderB=[209,210,211,212,214,215,216,217,218,219];
  const ordered=rooms=>rooms.flatMap(room=>['A','B'].map(s=>`${room}${s}`)).filter(id=>byId.has(id));
  const a=ordered(orderA),b=ordered(orderB),assignment={};
  const splitPenalty=(ids,cut)=>cut>0&&cut<ids.length&&ids[cut-1].slice(0,3)===ids[cut].slice(0,3)?100:0;
  const spread=loads=>{const mean=loads.reduce((x,y)=>x+y,0)/loads.length;const excess=Math.max(0,Math.max(...loads)-Math.min(...loads)-2);return excess**2*10000+loads.reduce((s,n)=>s+(n-mean)**2,0)*20;};
  if(count===2) {a.forEach(id=>assignment[id]='A');b.forEach(id=>assignment[id]='B');}
  if(count===4) {
    for(const [ids,first,second] of [[a,'A','A2'],[b,'B','B2']]) {
      let best=Infinity,cut=0;
      for(let i=0;i<=ids.length;i++) {
        const score=spread([i,ids.length-i])+splitPenalty(ids,i);
        if(score<best){best=score;cut=i;}
      }
      ids.forEach((id,i)=>assignment[id]=i<cut?first:second);
    }
  }
  if(count===3) {
    const usualA=a.filter(id=>Number(id.slice(0,3))<=208).length;
    const usualB=b.filter(id=>Number(id.slice(0,3))<=216).length;
    let best=Infinity,cutA=0,cutB=0;
    for(let i=0;i<=a.length;i++) for(let j=0;j<=b.length;j++) {
      const loads=[i,j,a.length+b.length-i-j];
      const noShared=a.length>1&&b.length>1&&((i===a.length)||(j===b.length))?2:0;
      const score=spread(loads)+splitPenalty(a,i)+splitPenalty(b,j)+noShared
        +Math.abs(i-usualA)*.1+Math.abs(j-usualB)*.1;
      if(score<best){best=score;cutA=i;cutB=j;}
    }
    a.forEach((id,i)=>assignment[id]=i<cutA?'A':'AB');
    b.forEach((id,i)=>assignment[id]=i<cutB?'B':'AB');
  }
  for(const [id,roleId] of Object.entries(overrides||{})) {
    const role=roles.find(r=>r.id===roleId);
    if(byId.has(id)&&role&&(role.post==='AB'||role.post===bedInfo(id).post)) assignment[id]=roleId;
  }
  return assignment;
}

// Fill gaps with the last active professional, retaining each position's post.
// slotMap follows people, so their patients are never silently given to another
// person just because the position numbers changed.
export function normalizeStaffSlots(staff) {
  const next=staff.map(s=>({...s}));
  const origin=new Map(next.filter(s=>s.active).map(s=>[s.slot,s.slot]));
  const count=origin.size;
  for(let slot=1;slot<=count;slot++) {
    const destination=next.find(s=>s.slot===slot);
    if(!destination||destination.active)continue;
    const last=next.filter(s=>s.active).sort((a,b)=>b.slot-a.slot)[0];
    const destinationIndex=next.indexOf(destination),lastIndex=next.indexOf(last);
    next[destinationIndex]={...last,slot,post:destination.post};
    next[lastIndex]={...destination,slot:last.slot,post:last.post};
    origin.set(slot,origin.get(last.slot));origin.delete(last.slot);
  }
  return {staff:next,slotMap:Object.fromEntries([...origin].map(([slot,oldSlot])=>[oldSlot,slot]))};
}

export function remapAssignment(assignment,slotMap) {
  return Object.fromEntries(Object.entries(assignment||{})
    .filter(([,slot])=>slotMap[Number(slot)]!==undefined)
    .map(([id,slot])=>[id,slotMap[Number(slot)]]));
}

// The last active professional fills the departing position. All removal
// entry points use this same operation, including the presence checkbox.
export function remapStaffAfterRemoval(staff,removedSlot) {
  const next=staff.map(s=>({...s})),removed=next.find(s=>s.slot===removedSlot&&s.active);
  if(!removed) return {...normalizeStaffSlots(next),replacementSlot:null};
  const last=next.filter(s=>s.active).sort((a,b)=>b.slot-a.slot)[0];
  removed.active=false;
  return {...normalizeStaffSlots(next),replacementSlot:last.slot===removedSlot?null:last.slot,
    replacementName:last.name,removedName:removed.name};
}

// A returning professional keeps their profile. A new professional fills the
// next position, creating it when all the existing positions are already used.
export function addStaffMember(staff,details,{existingSlot=null}={}) {
  const active=staff.filter(s=>s.active);
  if(active.length>=MAX_TEAM_MEMBERS)return {ok:false,error:'A equipe já possui um profissional para cada leito do setor.'};
  if(!details.name?.trim())return {ok:false,error:'Preencha o nome do técnico que está entrando.'};
  if(!['A','B'].includes(details.post))return {ok:false,error:'Selecione o posto de referência do novo técnico.'};
  if(!['female','male'].includes(details.sex))return {ok:false,error:'Informe o sexo do profissional para conferir as restrições dos pacientes.'};
  const next=staff.map(s=>({...s}));
  let person=existingSlot?next.find(s=>s.slot===Number(existingSlot)&&!s.active):next.find(s=>s.slot===active.length+1&&!s.active);
  if(existingSlot&&!person)return {ok:false,error:'Esse profissional já está presente ou não está cadastrado.'};
  if(!person){person={slot:active.length+1};next.push(person);}
  const sourceSlot=person.slot;
  Object.assign(person,{name:details.name.trim().slice(0,85),role:existingSlot&&['tech','support','nurse'].includes(person.role)?person.role:'tech',post:details.post,sex:details.sex,
    woman:details.sex==='female',canBedridden:details.canBedridden!==false,canEnteral:details.canEnteral!==false,
    pcrRole:['A','B','C','D'].includes(details.pcrRole)?details.pcrRole:'',duty:'',active:true});
  const normalized=normalizeStaffSlots(next);
  // A newly added position has the explicitly selected reference post.
  const addedSlot=normalized.slotMap[sourceSlot];
  normalized.staff.find(s=>s.slot===addedSlot).post=details.post;
  normalized.staff.sort((a,b)=>a.slot-b.slot);
  return {ok:true,...normalized,addedSlot};
}
