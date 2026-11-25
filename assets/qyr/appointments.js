import { t, localized, dateLabel, monthLabel, weekdays, money } from './copy.js';
import { read } from './storage.js';
import { slots, clients, localClock, weekday, addDays, validDate, formatTime, parseTime,
  createBooking, moveBooking, changeStatus, addEvent, allowed, visitEpoch } from './model.js';
import { el, btn, primary, group, select, input, label, check, empty, subtitle, badge, dialog, form, submit,
  confirmDialog, dateInput, populateAvailableDates, bookingSummary, movingFields, run, onAction,
  clientName, staffName, serviceNames, relevantTransitions } from './ui.js';

const ordered=(a,b)=>a.date.localeCompare(b.date)||a.start-b.start;
const includesClient=(entry,search)=>clientName(entry.clientId).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
const future=entry=>visitEpoch(entry.date,entry.start)>=Date.now();
const staffOptions=data=>data.staff.map(item=>[item.id,localized(item.name)]);

export function visitCard(data, entry) {
  return el('button',{type:'button',class:'q-visit','data-status':entry.status,'data-record':entry.id,
    onclick:()=>openVisit(entry.id)},
  el('time',null,formatTime(entry.start)),
  el('span',{class:'q-visit-copy'},el('strong',null,clientName(entry.clientId)),el('small',null,serviceNames(entry)),
    el('small',null,localized(entry.staffName)+' · '+t('min',entry.minutes))),
  badge(entry.status));
}
export function appointmentList(data,entries,{withDate=true}={}) {
  if(!entries.length) return empty('noBookings');
  const sequence=entries.slice().sort(ordered);
  if(!withDate) return el('div',{class:'q-stack compact'},sequence.map(entry=>visitCard(data,entry)));
  const dates=[...new Set(sequence.map(entry=>entry.date))];
  return el('div',{class:'q-stack'},dates.map(date=>el('section',{class:'q-date-group'},
    el('h3',null,dateLabel(date)),sequence.filter(entry=>entry.date===date).map(entry=>visitCard(data,entry)))));
}

export function openVisit(id) {
  return dialog(t('bookingDetails'),({render})=>{
    function display() {
      const data=read();
      const item=data.bookings.find(entry=>entry.id===id);
      if(!item) return empty('noBookings');
      const actions=relevantTransitions(item,Date.now(),data.settings.late);
      function show() { render(display(),t('bookingDetails')); }
      function change(status) {
        if(status==='late') {
          render(form(async fields=>{
            await run(current=>changeStatus(current,id,status,Date.now(),{eta:Number(fields.get('eta'))}),'visit');
            show();
          },label(t('eta'),input('eta','number','10',{min:1,max:120,required:true})),
          group(btn(t('back'),show),submit('sendLate'))),t('reportLate'));
          return;
        }
        if(['cancelled','no-show','completed'].includes(status)) {
          render(form(async fields=>{
            await run(current=>changeStatus(current,id,status,Date.now(),{paid:fields.has('paid')}),'visit');
            show();
          },status==='completed'?check('paid',t('paid'),true):el('p',null,status==='cancelled'?t('cancelQuestion'):t('action-no-show')+'?'),
          group(btn(t('back'),show),submit('action-'+status))),t('action-'+status));
          return;
        }
        return run(current=>changeStatus(current,id,status),'visit').then(show);
      }
      function move() {
        const fields=movingFields(data,item,item.staffId);
        render(form(async values=>{
          await run(current=>moveBooking(current,id,{date:values.get('date'),staffId:values.get('staffId'),start:Number(values.get('start'))}),'visit');
          show();
        },fields.nodes,group(btn(t('back'),show),submit('move',{disabled:fields.start.disabled}))),t('move'));
      }
      return el('div',{class:'q-stack'},el('h3',null,clientName(item.clientId)),bookingSummary(item),
        item.review?subtitle(t('manualReview')):null,
        item.reconfirmRequested?subtitle(t('reconfirmRequested')):null,
        item.status==='completed'?subtitle(t(item.paid?'paidYes':'paidNo')):null,
        group(
          ['pending','confirmed','late'].includes(item.status)?btn(t('move'),move):null,
          item.status==='late'?btn(t('waiting'),onAction(async()=>{
            await run(current=>{
              const visit=current.bookings.find(booking=>booking.id===id);
              if(visit?.status!=='late') throw new Error('transition');
              visit.waitingAt=Date.now();
              addEvent(current,'waiting',visit);
            },'visit','waitingDone');
            show();
          })):null,
          actions.map(status=>btn(t('action-'+status),onAction(()=>change(status)),{'data-action':status})),
          item.status==='completed' && !item.paid?btn(t('markPaid'),onAction(async()=>{
            await run(current=>{
              const visit=current.bookings.find(booking=>booking.id===id);
              if(visit?.status!=='completed') throw new Error('transition');
              visit.paid=true;
            },'visit');
            show();
          })):null));
    }
    return display();
  });
}

export function openManual(defaults={}) {
  return dialog(t('manual'),({close})=>{
    const data=read();
    const staffChoices=[['any',t('any')],...data.staff.filter(person=>person.state==='active').map(item=>[item.id,localized(item.name)])];
    const staff=select('staffId',staffChoices,staffChoices.some(([id])=>id===defaults.staffId)?defaults.staffId:'any');
    const day=select('date',[],'',{required:true});
    const time=select('start',[],'',{required:true});
    const choices=el('fieldset',null,el('legend',null,t('services')),data.services.filter(item=>item.active)
      .map(item=>check('serviceId',localized(item.name),false,item.id)));
    const status=el('p',{role:'status',class:'q-muted'});
    const create=submit('manual',{disabled:true});
    const body=form(async values=>{
      const request={date:values.get('date'),start:Number(values.get('start')),staffId:values.get('staffId'),
        serviceIds:values.getAll('serviceId'),clientId:values.get('clientId')};
      const booking=await run(state=>createBooking(state,request,Date.now(),{staffMode:true}),'visit');
      close();
      setTimeout(()=>openVisit(booking.id),0);
    },label(t('profile'),select('clientId',clients.map(item=>[item.id,localized(item.name)]),clients[0].id)),
    choices,el('div',{class:'q-form-grid'},label(t('master'),staff),label(t('date'),day)),label(t('time'),time),status,group(create));
    function refresh(rebuildDates=false) {
      const ids=new FormData(body).getAll('serviceId');
      const request={staffId:staff.value,serviceIds:ids};
      const live=read();
      const now=Date.now();
      if(rebuildDates) populateAvailableDates(day,live,request,day.value || defaults.date,now);
      const starts=slots(live,{...request,date:day.value},now);
      const previous=time.value;
      time.replaceChildren(el('option',{value:''},t('chooseTime')),
        ...starts.map(item=>el('option',{value:String(item.start)},formatTime(item.start)+' · '+staffName(live,item.staffId)+' · '+money(item.total))));
      if(starts.some(item=>String(item.start)===previous)) time.value=previous;
      time.disabled=!starts.length;
      create.disabled=!starts.length;
      status.textContent=!ids.length?t('chooseServices'):starts.length?'':t('noNearby');
    }
    day.addEventListener('change',()=>refresh());
    day.addEventListener('focus',()=>refresh(true));
    for(const node of [staff,choices]) node.addEventListener('change',()=>refresh(true));
    refresh(true);
    return body;
  });
}

export function openInterval(defaults={}) {
  return dialog(t('interval'),({close})=>{
    const data=read();
    const available=staffOptions(data);
    if(!available.length) return empty('noStaff');
    const kind=select('kind',[['block',t('block')],['break',t('break')],['leave',t('leave')]],defaults.kind || 'block');
    const date=dateInput('date',defaults.date || localClock().date,{required:true,max:'2099-12-31'});
    const through=dateInput('through',defaults.date || localClock().date,{required:true,max:'2099-12-31'});
    const times=el('div',{class:'q-form-grid'},
      label(t('at'),input('start','time','13:00',{required:true})),
      label(t('ends'),input('end','time','14:00',{required:true})));
    function toggle() { times.hidden=kind.value==='leave';for(const field of times.querySelectorAll('input')) field.disabled=times.hidden; }
    kind.addEventListener('change',toggle);
    date.addEventListener('change',()=>{through.min=date.value;if(through.value<date.value) through.value=date.value;});
    toggle();
    return form(async values=>{
      const type=values.get('kind');
      const start=type==='leave'?0:parseTime(values.get('start'));
      const end=type==='leave'?1440:parseTime(values.get('end'));
      const item={id:crypto.randomUUID(),staffId:values.get('staffId'),date:values.get('date'),through:values.get('through'),kind:type,start,end};
      await run(current=>{
        if(!validDate(item.date) || !validDate(item.through) || item.through<item.date || !Number.isFinite(start) || !Number.isFinite(end) || start>=end) throw new Error('invalidValue');
        if(current.bookings.some(entry=>entry.staffId===item.staffId && entry.date>=item.date && entry.date<=item.through &&
          allowed(entry).length && start<entry.start+entry.minutes+current.settings.buffer && end>entry.start)) throw new Error('intervalConflict');
        current.intervals.push(item);
        addEvent(current,'schedule',item);
      },'interval');
      close();
    },label(t('master'),select('staffId',available,available.some(([id])=>id===defaults.staffId)?defaults.staffId:available[0][0])),
    label(t('interval'),kind),el('div',{class:'q-form-grid'},label(t('dateFrom'),date),label(t('dateTo'),through)),times,group(submit()));
  });
}

export function intervalRow(data,item) {
  return el('div',{class:'q-interval'},el('div',null,el('strong',null,t(item.kind)+' · '+staffName(data,item.staffId)),
    subtitle(dateLabel(item.date)+(item.through!==item.date?' – '+dateLabel(item.through):'')+' · '+
      (item.kind==='leave'?t('hoursClosed'):formatTime(item.start)+'–'+formatTime(item.end)))),
    btn(t('removeInterval'),()=>confirmDialog(t('removeQuestion'),()=>run(current=>{
      current.intervals=current.intervals.filter(entry=>entry.id!==item.id);
      addEvent(current,'schedule',item);
    },'interval'),'remove')));
}

function calendarRange(state) {
  const focus=state.date;
  if(state.view==='day') return [focus,focus];
  if(state.view==='week') {
    const first=addDays(focus,-(weekday(focus)+6)%7);
    return [first,addDays(first,6)];
  }
  const first=focus.slice(0,7)+'-01';
  const later=addDays(first,32).slice(0,7)+'-01';
  return [first,addDays(later,-1)];
}
function nextPeriod(state,direction) {
  if(state.view==='month') {
    const first=state.date.slice(0,7)+'-01';
    return direction>0?addDays(first,32).slice(0,7)+'-01':addDays(first,-1).slice(0,7)+'-01';
  }
  return addDays(state.date,direction*(state.view==='week'?7:1));
}
function calendarToolbar(data,state,refresh,mode) {
  const update=(key,value)=>{state[key]=value;refresh(state);};
  const choices=staffOptions(data);
  const filter=select('staff',[['all',t('all')],...choices],state.staff,
    {disabled:mode==='master',onchange:event=>update('staff',event.currentTarget.value)});
  const search=input('search','search',state.search,{autocomplete:'off',onchange:event=>update('search',event.currentTarget.value)});
  return el('div',{class:'q-stack'},
    el('div',{class:'q-calendar-toolbar'},group(
      btn(t('previous'),()=>update('date',nextPeriod(state,-1)),{'aria-label':t('previous'),class:'q-icon-button','data-direction':'back'}),
      btn(t('today'),()=>update('date',localClock().date)),
      btn(t('following'),()=>update('date',nextPeriod(state,1)),{'aria-label':t('following'),class:'q-icon-button','data-direction':'forward'})),
      el('div',{class:'q-segment',role:'group','aria-label':t('calendar')},['day','week','month'].map(view=>
        btn(t(view),()=>update('view',view),{'aria-pressed':String(state.view===view)})))),
    el('div',{class:'q-filters'},label(t('date'),dateInput('date',state.date,{onchange:event=>{
      if(validDate(event.currentTarget.value)) update('date',event.currentTarget.value);
    }})),label(t('master'),filter),label(t('searchClient'),search)),
    mode==='owner'?group(primary(t('manual'),()=>openManual({date:state.date,staffId:state.staff})),
      btn(t('interval'),()=>openInterval({date:state.date,staffId:state.staff}))):null);
}

export function calendarView(data,state,refresh,mode) {
  const [from,to]=calendarRange(state);
  const filter=state.staff==='all'?null:state.staff;
  const bookings=data.bookings.filter(item=>item.date>=from && item.date<=to && (!filter || item.staffId===filter) && includesClient(item,state.search));
  const intervals=data.intervals.filter(item=>item.date<=to && item.through>=from && (!filter || item.staffId===filter));
  const dates=Array.from({length:Math.round((Date.parse(to)-Date.parse(from))/86400000)+1},(_,index)=>addDays(from,index));
  const people=data.staff.filter(person=>(!filter || person.id===filter) && (person.state==='active' ||
    bookings.some(record=>record.staffId===person.id) || intervals.some(item=>item.staffId===person.id)));
  const heading=state.view==='month'?monthLabel(state.date):dateLabel(from)+(from===to?'':' – '+dateLabel(to));
  let calendar;
  if(state.view==='month') {
    const offset=(weekday(from)+6)%7;
    calendar=el('div',{class:'q-month'},
      [1,2,3,4,5,6,0].map(day=>el('span',{class:'q-month-label'},t(weekdays[day]))),
      Array.from({length:offset},()=>el('span',{'aria-hidden':'true'})),
      dates.map(date=>{
        const amount=bookings.filter(item=>item.date===date).length;
        const day=Number(date.slice(-2));
        return btn([el('strong',null,String(day)),amount?el('small',null,String(amount)):null],()=>{
          state.date=date;state.view='day';refresh(state);
        },{class:'q-month-day','aria-label':dateLabel(date)+' · '+amount,
          'aria-current':date===localClock().date?'date':null});
      }));
  } else {
    calendar=el('div',{class:'q-stack'},dates.map(date=>{
      const entries=bookings.filter(item=>item.date===date);
      const unavailable=intervals.filter(item=>item.date<=date && item.through>=date);
      return el('section',{class:'q-calendar-day'},
        state.view==='week'?el('h3',null,dateLabel(date)):null,
        people.length?el('div',{class:'q-calendar-columns'},people.map(person=>{
          const visits=entries.filter(item=>item.staffId===person.id).sort(ordered);
          return el('div',{class:'q-calendar-staff'},el(state.view==='week'?'h4':'h3',null,localized(person.name)),
            visits.length?visits.map(item=>visitCard(data,item)):empty('noBookings'),
            unavailable.filter(item=>item.staffId===person.id).map(item=>mode==='owner'?intervalRow(data,item):
              subtitle(t(item.kind)+' · '+formatTime(item.start)+'–'+formatTime(item.end))));
        })):empty('calendarEmpty'));
    }));
  }
  return el('div',{class:'q-stack'},calendarToolbar(data,state,refresh,mode),
    el('h2',{class:'q-period'},heading),calendar,
    state.view==='month'?appointmentList(data,bookings):null);
}

export function bookingsView(data,state,refresh,mode) {
  const choices=staffOptions(data);
  const filters=el('div',{class:'q-filters'},
    label(t('searchClient'),input('search','search',state.search,{autocomplete:'off',onchange:event=>{state.search=event.currentTarget.value;refresh(state);}})),
    label(t('status'),select('status',[['all',t('all')],...['pending','confirmed','late','arrived','in-service','completed','cancelled','no-show'].map(item=>[item,t(item)])],
      state.status,{onchange:event=>{state.status=event.currentTarget.value;refresh(state);}})),
    label(t('master'),select('staff',[['all',t('all')],...choices],state.staff,{disabled:mode==='master',onchange:event=>{state.staff=event.currentTarget.value;refresh(state);}})));
  const entries=data.bookings.filter(item=>includesClient(item,state.search) && (state.status==='all' || item.status===state.status) &&
    (state.staff==='all' || item.staffId===state.staff));
  const upcoming=entries.filter(future);
  const history=entries.filter(item=>!future(item));
  return el('div',{class:'q-stack'},filters,
    mode==='owner'?group(primary(t('manual'),()=>openManual({staffId:state.staff})),
      btn(t('clearFilters'),()=>{Object.assign(state,{search:'',status:'all',staff:'all'});refresh();})):null,
    !entries.length?empty():null,
    upcoming.length?el('section',{class:'q-stack'},el('h2',null,t('upcoming')),appointmentList(data,upcoming)):null,
    history.length?el('section',{class:'q-stack'},el('h2',null,t('clientHistory')),appointmentList(data,history)):null);
}
