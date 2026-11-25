import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, localClock, slots, availableDates, quote, createBooking, moveBooking, changeStatus, setStaffState, collectEvents, finance, holdSlot, clearHold, migrate, visitEpoch } from '../assets/qyr/model.js';

const now = Date.parse('2026-11-24T02:00:00Z');
const today = '2026-11-24';
const next = '2026-11-25';
const request = { serviceIds: ['cut'], staffId: 'alihan', clientId: 'amir', date: next, start: 600 };

function empty() {
  const data = seed(now);
  data.bookings = [];
  data.events = [];
  data.intervals = [];
  data.settings.maxActive = 4;
  return data;
}

test('Almaty calendar, weekday shutdown, buffers, break and vacation', () => {
  assert.equal(localClock(Date.parse('2026-11-24T21:45Z')).date, next);
  assert.equal(visitEpoch(next,600), Date.parse('2026-11-25T05:00Z'));
  const data = empty();
  assert.equal(slots(data,{...request,date:'2026-11-23'},now).length,0);
  data.intervals.push({ id:'leave', staffId:'alihan', date:next, through:next, kind:'leave', start:0,end:1440 });
  assert.equal(slots(data,request,now).length,0);
  data.intervals.pop();
  assert(slots(data,request,now).every(slot => slot.start + 55 <= 780 || slot.start >= 810));
  const booking = createBooking(data,request,now);
  const starts = slots(data,request,now).map(slot=>slot.start);
  assert(!starts.includes(645));
  assert(starts.includes(660));
  assert.equal(booking.minutes,45);
});

test('combined service eligibility, booked-price snapshots, atomic move and cancellation', () => {
  const data = empty();
  assert.equal(quote(data,['cut','beard'],'alihan'),null);
  assert.equal(quote(data,['cut','beard'],'daniyar').minutes,75);
  assert.equal(quote(data,['cut','combo'],'daniyar'),null);
  const booking = createBooking(data,request,now);
  const second = createBooking(data,{...request,start:675},now);
  data.services.find(item=>item.id==='cut').price = 6100;
  assert.throws(()=>moveBooking(data,booking.id,{date:next,start:675,staffId:'alihan'},now));
  assert.equal(booking.start,600);
  assert.equal(booking.total,5500);
  moveBooking(data,booking.id,{date:next,start:810,staffId:'alihan'},now);
  assert.equal(booking.total,5500);
  changeStatus(data,second.id,'cancelled',now);
  assert(slots(data,request,now).some(slot=>slot.start===675));
});

test('holds expire, reminders deduplicate, no-shows and revenue reflect actual actions', () => {
  const data = empty();
  holdSlot(data,'test',request,now);
  assert(!slots(data,request,now).some(slot=>slot.start===600));
  assert(slots(data,request,now,{token:'test'}).some(slot=>slot.start===600));
  assert(slots(data,request,now+15*60_000).some(slot=>slot.start===600));
  clearHold(data,'test');
  const booking = createBooking(data,request,now);
  changeStatus(data,booking.id,'confirmed',now);
  collectEvents(data,now+4*3600_000);
  assert(data.events.some(event=>event.type==='reminder' && event.minutes===1440));
  collectEvents(data,now+4*3600_000);
  assert.equal(data.events.filter(event=>event.type==='reminder').length,1);
  assert.throws(()=>changeStatus(data,booking.id,'no-show',now));
  const visit = visitEpoch(next,600);
  changeStatus(data,booking.id,'late',visit,{eta:10});
  changeStatus(data,booking.id,'arrived',visit);
  changeStatus(data,booking.id,'in-service',visit);
  changeStatus(data,booking.id,'completed',visit,{paid:false});
  assert.equal(finance(data,today,next).received,0);
  booking.paid = true;
  assert.equal(finance(data,today,next).received,5500);
});

test('staff deactivation warns, preserves history, and legacy entries migrate', () => {
  const data = empty();
  const booking = createBooking(data,request,now);
  assert.throws(()=>setStaffState(data,'alihan',false,null,now));
  setStaffState(data,'alihan',false,'keep',now);
  assert.equal(booking.status,'pending');
  assert.equal(slots(data,request,now).length,0);
  const restored = migrate([{id:'old',artist:'alihan',service:'cut',date:next,start:600,cancelled:false}],now);
  assert.equal(restored.bookings.find(item=>item.id==='old').total,5500);
});

test('a held quote cannot silently change and an overdue confirmation releases its slot', () => {
  const data=empty();
  const hold=holdSlot(data,'original',request,now);
  data.services[0].price=7100;
  assert.throws(()=>createBooking(data,request,now,{token:'original'}),/offerChanged/);
  assert.equal(hold.total,5500);
  clearHold(data,'original');
  const entry=createBooking(data,request,now);
  data.settings.confirmBefore=30;
  const until=visitEpoch(entry.date,entry.start)-20*60_000;
  collectEvents(data,until);
  assert.equal(entry.status,'cancelled');
  assert(slots(data,request,until).some(item=>item.start===600));
  assert(data.events.some(item=>item.bookingId===entry.id && item.type==='opening'));
});

test('date listings omit closed days, full days and days without a compatible service', () => {
  const data=empty();
  data.settings.horizon=8;
  data.intervals.push({id:'closure',staffId:'alihan',date:next,through:next,start:0,end:1440,kind:'block'});
  const dates=availableDates(data,{...request,date:next},now);
  assert.deepEqual(dates.map(item=>item.date),['2026-11-26','2026-11-27','2026-11-28','2026-12-01','2026-12-02']);
  for(const item of dates) assert.equal(item.count,slots(data,{...request,date:item.date},now).length);
  assert.deepEqual(availableDates(data,{...request,serviceIds:['beard']},now),[]);
  data.intervals.pop();
  assert.equal(availableDates(data,{...request,date:next},now)[0].date,next);
});
