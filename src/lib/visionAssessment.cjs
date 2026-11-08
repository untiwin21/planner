'use strict';
// Deterministic behaviour measurements, not a trained model or a clinical assessment.
const DAY=86400000,FOCUS=new Set(['study','work','project']);
const dateOf=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
const add=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
function minute(value){if(typeof value!=='string'||!/^\d{2}:\d{2}$/.test(value))return null;const [h,m]=value.split(':').map(Number);if(h>29||m>59)return null;const n=h*60+m;return n<300?n+1440:n;}
function duration(start,end){const a=minute(start),b=minute(end);return a!==null&&b!==null&&b>a?b-a:null;}
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
function actual(task,date,now){
  if(task.actual_status==='skipped')return {start:null,minutes:null};
  const base=Date.parse(date+'T00:00:00+09:00');
  const sessions=(task.actual_sessions??[]).filter(s=>{
    const a=Date.parse(s.started_at),b=Date.parse(s.ended_at);
    return positive(s.duration_min)&&b>a&&b<=now&&a>=base+300*60000&&a<base+1740*60000&&s.duration_min<=(b-a)/60000+1;
  });
  if(sessions.length)return {start:Math.min(...sessions.map(s=>(Date.parse(s.started_at)-base)/60000)),minutes:sessions.reduce((sum,s)=>sum+s.duration_min,0)};
  // A sessions array is authoritative, including incomplete/future sessions.
  if(task.actual_sessions?.length)return {start:null,minutes:null};
  const start=minute(task.actual_start_time),end=minute(task.actual_end_time);
  if(start!==null&&base+start*60000>now)return {start:null,minutes:null};
  if(end!==null&&base+end*60000>now)return {start:null,minutes:null};
  let minutes=positive(task.actual_duration_min)?task.actual_duration_min:task.actual_status==='recorded'?duration(task.actual_start_time,task.actual_end_time):null;
  if(minutes===null){const subs=(task.subtasks??[]).filter(s=>!s.discarded&&s.actual_status==='recorded').map(s=>actual(s,date,now)).filter(s=>s.minutes!==null);if(subs.length){const starts=subs.filter(s=>Number.isFinite(s.start)).map(s=>s.start);return {start:starts.length?Math.min(...starts):null,minutes:subs.reduce((sum,s)=>sum+s.minutes,0)};}}
  return {start:Number.isFinite(start)?start:null,minutes};
}
function linkedTasks(day,goals){
  const items=new Map((day?.tasks??[]).map(t=>[t.id,t])),linked=new Set(day?.linkedGoalTaskIds??[]),subs=new Set(day?.linkedGoalSubtaskIds??[]);
  for(const goal of goals.filter(g=>g.date_from<=day.date&&g.date_to>=day.date))for(const t of goal.tasks??[]){
    if(t.deleted_at)continue;
    if(items.has(t.id))continue;
    if(linked.has(t.id)){items.set(t.id,t);continue;}
    for(const sub of t.subtasks??[])if(subs.has(sub.id)&&!items.has(sub.id))items.set(sub.id,{...sub,category_name:t.category_name,category_id:t.category_id});
  }
  for(const t of items.values())for(const sub of t.subtasks??[])items.delete(sub.id);
  return [...items.values()].filter(t=>!t.deleted_at);
}
function assessment({cycleStart,days=[],goals=[],routines=[],logs=[],now=Date.now()}){
  const asOf=dateOf(now),weeks={},byDate=new Map(days.map(d=>[d.date,d])),logMap=new Map();
  for(const log of logs){const key=log.date+'|'+log.routine_id,old=logMap.get(key);if(!old||(log.updated_at??0)>=(old.updated_at??0))logMap.set(key,log);}
  for(let n=1;n<=12;n++){
    const sums=Object.fromEntries(['studyStart','calibration','action','kpt','sleep','routines'].map(k=>[k,{sum:0,observed:0,eligible:0,raw:0,rawCount:0}]));
    function observe(k,score,raw){const m=sums[k];m.eligible++;if(score===null)return;m.observed++;m.sum+=Math.max(0,Math.min(100,score));if(Number.isFinite(raw)){m.raw+=raw;m.rawCount++;}}
    for(let i=0;i<7;i++){
      const date=add(cycleStart,(n-1)*7+i);if(date>asOf)continue;
      const day=byDate.get(date)??{date,tasks:[]},base=Date.parse(date+'T00:00:00+09:00'),closed=base+1740*60000<=now,tasks=linkedTasks(day,goals);
      const records=tasks.map(t=>({t,a:actual(t,date,now)})),starts=records.filter(x=>x.a.minutes!==null&&x.a.start!==null).map(x=>x.a.start);
      for(const r of Object.values(day.routineActual??{})){const a=minute(r.start),b=minute(r.end);if(a!==null&&b!==null&&b>a&&base+b*60000<=now)starts.push(a);}
      for(const l of logs.filter(l=>l.date===date)){const a=minute(l.actual_start_time),b=minute(l.actual_end_time);if(a!==null&&b!==null&&b>a&&base+b*60000<=now)starts.push(a);}
      const planned=records.filter(({t})=>!t.discarded&&!t.actual_only&&!['schedule','deadline'].includes(t.category_id)),study=records.filter(x=>x.t.category_name?.trim().toLowerCase()==='study'&&!x.t.discarded),studyStarts=study.filter(x=>x.a.minutes!==null&&x.a.start!==null).map(x=>x.a.start);
      if(study.length){const first=starts.length?Math.min(...starts):null,firstStudy=studyStarts.length?Math.min(...studyStarts):null,delay=first!==null&&firstStudy!==null?Math.max(0,firstStudy-first):null;observe('studyStart',delay!==null?100*(1-Math.max(0,delay-60)/120):closed&&study.every(x=>x.t.actual_status==='skipped')?0:null,delay);}
      for(const {t,a} of planned){
        if(t.done){const estimate=positive(t.duration_min)?t.duration_min:duration(t.start_time??t.time,t.end_time);observe('calibration',estimate!==null&&a.minutes!==null?100*Math.min(estimate,a.minutes)/Math.max(estimate,a.minutes):null,estimate!==null&&a.minutes!==null?a.minutes/estimate:null);}
        const scheduled=minute(t.start_time??t.time);
        if(FOCUS.has(t.category_name?.trim().toLowerCase())&&scheduled!==null&&base+scheduled*60000<=now){const delay=a.start!==null&&a.minutes!==null?Math.max(0,a.start-scheduled):null;observe('action',delay!==null?100*(1-Math.max(0,delay-10)/60):closed&&t.actual_status==='skipped'?0:null,delay);}
      }
      if(closed)observe('kpt',['keep','problem','try'].filter(k=>typeof day.review?.[k]==='string'&&day.review[k].trim()).length/3*100);
      observe('sleep',typeof day.sleep==='number'&&Number.isFinite(day.sleep)&&day.sleep>=0&&day.sleep<=1440?Math.min(100,day.sleep/420*100):null,day.sleep);
      for(const routine of routines){
        if(routine.config?.group_only)continue;
        const log=logMap.get(date+'|'+routine.id),created=Number.isFinite(Date.parse(routine.created_at))?dateOf(Date.parse(routine.created_at)):null;
        // An explicit historical check survives later pauses, edits or archiving.
        if(log){if(closed||log.done)observe('routines',log.done?(log.completion==='minimum'?50:100):0);continue;}
        const changed=Number.isFinite(routine.updated_at)?dateOf(routine.updated_at):null,daysOfWeek=routine.config?.days_of_week?.filter(x=>Number.isInteger(x)&&x>=0&&x<=6),weekday=(new Date(date+'T00:00:00Z').getUTCDay()+6)%7;
        // No historical schedule exists: never reconstruct an old obligation from a later edit.
        if(!created||created>date||(!log&&changed&&changed>date)||routine.status!=='active'||routine.config?.stage==='backlog'||(daysOfWeek?.length&&!daysOfWeek.includes(weekday)))continue;
        if(closed||log?.done)observe('routines',log?.done?(log.completion==='minimum'?50:100):0);
      }
    }
    weeks[n]=Object.fromEntries(Object.entries(sums).map(([key,v])=>[key,{score:v.observed?Math.round(v.sum/v.observed*10)/10:null,observed:v.observed,eligible:v.eligible,mean:v.rawCount?Math.round(v.raw/v.rawCount*10)/10:null}]));
  }
  return {version:1,cycleStart,asOf,observedAt:new Date(now).toISOString(),weeks};
}
module.exports={assessment,actual,minute};
