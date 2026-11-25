import { allowed, clients, formatTime, localClock, addDays, slots, nearby, visitEpoch, zone, finalStatuses } from './model.js';
import { t, localized, dateLabel, money } from './copy.js';
import { read, storageWarning, update } from './storage.js';

export const asset = name => new URL('../'+name,import.meta.url).href;
const visibleChildren=children=>children.flat(Infinity).filter(item=>item!==null && item!==undefined && item!==false);
export const replace=(node,...children)=>node.replaceChildren(...visibleChildren(children));
export function el(tag, attrs, ...children) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs || {})) {
    if(value===false || value==null) continue;
    if(key.startsWith('on') && typeof value==='function') node.addEventListener(key.slice(2),value);
    else if(key==='class') node.className=value;
    else if(value===true) node.setAttribute(key,'');
    else node.setAttribute(key,value);
  }
  node.append(...visibleChildren(children));
  return node;
}
export const group=(...kids)=>el('div',{class:'q-actions'},...kids);
export const btn=(label,handler,attrs={})=>el('button',{type:'button',class:'button secondary',onclick:handler,...attrs},label);
export const primary=(label,handler,attrs={})=>btn(label,handler,{class:'button',...attrs});
export const label=(text,input,extra)=>el('label',{class:'field'},el('span',null,text),input,extra);
export const input=(name,type,value,opts={})=>el('input',{name,type,value,...opts});
export const check=(name,text,state=false,val='1')=>el('label',{class:'q-check'},
  input(name,'checkbox',val,{checked:state}),el('span',null,text));
export function select(name, choices, value, opts={}) {
  const control=el('select',{name,...opts},choices.map(([id,title])=>el('option',{value:id},title)));
  control.value=String(value ?? '');
  return control;
}
export const empty=(key='noResults')=>el('p',{class:'q-empty'},t(key));
export const subtitle=(...kids)=>el('p',{class:'q-muted'},...kids);
export const badge=status=>el('span',{class:'q-badge','data-status':status},t(status));
export const clientName=id=>localized(clients.find(client=>client.id===id)?.name) || '—';
export const staffName=(data,id)=>localized(data.staff.find(person=>person.id===id)?.name) || '—';
export const serviceNames=booking=>booking.lines.map(item=>localized(item.name)).join(' + ');
export const bookingText=booking=>dateLabel(booking.date)+' · '+formatTime(booking.start)+'–'+formatTime(booking.start+booking.minutes);
export const detailsList = rows=>el('dl',{class:'q-details'},rows.map(([key,value])=>el('div',null,el('dt',null,key),el('dd',null,value))));
export const photo=(id,opts={})=>el('img',{
  src:asset(id+'-640.webp'),srcset:asset(id+'-640.webp')+' 640w, '+asset(id+'-1280.webp')+' 1280w',
  sizes:'(min-width: 48rem) 42vw, 92vw',width:640,height:490,alt:t('photo-'+id),loading:'lazy',...opts
});
export const policy=data=>t('policyCopy',data.settings.cancellation,data.settings.late);
export const errText=error=>{const result=t(error?.message || 'invalidValue');return result===error?.message?t('invalidValue'):result;};
export const notice = document.getElementById('qyr-notice');
export function announce(text,kind='ok') {
  if(!notice) return;
  notice.dataset.kind=kind;
  notice.textContent=text;
}
export function showStorageWarning() {
  const warning=storageWarning();
  if(warning) announce(t(warning),'error');
}

export function dialog(title, build) {
  const previous=document.activeElement;
  const panel=el('dialog',{class:'q-dialog','aria-labelledby':'q-dialog-title'});
  const heading=el('h2',{id:'q-dialog-title',tabindex:-1},title);
  const close=()=>panel.close();
  const box=el('div',{class:'q-dialog-body'});
  panel.append(el('div',{class:'q-dialog-head'},heading,btn(t('close'),close)),box);
  document.body.append(panel);
  const render=(content,newTitle)=>{if(newTitle) heading.textContent=newTitle; box.replaceChildren(content);};
  render(build({close, render, panel}));
  panel.addEventListener('close',()=>{
    panel.remove();
    if(previous?.isConnected) previous.focus();
    else (document.querySelector('[data-q-view][aria-current="page"]') || document.querySelector('main h1'))?.focus();
  },{once:true});
  panel.showModal();
  heading.focus();
  return panel;
}

export function form(action,...children) {
  const error=el('p',{class:'q-error',role:'alert'});
  const element=el('form',{class:'q-form'},...children,error);
  element.addEventListener('submit',async event=>{
    event.preventDefault();
    if(element.getAttribute('aria-busy')==='true') return;
    error.textContent='';
    const submit=event.submitter;
    const data=new FormData(element);
    const caption=submit?.textContent;
    element.setAttribute('aria-busy','true');
    if(submit) { submit.disabled=true; submit.textContent=t('working'); }
    try { await action(data,element,event); }
    catch(reason) { error.textContent=errText(reason); }
    finally {
      element.removeAttribute('aria-busy');
      if(submit) { submit.disabled=false; submit.textContent=caption; }
    }
  });
  return element;
}
export const submit=(text='save',attrs={})=>el('button',{type:'submit',class:'button',...attrs},t(text));
export function confirmDialog(question, action, text='confirm') {
  return dialog(t(text),({close})=>form(async()=>{
    await action();
    close();
  },el('p',null,question),group(btn(t('back'),close),submit(text))));
}

export function dateInput(name,value,attrs={}) { return input(name,'date',value,attrs); }
export function dateBounds(data) {
  const {date}=localClock();
  return { min:date,max:addDays(date,data.settings.horizon) };
}
export function bookingSummary(booking) {
  const rows=[
    [t('services'),serviceNames(booking)],[t('master'),localized(booking.staffName)],[t('date'),dateLabel(booking.date)],
    [t('time'),formatTime(booking.start)+'–'+formatTime(booking.start+booking.minutes)+' · '+zone],
    [t('duration'),t('min',booking.minutes)],[t('total'),money(booking.total)],[t('status'),badge(booking.status)]
  ];
  if(booking.arrival) rows.push([t('arrival'),formatTime(localClock(booking.arrival).minutes)]);
  return detailsList(rows);
}

export function movingFields(data,booking,originalStaff) {
  const staffOptions=data.staff.filter(person=>person.state==='active' &&
    booking.lines.every(line=>person.services.includes(line.id))).map(person=>[person.id,localized(person.name)]);
  const staff=select('staffId',[['any',t('any')],...staffOptions],originalStaff || 'any');
  const day=dateInput('date',booking.date<localClock().date?localClock().date:booking.date,{required:true,...dateBounds(data)});
  const start=select('start',[],'',{required:true});
  const suggestions=el('div',{class:'q-slot-hint'});
  const status=el('p',{class:'q-muted',role:'status'});
  function refresh() {
    const value=start.value;
    const request={date:day.value,staffId:staff.value,serviceIds:booking.lines.map(item=>item.id)};
    const options={snapshot:booking,ignoreId:booking.id};
    const live=read();
    const choices=slots(live,request,Date.now(),options);
    start.replaceChildren(el('option',{value:''},t('chooseTime')),
      ...choices.map(slot=>el('option',{value:String(slot.start)},formatTime(slot.start)+' · '+staffName(live,slot.staffId))));
    if(choices.some(slot=>String(slot.start)===value)) start.value=value;
    start.disabled=!choices.length;
    const confirm=start.form?.querySelector('[type=submit]');
    if(confirm) confirm.disabled=start.disabled;
    status.textContent=choices.length?'':t('noSlots');
    suggestions.replaceChildren();
    if(!choices.length) suggestions.append(...nearby(live,request,Date.now(),options).map(date=>btn(dateLabel(date),()=>{
      day.value=date; refresh(); start.focus();
    })));
  }
  staff.addEventListener('change',refresh);
  day.addEventListener('change',refresh);
  refresh();
  return { nodes:[label(t('master'),staff),label(t('date'),day),label(t('time'),start),status,suggestions],start };
}

export function download(name,body,type) {
  const url=URL.createObjectURL(new Blob([body],{type}));
  const link=el('a',{href:url,download:name});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function calendarFile(data,booking) {
  const escape=value=>String(value).replace(/[\\;,\r\n]/g,character=>({'\\':'\\\\',';':'\\;',',':'\\,','\n':'\\n','\r':''}[character]));
  const utc=ms=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const start=visitEpoch(booking.date,booking.start);
  const content=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AKMAVREN//QYR Demo//RU','CALSCALE:GREGORIAN',
    'BEGIN:VEVENT','UID:'+escape(booking.id)+'@qyr.example','DTSTAMP:'+utc(Date.now()),
    'DTSTART:'+utc(start),'DTEND:'+utc(start+booking.minutes*60_000),
    'SUMMARY:'+escape(data.site.name+' · '+t('demo')+' · '+serviceNames(booking)),
    'DESCRIPTION:'+escape(policy(data)),'END:VEVENT','END:VCALENDAR',''
  ].map(line=>{
    const encoder=new TextEncoder();
    const output=[];
    let part='';
    for(const char of line) {
      if(encoder.encode(part+char).length>75) { output.push(part); part=' '; }
      part+=char;
    }
    output.push(part);
    return output.join('\r\n');
  }).join('\r\n');
  download('QYR-demo.ics',content,'text/calendar;charset=utf-8');
}

export function run(action,source,success='savedChanges') {
  return update(action,source).then(result=>{announce(t(success));return result;});
}
export function onAction(action) {
  return async event=>{
    const button=event.currentTarget;
    if(button.disabled) return;
    button.disabled=true;
    try { await action(event); }
    catch(reason) { announce(errText(reason),'error'); }
    finally { button.disabled=false; }
  };
}
export function activeVisit(booking) { return !finalStatuses.includes(booking.status); }
export function relevantTransitions(booking,now=Date.now(),grace=0) {
  const until=visitEpoch(booking.date,booking.start)-now;
  return allowed(booking).filter(status=>status!=='no-show' || until<=-grace*60_000)
    .filter(status=>!['arrived','in-service','completed'].includes(status) || until<=60*60_000);
}
