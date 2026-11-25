import { t, localized, dateLabel, money, weekdays } from './copy.js';
import { read, update, subscribe, refreshEvents } from './storage.js';
import { clients, quote, slots, nearby, availableDates, holdSlot, clearHold, createBooking, moveBooking, changeStatus,
  localClock, formatTime, visitEpoch, protection } from './model.js';
import { el, replace, btn, primary, group, select, input, label, check, empty, subtitle, badge, photo, asset,
  dialog, form, submit, confirmDialog, bookingSummary, movingFields, calendarFile,
  announce, showStorageWarning, onAction, run, policy, serviceNames, bookingText } from './ui.js';

const serviceList=document.querySelector('.services');
const teamList=document.querySelector('.team-list');
const wizard=document.getElementById('qyr-wizard');
const info=document.getElementById('qyr-info');
const mode=document.getElementById('qyr-mode');
const token=crypto.randomUUID();
const newDraft=()=>({ step:0, serviceIds:[], staffId:'any', date:'', datePage:0, start:null, clientId:'', reserved:null, result:null });
let draft=newDraft();
let live=read();
let renderedStep=-1;
const stepTitles=['chooseServices','chooseStaff','chooseDate','chooseTime','chooseProfile','review'];

const activeStaff=data=>data.staff.filter(person=>person.state==='active');
const plans=(data,ids)=>activeStaff(data).map(person=>quote(data,ids,person.id)).filter(Boolean);
const priceRange=prices=>{
  if(!prices.length) return t('unavailable');
  const low=Math.min(...prices);
  return prices.some(value=>value!==low)?t('from',money(low)):money(low);
};

function switchToBooking({service,staff}={}) {
  if(draft.reserved) void update(data=>clearHold(data,token),'wizard').catch(()=>{});
  const clientId=draft.clientId;
  draft=newDraft();
  draft.clientId=clientId;
  if(service) { draft.serviceIds=[service]; draft.step=1; }
  if(staff) draft.staffId=staff;
  renderWizard(true);
}
function bookingLink(text,selection,attributes={}) {
  return el('a',{href:'#booking',...attributes,onclick:()=>switchToBooking(selection)},text);
}
function renderPublic() {
  const site=live.site;
  const brand=document.querySelector('.brand-word');
  replace(brand,site.logo==='mark'?el('img',{src:asset('mark.png'),width:26,height:26,alt:''}):null,site.name);
  const hero=document.querySelector('.barber-hero');
  hero.querySelector('h1').textContent=localized(site.title);
  hero.querySelector('.location').textContent=localized(site.contact);
  hero.querySelector('.lead').textContent=localized(site.intro);
  const current=hero.querySelector(':scope > img');
  if(current.dataset.picture!==site.hero) {
    current.replaceWith(photo(site.hero,{width:1280,height:853,loading:'eager',fetchpriority:'high','data-picture':site.hero}));
  }
  const available=live.services.filter(item=>item.active && plans(live,[item.id]).length);
  serviceList.replaceChildren(...(available.length?available.map(item=>el('li',null,
    bookingLink([el('span',{class:'q-service-copy'},photo(item.photo,{width:64,height:64,alt:''}),el('span',null,el('strong',null,localized(item.name)),
      el('small',null,localized(item.description)+' · '+t('min',item.minutes)))),
      el('span',{class:'price'},item.sale?el('s',null,money(item.price)):null,priceRange(plans(live,[item.id]).map(item=>item.total)))],
      {service:item.id},{'data-service':item.id}))):[el('li',null,empty('noServices'))]));
  teamList.replaceChildren(...(activeStaff(live).length?activeStaff(live).map(person=>el('article',{class:'person q-person'},
    photo(person.photo,{alt:'',width:152,height:152}),
    el('div',null,el('h3',null,localized(person.name)),subtitle(localized(person.description)),
      bookingLink(t('quickBook'),{staff:person.id},{class:'text-link','data-staff':person.id,
        'aria-label':t('quickBook')+' · '+localized(person.name)})))):[empty('noStaff')]));
  const openDays=site.hours.days.map(index=>t(weekdays[index])).join(', ');
  const gallery=el('section',{class:'q-section',id:'gallery','aria-labelledby':'q-gallery-title'},
    el('h2',{id:'q-gallery-title'},t('gallery')),subtitle(t('galleryInfo')),
    el('div',{class:'q-gallery'},site.gallery.map(id=>el('a',{href:asset(id+'-1280.webp'),onclick:event=>{
      event.preventDefault();
      dialog(t('photo-'+id),()=>photo(id,{loading:'eager'}));
    }},photo(id)))),
    el('details',null,el('summary',null,t('photoCredits')),
      el('p',null,[['qyr-fade','https://www.pexels.com/photo/selective-focus-photography-of-a-barber-1453005/'],
        ['qyr-cut','https://www.pexels.com/photo/man-getting-a-beard-cut-3998417/'],
        ['qyr-shop','https://www.pexels.com/photo/a-barber-trimming-a-beard-7518739/']].map(([id,href])=>
          el('a',{class:'text-link',href},t('photo-'+id))))));

  const faq=el('section',{class:'q-section',id:'faq','aria-labelledby':'q-faq-title'},
    el('h2',{id:'q-faq-title'},t('faq')),
    ['Price','Move','Demo'].map(key=>el('details',null,el('summary',null,t('faq'+key)),el('p',null,t('faq'+key+'Answer')))));
  info.replaceChildren(gallery,
    el('section',{class:'q-section q-story',id:'about','aria-labelledby':'q-about-title'},
      el('div',null,el('h2',{id:'q-about-title'},t('about')),subtitle(localized(site.about))),
      localized(site.promotion)?el('div',{class:'q-offer'},el('h3',null,t('promotion')),el('p',null,localized(site.promotion)),
        bookingLink(t('quickBook'),live.services.some(item=>item.id==='combo' && item.active)?{service:'combo'}:{},{class:'text-link'})):null),
    el('section',{class:'q-section q-story',id:'contact','aria-labelledby':'q-contact-title'},
      el('div',null,el('h2',{id:'q-contact-title'},t('contact')),el('p',null,localized(site.contact)),
        subtitle(site.email),el('h3',null,t('hours')),el('p',null,openDays?openDays+' · '+formatTime(site.hours.start)+'–'+formatTime(site.hours.end)+' · Asia/Almaty':t('hoursClosed'))),
      el('div',null,el('h3',null,t('rules')),el('p',null,localized(site.rules)),subtitle(policy(live)))),faq);
  refreshMode();
}
function refreshMode() {
  mode.replaceChildren(
    el('span',{class:'q-demo-tag'},t('demo')),
    el('span',{'aria-current':'page'},t('visitor')),
    el('a',{href:'admin/#dashboard',class:'text-link'},t('owner')),
    el('a',{href:'admin/?mode=master#calendar',class:'text-link'},t('master'))
  );
}

function request() {
  return { serviceIds:draft.serviceIds,staffId:draft.staffId,date:draft.date,start:draft.start,clientId:draft.clientId };
}
function selectDate(date) {
  if(date!==draft.date) { draft.date=date; draft.start=null; draft.reserved=null; }
}
function stepServices() {
  const items=live.services.filter(item=>item.active && plans(live,[item.id]).length);
  return items.length?el('div',{class:'q-choices'},items.map(item=>{
    const picked=draft.serviceIds.includes(item.id);
    const prices=plans(live,[item.id]).map(plan=>plan.total);
    return btn([el('strong',null,localized(item.name)),el('small',null,t('min',item.minutes)+' · '+priceRange(prices))],()=>{
      const wasSelected=draft.serviceIds.includes(item.id);
      const previous=draft.serviceIds;
      const exclusive=previous.some(id=>live.services.find(service=>service.id===id)?.exclusive);
      draft.serviceIds=wasSelected ? previous.filter(id=>id!==item.id) : item.exclusive || exclusive ? [item.id] : [...previous,item.id];
      draft.start=null; draft.reserved=null;
      renderWizard();
      wizard.querySelector('[data-choice="'+item.id+'"]')?.focus({preventScroll:true});
    },{'aria-pressed':String(picked),'data-choice':item.id,class:'q-choice'});
  })):empty('noServices');
}
function stepStaff() {
  const people=activeStaff(live).filter(person=>quote(live,draft.serviceIds,person.id));
  if(!people.length) return empty('noMatch');
  return el('div',{class:'q-choices'},
    [['any',t('any')],...people.map(person=>[person.id,localized(person.name)])].map(([id,name])=>{
      const plan=id==='any'?null:quote(live,draft.serviceIds,id);
      return btn([el('strong',null,name),plan?el('small',null,money(plan.total)):null],()=>{
        if(draft.staffId!==id){draft.staffId=id;draft.start=null;draft.reserved=null;}
        renderWizard(true);
      },{'aria-pressed':String(draft.staffId===id),'data-choice':id,class:'q-choice'});
    }));
}
const datePageSize=6;
function dateButtons(dates,skipToTime=false) {
  return el('div',{class:'q-date-grid'},dates.map(entry=>{
    const date=typeof entry==='string'?entry:entry.date;
    return btn([el('strong',null,dateLabel(date)),entry.count?el('small',null,t('freeStarts',entry.count)):null],()=>{
      selectDate(date);
      if(skipToTime) draft.step=3;
      renderWizard(skipToTime);
      if(!skipToTime) wizard.querySelector('[data-date="'+date+'"]')?.focus({preventScroll:true});
    },{'aria-pressed':String(draft.date===date),'data-date':date,class:'q-choice'});
  }));
}
function stepDate() {
  const dates=availableDates(live,{...request(),date:''},Date.now(),{token});
  if(!dates.length) return empty('noNearby');
  const pages=Math.ceil(dates.length/datePageSize);
  draft.datePage=Math.min(draft.datePage,pages-1);
  const first=draft.datePage*datePageSize;
  function page(direction) {
    draft.datePage+=direction;
    renderWizard(true);
  }
  const shown=dates.slice(first,first+datePageSize);
  return el('div',{class:'q-stack'},subtitle(t('availableDatesOnly')),dateButtons(shown),
    draft.date && dates.some(item=>item.date===draft.date) && !shown.some(item=>item.date===draft.date)
      ?subtitle(t('selectedDate',dateLabel(draft.date))):null,
    pages>1?group(btn(t('earlierDates'),()=>page(-1),{disabled:draft.datePage===0}),
      btn(t('laterDates'),()=>page(1),{disabled:draft.datePage>=pages-1})):null);
}
function stepTime() {
  const times=slots(live,request(),Date.now(),{token});
  if(!times.length) {
    const suggestions=nearby(live,request(),Date.now(),{token});
    return el('div',{class:'q-stack'},empty('noSlots'),suggestions.length?el('p',null,t('nearby')):subtitle(t('noNearby')),
      dateButtons(suggestions,true));
  }
  return el('div',{class:'q-stack'},subtitle(dateLabel(draft.date)+' · Asia/Almaty'),
    el('div',{class:'q-times'},times.map(slot=>btn(formatTime(slot.start),()=>{
      draft.start=slot.start;
      renderWizard(true);
    },{'aria-pressed':String(draft.start===slot.start),'data-slot':slot.start}))));
}
function stepProfile() {
  return el('div',{class:'q-choices'},clients.map(profile=>btn([
    el('strong',null,localized(profile.name)),el('small',null,profile.phone)
  ],()=>{draft.clientId=profile.id;renderWizard(true);},
  {'aria-pressed':String(draft.clientId===profile.id),'data-profile':profile.id,class:'q-choice'})));
}
function stepReview() {
  const hold=draft.reserved;
  if(!hold) return empty('holdExpired');
  const guard=protection(live,draft.clientId);
  const booking={...hold,staffName:live.staff.find(item=>item.id===hold.staffId)?.name,date:draft.date,
    status:live.settings.requireConfirmation || guard.review?'pending':'confirmed'};
  return el('div',{class:'q-stack'},bookingSummary(booking),subtitle(policy(live)),
    subtitle(t('until',formatTime(localClock(hold.until).minutes))),
    guard.review?subtitle(t('manualReview')):null,
    guard.code?label(t('code'),input('code','text','',{maxlength:4,inputmode:'numeric',autocomplete:'off',required:true}),subtitle(t('phoneDemo'))):null,
    guard.deposit?check('deposit',t('depositDemo',money(Math.min(guard.deposit,hold.total)))):null);
}
function canProceed() {
  const compatible=plans(live,draft.serviceIds).length>0;
  if(draft.step===0) return compatible;
  if(draft.step===1) return compatible && (draft.staffId==='any' || Boolean(quote(live,draft.serviceIds,draft.staffId)));
  if(draft.step===2) return slots(live,request(),Date.now(),{token}).length>0;
  if(draft.step===3) return draft.start!==null && slots(live,request(),Date.now(),{token}).some(item=>item.start===draft.start);
  if(draft.step===4) return Boolean(draft.clientId);
  return Boolean(draft.reserved);
}
async function next(formData) {
  live=read();
  if(!canProceed()) {
    if(draft.step===2 || draft.step===3) { renderWizard(true);announce(t('slotLost'),'error');return; }
    throw new Error('chooseOption');
  }
  if(draft.step===2 && !slots(live,request(),Date.now(),{token}).some(item=>item.start===draft.start)) draft.start=null;
  if(draft.step===3) {
    draft.reserved=await update(data=>holdSlot(data,token,request()),'wizard');
  }
  if(draft.step===5) {
    try {
      draft.result=await update(data=>createBooking(data,{...request(),staffId:draft.reserved.staffId,
        code:formData.get('code'),demoDeposit:formData.has('deposit')},Date.now(),{token}),'wizard');
    } catch(reason) {
      if(['slotLost','holdExpired','offerChanged'].includes(reason.message)) {
        draft.step=3;draft.reserved=null;renderWizard(true);announce(t(reason.message),'error');return;
      }
      throw reason;
    }
  }
  draft.step++;
  renderWizard(true);
}
function renderWizard(focus=false) {
  const stepChanged=renderedStep!==draft.step;
  renderedStep=draft.step;
  if(draft.step===6 && draft.result) {
    const current=live.bookings.find(item=>item.id===draft.result.id) || draft.result;
    const heading=el('h3',{tabindex:-1,'data-wizard-heading':'','data-step-enter':stepChanged},t('saved'));
    replace(wizard,heading,bookingSummary(current),
      current.status==='pending'?subtitle(t('confirmationHint')):null,
      group(primary(t('myBookings'),()=>openBookings(current.clientId)),
        btn(t('ics'),()=>calendarFile(live,current)),btn(t('newBooking'),()=>switchToBooking())));
    if(focus) heading.focus({preventScroll:true});
    return;
  }
  const heading=el('h3',{id:'qyr-step',tabindex:-1,'data-wizard-heading':''},t(stepTitles[draft.step]));
  const body=[stepServices,stepStaff,stepDate,stepTime,stepProfile,stepReview][draft.step]();
  body.toggleAttribute('data-step-enter',stepChanged);
  const total=draft.reserved ? [draft.reserved] : draft.staffId==='any' ? plans(live,draft.serviceIds) :
    [quote(live,draft.serviceIds,draft.staffId)].filter(Boolean);
  wizard.replaceChildren(
    el('div',{class:'q-progress'},el('span',null,t('step',draft.step+1,6)),
      el('progress',{max:6,value:draft.step+1,'aria-label':t('step',draft.step+1,6)})),
    heading,
    form(next,body,
      total.length && draft.step<5?el('div',{class:'q-book-total'},
        el('strong',null,priceRange(total.map(item=>item.total))),subtitle(t('min',total[0].minutes))):null,
      draft.step===0 && draft.serviceIds.length && !total.length?subtitle(t('noMatch')):null,
      group(draft.step>0?btn(t('back'),()=>{
        draft.step--;
        if(draft.step<3 && draft.reserved){
          draft.reserved=null;
          void update(data=>clearHold(data,token),'wizard').catch(()=>{});
        }
        renderWizard(true);
      }):null,submit(draft.step===5?'confirm':'next',{disabled:!canProceed()}))));
  if(focus) heading.focus({preventScroll:true});
}

function openBookings(profileId='') {
  let profile=profileId;
  return dialog(t('myBookings'),({render})=>{
    const screen=()=>{
      const data=read();
      const selectProfile=select('profile',[['',t('chooseProfile')],...clients.map(item=>[item.id,localized(item.name)])],profile,
        {onchange:event=>{profile=event.currentTarget.value;render(screen());}});
      const entries=data.bookings.filter(item=>item.clientId===profile).sort((a,b)=>b.date.localeCompare(a.date)||b.start-a.start);
      return el('div',{class:'q-stack'},label(t('profile'),selectProfile),
        profile?(entries.length?el('ul',{class:'q-visit-list'},entries.map(item=>el('li',null,
          el('div',null,el('strong',null,serviceNames(item)),subtitle(bookingText(item))),badge(item.status),
          btn(t('bookingDetails'),()=>render(details(item.id),t('bookingDetails')))))):empty('noBookings')):subtitle(t('demoPrivacy')));
    };
    const details=id=>{
      const data=read();
      const booking=data.bookings.find(item=>item.id===id);
      const back=()=>render(screen(),t('myBookings'));
      if(!booking) return el('div',null,empty('noBookings'),btn(t('back'),back));
      const until=visitEpoch(booking.date,booking.start)-Date.now();
      const liveStatus=['pending','confirmed','late'].includes(booking.status);
      const visitAction=async(status,options={})=>{
        await run(current=>changeStatus(current,id,status,Date.now(),{visitor:true,...options}),'visit');
        render(details(id));
      };
      return el('div',{class:'q-stack'},bookingSummary(booking),subtitle(policy(data)),group(
        btn(t('back'),back),
        (booking.status==='pending' && !booking.review || booking.reconfirmRequested) && until>=0?primary(t('reconfirm'),onAction(()=>visitAction('confirmed'))):null,
        liveStatus?btn(t('move'),()=>render(moveScreen(booking,data),t('move'))):null,
        liveStatus?btn(t('reportLate'),()=>render(lateScreen(data),t('reportLate'))):null,
        liveStatus?btn(t('cancel'),()=>render(cancelScreen(booking),t('cancel'))):null,
        liveStatus?btn(t('ics'),()=>calendarFile(data,booking)):null),
        booking.status==='pending' && booking.review?subtitle(t('manualReview')):null,
        booking.reconfirmRequested?subtitle(t('reconfirmRequested')):null);
      function moveScreen(item,current) {
        const fields=movingFields(current,item,item.staffId);
        return form(async values=>{
          await run(next=>moveBooking(next,id,{date:values.get('date'),staffId:values.get('staffId'),start:Number(values.get('start'))},Date.now(),{visitor:true}),'visit');
          render(details(id),t('bookingDetails'));
        },subtitle(policy(current)),fields.nodes,group(btn(t('back'),()=>render(details(id),t('bookingDetails'))),
          submit('move',{disabled:fields.start.disabled})));
      }
      function lateScreen() {
        return form(async values=>visitAction('late',{eta:Number(values.get('eta'))}),
          label(t('eta'),input('eta','number','10',{required:true,min:1,max:120})),
          group(btn(t('back'),()=>render(details(id),t('bookingDetails'))),submit('sendLate')));
      }
      function cancelScreen() {
        return form(()=>visitAction('cancelled'),
          el('p',null,t('cancelQuestion')),
          group(btn(t('back'),()=>render(details(id),t('bookingDetails'))),submit('cancel')));
      }
    };
    return screen();
  });
}

document.getElementById('qyr-manage').replaceChildren(btn(t('myBookings'),()=>openBookings(draft.clientId)));
document.getElementById('qyr-reset').replaceChildren(btn(t('reset'),()=>{
  confirmDialog(t('resetQuestion'),async()=>{
    const {reset}=await import('./storage.js');
    draft=newDraft();
    await reset();
    announce(t('resetDone'));
  },'reset');
}));
subscribe((data,source)=>{
  const prior=live;
  live=data;
  if(source==='reset' || prior.instanceId!==data.instanceId) {
    draft=newDraft();
    document.querySelector('dialog[open]')?.close();
  }
  if(source==='wizard') return;
  if(JSON.stringify([prior.site,prior.staff,prior.services])!==JSON.stringify([data.site,data.staff,data.services])) renderPublic();
  if(source==='clock' && ![2,3].includes(draft.step)) return;
  if(source==='other' && draft.step===5) return;
  renderWizard();
});
renderPublic();
renderWizard();
showStorageWarning();
void refreshEvents().catch(()=>{});
setInterval(()=>void refreshEvents().catch(()=>{}),30_000);
