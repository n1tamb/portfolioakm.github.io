export const pair = (ru, kk = ru) => ({ ru, kk });
export const zone = 'Asia/Almaty';
export const photos = ['barber', 'qyr-fade', 'qyr-cut', 'qyr-shop'];
export const statuses = ['pending','confirmed','late','arrived','in-service','completed','cancelled','no-show'];
export const finalStatuses = ['completed','cancelled','no-show'];
export const clients = [
  { id:'amir', name:pair('Амир Демо','Әмір Демо'), phone:'+7 (000) 000-00-01' },
  { id:'samat', name:pair('Самат Демо'), phone:'+7 (000) 000-00-02' },
  { id:'timur', name:pair('Тимур Демо'), phone:'+7 (000) 000-00-03' },
  { id:'nurlan', name:pair('Нурлан Демо','Нұрлан Демо'), phone:'+7 (000) 000-00-04' },
  { id:'arman', name:pair('Арман Демо'), phone:'+7 (000) 000-00-05' }
];

export const baseSite = {
  name: 'QYR', logo: 'word', hero:'barber', gallery: ['qyr-fade','qyr-cut','qyr-shop'],
  title: pair('Стрижки и уход за бородой','Шаш қию және сақал күтімі'),
  intro: pair('Мужские стрижки, чистые контуры и уход за бородой в Актобе.','Ақтөбеде ерлерге шаш қию, жиектерін тегістеу және сақал күтімі.'),
  about: pair('QYR — пример барбершопа, где услугу, мастера и время можно выбрать до визита.','QYR — қызметті, шеберді және уақытты келмей тұрып таңдауға болатын барбершоп үлгісі.'),
  contact: pair('Актобе · демонстрационная локация','Ақтөбе · демо орын'),
  email: 'hello@qyr.example',
  promotion: pair('Стрижка и борода · выгоднее вместе','Шаш қию және сақал · бірге тиімді'),
  rules: pair('Если планы изменились, обновите запись через профиль. Приходите за 5 минут до визита.','Жоспарыңыз өзгерсе, профиль арқылы жазбаны жаңартыңыз. Қабылдауға 5 минут ерте келіңіз.'),
  hours: { days:[2,3,4,5,6,0], start:600, end:1200 }
};

export const baseSettings = {
  buffer:10, step:15, late:15, cancellation:60, horizon:45, maxActive:3, hold:5,
  verifyPhone:false, requireConfirmation:true, suspicious:true, noShowLimit:2, deposit:0,
  reminderOne:1440, reminderTwo:120, confirmBefore:0
};

export const baseServices = [
  { id:'cut', name:pair('Мужская стрижка','Ерлерге шаш қию'), description:pair('Форма, мойка и укладка.','Пішін беру, жуу және сәндеу.'), category:pair('Стрижки','Шаш қию'), photo:'qyr-fade', price:5500, sale:0, minutes:45, active:true, exclusive:false },
  { id:'beard', name:pair('Оформление бороды','Сақалды реттеу'), description:pair('Контур и уход.','Сақал жиегін тегістеу және күтім.'), category:pair('Борода','Сақал'), photo:'barber', price:3500, sale:0, minutes:30, active:true, exclusive:false },
  { id:'combo', name:pair('Стрижка и борода','Шаш қию және сақал'), description:pair('Комплекс за одно посещение.','Бір қабылдаудағы кешенді қызмет.'), category:pair('Комплексы','Кешендер'), photo:'qyr-cut', price:9000, sale:8000, minutes:75, active:true, exclusive:true },
  { id:'kids', name:pair('Детская стрижка','Балаларға шаш қию'), description:pair('Спокойная стрижка с учётом пожеланий.','Тілектерге сай асықпай шаш қию.'), category:pair('Стрижки','Шаш қию'), photo:'qyr-cut', price:4500, sale:0, minutes:40, active:true, exclusive:true }
];

export const baseStaff = [
  { id:'alihan', name:pair('Алихан','Әлихан'), description:pair('Фейд и короткие стрижки','Фейд және қысқа шаш үлгілері'), photo:'qyr-fade', days:[2,3,4,5,6], start:600, end:1140, breaks:[[780,810]], services:['cut','kids'], prices:{}, commission:45, state:'active' },
  { id:'daniyar', name:pair('Данияр'), description:pair('Классические стрижки и борода','Классикалық шаш үлгілері және сақал күтімі'), photo:'qyr-cut', days:[0,2,3,4,5,6], start:600, end:1200, breaks:[[840,870]], services:['cut','beard','combo','kids'], prices:{}, commission:50, state:'active' }
];
