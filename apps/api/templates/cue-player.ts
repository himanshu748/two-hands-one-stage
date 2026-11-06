/** Fixed script. Untrusted story content is never interpolated into JavaScript. */
export const cuePlayerScript = String.raw`
(() => {
  'use strict';
  const start = document.getElementById('start');
  const pause = document.getElementById('pause');
  const reset = document.getElementById('reset');
  const readThrough = document.getElementById('read-through');
  const prepared = document.getElementById('prepared');
  const status = document.getElementById('playback-status');
  const remaining = document.getElementById('remaining');
  const endNote = document.getElementById('end-note');
  const beats = Array.from(document.querySelectorAll('article.beat'));
  let mode = 'ready';
  let index = 0;
  let showAll = false;
  let deadline = 0;
  let timer = null;
  function display() {
    beats.forEach((beat, position) => { beat.hidden = !showAll && position !== index; });
  }
  function clearTimer() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }
  function stopPlayback() {
    if (mode !== 'countdown' && mode !== 'playing') return;
    clearTimer();
    mode = 'paused';
    status.textContent = 'Paused — put the objects back, then start over';
    remaining.textContent = '';
    pause.disabled = true;
    start.disabled = true;
    prepared.checked = false;
    prepared.disabled = true;
  }
  function update() {
    if (mode === 'countdown') {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      status.textContent = 'Hands ready in ' + seconds + '…';
      if (seconds > 0) return;
      mode = 'playing';
      index = 0;
      deadline = Date.now() + Number(beats[0].dataset.seconds) * 1000;
      display();
    }
    if (mode !== 'playing') return;
    if (Date.now() >= deadline) {
      index += 1;
      if (index === beats.length) {
        index = beats.length - 1;
        clearTimer();
        mode = 'complete';
        status.textContent = 'Scene finished. How did it feel?';
        remaining.textContent = '';
        pause.disabled = true;
        start.disabled = true;
        endNote.hidden = false;
        return;
      }
      deadline = Date.now() + Number(beats[index].dataset.seconds) * 1000;
      display();
    }
    status.textContent = 'Part ' + (index + 1) + ' of 6 · ' + beats[index].dataset.title;
    remaining.textContent = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) + ' seconds remaining';
  }
  readThrough.addEventListener('click', () => {
    if (mode !== 'ready') return;
    showAll = !showAll;
    readThrough.textContent = showAll ? 'Show one part at a time' : 'Read the whole scene';
    readThrough.setAttribute('aria-expanded', String(showAll));
    display();
  });
  prepared.addEventListener('change', () => { start.disabled = !prepared.checked || mode !== 'ready'; });
  start.addEventListener('click', () => {
    if (!prepared.checked || mode !== 'ready') return;
    mode = 'countdown';
    showAll = false;
    readThrough.disabled = true;
    readThrough.setAttribute('aria-expanded', 'false');
    display();
    document.body.classList.add('performing');
    window.scrollTo(0, 0);
    deadline = Date.now() + 5000;
    start.disabled = true;
    pause.disabled = false;
    prepared.disabled = true;
    endNote.hidden = true;
    update();
    timer = window.setInterval(update, 200);
  });
  pause.addEventListener('click', stopPlayback);
  reset.addEventListener('click', () => {
    clearTimer();
    mode = 'ready';
    showAll = false;
    readThrough.disabled = false;
    readThrough.textContent = 'Read the whole scene';
    readThrough.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('performing');
    index = 0;
    display();
    status.textContent = 'Ready when you are · five-second countdown';
    remaining.textContent = '';
    prepared.disabled = false;
    prepared.checked = false;
    start.disabled = true;
    pause.disabled = true;
    endNote.hidden = true;
    prepared.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); stopPlayback(); }
  });
  // Browser suspension must not silently skip a physical beat.
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
  window.addEventListener('pagehide', stopPlayback);
  display();
})();
`;
