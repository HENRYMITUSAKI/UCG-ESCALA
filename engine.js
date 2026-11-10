/**
 * Motor de distribuição assistencial — protótipo local, sem dependências.
 * Todos os dados são fictícios até que o usuário os preencha.
 * As relações de proximidade são preferências informadas, NÃO distâncias aferidas.
 */
export const POST_A = [201,202,203,204,205,206,207,208,220,221,222,223,224];
export const POST_B = [209,210,211,212,214,215,216,217,218,219];
export const ROOMS = [...POST_A, ...POST_B].sort((a,b) => a-b);
export const BEDS = [...POST_A.map(n => ({room:n,post:'A'})), ...POST_B.map(n => ({room:n,post:'B'}))]
  .flatMap(item => ['A','B'].map(suffix => ({id:`${item.room}${suffix}`, ...item})));
export const TRANSITION_A = [220,221,222,223];
export const TRANSITION_B = [217,218,219];
export const MAX_PATIENTS = 7;
export const MAX_BATHS = 3;
export const EXCEPTIONAL_MAX_BATHS = 4;
export const ESCALA_1_BEDS = new Set(['223A','223B','224A','224B']);
export function techCount(staff) { return staff.filter(s => s.active && s.role !== 'nurse').length; }
export function bathLimit(staff) { return techCount(staff) < 8 ? EXCEPTIONAL_MAX_BATHS : MAX_BATHS; }
export function canUseSlot(bed,staff) { return staff?.slot !== 1 || ESCALA_1_BEDS.has(bed.id); }

export const HOME_ROOMS = {
  1:[201,202,203,204,205,223,224],
  2:[206,207,208,220,222,223,224],
  3:[220,221,222,223,224],
  4:[217,218,219,220,221,222,223],
  5:[209,218,219],
  6:[210,216,217],
  7:[211,212,214,215],
  8:[214,215,216,217,218,219],
  9:[217,218,219,220,221,222,223]
};

const bedroomById = new Map(BEDS.map(b => [b.id,b]));
export function bedInfo(id) { return bedroomById.get(id); }
export function bathApplies(bed, shift) {
  if (!bed || bed.status !== 'occupied') return false;
  if (bed.bath === 'yes') return true;
  if (bed.bath === 'no') return false;
  return (Number(bed.id.slice(0,3)) % 2 === 0) === (shift === 'day');
}
export function canAttend(bed, staff) {
  return !!(staff?.active &&
    (!bed.bedridden || staff.canBedridden) &&
    (!bed.enteral || staff.canEnteral) &&
    canUseSlot(bed, staff) &&
    (!(bed.sexRestriction === 'female' || (!bed.sexRestriction && bed.womenOnly)) || (staff.sex || (staff.woman ? 'female' : 'male')) === 'female') &&
    (!(bed.sexRestriction === 'male') || (staff.sex || (staff.woman ? 'female' : 'male')) === 'male')); 
}

function buildDistances() {
  const graph = new Map(ROOMS.map(r => [r, []]));
  function link(a,b,w=1) { graph.get(a).push([b,w]); graph.get(b).push([a,w]); }
  [POST_A.slice(0,8), POST_A.slice(8), POST_B.slice(0,4), POST_B.slice(4)]
    .forEach(xs => { for (let i=0;i<xs.length-1;i++) link(xs[i],xs[i+1],1); });
  // Agrupamentos informados pelo usuário. Pesos relativos, não metros.
  [201,202,203,204,205].forEach((r,i)=>link(r, i<3 ? 224 : 223, 1.35));
  [[206,224],[207,223],[208,222],[208,220],[208,221],
   [209,218],[209,219],[210,216],[210,217],[212,214],[212,215]]
    .forEach(([a,b])=>link(a,b,1.05));
  // A região 217–223 é a faixa de transição; o custo é heurístico.
  link(219,220,2.2); link(218,221,2.4); link(217,222,2.8);
  const out = new Map();
  for (const start of ROOMS) {
    const dist = new Map(ROOMS.map(r=>[r,Infinity])); dist.set(start,0);
    const seen = new Set();
    for (let j=0;j<ROOMS.length;j++) {
      let v=null, best=Infinity;
      for (const r of ROOMS) if (!seen.has(r) && dist.get(r)<best) {best=dist.get(r);v=r;}
      if (v===null) break;
      seen.add(v);
      for (const [next,w] of graph.get(v)) if (dist.get(next)>best+w) dist.set(next,best+w);
    }
    out.set(start,dist);
  }
  return out;
}
const DISTANCES = buildDistances();
function dist(a,b) { return DISTANCES.get(a)?.get(b) ?? 12; }
function affinity(room, staff, zone) {
  const anchors = zone === 'S' ? [...TRANSITION_A,...TRANSITION_B] : (HOME_ROOMS[staff.slot] || []);
  const choices = anchors.filter(r=>zone==='S' || (zone==='A' ? POST_A.includes(r) : POST_B.includes(r)));
  const samePost = zone === 'A' ? POST_A : zone === 'B' ? POST_B : ROOMS;
  const target = choices.length ? choices : samePost;
  return Math.min(...target.map(r=>dist(room,r)));
}
function zoneCost(staff,zone) {
  const slot=staff.slot;
  const matrix={
    1:{A:0,B:35,S:15},2:{A:0,B:35,S:15},3:{A:0,B:20,S:7},
    4:{A:5,B:17,S:0},5:{A:35,B:0,S:15},6:{A:35,B:0,S:15},
    7:{A:35,B:0,S:15},8:{A:30,B:0,S:10},9:{A:12,B:10,S:0}
  };
  return matrix[slot]?.[zone] ?? 10;
}
function combinations(arr,k) {
  if(k===0)return [[]];
  if(k>arr.length)return [];
  const result=[];
  function walk(start,chosen) {
    if(chosen.length===k){result.push(chosen.slice());return;}
    for(let i=start;i<=arr.length-(k-chosen.length);i++){chosen.push(arr[i]);walk(i+1,chosen);chosen.pop();}
  }
  walk(0,[]);return result;
}
function planZones(staff,beds,shift,preserve,bathCap=3) {
  const n=staff.length;
  const techCount = staff.filter(s=>s.role!=='nurse').length;
  const odd = techCount % 2 === 1;
  const a=beds.filter(b=>bedInfo(b.id).post==='A').length;
  const b=beds.length-a;
  const bathA=beds.filter(x=>bedInfo(x.id).post==='A'&&bathApplies(x,shift)).length;
  const bathB=beds.filter(x=>bedInfo(x.id).post==='B'&&bathApplies(x,shift)).length;
  const mustShare = odd && a > 0 && b > 0;
  const minCross = mustShare ? 1 : 0;
  const maxCross = mustShare ? Math.min(2,n) : 0;
  const proposals=[];
  for(let sharedCount=minCross;sharedCount<=maxCross;sharedCount++) {
    for(const shared of combinations(staff,sharedCount)) {
      if(shared.some(s=>s.role==='nurse' || s.slot===1) && sharedCount>0) continue; // o técnico divide o posto
      const remaining=staff.filter(s=>!shared.includes(s));
      for(let aN=0;aN<=remaining.length;aN++) {
        const bN=remaining.length-aN;
        if(a>7*(aN+sharedCount)-(b>0?sharedCount:0))continue;
        if(b>7*(bN+sharedCount)-(a>0?sharedCount:0))continue;
        if(bathA>bathCap*(aN+sharedCount)||bathB>bathCap*(bN+sharedCount))continue;
        if(a<sharedCount || b<sharedCount)continue;
        for(const aList of combinations(remaining,aN)) {
          const aSet=new Set(aList.map(s=>s.slot));
          const zones={};
          staff.forEach(s=>zones[s.slot]=shared.includes(s)?'S':aSet.has(s.slot)?'A':'B');
          if(staff.some(s=>s.slot===1 && zones[s.slot]!=='A'))continue;
          let rating=staff.reduce((sum,s)=>sum+zoneCost(s,zones[s.slot]),0);
          rating+=sharedCount*(odd?8:12);
          rating+=Math.abs(aN-(n-sharedCount)*(a/(a+b||1)))*7;
          if (preserve?.assignment) {
            for (const s of shared) {
              const past=beds.filter(x=>preserve.assignment[x.id]===s.slot);
              if(new Set(past.map(x=>bedInfo(x.id).post)).size===2)rating-=9;
            }
          }
          proposals.push({zones,shared:shared.map(s=>s.slot),rating});
        }
      }
    }
  }
  proposals.sort((x,y)=>x.rating-y.rating);
  // Incluir alternativas de zonas para cobrir ausências e restrições individuais.
  const selected=[];
  const split = n<=5 ? [20,20,20] : (odd ? [20,40,30] : [45,0,0]);
  for(let i=0;i<=2;i++)selected.push(...proposals.filter(p=>p.shared.length===i).slice(0,split[i]));
  return selected;
}

class MinCostFlow {
  constructor(n){this.n=n;this.g=Array.from({length:n},()=>[]);}
  add(u,v,cap,cost){
    const a={to:v,rev:this.g[v].length,cap,cost,initial:cap};
    const b={to:u,rev:this.g[u].length,cap:0,cost:-cost,initial:0};
    this.g[u].push(a);this.g[v].push(b);return a;
  }
  solve(source,sink,required) {
    const pot=new Float64Array(this.n);
    let sent=0,total=0;
    while(sent<required) {
      const d=Array(this.n).fill(Infinity),pu=Array(this.n).fill(-1),pe=Array(this.n).fill(-1);
      const used=new Uint8Array(this.n);d[source]=0;
      for(let step=0;step<this.n;step++) {
        let v=-1,md=Infinity;
        for(let i=0;i<this.n;i++)if(!used[i]&&d[i]<md){md=d[i];v=i;}
        if(v===-1)break;
        used[v]=1;
        for(let j=0;j<this.g[v].length;j++){
          const e=this.g[v][j];if(e.cap===0)continue;
          const nd=d[v]+e.cost+pot[v]-pot[e.to];
          if(nd<d[e.to]-1e-8){d[e.to]=nd;pu[e.to]=v;pe[e.to]=j;}
        }
      }
      if(!Number.isFinite(d[sink]))break;
      for(let i=0;i<this.n;i++)if(Number.isFinite(d[i]))pot[i]+=d[i];
      let flow=required-sent;
      for(let v=sink;v!==source;v=pu[v])flow=Math.min(flow,this.g[pu[v]][pe[v]].cap);
      for(let v=sink;v!==source;v=pu[v]){
        const e=this.g[pu[v]][pe[v]];e.cap-=flow;this.g[v][e.rev].cap+=flow;
        total+=flow*e.cost;
      }
      sent+=flow;
    }
    return {sent,total};
  }
}
function chooseAnchors(plan,staff,beds,shift,variant,preserve,bathCap) {
  const assignments={};
  const counts=new Map(staff.map(s=>[s.slot,{patients:0,baths:0}]));
  const reserved=new Set();
  for(const slot of plan.shared) {
    const person=staff.find(s=>s.slot===slot);
    for(const post of (variant===2 ? ['B','A']:['A','B'])) {
      const transition = post==='A'?TRANSITION_A:TRANSITION_B;
      const groups=[];
      for(const room of (post==='A'?POST_A:POST_B)) {
        const options=beds.filter(x=>Number(x.id.slice(0,3))===room&&!reserved.has(x.id)&&canAttend(x,person));
        if(!options.length)continue;
        const roomDistance=Math.min(...transition.map(r=>dist(room,r)));
        const prevBonus=preserve?.assignment && options.some(x=>preserve.assignment[x.id]===slot)?-0.6:0;
        groups.push({room,options,rank:roomDistance+prevBonus});
      }
      groups.sort((x,y)=>x.rank-y.rank || x.room-y.room);
      // Diversificar os pontos de ancoragem sem perder a zona de transição.
      const best=groups.filter(g=>g.rank<=Math.max(2.8,(groups[0]?.rank??0)+1.5));
      const ordered=[...best.slice(variant%Math.max(best.length,1)),...best.slice(0,variant%Math.max(best.length,1)),...groups.filter(g=>!best.includes(g))];
      let found=false;
      for(const group of ordered) {
        const count=counts.get(slot);
        let choices=group.options;
        if(plan.shared.length>1 || variant===1)choices=choices.slice(0,1);
        let bath=choices.filter(x=>bathApplies(x,shift)).length;
        if(count.patients+choices.length>7||count.baths+bath>bathCap){
          choices=group.options.slice(0,1);bath=choices.filter(x=>bathApplies(x,shift)).length;
        }
        if(!choices.length||count.patients+choices.length>7||count.baths+bath>bathCap)continue;
        for(const x of choices){assignments[x.id]=slot;reserved.add(x.id);}
        count.patients+=choices.length;count.baths+=bath;
        found=true;break;
      }
      if(!found)return null;
    }
  }
  return {assignments,counts};
}
function solvePlan(plan,staff,beds,shift,variant,preserve,bathCap) {
  const anchored=chooseAnchors(plan,staff,beds,shift,variant,preserve,bathCap);
  if(!anchored)return null;
  const left=beds.filter(x=>!anchored.assignments[x.id]);
  const n=1+left.length+3*staff.length+1, source=0,sink=n-1;
  const flow=new MinCostFlow(n);
  const start=1+left.length;
  const sMap=new Map(staff.map((s,i)=>[s.slot,{
    bath:start+i*3,non:start+i*3+1,total:start+i*3+2
  }]));
  const links=[];
  for(let i=0;i<left.length;i++){
    const bed=left[i],info=bedInfo(bed.id),room=info.room;
    flow.add(source,i+1,1,0);
    for(const s of staff) {
      const zone=plan.zones[s.slot];
      if(zone!=='S'&&zone!==info.post)continue;
      if(!canAttend(bed,s))continue;
      const slotNodes=sMap.get(s.slot);
      const bnode=bathApplies(bed,shift)?slotNodes.bath:slotNodes.non;
      let cost=Math.round(4.8*Math.min(affinity(room,s,zone),9));
      if(zone==='S' && !(TRANSITION_A.includes(room)||TRANSITION_B.includes(room)))cost+=15;
      if(preserve?.assignment)cost+=preserve.assignment[bed.id]===s.slot?0:38;
      if(bed.isolation && bed.isolation!=='none')cost+=1;
      // Desempate determinístico, sem dados pessoais.
      cost+=((room*7+s.slot*13+variant*3)%5);
      const edge=flow.add(i+1,bnode,1,cost);
      links.push({bed:bed.id,slot:s.slot,edge});
    }
  }
  for(const s of staff){
    const nodes=sMap.get(s.slot),current=anchored.counts.get(s.slot);
    const remain=7-current.patients;
    if(remain<0||current.baths>bathCap)return null;
    for(let j=current.baths;j<bathCap;j++)flow.add(nodes.bath,nodes.total,1,j<3?j*9:150);
    flow.add(nodes.non,nodes.total,7,0);
    for(let j=current.patients;j<7;j++)flow.add(nodes.total,sink,1,j*23);
  }
  const result=flow.solve(source,sink,left.length);
  if(result.sent!==left.length)return null;
  const assignment={...anchored.assignments};
  for(const link of links)if(link.edge.initial===1&&link.edge.cap===0)assignment[link.bed]=link.slot;
  return assignment;
}

export function statistics(assignment,beds,staff,shift) {
  const active=staff.filter(s=>s.active);
  const rows=active.map(s=>({slot:s.slot,name:s.name||`Profissional ${s.slot}`,role:s.role,
    patients:0,baths:0,bedridden:0,enteral:0,isolated:0,posts:{A:0,B:0},roomIds:new Set(),beds:[]}));
  const bySlot=new Map(rows.map(r=>[r.slot,r]));
  for(const b of beds.filter(x=>x.status==='occupied')) {
    const row=bySlot.get(Number(assignment[b.id]));
    if(!row)continue;
    const info=bedInfo(b.id);
    row.beds.push(b.id);row.patients++;row.posts[info.post]++;row.roomIds.add(info.room);
    if(bathApplies(b,shift))row.baths++;
    if(b.bedridden)row.bedridden++;
    if(b.enteral)row.enteral++;
    if(b.isolation && b.isolation!=='none')row.isolated++;
  }
  rows.forEach(r=>r.beds.sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})));
  return rows;
}
function scoreAssignment(assignment,beds,staff,shift,preserve) {
  const rows=statistics(assignment,beds,staff,shift);
  if(!rows.length)return Infinity;
  let score=0;
  const counts=rows.map(r=>r.patients),max=Math.max(...counts),min=Math.min(...counts),mean=beds.length/rows.length;
  score+=Math.max(0,max-min-1)*380;
  score+=counts.reduce((t,x)=>t+(x-mean)**2,0)*24;
  const baths=rows.map(x=>x.baths),bmean=baths.reduce((a,b)=>a+b,0)/rows.length;
  score+=baths.reduce((sum,x)=>sum+(x-bmean)**2,0)*11;
  const eligibleBed=rows.filter(r=>staff.find(s=>s.slot===r.slot)?.canBedridden);
  if(eligibleBed.length){
    const m=eligibleBed.reduce((a,r)=>a+r.bedridden,0)/eligibleBed.length;
    score+=eligibleBed.reduce((a,r)=>a+(r.bedridden-m)**2,0)*18;
  }
  for(const r of rows){
    const person=staff.find(s=>s.slot===r.slot);
    if(r.patients>0 && r.bedridden===r.patients && r.patients>1)score+=240;
    score+=Math.max(0,r.baths-3)*220;
    if(r.slot===1 && r.patients===0)score+=12;
    score+=r.roomIds.size*3;
    const rooms=[...r.roomIds];
    for(let i=0;i<rooms.length;i++){
      const d=affinity(rooms[i],person,r.posts.A>0 &&r.posts.B>0?'S':r.posts.A>0?'A':'B');
      score+=Math.min(d,7)*2.5;
      for(let j=0;j<i;j++){
        const apart=dist(rooms[i],rooms[j]);
        score+=Math.max(0,apart-2)*3.1;
      }
    }
    if(r.posts.A&&r.posts.B){
      const disparity=Math.abs(r.posts.A-r.posts.B);
      score+=32+disparity*10+Math.max(0,disparity-1)*115;
      for(const id of r.beds){
        const room=bedInfo(id).room;
        if(!TRANSITION_A.includes(room)&&!TRANSITION_B.includes(room))score+=17;
      }
    }
    if(person && !person.canBedridden && r.patients < mean)score+=(mean-r.patients)*4;
  }
  const rooms=new Map();
  for(const b of beds) {
    const room=bedInfo(b.id).room;
    if(!rooms.has(room))rooms.set(room,new Set());
    rooms.get(room).add(assignment[b.id]);
  }
  for(const owners of rooms.values())score+=(owners.size-1)*54;
  if(preserve?.assignment) {
    for(const b of beds)if(preserve.assignment[b.id]!==assignment[b.id])score+=preserve.weight??55;
  }
  const shared=rows.filter(r=>r.posts.A&&r.posts.B).length;
  score+=Math.max(0,shared-1)*30;
  return score;
}
function legalForZone(assignment,beds,staff,shift,zones,oddMandatory,bathCap){
  const rows=statistics(assignment,beds,staff,shift);
  if(rows.some(r=>r.patients>7||r.baths>bathCap))return false;
  for(const bed of beds){
    const s=staff.find(s=>s.slot===assignment[bed.id]);
    if(!canAttend(bed,s))return false;
    if(zones[s.slot]!=='S'&&zones[s.slot]!==bedInfo(bed.id).post)return false;
  }
  const shared=rows.filter(r=>r.posts.A&&r.posts.B).length;
  if(shared>2 || (!oddMandatory&&shared>0) || (oddMandatory&&shared<1))return false;
  if(rows.some(r=>r.posts.A&&r.posts.B&&Math.abs(r.posts.A-r.posts.B)>1))return false;
  return true;
}
function localImprove(initial,beds,staff,shift,zones,preserve,bathCap) {
  let best={...initial},bestScore=scoreAssignment(best,beds,staff,shift,preserve);
  const techOdd=staff.filter(s=>s.role!=='nurse').length%2===1;
  const bothPosts=new Set(beds.map(b=>bedInfo(b.id).post)).size===2;
  const oddMandatory=techOdd&&bothPosts;
  const ordered=beds.slice().sort((a,b)=>a.id.localeCompare(b.id));
  // Permutas e realocações locais com verificação integral das restrições.
  for(let round=0;round<3;round++){
    let improvement=null,score=bestScore;
    const rows=statistics(best,beds,staff,shift),bySlot=new Map(rows.map(x=>[x.slot,x]));
    for(const bed of ordered){
      const src=best[bed.id];
      for(const s of staff){
        if(s.slot===src || !canAttend(bed,s))continue;
        if(zones[s.slot]!=='S'&&zones[s.slot]!==bedInfo(bed.id).post)continue;
        const destination=bySlot.get(s.slot);
        if(destination.patients>=7||destination.baths+(bathApplies(bed,shift)?1:0)>bathCap)continue;
        const temp={...best,[bed.id]:s.slot};
        if(!legalForZone(temp,beds,staff,shift,zones,oddMandatory,bathCap))continue;
        const v=scoreAssignment(temp,beds,staff,shift,preserve);
        if(v<score-0.001){score=v;improvement=temp;}
      }
    }
    // Trocas de pacientes preservam a quantidade de cada profissional.
    for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
      const a=ordered[i],b=ordered[j],sa=best[a.id],sb=best[b.id];
      if(sa===sb)continue;
      const pa=staff.find(s=>s.slot===sa),pb=staff.find(s=>s.slot===sb);
      if(!canAttend(a,pb)||!canAttend(b,pa))continue;
      if(zones[sa]!=='S'&&zones[sa]!==bedInfo(b.id).post)continue;
      if(zones[sb]!=='S'&&zones[sb]!==bedInfo(a.id).post)continue;
      const shiftA=(bathApplies(b,shift)?1:0)-(bathApplies(a,shift)?1:0);
      const shiftB=-shiftA;
      if(bySlot.get(sa).baths+shiftA>bathCap||bySlot.get(sb).baths+shiftB>bathCap)continue;
      const temp={...best,[a.id]:sb,[b.id]:sa};
      if(!legalForZone(temp,beds,staff,shift,zones,oddMandatory,bathCap))continue;
      const v=scoreAssignment(temp,beds,staff,shift,preserve);
      if(v<score-0.001){score=v;improvement=temp;}
    }
    if(!improvement)break;
    best=improvement;bestScore=score;
  }
  return {assignment:best,score:bestScore};
}

/**
 * Não inventa alocações que violam limite de 7, banho<=3/4 ou restrições.
 * Se não houver solução nas alternativas examinadas, retorna explicação e não publica escala.
 */
export function generateSchedule(state,{preserve=false}={}) {
  const beds=state.beds.filter(b=>b.status==='occupied');
  const staff=state.staff.filter(s=>s.active);
  const shift=state.shift;
  const errors=[];
  if(!staff.length)errors.push('Não há profissionais ativos para distribuir os pacientes.');
  if(beds.length>staff.length*7)errors.push(`${beds.length} pacientes excedem a capacidade máxima de ${staff.length*7} com ${staff.length} profissionais.`);
  const bathTotal=beds.filter(b=>bathApplies(b,shift)).length;
  const cap=bathLimit(staff);
  if(bathTotal>staff.length*cap)errors.push(`${bathTotal} banhos previstos excedem o limite total de ${staff.length*cap} (${staff.length} profissionais × ${cap}).`);
  for(const b of beds)if(!staff.some(s=>canAttend(b,s)))errors.push(`Leito ${b.id}: nenhum profissional ativo atende a todas as restrições.`);
  if(errors.length)return {ok:false,errors};
  if(!beds.length)return {ok:true,assignment:{},score:0};
  const previously=preserve?{assignment:{...state.assignment},weight:80}:null;
  // Preferir rigidamente três banhos. Quarto banho é exceção se houver menos de 8 técnicos
  // e se não for encontrada solução completa com limite de três.
  for(const bathCap of (cap===4?[3,4]:[3])) {
    const plans=planZones(staff,beds,shift,previously,bathCap);
    let top=[];
    for(const plan of plans){
      for(let variant=0;variant<3;variant++){
        const solution=solvePlan(plan,staff,beds,shift,variant,previously,bathCap);
        if(!solution || validateSchedule(state,solution).errors.length)continue;
        const score=scoreAssignment(solution,beds,staff,shift,previously);
        top.push({assignment:solution,score:score+plan.rating*3,plan});
        top.sort((a,b)=>a.score-b.score);
        if(top.length>5)top.pop();
      }
    }
    if(!top.length)continue;
    let chosen=top[0];
    for(const option of top.slice(0,3)){
      const updated=localImprove(option.assignment,beds,staff,shift,option.plan.zones,previously,bathCap);
      const combined=updated.score+option.plan.rating*3;
      if(combined<chosen.score)chosen={assignment:updated.assignment,score:combined,plan:option.plan};
    }
    return {ok:true,assignment:chosen.assignment,score:chosen.score,bathCap};
  }
  return {ok:false,errors:[
    `Não foi possível distribuir todos os pacientes respeitando as restrições, a Escala 1 (somente 223/224), os postos separados com técnicos em número par e os limites de 7 pacientes/${cap} banhos.`,
    'A busca automática usa heurísticas; revise ocupação, restrições e cobertura antes de tentar novamente.'
  ]};

}
export function validateSchedule(state,assignment=state.assignment) {
  const errors=[],warnings=[];
  const occupied=state.beds.filter(b=>b.status==='occupied');
  const active=state.staff.filter(s=>s.active);
  for(const b of occupied){
    const slot=assignment[b.id],s=active.find(x=>x.slot===Number(slot));
    if(!s){errors.push(`Leito ${b.id} não possui profissional ativo atribuído.`);continue;}
    if(!canAttend(b,s))errors.push(`Leito ${b.id} atribuído à Escala ${s.slot}, que possui restrição incompatível (sexo, competências ou limite territorial da Escala 1).`);
  }
  const rows=statistics(assignment,occupied,active,state.shift);
  const cap=bathLimit(active);
  rows.forEach(r=>{
    if(r.patients>7)errors.push(`Escala ${r.slot} tem ${r.patients} pacientes (máximo: 7).`);
    if(r.baths>cap)errors.push(`Escala ${r.slot} tem ${r.baths} banhos (máximo permitido: ${cap}).`);
    if(r.baths>3)warnings.push(`Escala ${r.slot} tem ${r.baths} banhos: exceção ao limite habitual de 3, permitida por haver menos de 8 técnicos.`);
    if(r.patients>1&&r.bedridden===r.patients)warnings.push(`Escala ${r.slot} ficou exclusivamente com pacientes acamados.`);
    if(r.posts.A&&r.posts.B&&Math.abs(r.posts.A-r.posts.B)>1)errors.push(`Escala ${r.slot} compartilha postos sem proporcionalidade: ${r.posts.A} pacientes no A e ${r.posts.B} no B (diferença máxima permitida: 1).`);
  });
  const shared=rows.filter(r=>r.posts.A&&r.posts.B);
  if(shared.length>2)errors.push(`${shared.length} profissionais dividem os postos (máximo: 2).`);
  if(shared.some(r=>r.role==='nurse'))errors.push('A divisão de postos deve ser realizada por técnico, não pelo enfermeiro de cobertura.');
  const tech=active.filter(s=>s.role!=='nurse').length;
  const across=new Set(occupied.map(b=>bedInfo(b.id).post)).size===2;
  if(tech%2===0&&shared.length)errors.push('Com número par de técnicos, é proibido compartilhar os Postos A e B.');
  if(tech%2===1&&across&&!shared.some(r=>state.staff.find(s=>s.slot===r.slot)?.role!=='nurse'))errors.push('Com número ímpar de técnicos, pelo menos um técnico deve dividir os Postos A e B.');
  if(tech<7){
    const substitutes=active.filter(s=>s.role==='nurse'||s.role==='support').length;
    if(active.length<7)warnings.push(`Equipe abaixo do mínimo habitual: ${tech} técnicos/apoios ativos e ${active.length} profissionais no total. Acionar enfermeiro de cobertura ou técnico de apoio.`);
    else if(substitutes)warnings.push('Cobertura excepcional com profissional de apoio ou enfermeiro; confirmar designação e responsabilidades.');
  }
  if(rows.length){
    const mx=Math.max(...rows.map(x=>x.patients)),mn=Math.min(...rows.map(x=>x.patients));
    if(mx-mn>1)warnings.push(`Diferença de ${mx-mn} pacientes entre profissionais (${mn} a ${mx}). Rever proporcionalidade.`);
  }
  for(const bed of state.beds.filter(x=>x.status!=='occupied')){
    if(assignment[bed.id])warnings.push(`Leito ${bed.id} não está ocupado, mas consta na escala: atualizar a distribuição.`);
  }
  return {errors,warnings,stats:rows};
}
