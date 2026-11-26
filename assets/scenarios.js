// Сценарии демо: сообщение для WhatsApp, запись на тренировку, фильтр комнат.
(() => {
  const kk = document.documentElement.lang === 'kk';
  const copy = kk ? {
    wa: 'WhatsApp-та ашу',
    waNote: 'WhatsApp дайын мәтінмен ашылады. Бизнес нөмірі көрсетілмеген: алушыны өзіңіз таңдайсыз.',
    bookingHello: 'Сәлеметсіз бе! QYR демосынан сынақ жазбасы:',
    orderHello: 'Сәлеметсіз бе! Sary Coffee демосынан сынақ тапсырысы:',
    total: 'Барлығы',
    fitHello: 'Сәлеметсіз бе! Qadam Fit демосынан сынақ жазбасы:',
    fitNote: 'Жазылу сынақ түрінде: ол тек осы браузерде сақталады. Аты-жөні мен телефон қажет емес.',
    book: 'Жазылу', cancel: 'Бас тарту', booked: 'Сіз жазылдыңыз',
    saved: 'Сынақ жазбасы сақталды', removed: 'Жазбадан бас тартылды',
    storage: 'Браузер өзгерісті сақтай алмады. Осы сайтқа жергілікті жадты пайдалануға рұқсат беріп, қайталап көріңіз.',
    allRooms: 'Барлық бөлме', rooms: 'Бөлмені таңдау'
  } : {
    wa: 'Открыть в WhatsApp',
    waNote: 'WhatsApp откроется с готовым текстом. Номер бизнеса не указан: получателя выбираете вы.',
    bookingHello: 'Здравствуйте! Пробная запись из демо QYR:',
    orderHello: 'Здравствуйте! Пробный заказ из демо Sary Coffee:',
    total: 'Итого',
    fitHello: 'Здравствуйте! Пробная запись из демо Qadam Fit:',
    fitNote: 'Запись пробная: она сохраняется только в этом браузере. Имя и телефон не нужны.',
    book: 'Записаться', cancel: 'Отменить запись', booked: 'Вы записаны',
    saved: 'Пробная запись сохранена', removed: 'Запись отменена',
    storage: 'Браузер не смог сохранить изменение. Разрешите локальное хранение для сайта и попробуйте ещё раз.',
    allRooms: 'Все комнаты', rooms: 'Выбор комнаты'
  };
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Ссылка без номера: WhatsApp сам предложит выбрать получателя
  const waUrl = lines => `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;

  function waLink(label = copy.wa) {
    const link = element('a', 'button whatsapp', label);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  // Барбершоп: сообщение появляется вместе с подтверждением записи
  const receipt = document.getElementById('receipt');
  if (receipt) {
    const summary = document.getElementById('booking-summary');
    const service = document.getElementById('booking-form').elements.service;
    const link = waLink();
    receipt.append(link, element('p', 'wa-note', copy.waNote));
    new MutationObserver(() => {
      if (receipt.hidden) {
        link.removeAttribute('href');
        return;
      }
      const [, ...details] = summary.textContent.split('\n');
      link.href = waUrl([copy.bookingHello, service.selectedOptions[0].textContent, ...details]);
    }).observe(receipt, { attributes: true, attributeFilter: ['hidden'] });
  }

  // Кофейня: список заказа с количеством и суммой
  const order = document.getElementById('sample-order');
  if (order) {
    const bar = order.querySelector('.order-total');
    const link = waLink();
    bar.append(link);
    const note = element('p', 'order-note', copy.waNote);
    document.getElementById('order-note').after(note);

    const update = () => {
      const lines = [];
      for (const input of $$('[data-price]', order)) {
        const units = Math.min(Number(input.max), Math.max(0, Math.trunc(Number(input.value) || 0)));
        if (!units) continue;
        const item = input.closest('.menu-item');
        const price = item.querySelector('.menu-selection strong').textContent;
        lines.push(`• ${item.querySelector('h4').textContent}: ${units} × ${price}`);
      }
      link.hidden = lines.length === 0;
      if (link.hidden) link.removeAttribute('href');
      else link.href = waUrl([copy.orderHello, ...lines, `${copy.total}: ${document.getElementById('price-total').textContent}`]);
    };
    for (const type of ['input', 'change', 'click']) order.addEventListener(type, update);
    order.addEventListener('reset', () => requestAnimationFrame(() => requestAnimationFrame(update)));
    addEventListener('pageshow', update);
    update();
  }

  // Фитнес: пробная запись из расписания
  const list = document.getElementById('sessions');
  if (list) {
    const key = 'akmavren-fit-bookings-v1';
    const status = element('p', 'visually-hidden');
    status.setAttribute('role', 'status');
    const error = element('p', 'fit-error');
    error.setAttribute('role', 'alert');
    list.before(element('p', 'fit-note', `${copy.fitNote} ${copy.waNote}`), error, status);

    const read = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
      } catch {
        return [];
      }
    };

    const rows = $$('.session', list).map(row => {
      const dayName = row.querySelector('.session-clock span').textContent;
      const time = row.querySelector('time').textContent;
      const title = row.querySelector('h3').textContent;
      const id = `${row.dataset.day}-${time}`;
      const actions = element('div', 'session-actions');
      const state = element('strong', 'session-state', `✓ ${copy.booked}`);
      const toggle = element('button', 'button session-toggle');
      toggle.type = 'button';
      const link = waLink();
      link.href = waUrl([copy.fitHello, title, `${dayName}, ${time} (UTC+5)`]);
      actions.append(state, toggle, link);
      row.append(actions);

      toggle.addEventListener('click', () => {
        const stored = read();
        const booked = stored.includes(id);
        error.textContent = '';
        try {
          localStorage.setItem(key, JSON.stringify(booked ? stored.filter(x => x !== id) : [...stored, id]));
        } catch {
          error.textContent = copy.storage;
          return;
        }
        render();
        status.textContent = `${booked ? copy.removed : copy.saved}: ${title}, ${dayName}, ${time}`;
      });
      return { id, row, state, toggle, link, name: `${title}, ${dayName}, ${time}` };
    });

    const render = () => {
      const stored = read();
      for (const { id, row, state, toggle, link, name } of rows) {
        const booked = stored.includes(id);
        row.classList.toggle('booked', booked);
        state.hidden = link.hidden = !booked;
        toggle.textContent = booked ? copy.cancel : copy.book;
        toggle.classList.toggle('secondary', booked);
        toggle.setAttribute('aria-label', `${toggle.textContent}: ${name}`);
      }
    };
    addEventListener('storage', e => { if (e.key === key || e.key === null) render(); });
    addEventListener('pageshow', render);
    render();
  }

  // Интерьеры: фильтр по комнатам
  const rooms = document.getElementById('rooms');
  if (rooms) {
    const figures = $$('figure[data-room]', rooms);
    const filter = element('div', 'chips room-filter');
    filter.setAttribute('role', 'group');
    filter.setAttribute('aria-label', copy.rooms);
    const options = [['all', copy.allRooms], ...figures.map(f => [f.dataset.room, f.querySelector('h3').textContent])];
    const select = value => {
      for (const button of filter.children) button.setAttribute('aria-pressed', button.dataset.value === value);
      rooms.classList.toggle('single', value !== 'all');
      for (const figure of figures) {
        figure.hidden = value !== 'all' && figure.dataset.room !== value;
        figure.classList.remove('reveal', 'shown', 'pop');
        if (!figure.hidden) {
          void figure.offsetWidth;
          figure.classList.add('pop');
        }
      }
    };
    for (const [value, label] of options) {
      const button = element('button', '', label);
      button.type = 'button';
      button.dataset.value = value;
      button.setAttribute('aria-pressed', value === 'all');
      button.addEventListener('click', () => select(value));
      filter.append(button);
    }
    rooms.before(filter);
  }
})();
