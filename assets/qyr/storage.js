import { seed, migrate, collectEvents, validDate, statuses, clients, version } from './model.js';
import { photos } from './seed.js';

export const key = 'akmavren-qyr-v2';
const legacyKey = 'akmavren-qyr-bookings-v1';
const idSet = array => new Set(array.map(item=>item.id));
const dual = value => value && typeof value.ru==='string' && typeof value.kk==='string';
const within = (n,min,max) => Number.isInteger(n) && n>=min && n<=max;
const days = value => Array.isArray(value) && value.every(day=>within(day,0,6));
const windowValid = value => within(value.start,0,1439) && within(value.end,1,1440) && value.end>value.start;

export function verify(data) {
  if (!data || data.version!==version || typeof data.instanceId!=='string' || !['services','staff','bookings','intervals','holds','events','expenses']
    .every(field=>Array.isArray(data[field]) && data[field].every(item=>item && typeof item==='object'))) return false;
  if (!data.site?.hours || !days(data.site.hours.days) || !windowValid(data.site.hours) ||
      !['title','intro','about','contact','promotion','rules'].every(field=>dual(data.site[field])) ||
      !photos.includes(data.site.hero) || !Array.isArray(data.site.gallery) || !data.site.gallery.every(photo=>photos.includes(photo)) ||
      typeof data.site.name!=='string' || typeof data.site.email!=='string' || !['word','mark'].includes(data.site.logo) ||
      !data.notes || typeof data.notes!=='object' || Array.isArray(data.notes) || !Object.values(data.notes).every(dual) ||
      !data.settings || !['light','dark'].includes(data.theme)) return false;
  const { settings } = data;
  if (![5,10,15,20,30].includes(settings.step) || !within(settings.horizon,1,90) || !within(settings.hold,1,30) ||
      !within(settings.buffer,0,120) || !within(settings.late,0,120) || !within(settings.cancellation,0,1440) ||
      !within(settings.maxActive,1,10) || !within(settings.noShowLimit,1,10) || !within(settings.deposit,0,1000000) ||
      !within(settings.reminderOne,0,10080) || !within(settings.reminderTwo,0,10080) || !within(settings.confirmBefore,0,1440)) return false;
  if (!data.services.every(item=>typeof item.id==='string' && dual(item.name) && dual(item.description) &&
      dual(item.category) && photos.includes(item.photo) && typeof item.active==='boolean' && typeof item.exclusive==='boolean' &&
      within(item.minutes,5,600) && within(item.price,0,1000000) && within(item.sale,0,item.price))) return false;
  const serviceIds=idSet(data.services);
  if (!data.staff.every(item=>typeof item.id==='string' && dual(item.name) && dual(item.description) && photos.includes(item.photo) &&
      days(item.days) && windowValid(item) && ['active','paused','inactive'].includes(item.state) &&
      Array.isArray(item.services) && item.services.every(id=>serviceIds.has(id)) && item.prices && typeof item.prices==='object' &&
      Object.entries(item.prices).every(([id,price])=>serviceIds.has(id) && within(price,0,1000000)) &&
      Array.isArray(item.breaks) && item.breaks.every(block=>Array.isArray(block) && windowValid({start:block[0],end:block[1]})) &&
      within(item.commission,0,100))) return false;
  const staffIds=idSet(data.staff);
  if (!data.bookings.every(item=>typeof item.id==='string' && clients.some(client=>client.id===item.clientId) &&
      staffIds.has(item.staffId) && dual(item.staffName) && validDate(item.date) && within(item.start,0,1439) &&
      within(item.minutes,5,1439-item.start) && within(item.total,0,10000000) && within(item.commission,0,100) &&
      statuses.includes(item.status) && typeof item.paid==='boolean' &&
      Array.isArray(item.lines) && item.lines.length>0 && item.lines.every(line=>line && typeof line.id==='string' &&
        dual(line.name) && within(line.minutes,5,600) && within(line.price,0,1000000)) && Array.isArray(item.reminders))) return false;
  return data.intervals.every(item=>typeof item.id==='string' && staffIds.has(item.staffId) && validDate(item.date) &&
      validDate(item.through) && item.through>=item.date && ['leave','block','break'].includes(item.kind) && windowValid(item)) &&
    data.holds.every(item=>typeof item.token==='string' && staffIds.has(item.staffId) && validDate(item.date) &&
      within(item.start,0,1439) && within(item.minutes,5,1439-item.start) && within(item.total,0,10000000) && Array.isArray(item.serviceIds) && Number.isFinite(item.until)) &&
    data.events.every(item=>typeof item.id==='string' && typeof item.type==='string' && Number.isFinite(item.at) && typeof item.seen==='boolean') &&
    data.expenses.every(item=>typeof item.id==='string' && validDate(item.date) &&
      ['supplies','rent','other'].includes(item.category) && within(item.amount,1,10000000)) &&
    [data.services,data.staff,data.bookings,data.intervals,data.events,data.expenses].every(list=>idSet(list).size===list.length);
}

let memory;
let warning = '';
const listeners=new Set();

export function read() {
  let raw;
  try { raw=localStorage.getItem(key); }
  catch { warning='storageUnavailable'; return memory ??= seed(); }
  if(raw===null) {
    let legacy=null;
    try { legacy=JSON.parse(localStorage.getItem(legacyKey)); }
    catch { warning='storageRecovered'; }
    memory ??= migrate(legacy);
    try { localStorage.setItem(key,JSON.stringify(memory)); }
    catch { warning='storageUnavailable'; }
    return memory;
  }
  try {
    const data=JSON.parse(raw);
    if(!verify(data)) throw new Error('schema');
    memory=data;
  } catch {
    warning='storageRecovered';
    memory=seed();
    try { localStorage.setItem(key,JSON.stringify(memory)); }
    catch { warning='storageUnavailable'; }
  }
  return memory;
}
export const storageWarning = ()=>warning;
export function subscribe(listener) { listeners.add(listener); return ()=>listeners.delete(listener); }
function notify(data,source) { for(const listener of listeners) listener(data,source); }
window.addEventListener('storage',event=>{
  if(event.key!==key && event.key!==null) return;
  if(event.newValue===null) memory=null;
  notify(read(),'other');
});
const withLock = action=>navigator.locks ? navigator.locks.request(key,action) : Promise.resolve().then(action);

export function update(operation,source='update',{saveUnchanged=true}={}) {
  return withLock(()=>{
    const data=structuredClone(read());
    const result=operation(data);
    if(!saveUnchanged && !result) return result;
    if(!verify(data)) throw new Error('invalidValue');
    try { localStorage.setItem(key,JSON.stringify(data)); }
    catch { throw new Error('storageUnavailable'); }
    memory=data;
    notify(data,source);
    return result;
  });
}

export function reset() {
  return withLock(()=>{
    const data=seed();
    try {
      localStorage.setItem(key,JSON.stringify(data));
      localStorage.removeItem(legacyKey);
    } catch { throw new Error('storageUnavailable'); }
    memory=data;
    warning='';
    notify(data,'reset');
  });
}
export function refreshEvents() { return update(data=>collectEvents(data),'clock',{saveUnchanged:false}); }

export function cleanDemoText(value,max,{allowEmail=false}={}) {
  const text=String(value ?? '').trim();
  if(text.length>max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text) ||
    /(?:\d[\s().+-]*){7}|https?:\/\/|www\.|(?:api[_ -]?key|secret|password|token)\s*[:=]/i.test(text) ||
    /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_|sk-(?:proj-)?|AKIA)[A-Za-z0-9_-]{12,})/.test(text) ||
    (!allowEmail && text.includes('@'))) throw new Error('demoDataOnly');
  if(allowEmail && !/^[a-z0-9._-]+@[a-z0-9.-]+\.example$/i.test(text)) throw new Error('demoDataOnly');
  return text;
}
