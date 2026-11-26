import { t, localized, money, weekdays, dateLabel } from './copy.js';
import { photos, pair } from './seed.js';
import { read, cleanDemoText, reset } from './storage.js';
import { addEvent, futureBookings, setStaffState, parseTime, formatTime, localClock } from './model.js';
import { el, replace, btn, primary, group, select, input, label, check, empty, subtitle, dialog, form, submit,
  confirmDialog, detailsList, badge, photo, asset, run, announce, onAction } from './ui.js';
import { openInterval, intervalRow } from './appointments.js';

const numeric=(name,value,min,max)=>input(name,'number',String(value),{min,max,required:true,step:1});
const photoPicker=(name,value)=>select(name,photos.map(id=>[id,t('photo-'+id)]),value);
const bool=(values,name)=>values.has(name);
const number=(values,name)=>Number(values.get(name));

function translated(name,title,value={ru:'',kk:''},{required=false,max=100,long=false}={}) {
  const field=lang=>{
    const options={name:name+'-'+lang,maxlength:max,required,lang,autocomplete:'off'};
    return long?el('textarea',{...options,rows:3},value[lang] ?? ''):input(name+'-'+lang,'text',value[lang] ?? '',options);
  };
  return el('div',{class:'q-form-grid'},label(t(title)+' · RU',field('ru')),label(t(title)+' · KK',field('kk')));
}
function translateValues(values,name,max,required=false) {
  const ru=cleanDemoText(values.get(name+'-ru'),max);
  const kk=cleanDemoText(values.get(name+'-kk'),max);
  if(required && (!ru || !kk)) throw new Error('invalidValue');
  return pair(ru,kk);
}
function weekdayFieldset(days) {
  return el('fieldset',{class:'q-weekdays'},el('legend',null,t('weekdays')),
    [1,2,3,4,5,6,0].map(index=>check('day',t(weekdays[index]),days.includes(index),String(index))));
}
function timeWindows(window,first='at',second='ends') {
  return el('div',{class:'q-form-grid'},label(t(first),input('start','time',formatTime(window.start),{required:true})),
    label(t(second),input('end','time',formatTime(window.end),{required:true})));
}
function workFields(values) {
  const start=parseTime(values.get('start')),end=parseTime(values.get('end'));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start>=end) throw new Error('invalidValue');
  return {days:values.getAll('day').map(Number),start,end};
}

function editStaff(id) {
  return dialog(t(id?'edit':'addStaff'),({close})=>{
    const data=read();
    const person=data.staff.find(item=>item.id===id) || {
      name:pair('',''),description:pair('',''),photo:'qyr-shop',days:[2,3,4,5,6],start:600,end:1140,
      services:['cut'],commission:45,prices:{},breaks:[],state:'active'
    };
    const selected=el('fieldset',null,el('legend',null,t('staffServices')),
      data.services.map(item=>check('service',localized(item.name),person.services.includes(item.id),item.id)));
    const prices=el('details',null,el('summary',null,t('individualPrices')),
      el('div',{class:'q-form-grid'},data.services.map(item=>label(localized(item.name)+' · ₸',
        input('price-'+item.id,'number',person.prices[item.id] ?? '',{min:0,max:1000000,step:1,placeholder:String(item.sale || item.price)})))));
    const breaks=el('fieldset',null,el('legend',null,t('break')),
      [0,1,2].map(index=>el('div',{class:'q-form-grid'},
        label(t('at')+' '+(index+1),input('break-start-'+index,'time',person.breaks[index]?formatTime(person.breaks[index][0]):'')),
        label(t('ends')+' '+(index+1),input('break-end-'+index,'time',person.breaks[index]?formatTime(person.breaks[index][1]):'')))));
    return form(async values=>{
      const window=workFields(values);
      const enabled=values.getAll('service');
      const priceList={};
      for(const serviceId of enabled) {
        const value=values.get('price-'+serviceId);
        if(value!=='') priceList[serviceId]=Number(value);
      }
      const ranges=[];
      for(let index=0;index<3;index++) {
        const start=values.get('break-start-'+index);
        const end=values.get('break-end-'+index);
        if(!start && !end) continue;
        const a=parseTime(start),b=parseTime(end);
        if(!Number.isFinite(a) || !Number.isFinite(b) || a>=b || a<window.start || b>window.end ||
          ranges.some(([c,d])=>a<d && b>c)) throw new Error('invalidValue');
        ranges.push([a,b]);
      }
      const record={ id:id || crypto.randomUUID(), ...window, name:translateValues(values,'name',55,true),
        description:translateValues(values,'description',240), photo:values.get('photo'), services:enabled,
        commission:number(values,'commission'), prices:priceList, breaks:ranges, state:person.state };
      await run(current=>{
        if(id) {
          const index=current.staff.findIndex(item=>item.id===id);
          if(index<0) throw new Error('invalidValue');
          record.state=current.staff[index].state;
          current.staff[index]=record;
        } else current.staff.push(record);
        addEvent(current,'schedule',{staffId:record.id});
      },'catalog');
      close();
    },translated('name','name',person.name,{required:true,max:55}),translated('description','specialty',person.description,{max:240,long:true}),
      label(t('photo'),photoPicker('photo',person.photo)),selected,prices,weekdayFieldset(person.days),timeWindows(person),
      breaks,label(t('commission')+' (%)',numeric('commission',person.commission,0,100)),group(submit()));
  });
}

function stateEditor(person,next,navigate) {
  const state=read();
  const upcoming=futureBookings(state,person.id);
  if(next==='active' || !upcoming.length) {
    void run(data=>setStaffState(data,person.id,next,null),'catalog').catch(error=>announce(t(error.message),'error'));
    return;
  }
  dialog(t('staffState'),({close})=>el('div',{class:'q-stack'},
    el('p',null,t('futureStaff')+' ('+upcoming.length+')'),
    el('ul',{class:'q-key-values'},upcoming.slice(0,6).map(entry=>el('li',null,dateLabel(entry.date)+' · '+formatTime(entry.start)))),
    group(primary(t('keepMove'),onAction(async()=>{
      await run(data=>setStaffState(data,person.id,next,'keep'),'catalog');
      close();
      navigate('bookings',person.id);
    })),
    btn(t('cancelFuture'),onAction(async()=>{
      await run(data=>setStaffState(data,person.id,next,'cancel'),'catalog');
      close();
    })),btn(t('keep'),close))));
}

export function staffView(data,navigate) {
  return el('div',{class:'q-stack'},group(primary(t('addStaff'),()=>editStaff())),
    data.staff.length?el('div',{class:'q-catalog'},data.staff.map(person=>{
      const names=data.services.filter(item=>person.services.includes(item.id)).map(item=>localized(item.name));
      const days=person.days.map(index=>t(weekdays[index])).join(', ');
      const intervals=data.intervals.filter(item=>item.staffId===person.id && item.through>=localClock().date);
      return el('article',{class:'q-catalog-item','data-staff-row':person.id},
        el('div',{class:'q-catalog-head'},photo(person.photo,{alt:'',width:80,height:80}),
          el('div',null,el('h2',null,localized(person.name)),subtitle(localized(person.description)),badge(person.state))),
        detailsList([[t('hours'),days+' · '+formatTime(person.start)+'–'+formatTime(person.end)],
          [t('services'),names.join(', ') || '—'],[t('commission'),String(person.commission)+'%']]),
        group(btn(t('edit'),()=>editStaff(person.id)),btn(t('leave'),()=>openInterval({staffId:person.id,kind:'leave'})),
          btn(t('break'),()=>openInterval({staffId:person.id,kind:'break'}))),
        label(t('staffState'),select('state',[['active',t('active')],['paused',t('paused')],['inactive',t('inactive')]],person.state,
          {onchange:event=>{ const next=event.currentTarget.value; event.currentTarget.value=person.state; stateEditor(person,next,navigate); }})),
        intervals.length?el('details',null,el('summary',null,t('interval')+' ('+intervals.length+')'),intervals.map(item=>intervalRow(data,item))):null);
    })):empty('noStaff'));
}

function editService(id) {
  return dialog(t(id?'edit':'addService'),({close})=>{
    const data=read();
    const service=data.services.find(item=>item.id===id) || {
      name:pair('',''),description:pair('',''),category:pair('',''),photo:'qyr-fade',
      active:true,exclusive:false,price:5000,sale:0,minutes:45
    };
    const people=el('fieldset',null,el('legend',null,t('staff')),
      data.staff.map(item=>check('staff',localized(item.name),id?item.services.includes(id):item.state==='active',item.id)));
    return form(async values=>{
      const record={ id:id || crypto.randomUUID(), name:translateValues(values,'name',80,true),
        description:translateValues(values,'description',240),category:translateValues(values,'category',50,true),
        photo:values.get('photo'),price:number(values,'price'),sale:number(values,'sale'),
        minutes:number(values,'minutes'),active:bool(values,'active'),exclusive:bool(values,'exclusive') };
      if(record.sale>record.price) throw new Error('invalidValue');
      await run(current=>{
        if(id) {
          const index=current.services.findIndex(item=>item.id===id);
          if(index<0) throw new Error('invalidValue');
          current.services[index]=record;
        } else current.services.push(record);
        const chosen=values.getAll('staff');
        for(const person of current.staff) {
          if(chosen.includes(person.id) && !person.services.includes(record.id)) person.services.push(record.id);
          if(!chosen.includes(person.id)){
            person.services=person.services.filter(item=>item!==record.id);
            delete person.prices[record.id];
          }
        }
        addEvent(current,'schedule',null);
      },'catalog');
      close();
    },translated('name','name',service.name,{required:true,max:80}),translated('description','description',service.description,{max:240,long:true}),
      translated('category','category',service.category,{required:true,max:50}),label(t('photo'),photoPicker('photo',service.photo)),
      el('div',{class:'q-form-grid'},label(t('price'),numeric('price',service.price,0,1000000)),
        label(t('sale'),numeric('sale',service.sale,0,1000000)),label(t('minutes'),numeric('minutes',service.minutes,5,600))),
      people,check('active',t('serviceActive'),service.active),check('exclusive',t('exclusive'),service.exclusive),
      subtitle(t('pricesNote')),group(submit()));
  });
}

export function servicesView(data) {
  function reorder(id,direction) {
    return run(current=>{
      const index=current.services.findIndex(item=>item.id===id);
      const to=index+direction;
      if(index<0 || to<0 || to>=current.services.length) return;
      [current.services[index],current.services[to]]=[current.services[to],current.services[index]];
    },'catalog');
  }
  return el('div',{class:'q-stack'},group(primary(t('addService'),()=>editService())),
    data.services.length?el('div',{class:'q-catalog'},data.services.map((item,index)=>
      el('article',{class:'q-catalog-item','data-service-row':item.id},
        el('div',{class:'q-catalog-head'},photo(item.photo,{width:80,height:80,alt:''}),
          el('div',null,el('h2',null,localized(item.name)),subtitle(localized(item.category)+' · '+t('min',item.minutes)),
            el('strong',null,money(item.sale || item.price)),item.sale?el('s',null,money(item.price)):null)),
        subtitle(localized(item.description)),badge(item.active?'active':'inactive'),
        group(btn(t('edit'),()=>editService(item.id)),
          btn(t('up'),onAction(()=>reorder(item.id,-1)),{disabled:index===0}),
          btn(t('down'),onAction(()=>reorder(item.id,1)),{disabled:index===data.services.length-1}),
          btn(t(item.active?'inactive':'active'),onAction(()=>run(current=>{
            const service=current.services.find(entry=>entry.id===item.id);
            service.active=!service.active;
            addEvent(current,'schedule',null);
          },'catalog'))))))):empty('noServices'));
}

function siteValues(values) {
  const name=cleanDemoText(values.get('name'),50);
  if(!name) throw new Error('invalidValue');
  return {name,logo:values.get('logo'),hero:values.get('hero'),gallery:values.getAll('gallery'),
    title:translateValues(values,'title',110,true),intro:translateValues(values,'intro',240,true),
    about:translateValues(values,'about',500,true),contact:translateValues(values,'contact',150,true),
    promotion:translateValues(values,'promotion',180),rules:translateValues(values,'rules',450,true),
    email:cleanDemoText(values.get('email'),100,{allowEmail:true}),hours:workFields(values)};
}
export function siteView(data,navigate) {
  const site=data.site;
  const preview=el('div',{class:'q-site-preview',hidden:true});
  const editor=form(async(values,_,event)=>{
    const next=siteValues(values);
    if(event.submitter?.value==='preview') {
      replace(preview,el('h2',null,t('draft')),
        el('div',{class:'q-site-sheet'},el('div',null,el('strong',{class:'brand-word'},next.logo==='mark'?el('img',{src:asset('mark.png'),width:26,height:26,alt:''}):null,next.name),
          el('h3',null,localized(next.title)),subtitle(localized(next.intro)),el('p',null,localized(next.contact))),
          photo(next.hero,{alt:''})),
        detailsList([[t('about'),localized(next.about)],[t('promotion'),localized(next.promotion)||'—'],
          [t('hours'),next.hours.days.map(day=>t(weekdays[day])).join(', ')+' · '+formatTime(next.hours.start)+'–'+formatTime(next.hours.end)],
          [t('rules'),localized(next.rules)],[t('contact'),next.email]]),
        next.gallery.length?el('div',{class:'q-gallery'},next.gallery.map(id=>photo(id))):null);
      preview.hidden=false;
      preview.scrollIntoView({block:'nearest'});
      return;
    }
    await run(current=>{current.site=next;addEvent(current,'schedule',null);},'site','savedLocal');
  },label(t('siteName'),input('name','text',site.name,{required:true,maxlength:50,autocomplete:'off'})),
    el('div',{class:'q-form-grid'},label(t('logo'),select('logo',[['word',t('logoWord')],['mark',t('logoMark')]],site.logo)),
    label(t('photo'),photoPicker('hero',site.hero))),
    el('fieldset',null,el('legend',null,t('gallery')),photos.map(id=>check('gallery',t('photo-'+id),site.gallery.includes(id),id))),
    translated('title','siteHeadline',site.title,{required:true,max:110}),translated('intro','intro',site.intro,{required:true,max:240,long:true}),
    translated('about','about',site.about,{required:true,max:500,long:true}),
    translated('contact','contact',site.contact,{required:true,max:150}),label(t('demoEmail'),input('email','email',site.email,{required:true,maxlength:100,autocomplete:'off'})),
    translated('promotion','promotion',site.promotion,{max:180}),translated('rules','rules',site.rules,{required:true,max:450,long:true}),
    weekdayFieldset(site.hours.days),timeWindows(site.hours),
    group(submit('draft',{name:'intent',value:'preview',class:'button secondary'}),submit('publish',{name:'intent',value:'publish'})));
  return el('div',{class:'q-stack'},group(btn(t('services'),()=>navigate('services')),btn(t('staff'),()=>navigate('staff'))),
    subtitle(t('demoPrivacy')),editor,preview);
}

const settingsFields=[
  ['buffer','buffer',0,120],['late','lateGrace',0,120],['cancellation','cancelLead',0,1440],['hold','holdMinutes',1,30],
  ['maxActive','maxActive',1,10],['noShowLimit','noShowLimit',1,10],['deposit','deposit',0,1000000],
  ['reminderOne','reminderOne',0,10080],['reminderTwo','reminderTwo',0,10080],['confirmBefore','confirmBefore',0,1440]
];
export function settingsView(data, onboarding) {
  return el('div',{class:'q-stack'},subtitle(t('serverNeeded')),
    form(async values=>{
      await run(current=>{
        for(const [key] of settingsFields) current.settings[key]=number(values,key);
        for(const key of ['verifyPhone','requireConfirmation','suspicious']) current.settings[key]=bool(values,key);
      },'settings');
    },el('div',{class:'q-form-grid'},settingsFields.map(([key,text,min,max])=>label(t(text),numeric(key,data.settings[key],min,max)))),
    subtitle(t('settingsMinutes')),
    ['verifyPhone','requireConfirmation','suspicious'].map(key=>check(key,t(key),data.settings[key])),
    group(submit())),
    el('section',{class:'q-section'},el('h2',null,t('demo')),subtitle(t('demoPrivacy')),group(
      btn(t('onboardOpen'),onboarding),
      btn(t('reset'),()=>confirmDialog(t('resetQuestion'),async()=>{await reset();announce(t('resetDone'));},'reset')))));
}
