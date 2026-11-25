const records = document.getElementById('records');
const filters = document.getElementById('admin-filters');
const dateFilter = document.getElementById('date-filter');
const statusFilter = document.getElementById('status-filter');
const notice = document.getElementById('admin-notice');
const error = document.getElementById('admin-error');
const empty = document.getElementById('records-empty');
const emptyCopy = document.getElementById('empty-copy');
const newBooking = document.getElementById('new-booking');
const { lang, services, artists, formatTime, formatDate } = qyrBookings;

const copy = lang === 'kk' ? {
  empty: 'Сынақ жазбалары әлі жоқ.',
  filtered: 'Осы сүзгілерге сәйкес жазба табылмады. Күнді не күйді өзгертіп көріңіз.',
  active: 'Белсенді',
  cancelled: 'Бас тартылған',
  cancel: 'Бас тарту',
  cancelling: 'Күте тұрыңыз…',
  done: 'Жазбадан бас тартылды.',
  readError: 'Жазбалар жүктелмеді. Браузердің жергілікті жадын тексеріп, бетті жаңартыңыз.',
  writeError: 'Өзгеріс сақталмады. Қайталап көріңіз.'
} : {
  empty: 'Пробных записей пока нет.',
  filtered: 'По этим фильтрам записей нет. Измените дату или статус.',
  active: 'Активна',
  cancelled: 'Отменена',
  cancel: 'Отменить',
  cancelling: 'Отменяем…',
  done: 'Запись отменена.',
  readError: 'Записи не загрузились. Проверьте доступ к хранилищу браузера и обновите страницу.',
  writeError: 'Изменение не сохранилось. Попробуйте ещё раз.'
};

function record(entry) {
  const item = document.createElement('li');
  item.className = 'record';

  const service = document.createElement('div');
  const name = document.createElement('h3');
  name.textContent = services[entry.service][lang];
  const artist = document.createElement('p');
  artist.textContent = artists[entry.artist][lang];
  service.append(name, artist);

  const when = document.createElement('time');
  when.className = 'record-when';
  const start = formatTime(entry.start);
  when.dateTime = entry.date + 'T' + start + '+05:00';
  when.textContent = formatDate(entry.date) + ' · ' + start;

  const status = document.createElement('span');
  status.className = 'record-status';
  status.textContent = entry.cancelled ? copy.cancelled : copy.active;
  item.append(service, when, status);

  if (!entry.cancelled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary record-action';
    button.textContent = copy.cancel;
    button.setAttribute('aria-label', [copy.cancel, name.textContent, when.textContent].join(' · '));
    button.addEventListener('click', async () => {
      error.textContent = '';
      notice.textContent = '';
      button.disabled = true;
      button.textContent = copy.cancelling;
      try {
        await qyrBookings.cancel(entry.id);
        notice.textContent = copy.done;
        render();
        statusFilter.focus();
      } catch {
        error.textContent = copy.writeError;
        button.disabled = false;
        button.textContent = copy.cancel;
        button.focus();
      }
    });
    item.append(button);
  }
  return item;
}

function render() {
  let entries;
  try {
    entries = qyrBookings.read();
  } catch {
    error.textContent = copy.readError;
    records.replaceChildren();
    empty.hidden = true;
    filters.hidden = true;
    return;
  }

  error.textContent = '';
  filters.hidden = false;
  const selected = entries
    .filter(entry => !dateFilter.value || dateFilter.value === entry.date)
    .filter(entry => statusFilter.value === 'all' || entry.cancelled === (statusFilter.value === 'cancelled'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  records.replaceChildren(...selected.map(record));
  empty.hidden = selected.length !== 0;
  emptyCopy.textContent = entries.length ? copy.filtered : copy.empty;
  newBooking.hidden = entries.length !== 0;
}

filters.addEventListener('change', () => {
  notice.textContent = '';
  render();
});
window.addEventListener('pageshow', render);
window.addEventListener('storage', event => {
  if (event.key === qyrBookings.key || event.key === null) render();
});
render();
