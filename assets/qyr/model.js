import { baseSite, baseSettings, baseServices, baseStaff, clients, finalStatuses, zone } from './seed.js';
export { clients, statuses, finalStatuses, zone } from './seed.js';

export const version = 2;
const minute = 60_000;
const clockFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone:zone, calendar:'iso8601', numberingSystem:'latn',
  year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
});

export function localClock(now = Date.now()) {
  const values = Object.fromEntries(clockFormat.formatToParts(new Date(now)).map(part=>[part.type,part.value]));
  return { date:[values.year,values.month,values.day].join('-'), minutes:Number(values.hour)*60+Number(values.minute) };
}
export function addDays(date, days) {
  const time = new Date(date+'T12:00:00Z');
  time.setUTCDate(time.getUTCDate()+days);
  return time.toISOString().slice(0,10);
}
export const weekday = date => new Date(date+'T12:00:00Z').getUTCDay();
export const validDate = date => typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) && addDays(date,0)===date;
export const formatTime = minutes => [Math.floor(minutes/60),minutes%60].map(value=>String(value).padStart(2,'0')).join(':');
export const parseTime = value => {
  if (!/^\d{2}:\d{2}$/.test(value ?? '')) return NaN;
  const [hour,min] = value.split(':').map(Number);
  return hour<24 && min<60 ? hour*60+min : NaN;
};

export function visitEpoch(date, start) {
  const nominal = Date.parse(date+'T00:00:00Z')+start*minute;
  const observed = localClock(nominal);
  return nominal+(nominal-(Date.parse(observed.date+'T00:00:00Z')+observed.minutes*minute));
}

const bookingActive = booking => !finalStatuses.includes(booking.status);
export const futureBookings = (data,staffId,now=Date.now()) => data.bookings.filter(item=>
  (!staffId || item.staffId===staffId) && bookingActive(item) && visitEpoch(item.date,item.start)>=now);
const overlap = (a,b,c,d) => a<d && b>c;
function fail(code) { throw new Error(code); }

export function quote(data, ids, staffId) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size!==ids.length) return null;
  const items = ids.map(id=>data.services.find(service=>service.id===id && service.active));
  const staff = data.staff.find(person=>person.id===staffId && person.state==='active');
  if (!staff || items.some(item=>!item || !staff.services.includes(item.id)) ||
      (items.length>1 && items.some(item=>item.exclusive))) return null;
  const lines = items.map(item=>({
    id:item.id, name:structuredClone(item.name), minutes:item.minutes,
    price:staff.prices[item.id] ?? (item.sale || item.price)
  }));
  return { lines, minutes:lines.reduce((n,item)=>n+item.minutes,0), total:lines.reduce((n,item)=>n+item.price,0) };
}

export function workWindow(data, staff, date) {
  const day = weekday(date);
  if (!data.site.hours.days.includes(day) || !staff.days.includes(day) || staff.state!=='active') return null;
  const start = Math.max(staff.start,data.site.hours.start);
  const end = Math.min(staff.end,data.site.hours.end);
  return end>start ? [start,end] : null;
}

function occupied(data, staff, date, now, { ignoreId, token }={}) {
  const buffer = data.settings.buffer;
  return [
    ...staff.breaks,
    ...data.intervals.filter(item=>item.staffId===staff.id && item.date<=date && (item.through || item.date)>=date).map(item=>[item.start,item.end]),
    ...data.bookings.filter(item=>item.id!==ignoreId && item.staffId===staff.id && item.date===date &&
      item.status!=='cancelled' && item.status!=='no-show').map(item=>[item.start,item.start+item.minutes+buffer]),
    ...data.holds.filter(item=>item.token!==token && item.staffId===staff.id && item.date===date && item.until>now).map(item=>[item.start,item.start+item.minutes+buffer])
  ];
}

export function slots(data, request, now=Date.now(), options={}) {
  const { date, staffId, serviceIds } = request;
  const clock=localClock(now);
  if (!validDate(date) || date<clock.date || date>addDays(clock.date,data.settings.horizon)) return [];
  const candidates = data.staff.filter(item=>staffId==='any' || item.id===staffId);
  const starts = new Map();
  for (const staff of candidates) {
    const plan = options.snapshot
      ? (staff.state==='active' && options.snapshot.lines.every(line=>staff.services.includes(line.id)) ? options.snapshot : null)
      : quote(data,serviceIds,staff.id);
    const window = workWindow(data,staff,date);
    if (!plan || !window) continue;
    const conflicts = occupied(data,staff,date,now,options);
    const step = data.settings.step;
    for (let start=Math.ceil(window[0]/step)*step; start+plan.minutes+data.settings.buffer<=window[1]; start+=step) {
      if ((date===clock.date && start<=clock.minutes) || starts.has(start)) continue;
      if (conflicts.some(([a,b])=>overlap(start,start+plan.minutes+data.settings.buffer,a,b))) continue;
      starts.set(start,{ start, staffId:staff.id, lines:plan.lines, total:plan.total, minutes:plan.minutes });
    }
  }
  return [...starts.values()].sort((a,b)=>a.start-b.start);
}

export function nearby(data,request,now=Date.now(),options={}) {
  const { date } = localClock(now);
  const first = validDate(request.date) && request.date>date ? request.date : date;
  const candidates = [];
  for(let next=first; next<=addDays(date,data.settings.horizon) && candidates.length<3; next=addDays(next,1)) {
    if(slots(data,{...request,date:next},now,options).length) candidates.push(next);
  }
  return candidates;
}

export function addEvent(data,type,booking,now=Date.now(),extra={}) {
  data.events.unshift({
    id:crypto.randomUUID(), type, at:now, seen:false,
    bookingId:booking?.id || null, clientId:booking?.clientId || null, staffId:booking?.staffId || null,
    date:booking?.date || null, start:booking?.start ?? null, ...extra
  });
  if(data.events.length>250) data.events.length=250;
}

export function holdSlot(data, token, request, now=Date.now()) {
  const slot=slots(data,request,now,{token}).find(item=>item.start===request.start);
  if(!slot) fail('slotLost');
  data.holds=data.holds.filter(item=>item.until>now && item.token!==token);
  const until=now+data.settings.hold*minute;
  data.holds.push({token,date:request.date,staffId:slot.staffId,start:slot.start,minutes:slot.minutes,
    total:slot.total,serviceIds:[...request.serviceIds],until});
  return { ...slot, until };
}

export function clearHold(data, token) {
  data.holds=data.holds.filter(item=>item.token!==token);
}

export function clientStats(data,id) {
  const entries=data.bookings.filter(item=>item.clientId===id);
  const completed=entries.filter(item=>item.status==='completed');
  return {
    entries, completed,
    missed:entries.filter(item=>item.status==='no-show').length,
    total:completed.filter(item=>item.paid).reduce((n,item)=>n+item.total,0),
    last:completed.map(item=>item.date).sort().at(-1)
  };
}

export function protection(data,clientId) {
  const missed=clientStats(data,clientId).missed;
  return {
    code:data.settings.verifyPhone,
    review:data.settings.suspicious && missed>=data.settings.noShowLimit,
    deposit:missed>=data.settings.noShowLimit ? data.settings.deposit : 0
  };
}

export function createBooking(data,request,now=Date.now(),{token, staffMode=false}={}) {
  if(!clients.some(item=>item.id===request.clientId)) fail('chooseProfile');
  const count=futureBookings(data,null,now).filter(item=>item.clientId===request.clientId).length;
  const guard=protection(data,request.clientId);
  if(!staffMode) {
    if(count>=data.settings.maxActive) fail('activeLimit');
    if(guard.code && request.code!=='0000') fail('invalidCode');
    if(guard.deposit && !request.demoDeposit) fail('depositRequired');
  }
  const hold=token && data.holds.find(item=>item.token===token && item.until>now &&
    item.start===request.start && item.date===request.date && item.staffId===request.staffId);
  if(token && !hold) fail('holdExpired');
  const selected=slots(data,request,now,{token}).find(item=>item.start===request.start);
  if(!selected) fail('slotLost');
  if(hold && (hold.total!==selected.total || hold.minutes!==selected.minutes ||
    hold.serviceIds.join(',')!==request.serviceIds.join(','))) fail('offerChanged');
  const staff=data.staff.find(item=>item.id===selected.staffId);
  const requiresReview=guard.review && !staffMode;
  const booking={
    id:crypto.randomUUID(), clientId:request.clientId, staffId:staff.id,
    staffName:structuredClone(staff.name), date:request.date, start:selected.start,
    minutes:selected.minutes, total:selected.total, lines:selected.lines, commission:staff.commission,
    status:!staffMode && (data.settings.requireConfirmation || requiresReview) ? 'pending' : 'confirmed',
    review:requiresReview, paid:false, simulatedDeposit:!staffMode && guard.deposit ? Math.min(guard.deposit,selected.total) : 0,
    arrival:null, reminders:[], created:now
  };
  data.bookings.push(booking);
  if(token) clearHold(data,token);
  addEvent(data,'new',booking,now);
  if(booking.status==='confirmed') addEvent(data,'confirmation',booking,now);
  return booking;
}

export function moveBooking(data,id,request,now=Date.now(),{visitor=false}={}) {
  const booking=data.bookings.find(item=>item.id===id);
  if(!booking || !['pending','confirmed','late'].includes(booking.status)) fail('transition');
  if(visitor && visitEpoch(booking.date,booking.start)-now<data.settings.cancellation*minute) fail('policyCutoff');
  const selected=slots(data,request,now,{ignoreId:id,snapshot:booking}).find(item=>item.start===request.start);
  if(!selected) fail('slotLost');
  if(booking.date===request.date && booking.start===selected.start && booking.staffId===selected.staffId) return booking;
  addEvent(data,'opening',booking,now);
  const staff=data.staff.find(item=>item.id===selected.staffId);
  Object.assign(booking,{date:request.date,start:selected.start,staffId:staff.id,staffName:structuredClone(staff.name),
    commission:staff.commission,arrival:null,reminders:[],reconfirmRequested:false,status:booking.status==='late'?'confirmed':booking.status});
  addEvent(data,'move',booking,now);
  return booking;
}

const transitions = {
  pending:['confirmed','late','arrived','cancelled','no-show'],
  confirmed:['late','arrived','cancelled','no-show'],
  late:['arrived','cancelled','no-show'],
  arrived:['in-service','cancelled'],
  'in-service':['completed']
};
export const allowed = booking => transitions[booking.status] || [];

export function changeStatus(data,id,status,now=Date.now(),{ visitor=false,eta,paid=false }={}) {
  const booking=data.bookings.find(item=>item.id===id);
  if(!booking || (!allowed(booking).includes(status) && !(booking.status==='late' && status==='late') &&
      !(booking.status==='confirmed' && status==='confirmed' && booking.reconfirmRequested))) fail('transition');
  const until=visitEpoch(booking.date,booking.start)-now;
  if(visitor) {
    if(!['confirmed','cancelled','late'].includes(status) || (booking.review && status==='confirmed')) fail('transition');
    if(status==='cancelled' && until<data.settings.cancellation*minute) fail('policyCutoff');
    if(status==='confirmed' && until<0) fail('transition');
    if(status==='late' && (until>60*minute || until< -data.settings.late*minute)) fail('lateWindow');
  }
  if(status==='no-show' && until> -data.settings.late*minute) fail('beforeGrace');
  if(status==='late' && (!Number.isInteger(eta) || eta<1 || eta>120)) fail('invalidValue');
  if(['arrived','in-service','completed'].includes(status) && until>60*minute) fail('beforeVisit');
  booking.status=status;
  if(status==='confirmed') { booking.review=false; booking.reconfirmRequested=false; }
  if(status==='late') booking.arrival=now+eta*minute;
  if(status==='completed') { booking.paid=paid; booking.completedAt=now; }
  const event={confirmed:'confirmation',late:'late',cancelled:'cancellation','no-show':'noShow',completed:'completed'}[status];
  if(event) addEvent(data,event,booking,now,status==='late'?{eta}:{});
  if(status==='cancelled' || status==='no-show') addEvent(data,'opening',booking,now);
  return booking;
}

export function collectEvents(data,now=Date.now()) {
  const expired=data.holds.filter(item=>item.until<=now);
  if(expired.length){
    data.holds=data.holds.filter(item=>item.until>now);
    for(const hold of expired) addEvent(data,'opening',hold,now);
  }
  let generated=expired.length>0;
  const intervals=[...new Set([data.settings.reminderOne,data.settings.reminderTwo].filter(value=>value>0))].sort((a,b)=>a-b);
  for(const booking of data.bookings) {
    if(!['pending','confirmed'].includes(booking.status)) continue;
    const left=(visitEpoch(booking.date,booking.start)-now)/minute;
    if(booking.status==='pending' && data.settings.confirmBefore>0 && left<=data.settings.confirmBefore && left>=0) {
      booking.status='cancelled';
      booking.cancelledReason='confirmation-expired';
      addEvent(data,'cancellation',booking,now);
      addEvent(data,'opening',booking,now);
      generated=true;
      continue;
    }
    if(left<=0) continue;
    const due=intervals.filter(value=>left<=value && !booking.reminders.includes(value));
    if(!due.length) continue;
    booking.reminders.push(...due);
    if(data.settings.requireConfirmation && booking.status==='confirmed') booking.reconfirmRequested=true;
    addEvent(data,'reminder',booking,now,{minutes:due[0], reconfirm:data.settings.requireConfirmation});
    generated=true;
  }
  return generated;
}

export function setStaffState(data,id,state,action,now=Date.now()) {
  const person=data.staff.find(item=>item.id===id);
  if(!person) fail('invalidValue');
  const next=state===false?'inactive':state===true?'active':state;
  if(!['active','paused','inactive'].includes(next)) fail('invalidValue');
  const upcoming=futureBookings(data,id,now);
  if(next!=='active' && upcoming.length && !['keep','cancel'].includes(action)) fail('futureStaff');
  if(next!=='active' && action==='cancel') for(const item of upcoming) {
    if(allowed(item).includes('cancelled')) changeStatus(data,item.id,'cancelled',now);
  }
  person.state=next;
  addEvent(data,'schedule', {staffId:id},now);
}

export function finance(data,from,to) {
  const entries=data.bookings.filter(item=>item.date>=from && item.date<=to);
  const done=entries.filter(item=>item.status==='completed');
  const paid=done.filter(item=>item.paid);
  const sum=list=>list.reduce((n,item)=>n+item.total,0);
  const received=sum(paid);
  const commission=paid.reduce((n,item)=>n+Math.round(item.total*item.commission/100),0);
  const expenses=data.expenses.filter(item=>item.date>=from && item.date<=to).reduce((n,item)=>n+item.amount,0);
  const popular={};
  for(const item of done) for(const line of item.lines) {
    popular[line.id] ??= {name:line.name,count:0};
    popular[line.id].count+=1;
  }
  return { entries, received, expected:sum(entries.filter(bookingActive)), unpaid:sum(done.filter(item=>!item.paid)),
    completed:done.length, serviceCount:done.reduce((n,item)=>n+item.lines.length,0),
    average:paid.length?Math.round(received/paid.length):0, commission, expenses, net:received-commission-expenses,
    popular:Object.values(popular).sort((a,b)=>b.count-a.count) };
}

export function utilization(data,staff,from,to) {
  let capacity=0;
  let booked=0;
  const today=localClock().date;
  for(let date=from; date<=to; date=addDays(date,1)) {
    const working=date<today?{...staff,state:'active'}:staff;
    const window=workWindow(data,working,date);
    if(!window) continue;
    const unavailable=occupied({...data,bookings:[],holds:[]},staff,date,0);
    for(let m=window[0];m<window[1];m++) if(!unavailable.some(([a,b])=>m>=a && m<b)) capacity++;
    booked+=data.bookings.filter(item=>item.staffId===staff.id && item.date===date &&
      !['cancelled','no-show'].includes(item.status)).reduce((n,item)=>n+item.minutes,0);
  }
  return {capacity,booked,percent:capacity?Math.min(100,Math.round(booked*100/capacity)):0};
}

function seedVisit(data,{id,staffId,service,clientId,date,start,status,paid=false}, now) {
  const staff=data.staff.find(item=>item.id===staffId);
  const base=data.services.find(item=>item.id===service);
  const plan=quote(data,[service],staffId) || {lines:[{id:base.id,name:base.name,minutes:base.minutes,price:base.sale || base.price}],
    minutes:base.minutes,total:base.sale || base.price};
  return { id,staffId,staffName:staff.name,clientId,date,start,status,paid,...plan,commission:staff.commission,
    review:false,arrival:status==='late'?visitEpoch(date,start)+10*minute:null,reminders:[],created:now-48*60*minute };
}

export function seed(now=Date.now()) {
  const {date}=localClock(now);
  const data={version, instanceId:crypto.randomUUID(), site:structuredClone(baseSite), settings:structuredClone(baseSettings),
    services:structuredClone(baseServices),staff:structuredClone(baseStaff),
    bookings:[], intervals:[], holds:[], events:[], notes:{}, expenses:[], theme:'light', onboarded:false };
  const fixtures=[
    [-18,600,'cut','alihan','nurlan','completed',true],[-12,690,'combo','daniyar','timur','completed',true],
    [-8,750,'kids','alihan','amir','completed',true],[-7,900,'beard','daniyar','arman','no-show',false],
    [-4,990,'cut','alihan','samat','completed',true],[-3,900,'combo','daniyar','arman','no-show',false],
    [-2,660,'beard','daniyar','timur','cancelled',false],[-1,1020,'cut','alihan','nurlan','completed',false],
    [0,615,'cut','alihan','amir','completed',true],[0,690,'beard','daniyar','samat','completed',true],
    [0,840,'cut','alihan','nurlan','cancelled',false],[0,1020,'combo','daniyar','timur','confirmed',false],
    [1,645,'cut','alihan','nurlan','confirmed',false],[2,930,'combo','daniyar','amir','pending',false],
    [3,960,'beard','daniyar','samat','pending',false],[7,1050,'cut','alihan','timur','confirmed',false],
    [-1,930,'cut','alihan','arman','pending',false],[-2,975,'beard','daniyar','samat','confirmed',false]
  ];
  const fixtureDate=(offset,staffId,start,minutes,status)=>{
    let day=addDays(date,offset);
    for(let n=0;n<14;n++,day=addDays(day,offset<0?-1:1)){
      const staff=data.staff.find(item=>item.id===staffId);
      const window=workWindow(data,staff,day);
      if(!window || start<window[0] || start+minutes+10>window[1] || staff.breaks.some(([a,b])=>overlap(start,start+minutes+10,a,b))) continue;
      if(offset>=0 && ['pending','confirmed'].includes(status) && visitEpoch(day,start)<=now) continue;
      if((offset===0 && status==='completed') && visitEpoch(day,start+minutes)>now) continue;
      if(data.bookings.some(item=>item.staffId===staffId && item.date===day && overlap(start,start+minutes+10,item.start,item.start+item.minutes+10))) continue;
      return day;
    }
    return null;
  };
  for(const [index,[offset,start,service,staffId,clientId,status,paid]] of fixtures.entries()) {
    const day=fixtureDate(offset,staffId,start,data.services.find(item=>item.id===service).minutes,status);
    if(day) data.bookings.push(seedVisit(data,{id:'sample-'+index,staffId,service,clientId,date:day,start,status,paid},now));
  }
  data.intervals.push({id:'sample-leave',staffId:'alihan',date:addDays(date,12),through:addDays(date,13),start:0,end:1440,kind:'leave'});
  data.intervals.push({id:'sample-block',staffId:'daniyar',date:addDays(date,4),through:addDays(date,4),start:960,end:1020,kind:'block'});
  data.expenses.push({id:'sample-expense',date:addDays(date,-3),category:'supplies',amount:12000});
  for(const booking of data.bookings.filter(item=>visitEpoch(item.date,item.start)>=now).slice(-4)) addEvent(data,booking.status==='confirmed'?'confirmation':'new',booking,now);
  for(const [index,minutes] of [[0,1440],[1,120]]) {
    if(data.bookings[index]) addEvent(data,'reminder',data.bookings[index],visitEpoch(data.bookings[index].date,data.bookings[index].start)-minutes*minute,{minutes});
  }
  data.events.sort((a,b)=>b.at-a.at);
  return data;
}

export function migrate(legacy,now=Date.now()) {
  const data=seed(now);
  if(!Array.isArray(legacy)) return data;
  for(const old of legacy) {
    if(!old || typeof old.id!=='string' || !validDate(old.date) || !Number.isInteger(old.start) ||
       old.start<0 || old.start>=1440 || !data.staff.some(item=>item.id===old.artist) ||
       !data.services.some(item=>item.id===old.service)) continue;
    const result=seedVisit(data,{id:old.id,staffId:old.artist,clientId:'amir',service:old.service,date:old.date,start:old.start,
      status:old.cancelled?'cancelled':'confirmed'},now);
    data.bookings.push(result);
  }
  return data;
}
