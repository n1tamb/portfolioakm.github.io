const qyrBookings = (() => {
  const key = 'akmavren-qyr-bookings-v1';
  const artists = {
    alihan: { ru: 'Алихан', kk: 'Әлихан' },
    daniyar: { ru: 'Данияр', kk: 'Данияр' }
  };
  const services = {
    cut: { minutes: 45, ru: 'Мужская стрижка', kk: 'Ерлерге арналған шаш қию' },
    beard: { minutes: 30, ru: 'Оформление бороды', kk: 'Сақалды реттеу' },
    combo: { minutes: 75, ru: 'Стрижка и борода', kk: 'Шаш қию және сақалды реттеу' },
    kids: { minutes: 40, ru: 'Детская стрижка', kk: 'Балаларға арналған шаш қию' }
  };
  const lang = document.documentElement.lang === 'kk' ? 'kk' : 'ru';
  const dateFormat = new Intl.DateTimeFormat(lang === 'kk' ? 'kk-KZ' : 'ru-KZ', {
    dateStyle: 'long', timeZone: 'UTC'
  });

  function read() {
    const stored = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(stored) || !stored.every(entry =>
      entry && typeof entry.id === 'string' &&
      Object.hasOwn(artists, entry.artist) && Object.hasOwn(services, entry.service) &&
      typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
      !Number.isNaN(Date.parse(entry.date)) &&
      Number.isInteger(entry.start) && entry.start >= 600 && entry.start <= 1170 &&
      typeof entry.cancelled === 'boolean'
    )) throw new Error('Invalid demo booking storage');
    return stored;
  }

  function availableArtist(entries, { date, artist, service, start }) {
    const offered = artist === 'any' ? Object.keys(artists) : [artist];
    const end = start + services[service].minutes;
    return offered.find(name => entries.every(entry =>
      entry.cancelled || entry.date !== date || entry.artist !== name ||
      end <= entry.start || start >= entry.start + services[entry.service].minutes
    ));
  }

  function withinStorageLock(update) {
    if (navigator.locks) return navigator.locks.request(key, update);
    return Promise.resolve().then(update);
  }

  function reserve(visit) {
    return withinStorageLock(() => {
      const entries = read();
      const artist = availableArtist(entries, visit);
      if (!artist) return null;
      const id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-');
      const entry = { ...visit, id, artist, cancelled: false };
      localStorage.setItem(key, JSON.stringify([...entries, entry]));
      return entry;
    });
  }

  function cancel(id) {
    return withinStorageLock(() => {
      const entries = read();
      const entry = entries.find(booking => booking.id === id);
      if (!entry || entry.cancelled) return;
      entry.cancelled = true;
      localStorage.setItem(key, JSON.stringify(entries));
    });
  }

  function formatTime(minutes) {
    return [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, '0')).join(':');
  }

  function formatDate(value) {
    return dateFormat.format(new Date(value + 'T00:00:00Z'));
  }

  return { key, services, artists, lang, read, availableArtist, reserve, cancel, formatTime, formatDate };
})();
