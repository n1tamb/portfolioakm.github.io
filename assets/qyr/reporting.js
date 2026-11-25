import { t, localized, dateLabel, money } from './copy.js';
import { clientStats, clients, localClock, visitEpoch, addDays, slots, finance, utilization, validDate, formatTime } from './model.js';
import { cleanDemoText, read } from './storage.js';
import { pair } from './seed.js';
import { el, btn, primary, group, input, label, select, empty, subtitle, badge, dialog, form, submit, detailsList,
  dateInput, download, onAction, run, announce, clientName, staffName, serviceNames, bookingText } from './ui.js';
import { appointmentList, openVisit } from './appointments.js';

function metrics(values) {
  return el('dl',{class:'q-metrics'},values.map(([name,value,detail])=>
    el('div',null,el('dt',null,t(name)),el('dd',null,String(value)),detail?el('p',null,detail):null)));
}
function loadRows(data,from,to,filter) {
  const people=data.staff.filter(item=>(!filter || filter===item.id) &&
    (item.state==='active' || data.bookings.some(booking=>booking.staffId===item.id && booking.date>=from && booking.date<=to)));
  if(!people.length) return empty('noStaff');
  return el('section',{class:'q-report-section'},el('h2',null,t('load')),subtitle(t('loadInfo')),
    people.map(person=>{
      const usage=utilization(data,person,from,to);
      return el('div',{class:'q-load-row'},el('strong',null,localized(person.name)),
        el('progress',{value:usage.percent,max:100,'aria-label':localized(person.name)+' · '+t('load')}),
        el('span',null,usage.percent+'%'),subtitle(t('min',usage.booked)+' / '+t('min',usage.capacity)));
    }));
}

export function dashboard(data,staffId,navigate) {
  const { date }=localClock();
  const list=data.bookings.filter(item=>item.date===date && (!staffId || item.staffId===staffId));
  const count=status=>list.filter(item=>item.status===status).length;
  const next=list.filter(item=>['confirmed','pending','late'].includes(item.status) && visitEpoch(item.date,item.start)>=Date.now())
    .sort((a,b)=>a.start-b.start)[0];
  const free=data.staff.filter(item=>item.state==='active' && (!staffId || staffId===item.id)).reduce((value,item)=>
    value+slots(data,{date,staffId:item.id,serviceIds:['cut']}).length,0);
  const received=list.filter(item=>item.status==='completed' && item.paid).reduce((value,item)=>value+item.total,0);
  return el('div',{class:'q-stack'},el('div',{class:'q-dashboard-strip'},el('div',null,
    el('h2',null,t('today')+' · '+dateLabel(date)),subtitle('Asia/Almaty')),
    primary(t('calendar'),()=>navigate('calendar'))),
    metrics([['todayCount',list.length],['freeCount',free],['completedCount',count('completed')],['received',money(received)],
      ['lateCount',count('late')],['cancelledCount',count('cancelled')],['noShowCount',count('no-show')]]),
    el('div',{class:'q-report-split'},el('section',{class:'q-report-section'},el('h2',null,t('nextClient')),
      next?el('div',{class:'q-stack'},el('p',null,clientName(next.clientId)),subtitle(bookingText(next)),
        btn(t('bookingDetails'),()=>openVisit(next.id))):empty('noBookings')),
    loadRows(data,date,date,staffId)),
    el('section',{class:'q-report-section'},el('h2',null,t('todayCount')),appointmentList(data,list,{withDate:false})));
}

export function clientsView(data,state,refresh) {
  const search=input('search','search',state.search,{autocomplete:'off',onchange:event=>{
    state.search=event.currentTarget.value;
    refresh();
  }});
  const results=clients.filter(item=>[localized(item.name),item.phone].some(field=>field.toLocaleLowerCase().includes(state.search.trim().toLocaleLowerCase())));
  return el('div',{class:'q-stack'},label(t('searchClient'),search),
    results.length?el('div',{class:'q-catalog'},results.map(profile=>{
      const stats=clientStats(data,profile.id);
      const future=stats.entries.filter(entry=>['confirmed','pending','late'].includes(entry.status) &&
        visitEpoch(entry.date,entry.start)>=Date.now()).length;
      return el('article',{class:'q-catalog-item'},el('h2',null,localized(profile.name)),subtitle(profile.phone),
        detailsList([[t('completedCount'),String(stats.completed.length)],[t('received'),money(stats.total)],
          [t('lastVisit'),dateLabel(stats.last)],[t('upcoming'),String(future)],[t('noShowCount'),String(stats.missed)]]),
        btn(t('clientHistory'),()=>clientDetails(profile.id)));
    })):empty());
}

function clientDetails(id) {
  return dialog(clientName(id),({close})=>{
    const data=read();
    const stats=clientStats(data,id);
    const notes=data.notes[id] || pair('','');
    const entries=stats.entries.slice().sort((a,b)=>b.date.localeCompare(a.date) || b.start-a.start);
    return el('div',{class:'q-stack'},subtitle(t('demoPrivacy')),
      el('section',null,el('h3',null,t('clientHistory')),entries.length?el('ul',{class:'q-visit-list'},
        entries.map(entry=>el('li',null,el('div',null,el('strong',null,serviceNames(entry)),subtitle(bookingText(entry))),
          badge(entry.status),btn(t('bookingDetails'),()=>{close();setTimeout(()=>openVisit(entry.id),0);})))):empty('noBookings')),
      form(async values=>{
        const ru=cleanDemoText(values.get('ru'),220),kk=cleanDemoText(values.get('kk'),220);
        await run(current=>{current.notes[id]=pair(ru,kk);},'note');
        close();
      },el('div',{class:'q-form-grid'},['ru','kk'].map(lang=>label(t('notes')+' · '+lang.toUpperCase(),
        el('textarea',{name:lang,lang,rows:3,maxlength:220,autocomplete:'off'},notes[lang])))),group(submit())));
  });
}

const exportField=value=>'"'+String(value ?? '').replace(/"/g,'""').replace(/^[=+\-@]/,"'$&")+'"';
function reportCsv(result,data,from,to) {
  const headers=[t('date'),t('profile'),t('master'),t('services'),t('status'),t('total'),t('received'),t('commission')];
  const lines=result.entries.map(item=>[item.date,clientName(item.clientId),localized(item.staffName),
    serviceNames(item),t(item.status),item.total,item.paid && item.status==='completed'?item.total:0,
    item.paid && item.status==='completed'?Math.round(item.total*item.commission/100):0]);
  lines.push([t('expense'),t('category'),t('expenseAmount')]);
  for(const item of data.expenses.filter(row=>row.date>=from && row.date<=to)) lines.push([item.date,t(item.category),item.amount]);
  lines.push([t('total'),t('received'),result.received],[t('total'),t('expected'),result.expected],[t('total'),t('expense'),result.expenses],
    [t('total'),t('net'),result.net]);
  download('QYR-demo-'+from+'-'+to+'.csv','\ufeff'+[headers,...lines].map(row=>row.map(exportField).join(';')).join('\r\n'),'text/csv;charset=utf-8');
}

function addExpense() {
  dialog(t('addExpense'),({close})=>form(async values=>{
    const row={id:crypto.randomUUID(),date:values.get('date'),category:values.get('category'),amount:Number(values.get('amount'))};
    await run(data=>{data.expenses.push(row);},'expense');
    close();
  },label(t('date'),dateInput('date',localClock().date,{required:true,max:localClock().date})),
  label(t('category'),select('category',['supplies','rent','other'].map(key=>[key,t(key)]),'supplies')),
  label(t('expenseAmount'),input('amount','number','1200',{min:1,max:10000000,step:1,required:true})),group(submit())));
}

export function reportView(data,state,refresh,kind) {
  const result=finance(data,state.from,state.to);
  const expenses=data.expenses.filter(item=>item.date>=state.from && item.date<=state.to);
  const controls=form(async values=>{
    const from=values.get('from'),to=values.get('to');
    if(!validDate(from) || !validDate(to) || from>to || to>addDays(from,366)) throw new Error('rangeError');
    Object.assign(state,{from,to});
    refresh();
  },el('div',{class:'q-filters'},label(t('dateFrom'),dateInput('from',state.from,{required:true})),
    label(t('dateTo'),dateInput('to',state.to,{required:true})),group(submit('filters'))));
  return el('div',{class:'q-stack'},controls,
    group(btn(t('export'),()=>reportCsv(result,data,state.from,state.to)),
      kind==='finance'?primary(t('addExpense'),addExpense):null),
    kind==='finance'?
      metrics([['received',money(result.received)],['expected',money(result.expected)],['unpaid',money(result.unpaid)],
        ['average',money(result.average)],['commission',money(result.commission)],['expense',money(result.expenses)],['net',money(result.net)]])
      :metrics([['serviceCount',result.serviceCount],['completedCount',result.completed],['average',money(result.average)]]),
    kind==='finance'?el('section',{class:'q-report-section'},el('h2',null,t('expense')),subtitle(t('moneyReceived')),
      expenses.length?el('ul',{class:'q-key-values'},expenses.map(item=>el('li',null,dateLabel(item.date)+' · '+t(item.category)+' · '+money(item.amount)))):empty()):null,
    kind==='analytics'?el('div',{class:'q-report-split'},
      el('section',{class:'q-report-section'},el('h2',null,t('popular')),
        result.popular.length?detailsList(result.popular.map(item=>[localized(item.name),String(item.count)])):empty()),
      loadRows(data,state.from,state.to)):null);
}

const eventCopy={new:'waNew',confirmation:'waConfirmation',reminder:'waReminder',move:'waMove',
  cancellation:'waCancellation',late:'waLate',schedule:'waSchedule',opening:'waOpening',noShow:'waNoShow',
  completed:'waCompleted',waiting:'waWaiting'};
function previewEvent(event) {
  dialog(t('whatsapp'),()=>el('div',{class:'q-stack'},subtitle(t('neverSent')),
    el('article',{class:'q-message'},
      el('strong',null,read().site.name+' · '+t('demo')),
      event.clientId?el('p',null,clientName(event.clientId)):null,
      el('p',null,t(eventCopy[event.type] || 'waSchedule',event.minutes ?? event.eta ?? 0)),
      event.date?el('p',null,dateLabel(event.date)+(event.start!==null?' · '+formatTime(event.start):'')):null,
      event.reconfirm?subtitle(t('reconfirmRequested')):null)));
  void run(data=>{
    const item=data.events.find(candidate=>candidate.id===event.id);
    if(item) item.seen=true;
  },'notifications').catch(error=>announce(t(error.message),'error'));
}

export function notificationsView(data) {
  const unread=data.events.filter(item=>!item.seen).length;
  return el('div',{class:'q-stack'},subtitle(t('neverSent')),
    group(el('strong',null,t('unread',unread)),
      btn(t('markRead'),onAction(()=>run(current=>{for(const item of current.events)item.seen=true;},'notifications')),{disabled:!unread})),
    data.events.length?el('ul',{class:'q-events'},data.events.map(item=>{
      const moment=localClock(item.at);
      return el('li',{'data-event':item.type,'data-seen':String(item.seen)},
        el('div',null,el('strong',null,t(item.type==='waiting'?'waitingDone':item.type)),
          subtitle(dateLabel(moment.date)+' · '+formatTime(moment.minutes)+(item.clientId?' · '+clientName(item.clientId):'')+
            (item.staffId?' · '+staffName(data,item.staffId):''),
          item.minutes?' · '+t('min',item.minutes):null)),
        btn(t('whatsapp'),()=>previewEvent(item)));
    })):empty());
}
