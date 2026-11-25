const sampleOrder = document.getElementById('sample-order');

if (sampleOrder) {
  const quantities = [...sampleOrder.querySelectorAll('[data-price]')];
  const priceTotal = document.getElementById('price-total');
  const emptyOrder = document.getElementById('order-empty');
  const resetOrder = sampleOrder.querySelector('[type="reset"]');
  const amount = new Intl.NumberFormat(document.documentElement.lang === 'kk' ? 'kk-KZ' : 'ru-KZ', {
    maximumFractionDigits: 0
  });

  function clampUnits(field, units) {
    return Math.min(Number(field.max), Math.max(Number(field.min), Math.trunc(units || 0)));
  }

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
    priceTotal.value = `${amount.format(total)}\u00a0₸`;
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
  if ([...sessionDay.options].some(option => option.value === initialDay)) sessionDay.value = initialDay;

  function addDay(url) {
    if (sessionDay.value === 'all') url.searchParams.delete('day');
    else url.searchParams.set('day', sessionDay.value);
    return url;
  }

  function updateSchedule() {
    let visible = 0;
    for (const session of sessions) {
      session.hidden = sessionDay.value !== 'all' && session.dataset.day !== sessionDay.value;
      if (!session.hidden) visible += 1;
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
    updateSchedule();
  });
  window.addEventListener('pageshow', updateSchedule);
  window.addEventListener('hashchange', updateSchedule);
  document.getElementById('schedule-filter').hidden = false;
  updateSchedule();
}

