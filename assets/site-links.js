if (location.protocol === 'file:') {
  for (const link of document.querySelectorAll('a[data-local-index]')) {
    const target = new URL(link.href);
    target.pathname += 'index.html';
    link.href = target.href;
  }
}
