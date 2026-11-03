import './style.css';
import { esc, renderPage } from './render.js';
import { groupDomId } from './format.js';

const app = document.querySelector('#app');
const state = { list: 'missed', group: '', type: '' };
let data = null;

function paint(focusId) {
  app.innerHTML = renderPage(data, state);
  if (focusId) document.getElementById(focusId)?.focus();
}

function onClick(event) {
  const tab = event.target.closest('[data-list]');
  if (tab) {
    state.list = tab.getAttribute('data-list') === 'called' ? 'called' : 'missed';
    paint(tab.id);
    return;
  }
  if (event.target.closest('[data-filter="all-groups"]')) {
    state.group = '';
    paint('group-all');
    return;
  }
  const group = event.target.closest('[data-filter="group"]');
  if (group) {
    const next = group.getAttribute('data-group') || '';
    state.group = state.group === next ? '' : next;
    paint(state.group ? groupDomId(next) : 'group-all');
    return;
  }
  if (event.target.closest('[data-filter="all-types"]')) {
    state.type = '';
    state.list = 'missed';
    paint('type-all');
    return;
  }
  const type = event.target.closest('[data-filter="type"]');
  if (type) {
    const next = type.getAttribute('data-type') || '';
    state.type = state.type === next ? '' : next;
    state.list = 'missed';
    const id = type.id;
    paint(state.type ? id : 'type-all');
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
