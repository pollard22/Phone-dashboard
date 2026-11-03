import './style.css';
import { esc, renderPage } from './render.js';

const app = document.querySelector('#app');
const state = { open: false, group: '' };
let data = null;

function paint(focusId) {
  app.innerHTML = renderPage(data, state);
  if (focusId) document.getElementById(focusId)?.focus();
}

function onClick(event) {
  const toggle = event.target.closest('[data-action="toggle"]');
  if (toggle) {
    state.open = !state.open;
    paint('followup-toggle');
    if (state.open) document.getElementById('callback-detail')?.scrollIntoView({ block: 'nearest' });
    return;
  }
  const all = event.target.closest('[data-filter="all"]');
  if (all) {
    state.group = '';
    state.open = true;
    paint('group-all');
    return;
  }
  const chip = event.target.closest('[data-filter="group"]');
  if (chip) {
    const next = chip.getAttribute('data-group') || '';
    state.group = state.group === next ? '' : next;
    state.open = true;
    paint(state.group ? chip.id : 'group-all');
  }
}

async function loadData() {
  const base = import.meta.env.BASE_URL || '/';
  const url = new URL('data/latest.json', new URL(base, window.location.origin));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load call data (${res.status}).`);
  return res.json();
}

async function boot() {
  app.innerHTML = `<div class="loading" role="status">Loading this period’s calls…</div>`;
  app.addEventListener('click', onClick);
  try {
    data = await loadData();
    paint();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="error-box"><strong>Could not load call data.</strong><p>${esc(err.message || 'Try again in a moment.')}</p></div>`;
  }
}

boot();
