if (location.protocol === 'file:') {
  for (const link of document.querySelectorAll('a[data-local-index]')) {
    const target = new URL(link.href);
    if (target.pathname.endsWith('/')) target.pathname += 'index.html';
    link.href = target.href;
  }
}

for (const link of document.querySelectorAll('[data-keep-section]')) {
  const alternate = new URL(link.href);
  if (location.hash) alternate.hash = location.hash;
  link.href = alternate.href;
  window.addEventListener('hashchange', () => {
    alternate.hash = location.hash;
    link.href = alternate.href;
  });
}
