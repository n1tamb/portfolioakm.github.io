import { t, localized } from './copy.js';
import { read, subscribe, refreshEvents, reset } from './storage.js';
import { localClock, addDays } from './model.js';
import { el, replace, btn, primary, group, label, select, subtitle, dialog, confirmDialog, run, announce, onAction, showStorageWarning } from './ui.js';
import { calendarView, bookingsView } from './appointments.js';
import { dashboard, clientsView, reportView, notificationsView } from './reporting.js';
import { staffView, servicesView, siteView, settingsView } from './catalog.js';

const nav=document.getElementById('qyr-crm-nav');
const panel=document.getElementById('qyr-crm-view');
const heading=document.getElementById('qyr-crm-heading');
const modeBar=document.getElementById('qyr-mode');
const role=new URLSearchParams(location.search).get('mode')==='master'?'master':'owner';
const ownerViews=['dashboard','calendar','bookings','clients','staff','services','finance','analytics','notifications','site','settings'];
const views=role==='master'?['dashboard','calendar','bookings']:ownerViews;
const {date}=localClock();
const calendarState={view:'day',date,staff:'all',search:''};
const recordsState={staff:'all',status:'all',search:''};
const clientState={search:''};
const reportState={from:addDays(date,-29),to:addDays(date,14)};
let data=read();
let staffId=data.staff.find(item=>item.state==='active')?.id || null;
let shown=null;
let mobileNavOpen=false;

function currentView() {
  const match=location.hash.slice(1);
  return views.includes(match)?match:role==='master'?'calendar':'dashboard';
}
function navigate(view,staffFilter) {
  if(!views.includes(view)) return;
  if(staffFilter) recordsState.staff=staffFilter;
  if(location.hash==='#'+view) render();
  else location.hash=view;
}
function themeToggle() {
  return btn(t(data.theme==='dark'?'light':'dark'),onAction(()=>run(
    state=>{state.theme=state.theme==='dark'?'light':'dark';},'theme')));
}
function drawModes() {
  const modes=[
    ['visitor','../'],['owner','./#dashboard'],['master','?mode=master#calendar']
  ];
  modeBar.replaceChildren(el('span',{class:'q-demo-tag'},t('demo')),
    ...modes.map(([key,path])=>key===role?el('span',{'aria-current':'page'},t(key)):
      el('a',{href:path,class:'text-link'},t(key))),themeToggle());
}
function onboarding() {
  let page=0;
  const keys=['onboardCalendar','onboardClients','onboardSite'];
  dialog(t('onboard'),({close,render})=>{
    const finish=async()=>{
      await run(state=>{state.onboarded=true;},'onboard');
      close();
    };
    const instructions=()=>el('div',{class:'q-stack'},subtitle(t('step',page+1,keys.length)),
      el('p',null,t(keys[page])),group(btn(t('skip'),onAction(finish)),
        page?btn(t('back'),()=>{page--;render(instructions());}):null,
        primary(t(page===keys.length-1?'start':'next'),onAction(async()=>{
          if(page===keys.length-1) await finish();
          else {page++; render(instructions());}
        }))));
    return instructions();
  });
}
function introTour() {
  if(role!=='owner' || data.onboarded) return null;
  return el('section',{class:'q-tour','aria-label':t('onboard')},
    el('div',null,el('strong',null,t('onboard')),subtitle(t('onboardCalendar'))),
    group(primary(t('start'),onboarding),btn(t('skip'),onAction(()=>run(state=>{state.onboarded=true;},'onboard')))));
}
function drawNav(view) {
  const unread=data.events.filter(item=>!item.seen).length;
  const toggle=btn([t('openMenu'),el('span',{class:'q-nav-current'},t(view))],event=>{
    mobileNavOpen=!mobileNavOpen;
    nav.toggleAttribute('data-expanded',mobileNavOpen);
    event.currentTarget.setAttribute('aria-expanded',String(mobileNavOpen));
  },{class:'q-nav-toggle','aria-expanded':String(mobileNavOpen),'aria-controls':'qyr-view-links'});
  nav.toggleAttribute('data-expanded',mobileNavOpen);
  nav.replaceChildren(toggle,el('a',{class:'q-rail-home',href:'./#dashboard'},data.site.name,
      el('span',null,t('crm'))),
    el('ul',{id:'qyr-view-links'},views.map((key,index)=>el('li',null,
      el('a',{href:'#'+key,
        'aria-current':key===view?'page':null,'data-q-view':key,onclick:()=>{
          if(key===view){mobileNavOpen=false;drawNav(view);heading.focus();}
        },class:index===4||index===7?'q-rail-separator':null},
        t(key),key==='notifications' && unread?el('span',{class:'q-unread','aria-label':t('unread',unread)},String(unread)):null)))));
}
function content(view) {
  const refresh=()=>render();
  const scope=role==='master'?staffId:null;
  switch(view) {
    case 'calendar': return calendarView(data,scope?{...calendarState,staff:scope}:calendarState,
      scope?refreshScopedCalendar:refresh,role);
    case 'bookings': return bookingsView(data,scope?{...recordsState,staff:scope}:recordsState,
      scope?refreshScopedBookings:refresh,role);
    case 'clients': return clientsView(data,clientState,refresh);
    case 'staff': return staffView(data,navigate);
    case 'services': return servicesView(data);
    case 'finance':
    case 'analytics': return reportView(data,reportState,refresh,view);
    case 'notifications': return notificationsView(data);
    case 'site': return siteView(data,navigate);
    case 'settings': return settingsView(data,onboarding);
    default: return dashboard(data,scope,navigate);
  }
  function refreshScopedCalendar(state) {
    if(state) Object.assign(calendarState,{date:state.date,view:state.view,search:state.search});
    render();
  }
  function refreshScopedBookings(state) {
    if(state) Object.assign(recordsState,{status:state.status,search:state.search});
    render();
  }
}
function drawRoleField() {
  if(role!=='master') return null;
  return el('div',{class:'q-master-toolbar'},label(t('master'),select('staffRole',
    data.staff.map(person=>[person.id,localized(person.name)]),staffId,{onchange:event=>{
      staffId=event.currentTarget.value;render();
    }})),subtitle(t('masterMode')));
}
function updateLanguage() {
  const alternate=document.querySelector('.languages a[hreflang]');
  if(!alternate) return;
  const url=new URL(alternate.href);
  url.hash=location.hash;
  url.search=role==='master'?'?mode=master':'';
  alternate.href=url.href;
}
function render(focus=false) {
  const view=currentView();
  document.documentElement.dataset.qTheme=data.theme;
  document.querySelector('.brand-word').textContent=data.site.name;
  drawModes();
  drawNav(view);
  heading.textContent=t(view);
  replace(panel,introTour(),drawRoleField(),content(view));
  panel.setAttribute('aria-labelledby','qyr-crm-heading');
  updateLanguage();
  if(focus && shown!==view) {
    heading.focus({preventScroll:true});
    heading.scrollIntoView({block:'start'});
  }
  shown=view;
}
window.addEventListener('hashchange',()=>{mobileNavOpen=false;render(true);});
subscribe((updated,source)=>{
  const replaced=data.instanceId!==updated.instanceId;
  data=updated;
  if(replaced) {
    calendarState.staff='all';
    recordsState.staff='all';
    staffId=data.staff.find(item=>item.state==='active')?.id || null;
    if(source==='other') document.querySelector('dialog[open]')?.close();
  }
  if(source==='other' && ['site','settings'].includes(currentView()) && panel.contains(document.activeElement)) return;
  if(source==='clock' && panel.contains(document.activeElement)) { drawNav(currentView());return; }
  render();
});
document.getElementById('qyr-global-reset').replaceChildren(btn(t('reset'),()=>confirmDialog(t('resetQuestion'),async()=>{
  await reset(); announce(t('resetDone'));
},'reset')));
render();
showStorageWarning();
void refreshEvents().catch(()=>{});
setInterval(()=>void refreshEvents().catch(()=>{}),30_000);
