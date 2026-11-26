const player = document.querySelector('.project-player');
const controls = player.querySelector('.player-controls');
const choices = [...controls.querySelectorAll('button')];
const posters = [...player.querySelectorAll('.poster')];
let active = 0;

function selectProject(index) {
  if (index === active) return;
  const previous = posters[active];
  const next = posters[index];
  previous.hidden = true;
  next.hidden = false;
  choices[active].setAttribute('aria-pressed', 'false');
  choices[index].setAttribute('aria-pressed', 'true');
  active = index;
}

controls.hidden = false;
choices.forEach((choice, index) => {
  choice.addEventListener('click', () => selectProject(index));
  choice.addEventListener('keydown', event => {
    const step = {ArrowLeft: -1, ArrowRight: 1}[event.key];
    if (!step) return;
    event.preventDefault();
    const destination = (index + step + choices.length) % choices.length;
    choices[destination].focus();
    selectProject(destination);
  });
});

// Horizontal gestures browse the projects. Scrolling, pinch zoom and long presses stay native.
const stack = player.querySelector('.poster-stack');
let gesture = null;
let lastSwipe = -Infinity;
stack.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch') return;
  gesture = event.isPrimary ? {id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now()} : null;
});
stack.addEventListener('pointercancel', () => { gesture = null; });
stack.addEventListener('pointerup', event => {
  if (!gesture || event.pointerId !== gesture.id) return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  const now = performance.now();
  const elapsed = now - gesture.time;
  gesture = null;
  if (Math.abs(dx) >= 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
    selectProject((active + (dx < 0 ? 1 : -1) + choices.length) % choices.length);
    lastSwipe = now;
  } else if (now - lastSwipe < 700 && elapsed < 300 && Math.hypot(dx, dy) < 8) {
    // Touch browsers can suppress the first click after a drag. Activate the settled link once.
    posters[active].click();
  } else {
    lastSwipe = -Infinity;
  }
});
stack.addEventListener('click', event => {
  if (event.isTrusted && event.detail && performance.now() - lastSwipe < 700) event.preventDefault();
}, true);

const preview = document.querySelector('.demo-preview');
if (preview?.showModal) {
  const viewport = preview.querySelector('.preview-viewport');
  const title = preview.querySelector('h2');
  const fullscreen = preview.querySelector('.preview-full');
  for (const link of document.querySelectorAll('[data-demo-preview]')) {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      title.textContent = link.dataset.demoTitle;
      fullscreen.href = link.href;
      const frame = document.createElement('iframe');
      frame.title = preview.dataset.frameLabel + ' · ' + title.textContent;
      frame.src = link.href;
      frame.addEventListener('load', () => {
        frame.contentDocument?.addEventListener('keydown', key => {
          if (key.key === 'Escape' && !key.defaultPrevented && !frame.contentDocument.querySelector('dialog[open]')) preview.close();
        });
      });
      viewport.replaceChildren(frame);
      preview.showModal();
    });
  }
  preview.addEventListener('close', () => viewport.replaceChildren());
}
