// Анимации и удобства интерфейса. Без этого файла сайт остаётся рабочим.
(() => {
  const root = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const kk = root.lang === 'kk';
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  // Полоса прогресса и тень шапки
  const progress = document.body.appendChild(document.createElement('div'));
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  const onScroll = () => {
    const range = root.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.min(1, scrollY / range) : 0})`;
    root.classList.toggle('is-scrolled', scrollY > 8);
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // Появление блоков при прокрутке
  if (!calm.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.filter(e => e.isIntersecting).forEach((e, n) => {
        const el = e.target;
        el.style.setProperty('--delay', `${n * 80}ms`);
        el.classList.add('shown');
        observer.unobserve(el);
        // после появления возвращаем элементу его обычные hover-переходы
        setTimeout(() => el.classList.remove('reveal', 'shown'), 900 + n * 80);
      });
    }, { threshold: .08 });
    for (const el of $$('.work-head, .case-block, .page-section > h2, .room-grid figure, .design-services > div, .menu-item, .session, .price-list, .team, .booking')) {
      if (el.getBoundingClientRect().top < innerHeight) continue;
      el.classList.add('reveal');
      observer.observe(el);
    }
  }

  // Подсветка текущего раздела в меню демо
  const navLinks = $$('.section-nav a[href^="#"]');
  if (navLinks.length > 1) {
    const spy = () => {
      let current = null;
      for (const link of navLinks) {
        const target = document.querySelector(link.hash);
        const section = target?.closest('section') || target;
        if (section && section.getBoundingClientRect().top < innerHeight * .4) current = link;
      }
      for (const link of navLinks) {
        if (link === current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    };
    addEventListener('scroll', spy, { passive: true });
    spy();
  }

  // Кнопки-«чипсы» вместо выпадающего списка. select остаётся источником значения.
  function chips(select, className, label, skipEmpty) {
    const group = document.createElement('div');
    group.className = `chips ${className}`;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    const sync = () => {
      for (const b of group.children) {
        b.setAttribute('aria-pressed', b.dataset.value === select.value);
      }
      group.hidden = select.disabled;
    };
    const build = () => {
      group.replaceChildren(...[...select.options].filter(o => !skipEmpty || o.value).map(o => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.value = o.value;
        b.textContent = o.textContent;
        b.addEventListener('click', () => {
          select.value = o.value;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync();
        });
        return b;
      }));
      sync();
    };
    build();
    return { group, build, sync };
  }

  // Расписание: дни недели одним нажатием
  const day = document.getElementById('session-day');
  if (day) {
    const label = document.getElementById('schedule-filter');
    const filter = chips(day, 'schedule-filter-chips', label.firstChild.textContent.trim());
    label.closest('.schedule-head').after(filter.group);
    label.hidden = true;
    day.addEventListener('change', () => {
      filter.sync();
      $$('.session:not([hidden])').forEach((s, n) => {
        s.classList.remove('reveal', 'shown', 'pop');
        void s.offsetWidth;
        s.style.animationDelay = `${n * 60}ms`;
        s.classList.add('pop');
      });
    });
    addEventListener('pageshow', filter.sync);
  }

  // Запись: свободное время кнопками, выбранная услуга подсвечена в прайсе
  const form = document.getElementById('booking-form');
  if (form) {
    const { time, service } = form.elements;
    const field = time.closest('.field');
    const slots = chips(time, 'time-chips', field.querySelector('span').textContent, true);
    const row = field.parentElement;
    const heading = document.createElement('div');
    heading.className = 'field';
    heading.style.gridColumn = '1 / -1';
    const caption = document.createElement('span');
    caption.textContent = field.querySelector('span').textContent;
    heading.append(caption, slots.group);
    row.append(heading);
    field.classList.add('chip-source');
    time.tabIndex = -1;
    new MutationObserver(slots.build).observe(time, { childList: true, attributes: true, attributeFilter: ['disabled'] });
    // если проверка формы переводит фокус на скрытый select, передаём его кнопкам
    time.addEventListener('focus', () => slots.group.querySelector('button')?.focus());
    // подсказка браузера у скрытого select не видна, поэтому показываем свою
    time.addEventListener('invalid', e => {
      e.preventDefault();
      document.getElementById('slot-warning').textContent = kk ? 'Уақытты таңдаңыз.' : 'Выберите время.';
      slots.group.querySelector('button')?.focus();
    });
    const markService = () => {
      for (const link of $$('[data-service]')) link.setAttribute('aria-current', link.dataset.service === service.value);
    };
    form.addEventListener('input', () => { markService(); slots.sync(); });
    form.addEventListener('submit', () => setTimeout(slots.sync, 150));
    for (const link of $$('[data-service]')) link.addEventListener('click', () => { markService(); slots.sync(); });
    markService();
  }

  // Заказ кофе: отмечаем выбранные позиции и анимируем сумму
  const order = document.getElementById('sample-order');
  if (order) {
    const total = document.getElementById('price-total');
    let previous = total.textContent;
    const mark = () => {
      for (const input of $$('[data-price]', order)) input.closest('.menu-item').classList.toggle('in-order', Number(input.value) > 0);
      if (total.textContent !== previous) {
        previous = total.textContent;
        total.classList.remove('bump');
        void total.offsetWidth;
        total.classList.add('bump');
      }
    };
    for (const type of ['input', 'change', 'click']) order.addEventListener(type, mark);
    order.addEventListener('reset', () => requestAnimationFrame(() => requestAnimationFrame(mark)));
    addEventListener('pageshow', mark);
  }

  // Главная: свет за курсором и живое демо в телефоне
  const hero = document.querySelector('.hero');
  if (!hero) return;
  hero.addEventListener('pointermove', e => {
    if (calm.matches || e.pointerType !== 'mouse') return;
    const box = hero.getBoundingClientRect();
    hero.style.setProperty('--mx', `${e.clientX - box.left}px`);
    hero.style.setProperty('--my', `${e.clientY - box.top}px`);
  });

  const showcase = hero.querySelector('.showcase');
  const screens = $$('.screen', showcase);
  const tabs = $$('.showcase-tabs button', showcase);
  const cycle = 4800;
  let index = 0, timers = [], auto = !calm.matches, visible = true;
  showcase.style.setProperty('--cycle', `${cycle}ms`);
  showcase.querySelector('.showcase-tabs').hidden = false;

  function show(next) {
    timers.forEach(clearTimeout);
    timers = [];
    index = next;
    showcase.classList.remove('playing');
    void showcase.offsetWidth;
    screens.forEach((s, i) => s.classList.toggle('on', i === index));
    tabs.forEach((t, i) => t.setAttribute('aria-pressed', i === index));
    const steps = $$('[data-step-at]', screens[index]);
    for (const step of steps) {
      step.classList.toggle('act', calm.matches);
      if (!calm.matches) timers.push(setTimeout(() => step.classList.add('act'), Number(step.dataset.stepAt)));
    }
    if (auto && visible && !document.hidden) {
      showcase.classList.add('playing');
      timers.push(setTimeout(() => show((index + 1) % screens.length), cycle));
    }
  }
  // Нажатие на вкладку останавливает автопрокрутку
  tabs.forEach((tab, i) => tab.addEventListener('click', () => { auto = false; show(i); }));
  document.addEventListener('visibilitychange', () => show(index));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting !== visible) { visible = e.isIntersecting; show(index); }
    }).observe(showcase);
  }
  show(0);
})();
