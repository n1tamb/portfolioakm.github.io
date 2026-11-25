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
