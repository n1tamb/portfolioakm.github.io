const booking = document.getElementById('booking-form');
const receipt = document.getElementById('receipt');
const result = document.getElementById('booking-summary');
const day = booking.elements.namedItem('day');
const service = booking.elements.namedItem('service');
const artist = booking.elements.namedItem('artist');
const time = booking.elements.namedItem('time');
const timeNote = document.getElementById('time-note');
const warning = document.getElementById('slot-warning');
const submit = booking.querySelector('[type="submit"]');
const kazakh = document.documentElement.lang === 'kk';

function visitDate(now, daysAhead) {
  return new Date(now.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);
}

function hideReceipt() {
  receipt.hidden = true;
  result.textContent = '';
}

function syncTimes() {
  warning.textContent = '';
  const now = new Date(Date.now() + 5 * 3600000);
  day.min = visitDate(now, 0);
  const previousTime = time.value;
  const duration = Number(service.selectedOptions[0].dataset.minutes);
  const elapsed = day.value === day.min ? now.getUTCHours() * 60 + now.getUTCMinutes() : 0;
  const slots = [];

  if (day.validity.valid) {
    for (let minutes = 600; minutes + duration <= 1200; minutes += 30) {
      if (minutes <= elapsed) continue;
      slots.push(new Option(String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')));
    }
  }

  const placeholder = new Option(kazakh ? 'Уақытты таңдаңыз' : 'Выберите время', '');
  time.replaceChildren(placeholder, ...slots);
  if (slots.some(slot => slot.value === previousTime)) time.value = previousTime;
  time.disabled = slots.length === 0;
  submit.disabled = time.disabled;
  timeNote.hidden = !time.disabled;
  if (time.disabled) day.setAttribute('aria-describedby', timeNote.id);
  else day.removeAttribute('aria-describedby');
  hideReceipt();
}

day.value = visitDate(new Date(Date.now() + 5 * 3600000), 1);
syncTimes();
booking.classList.add('ready');
window.addEventListener('pageshow', syncTimes);

for (const link of document.querySelectorAll('[data-service]')) {
  link.addEventListener('click', () => {
    service.value = link.dataset.service;
    syncTimes();
  });
}

booking.addEventListener('input', event => {
  warning.textContent = '';
  if (event.target === day || event.target === service) {
    syncTimes();
  } else {
    hideReceipt();
  }
});

booking.addEventListener('submit', event => {
  event.preventDefault();
  const selectedTime = time.value;
  syncTimes();
  if (time.disabled) {
    day.focus();
    return;
  }
  if (!selectedTime || time.value !== selectedTime) {
    warning.textContent = selectedTime
      ? (kazakh ? 'Бұл уақыт өтіп кетті. Басқа уақытты таңдаңыз.' : 'Это время уже прошло. Выберите другое.')
      : (kazakh ? 'Уақытты таңдаңыз.' : 'Выберите время.');
    time.focus();
    return;
  }

  const readableDay = new Intl.DateTimeFormat(kazakh ? 'kk-KZ' : 'ru-KZ', {
    dateStyle: 'long', timeZone: 'UTC'
  }).format(new Date(day.value + 'T00:00:00Z'));

  result.textContent = [
    service.selectedOptions[0].textContent,
    artist.selectedOptions[0].textContent,
    readableDay + ' · ' + time.value + ' (UTC+5)'
  ].join('\n');
  receipt.hidden = false;
  result.focus();
});
