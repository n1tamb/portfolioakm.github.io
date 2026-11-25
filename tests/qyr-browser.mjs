import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const browserModule = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { chromium } = browserModule.default || browserModule;
const built = fileURLToPath(new URL('../dist/',import.meta.url));
const prefix = '/portfolioakm.github.io/';
const out=resolve('test-results');
await mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript',
  '.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.xml':'application/xml'};
const server=createServer(async(request,response)=>{
  try {
    const path=decodeURIComponent(new URL(request.url,'http://local').pathname);
    if(!path.startsWith(prefix)) throw new Error('404');
    let file=resolve(built,path.slice(prefix.length));
    if(file!==resolve(built) && !file.startsWith(built)) throw new Error('404');
    if((await stat(file)).isDirectory()) file=resolve(file,'index.html');
    response.setHeader('Content-Type',mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.statusCode=404;
    response.setHeader('Content-Type',mime['.html']);
    response.end(await readFile(resolve(built,'404.html')));
  }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port+prefix;
const errors=[];
const key='akmavren-qyr-v2';
const originTime=new Date('2026-11-24T07:00:00Z');
const launch={};
if(process.env.CHROMIUM_PATH) launch.executablePath=process.env.CHROMIUM_PATH;
const browser=await chromium.launch(launch);
const watch=page=>{
  page.on('pageerror',reason=>errors.push(reason.message));
  page.on('console',message=>{if(message.type()==='error' && !message.text().includes('404')) errors.push(message.text());});
  page.on('response',response=>{
    if(response.status()>=400 && response.url().startsWith(base) && !response.url().includes('missing-for-test')) errors.push(response.status()+' '+response.url());
  });
  return page;
};
async function navigate(page,path) {
  const response=await page.goto(base+path);
  if(response) assert.equal(response.status(),200,path);
  assert.equal(page.url(),base+path);
  await page.locator('h1').waitFor();
}
function button(scope,name) { return scope.getByRole('button',{name,exact:true}); }
function wizard(page) { return page.locator('#qyr-wizard'); }
function panel(page) { return page.getByRole('dialog'); }
function field(scope,name) { return scope.locator('[name="'+name+'"]'); }
async function state(page) { return page.evaluate(id=>JSON.parse(localStorage.getItem(id)),key); }
async function crmTab(page,route) {
  const link=page.locator('[data-q-view="'+route+'"]');
  if(!await link.isVisible()) await page.locator('.q-nav-toggle').click();
  await link.click();
  await page.waitForURL(url=>url.hash==='#'+route);
}
async function finishBooking(page,{service='cut',staff='alihan',date='2026-11-25',profile='samat',skipStart=false}={}) {
  const dialog=wizard(page);
  if(!skipStart) {
    await dialog.locator('[data-choice="'+service+'"]').click();
    await button(dialog,'Далее').click();
  }
  await dialog.locator('[data-choice="'+staff+'"]').click();
  await button(dialog,'Далее').click();
  await dialog.locator('[data-date="'+date+'"]').click();
  await button(dialog,'Далее').click();
  const time=dialog.locator('[data-slot]').first();
  const start=Number(await time.getAttribute('data-slot'));
  await time.click();
  await button(dialog,'Далее').click();
  await dialog.locator('[data-profile="'+profile+'"]').click();
  await button(dialog,'Далее').click();
  await button(dialog,'Подтвердить запись').click();
  await dialog.getByRole('heading',{name:'Пробная запись создана'}).waitFor();
  return (await state(page)).bookings.find(item=>!item.id.startsWith('sample-') &&
    item.date===date && item.staffId===staff && item.start===start && item.clientId===profile && item.status!=='cancelled');
}
async function firstOption(select,except) {
  const value=await select.locator('option').evaluateAll((items,except)=>items.map(item=>item.value).find(item=>item && item!==String(except)),except);
  assert(value,'A free slot is required for this test');
  await select.selectOption(value);
  return Number(value);
}
async function openRecord(crm,id) {
  await crmTab(crm,'bookings');
  const record=crm.locator('[data-record="'+id+'"]');
  await crm.locator('#qyr-crm-heading').filter({hasText:'Записи'}).waitFor();
  if(!await record.isVisible()) await button(crm,'Сбросить фильтры').click();
  await record.click();
  await panel(crm).getByRole('heading',{name:'Детали записи'}).waitFor();
  return panel(crm);
}
async function close(page) { await button(panel(page),'Закрыть').click(); }

try {
  const context=await browser.newContext({viewport:{width:1440,height:960},locale:'ru-KZ',acceptDownloads:true});
  const publicPage=watch(await context.newPage());
  const crm=watch(await context.newPage());
  for(const page of [publicPage,crm]) await page.clock.setFixedTime(originTime);
  await navigate(publicPage,'demos/qyr/');
  await navigate(crm,'demos/qyr/admin/#dashboard');
  await button(crm,'Пропустить').click();

  // 1–5. Create, find, move, cancel, and re-open the released slot.
  await publicPage.locator('[data-service="cut"]').click();
  const first=await finishBooking(publicPage,{skipStart:true});
  assert(first);
  const calendar=publicPage.waitForEvent('download');
  await button(wizard(publicPage),'В календарь (.ics)').click();
  const ics=await readFile(await (await calendar).path(),'utf8');
  assert.match(ics,/BEGIN:VEVENT/);
  let details=await openRecord(crm,first.id);
  await button(details,'Перенести').click();
  const moved=await firstOption(field(details,'start'),first.start);
  await button(details,'Перенести').click();
  await details.getByRole('heading',{name:'Детали записи'}).waitFor();
  assert.equal((await state(crm)).bookings.find(item=>item.id===first.id).start,moved);
  await button(details,'Отменить запись').click();
  await button(details,'Отменить запись').click();
  await details.getByText('Отменено',{exact:true}).waitFor();
  await close(crm);
  await navigate(publicPage,'demos/qyr/');
  await publicPage.locator('[data-service="cut"]').click();
  await wizard(publicPage).locator('[data-choice="alihan"]').click();
  await button(wizard(publicPage),'Далее').click();
  const dateWizard=wizard(publicPage);
  const reserveDate=dateWizard.locator('[data-date="'+first.date+'"]');
  await reserveDate.waitFor();
  assert.equal(await dateWizard.locator('[data-date="2026-11-29"]').count(),0);
  assert.equal(await dateWizard.locator('input[type=date]').count(),0);
  const blockId='test-full-day';
  await crm.evaluate(({key,date,blockId})=>{
    const data=JSON.parse(localStorage.getItem(key));
    data.intervals.push({id:blockId,staffId:'alihan',date,through:date,start:0,end:1440,kind:'block'});
    localStorage.setItem(key,JSON.stringify(data));
  },{key,date:first.date,blockId});
  await reserveDate.waitFor({state:'detached'});
  await crm.evaluate(({key,blockId})=>{
    const data=JSON.parse(localStorage.getItem(key));
    data.intervals=data.intervals.filter(interval=>interval.id!==blockId);
    localStorage.setItem(key,JSON.stringify(data));
  },{key,blockId});
  await reserveDate.click();
  await button(dateWizard,'Далее').click();
  assert(await dateWizard.locator('[data-slot="'+moved+'"]').isVisible());

  // 6–7. Price changes in CRM propagate to the open site; visit totals stay fixed.
  await crmTab(crm,'services');
  await button(crm.locator('[data-service-row="cut"]'),'Редактировать').click();
  await field(panel(crm),'price').fill('6300');
  await button(panel(crm),'Сохранить').click();
  await panel(crm).waitFor({state:'hidden'});
  await publicPage.locator('[data-service="cut"]').getByText(/6\s300/).waitFor();
  assert.equal((await state(crm)).bookings.find(item=>item.id===first.id).total,5500);

  // 8–11. Create a staff member, configure hours, book, and deactivate with warning.
  await crmTab(crm,'staff');
  await button(crm,'Добавить мастера').click();
  await field(panel(crm),'name-ru').fill('Ренат Демо');
  await field(panel(crm),'name-kk').fill('Ренат Демо');
  await field(panel(crm),'description-ru').fill('Короткие стрижки');
  await field(panel(crm),'description-kk').fill('Қысқа шаш үлгілері');
  await field(panel(crm),'start').fill('10:30');
  await field(panel(crm),'end').fill('17:00');
  await button(panel(crm),'Сохранить').click();
  await panel(crm).waitFor({state:'hidden'});
  const member=(await state(crm)).staff.find(item=>item.name.ru==='Ренат Демо');
  assert.equal(member.start,630);
  await publicPage.locator('[data-staff="'+member.id+'"]').click();
  assert(await wizard(publicPage).locator('[data-choice="cut"]').isVisible());
  const custom=await finishBooking(publicPage,{staff:member.id,profile:'timur'});
  assert.equal(custom.start,630);
  await field(crm.locator('[data-staff-row="'+member.id+'"]'),'state').selectOption('inactive');
  await panel(crm).getByText(/У мастера есть будущие записи/).waitFor();
  await button(panel(crm),'Скрыть из записи и перенести вручную').click();
  await crm.waitForURL(/#bookings$/);
  assert.equal((await state(crm)).staff.find(item=>item.id===member.id).state,'inactive');
  assert.equal((await state(crm)).bookings.find(item=>item.id===custom.id).status,'pending');

  // 12–16. Client delay, preview, no-show, completed visit, and report change.
  const lateDate=new Date('2026-11-25T05:20:00Z');
  for(const page of [publicPage,crm]) await page.clock.setFixedTime(lateDate);
  await button(wizard(publicPage),'Мои записи').click();
  const target=panel(publicPage).locator('.q-visit-list li').filter({hasText:'10:30'}).first();
  await button(target,'Детали записи').click();
  await button(panel(publicPage),'Я опаздываю').click();
  await field(panel(publicPage),'eta').fill('12');
  await button(panel(publicPage),'Сообщить об опоздании').click();
  await panel(publicPage).getByText('Опаздывает',{exact:true}).waitFor();
  await close(publicPage);
  await crmTab(crm,'notifications');
  const event=crm.locator('[data-event="late"]').first();
  await button(event,'Пример сообщения WhatsApp').click();
  await panel(crm).getByText(/12 мин/).waitFor();
  await panel(crm).getByText(/Сообщение не отправлялось/).waitFor();
  await close(crm);
  for(const page of [publicPage,crm]) await page.clock.setFixedTime(new Date('2026-11-25T05:46:00Z'));
  details=await openRecord(crm,custom.id);
  await button(details,'Отметить неявку').click();
  await button(details,'Отметить неявку').click();
  await details.getByText('Неявка',{exact:true}).waitFor();
  await close(crm);

  await crmTab(crm,'finance');
  const received=()=>crm.locator('.q-metrics div').filter({has:crm.getByText('Получено в демо',{exact:true})}).locator('dd').innerText();
  const before=Number((await received()).replace(/[^0-9]/g,''));
  // Mark a started fixture from the active schedule as paid and completed through the visit actions.
  const live=await state(crm);
  const confirmed=live.bookings.find(item=>item.status==='confirmed' && item.staffId==='daniyar');
  const minutes=confirmed.start-5;
  const epoch=Date.parse(confirmed.date+'T00:00:00Z')+(minutes-300)*60000;
  await crm.clock.setFixedTime(new Date(epoch));
  details=await openRecord(crm,confirmed.id);
  await button(details,'Отметить прибытие').click();
  await button(details,'Начать услугу').click();
  await button(details,'Завершить визит').click();
  await button(details,'Завершить визит').click();
  await details.getByText('Оплачено в демо',{exact:true}).waitFor();
  await close(crm);
  await crmTab(crm,'finance');
  assert.equal(Number((await received()).replace(/[^0-9]/g,''))-before,confirmed.total);
  const csv=crm.waitForEvent('download');
  await button(crm,'Экспорт CSV').click();
  assert.match(await readFile(await (await csv).path(),'utf8'),/Получено в демо/);

  // 17–18. Reload, publish preview, cross-tab data, and full reset.
  await crm.reload();
  assert.equal((await state(crm)).staff.find(item=>item.id===member.id).state,'inactive');
  await crmTab(crm,'site');
  await field(crm,'title-ru').fill('Новая витрина QYR');
  await button(crm,'Предпросмотр изменений').click();
  await crm.locator('.q-site-preview').getByText('Новая витрина QYR',{exact:true}).waitFor();
  await button(crm,'Опубликовать в демо').click();
  await publicPage.getByRole('heading',{name:'Новая витрина QYR'}).waitFor();
  await button(crm,'Сбросить демо').click();
  await button(panel(crm),'Сбросить демо').click();
  await publicPage.getByRole('heading',{name:'Стрижки и уход за бородой'}).waitFor();
  assert.equal((await state(crm)).staff.length,2);
  await wizard(publicPage).getByRole('heading',{name:'Выберите услуги'}).waitFor();

  // Calendar week/month, manual booking and a blocking interval.
  await crmTab(crm,'calendar');
  await button(crm,'Неделя').click();
  assert.equal(await crm.locator('.q-calendar-day').count(),7);
  await button(crm,'Месяц').click();
  assert(await crm.locator('.q-month-day').count()>=28);
  await button(crm,'День').click();
  await button(crm,'Создать запись').click();
  await field(panel(crm),'clientId').selectOption('arman');
  await panel(crm).locator('[name=serviceId][value=cut]').check();
  await field(panel(crm),'date').selectOption('2026-11-27');
  await firstOption(field(panel(crm),'start'));
  await button(panel(crm),'Создать запись').click();
  await panel(crm).getByRole('heading',{name:'Детали записи'}).waitFor();
  await close(crm);
  await button(crm,'Добавить интервал').click();
  await field(panel(crm),'date').fill('2026-11-28');
  await field(panel(crm),'through').fill('2026-11-28');
  await field(panel(crm),'kind').selectOption('break');
  await field(panel(crm),'start').fill('12:00');
  await field(panel(crm),'end').fill('12:30');
  await button(panel(crm),'Сохранить').click();
  await panel(crm).waitFor({state:'hidden'});
  assert((await state(crm)).intervals.some(item=>item.date==='2026-11-28' && item.kind==='break' && item.start===720));
  await context.close();

  const demoPage=watch(await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'}));
  await navigate(demoPage,'');
  assert.equal(await demoPage.locator('.poster:visible img').evaluate(el=>getComputedStyle(el).animationName),'poster-image');
  const picker = demoPage.locator('.player-controls');
  for (const [index, path] of ['sary-coffee','forma','qadam-fit','qyr'].entries()) {
    await picker.locator('button').nth(index).click();
    assert.equal(await demoPage.locator('.poster:visible').getAttribute('href'), 'demos/'+path+'/');
    assert.equal(await picker.locator('[aria-pressed=true]').count(), 1);
  }
  await demoPage.keyboard.press('ArrowRight');
  assert.equal(await picker.locator('button').first().getAttribute('aria-pressed'), 'true');
  await navigate(demoPage,'demos/sary-coffee/');
  await demoPage.locator('[data-step="1"]').first().click();
  assert.match(await demoPage.locator('#price-total').innerText(),/1\s200/);
  await demoPage.locator('[type="reset"]').click();
  await demoPage.locator('#order-empty').waitFor();
  await navigate(demoPage,'demos/forma/');
  await demoPage.locator('.room-photo').first().click();
  await panel(demoPage).locator('img').evaluate(image=>image.decode());
  await demoPage.keyboard.press('Escape');
  assert.equal(await demoPage.locator('.room-photo').first().evaluate(link=>link===document.activeElement),true);
  const fallback=await demoPage.goto(base+'demos/qadam-fit/?day=tue');
  assert.equal(fallback.status(),200);
  await demoPage.locator('#session-day').waitFor();
  assert.equal(new URL(demoPage.url()).searchParams.has('day'),false);
  assert.equal(await demoPage.locator('#session-day option').count(),5);
  await demoPage.locator('#session-day').selectOption('3');
  assert.equal(await demoPage.locator('.session:visible').count(),2);
  await demoPage.getByRole('link',{name:'Қазақша'}).click();
  await demoPage.waitForURL(url=>url.pathname.includes('/kk/') && url.searchParams.get('day')==='3');
  assert.equal(await demoPage.locator('.session:visible').count(),2);
  await demoPage.close();

  // 19–20. Both locale routes and all target viewports, including visual capture and dark mode.
  for(const width of [360,390,430,768,1024,1440]) {
    const context=await browser.newContext({viewport:{width,height:width<600?844:960},hasTouch:width<600,reducedMotion:'reduce'});
    const page=watch(await context.newPage());
    await page.clock.setFixedTime(originTime);
    for(const locale of ['','kk/']) {
      for(const route of ['','demos/qyr/','demos/qyr/admin/#dashboard','demos/qyr/admin/#calendar',
        'demos/qyr/admin/#clients','demos/qyr/admin/#staff','demos/qyr/admin/#services','demos/qyr/admin/#finance',
        'demos/qyr/admin/#analytics','demos/qyr/admin/#notifications','demos/qyr/admin/#site','demos/qyr/admin/#settings',
        'demos/qyr/admin/?mode=master#calendar','demos/forma/','demos/sary-coffee/','demos/qadam-fit/']) {
        await navigate(page,locale+route);
        if(route.includes('admin')) await page.locator('.q-rail [data-q-view]').first().waitFor({state:'attached'});
        if(route==='demos/qyr/') await wizard(page).locator('[data-choice]').first().waitFor();
        if(route==='') assert.equal(await page.locator('.poster:visible img').evaluate(el=>getComputedStyle(el).animationName),'none');
        if(locale && route==='demos/qyr/admin/#dashboard') await page.locator('.q-dashboard-strip').getByText(/қараша/).waitFor();
        const status=await page.evaluate(async()=>{
          await document.fonts.ready;
          await Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode().catch(()=>{});}));
          return {width:document.documentElement.scrollWidth,lang:document.documentElement.lang,
            broken:[...document.images].filter(img=>!img.naturalWidth).map(img=>img.src)};
        });
        assert.equal(status.width,width,locale+route);
        assert.equal(status.lang,locale?'kk':'ru');
        assert.deepEqual(status.broken,[],locale+route);
        if([390,1440].includes(width) && ['', 'demos/qyr/', 'demos/forma/', 'demos/sary-coffee/', 'demos/qadam-fit/', 'demos/qyr/admin/#dashboard'].includes(route)) {
          const name=route.split('/').filter(Boolean).at(-1)?.replace('#','') || 'portfolio';
          await page.screenshot({path:resolve(out,'showcase-'+(locale?'kk':'ru')+'-'+width+'-'+name+'.png')});
        }
        if(!locale && ['demos/qyr/','demos/qyr/admin/#dashboard','demos/qyr/admin/#calendar'].includes(route)) {
          await page.screenshot({path:resolve(out,'qyr-'+width+'-'+(route.endsWith('/')?'visitor':route.split('#')[1])+'.png')});
          if(route==='demos/qyr/' && [390,1440].includes(width)) {
            await page.locator('[data-service="cut"]').click();
            await wizard(page).getByRole('heading',{name:'Выберите мастера'}).waitFor();
            await button(wizard(page),'Далее').click();
            await wizard(page).locator('[data-date]').first().waitFor();
            await page.screenshot({path:resolve(out,'showcase-ru-'+width+'-available-dates.png')});
          }
        }
      }
    }
    await navigate(page,'demos/qyr/admin/#dashboard');
    await button(page,'Тёмная тема').click();
    await page.locator('html[data-q-theme="dark"]').waitFor();
    if([390,1440].includes(width)) await page.screenshot({path:resolve(out,'qyr-'+width+'-dark.png')});
    await navigate(page,'demos/qyr/admin/?mode=master#calendar');
    await page.getByRole('link',{name:'Қазақша'}).click();
    await page.waitForURL(url=>url.pathname.includes('/kk/') && url.searchParams.get('mode')==='master');
    await page.getByRole('heading',{name:'Күнтізбе',exact:true}).waitFor();
    await context.close();
    console.log('Responsive routes and photos checked in both languages at '+width+' px.');
  }

  const page=watch(await browser.newPage());
  const missing=await page.goto(base+'missing-for-test');
  assert.equal(missing.status(),404);
  await page.getByRole('heading',{name:'Страница не найдена'}).waitFor();
  await navigate(page,'demos/qyr/');
  await page.evaluate(id=>localStorage.setItem(id,'broken'),key);
  await page.reload();
  await page.getByText(/Повреждённые данные восстановлены/).waitFor();
  await page.close();
  assert.deepEqual(errors,[]);
  console.log('All 20 requested scenarios, CSV, ICS, stored snapshots, 404 and storage recovery verified.');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
