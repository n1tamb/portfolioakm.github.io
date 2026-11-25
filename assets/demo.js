const interfaceMotion = matchMedia('(prefers-reduced-motion: no-preference)');

const sampleOrder = document.getElementById('sample-order');

if (sampleOrder) {
  const quantities = [...sampleOrder.querySelectorAll('[data-price]')];
  const priceTotal = document.getElementById('price-total');
  const emptyOrder = document.getElementById('order-empty');
  const resetOrder = sampleOrder.querySelector('[type="reset"]');
  const amount = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0
  });

  function clampUnits(field, units) {
    return Math.min(Number(field.max), Math.max(Number(field.min), Math.trunc(units || 0)));
  }

  let totalMotion;
  function refreshTotal() {
    let total = 0;
    for (const field of quantities) {
      const units = clampUnits(field, field.valueAsNumber);
      total += Number(field.dataset.price) * units;
      const selection = field.parentElement;
      selection.querySelector('[data-step="-1"]').setAttribute('aria-disabled', units === Number(field.min));
      selection.querySelector('[data-step="1"]').setAttribute('aria-disabled', units === Number(field.max));
    }
    emptyOrder.hidden = total !== 0;
    resetOrder.disabled = total === 0;
    const value = amount.format(total) + '\u00a0₸';
    if (priceTotal.value === value) return;
    priceTotal.value = value;
    if (interfaceMotion.matches && priceTotal.animate) {
      totalMotion?.cancel();
      totalMotion = priceTotal.animate([{transform:'translateY(3px)',opacity:.65},{transform:'none',opacity:1}],
        {duration:190,easing:'ease-out'});
    }
  }

  sampleOrder.addEventListener('input', refreshTotal);
  for (const field of quantities) {
    field.parentElement.hidden = false;
    field.addEventListener('change', () => {
      field.value = clampUnits(field, field.valueAsNumber);
      refreshTotal();
    });
  }
  for (const button of sampleOrder.querySelectorAll('[data-step]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      const field = button.parentElement.querySelector('input');
      const previous = clampUnits(field, field.valueAsNumber);
      field.value = clampUnits(field, previous + Number(button.dataset.step));
      refreshTotal();
    });
  }
  sampleOrder.addEventListener('reset', () => requestAnimationFrame(() => {
    refreshTotal();
    quantities[0]?.parentElement.querySelector('[data-step="1"]').focus();
  }));
  sampleOrder.addEventListener('submit', event => event.preventDefault());
  window.addEventListener('pageshow', refreshTotal);
  document.getElementById('order-note').hidden = false;
  sampleOrder.querySelector('.order-total').hidden = false;
  refreshTotal();
}

const sessionDay = document.getElementById('session-day');

if (sessionDay) {
  const sessions = [...document.querySelectorAll('.session')];
  const count = document.getElementById('schedule-count');
  const emptySchedule = document.getElementById('schedule-empty');
  const languageLink = document.querySelector('[data-schedule-language]');
  const initialDay = new URLSearchParams(location.search).get('day');
  const activeDays = new Set(sessions.map(session => session.dataset.day));
  for (const option of [...sessionDay.options]) {
    if (option.value !== 'all' && !activeDays.has(option.value)) option.remove();
  }
  if (activeDays.has(initialDay)) sessionDay.value = initialDay;

  function addDay(url) {
    if (sessionDay.value === 'all') url.searchParams.delete('day');
    else url.searchParams.set('day', sessionDay.value);
    return url;
  }

  function updateSchedule(animate = false) {
    let visible = 0;
    for (const session of sessions) {
      session.hidden = sessionDay.value !== 'all' && session.dataset.day !== sessionDay.value;
      if (!session.hidden) {
        if (animate && interfaceMotion.matches && session.animate) {
          session.getAnimations().forEach(animation => animation.cancel());
          session.animate([{opacity:.68,transform:'translateY(4px)'},{opacity:1,transform:'none'}],
            {duration:190,delay:Math.min(visible,4)*24,easing:'ease-out'});
        }
        visible += 1;
      }
    }
    emptySchedule.hidden = visible !== 0;
    count.hidden = sessionDay.value === 'all' || visible === 0;
    count.textContent = count.hidden ? '' : `${count.dataset.label} ${visible}`;
    const alternate = addDay(new URL(languageLink.href));
    if (sessionDay.value !== 'all') alternate.hash = 'schedule';
    else alternate.hash = location.hash;
    languageLink.href = alternate;
  }

  sessionDay.addEventListener('change', () => {
    if (location.protocol !== 'file:') history.replaceState(history.state, '', addDay(new URL(location.href)));
    updateSchedule(true);
  });
  window.addEventListener('pageshow', () => updateSchedule());
  window.addEventListener('hashchange', () => updateSchedule());
  document.getElementById('schedule-filter').hidden = false;
  if (location.protocol !== 'file:' && initialDay !== null && !activeDays.has(initialDay)) {
    history.replaceState(history.state, '', addDay(new URL(location.href)));
  }
  updateSchedule();
}


const roomDialog = document.querySelector('.room-dialog');
if (roomDialog?.showModal) {
  const title = roomDialog.querySelector('h2');
  const enlarged = new Image(1120, 840);
  for (const link of document.querySelectorAll('.room-photo')) {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const thumbnail = link.querySelector('img');
      title.textContent = thumbnail.alt;
      enlarged.alt = thumbnail.alt;
      enlarged.src = link.href;
      roomDialog.append(enlarged);
      roomDialog.showModal();
    });
  }
}
