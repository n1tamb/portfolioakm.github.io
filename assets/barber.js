const booking = document.getElementById('booking-form');
const receipt = document.getElementById('receipt');
const result = document.getElementById('booking-summary');
const { day, service, artist, time } = booking.elements;
const timeNote = document.getElementById('time-note');
const warning = document.getElementById('slot-warning');
const submit = booking.querySelector('[type="submit"]');
const { lang, artists, services, formatDate, formatTime } = qyrBookings;
const copy = lang === 'kk' ? {
  placeholder: 'Уақытты таңдаңыз',
  unavailable: 'Бұл уақытта орын жоқ. Басқа уақытты таңдаңыз.',
  date: 'Бүгінгі немесе кейінгі күнді таңдаңыз.',
  empty: 'Бос уақыт жоқ. Басқа күнді не шеберді таңдаңыз.',
  storage: 'Браузер жазбаларды сақтай алмады. Осы сайттың жергілікті жадына рұқсат беріп, қайталап көріңіз.',
  pending: 'Сақталып жатыр…'
} : {
  placeholder: 'Выберите время',
  unavailable: 'Это время недоступно. Выберите другое.',
  date: 'Выберите сегодняшний день или более позднюю дату.',
  empty: 'Свободного времени нет. Выберите другую дату или мастера.',
  storage: 'Браузер не смог сохранить запись. Разрешите локальное хранение для сайта и попробуйте ещё раз.',
  pending: 'Сохраняем…'
};
const submitContent = [...submit.childNodes];
let pending = false;

function localNow() {
  return new Date(Date.now() + 5 * 3600000);
}

function visitDate(now, daysAhead) {
  return new Date(now.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);
}

function hideReceipt() {
  receipt.hidden = true;
  result.textContent = '';
}

function syncTimes() {
  const now = localNow();
  day.min = visitDate(now, 0);
  const validDate = day.value && day.validity.valid;
  const previousTime = time.value;
  const duration = services[service.value].minutes;
  const elapsed = day.value === day.min ? now.getUTCHours() * 60 + now.getUTCMinutes() : 0;
  const slots = [];

  if (validDate) {
    let entries = [];
    try {
      entries = qyrBookings.read();
    } catch {
      // The schedule can still render. Submission reports storage errors inline.
    }
    for (let start = 600; start + duration <= 1200; start += 30) {
      const visit = { date: day.value, artist: artist.value, service: service.value, start };
      if (start > elapsed && qyrBookings.availableArtist(entries, visit)) {
        const label = formatTime(start);
        slots.push(new Option(label, label));
      }
    }
  }

  time.replaceChildren(new Option(copy.placeholder, ''), ...slots);
  if (slots.some(slot => slot.value === previousTime)) time.value = previousTime;
  time.disabled = slots.length === 0;
  submit.disabled = pending || time.disabled;
  timeNote.hidden = !time.disabled;
  timeNote.textContent = time.disabled ? (validDate ? copy.empty : copy.date) : '';
  if (!validDate && day.value) day.setAttribute('aria-invalid', 'true');
  else day.removeAttribute('aria-invalid');
  if (time.disabled) day.setAttribute('aria-describedby', timeNote.id);
  else day.removeAttribute('aria-describedby');
}

day.value = visitDate(localNow(), 1);
syncTimes();
booking.hidden = false;
window.addEventListener('pageshow', syncTimes);
window.addEventListener('storage', event => {
  if (event.key === qyrBookings.key || event.key === null) syncTimes();
});

for (const link of document.querySelectorAll('[data-service]')) {
  link.addEventListener('click', () => {
    if (pending) return;
    service.value = link.dataset.service;
    warning.textContent = '';
    hideReceipt();
    syncTimes();
  });
}

booking.addEventListener('input', event => {
  warning.textContent = '';
  time.removeAttribute('aria-invalid');
  hideReceipt();
  if (event.target === day || event.target === service || event.target === artist) syncTimes();
});

booking.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending) return;
  const selectedTime = time.value;
  warning.textContent = '';
  syncTimes();
  if (time.disabled || time.value !== selectedTime) {
    warning.textContent = copy.unavailable;
    if (!time.disabled) time.setAttribute('aria-invalid', 'true');
    (time.disabled ? day : time).focus();
    return;
  }

  const [hours, minutes] = selectedTime.split(':').map(Number);
  const visit = { date: day.value, artist: artist.value, service: service.value, start: hours * 60 + minutes };
  pending = true;
  submit.disabled = true;
  submit.textContent = copy.pending;
  booking.setAttribute('aria-busy', 'true');

  let focusTarget = submit;
  try {
    const entry = await qyrBookings.reserve(visit);
    if (!entry) {
      warning.textContent = copy.unavailable;
      focusTarget = time;
    } else {
      result.textContent = [
        services[entry.service][lang],
        artists[entry.artist][lang],
        formatDate(entry.date) + ' · ' + formatTime(entry.start) + ' (UTC+5)'
      ].join('\n');
      time.value = '';
      receipt.hidden = false;
      focusTarget = result;
    }
  } catch {
    warning.textContent = copy.storage;
  } finally {
    pending = false;
    submit.replaceChildren(...submitContent);
    booking.removeAttribute('aria-busy');
    syncTimes();
    if (focusTarget === time && !time.disabled) time.setAttribute('aria-invalid', 'true');
    (focusTarget.disabled ? day : focusTarget).focus();
  }
});
