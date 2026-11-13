import './style.css';
import { esc, renderPage } from './render.js';
import { groupDomId } from './format.js';
import { createResolutionStore, readResolverName, writeResolverName } from './resolutions.js';

const app = document.querySelector('#app');
const state = {
  list: 'missed',
  group: '',
  type: '',
  resolutions: {},
  draftKey: '',
  draftNote: '',
  hideResolved: false,
  shared: false,
  name: '',
};
const store = createResolutionStore();
let data = null;

function paint(focusId) {
  if (!data) return;
  state.resolutions = store.map;
  state.shared = store.shared;
  if (!Object.values(state.resolutions).some((item) => item?.resolved)) state.hideResolved = false;
  app.innerHTML = renderPage(data, state);
  if (focusId) document.getElementById(focusId)?.focus();
}

function typing() {
  const active = document.activeElement;
  return active?.id === 'resolve-note' || active?.id === 'resolver-name';
}

function rowFrom(button) {
  try {
    return decodeURIComponent(button.getAttribute('data-row') || '');
  } catch {
    return '';
  }
}

async function onResolve(button) {
  const action = button.getAttribute('data-resolve');
  if (action === 'hide') {
    state.hideResolved = !state.hideResolved;
    paint('hide-resolved');
    return;
  }
  if (action === 'open') {
    state.draftKey = rowFrom(button);
    state.draftNote = '';
    paint('resolve-note');
    return;
  }
  if (action === 'cancel') {
    state.draftKey = '';
    state.draftNote = '';
    paint();
    return;
  }
  if (action === 'save') {
    const note = document.getElementById('resolve-note')?.value || state.draftNote || '';
    const name = document.getElementById('resolver-name')?.value ?? state.name;
    state.name = writeResolverName(name);
    const key = rowFrom(button);
    state.draftKey = '';
    state.draftNote = '';
    const saving = store.save(key, note, state.name.trim());
    paint();
    await saving;
    return;
  }
  if (action === 'undo') {
    const name = document.getElementById('resolver-name')?.value ?? state.name;
    state.name = writeResolverName(name);
    const undoing = store.undo(rowFrom(button), state.name.trim());
    paint();
    await undoing;
  }
}

function onClick(event) {
  const resolve = event.target.closest('[data-resolve]');
  if (resolve) {
    onResolve(resolve);
    return;
  }
  const tab = event.target.closest('[data-list]');
  if (tab) {
    state.list = tab.getAttribute('data-list') === 'called' ? 'called' : 'missed';
    if (state.list === 'called') state.type = '';
    state.draftKey = '';
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

function onInput(event) {
  if (event.target?.id === 'resolver-name') {
    state.name = writeResolverName(event.target.value);
    return;
  }
  if (event.target?.id === 'resolve-note') state.draftNote = event.target.value;
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
  app.addEventListener('input', onInput);
  state.name = readResolverName();
  try {
    data = await loadData();
    await store.start(data, () => {
      if (state.draftKey || typing()) return;
      paint();
    });
    paint();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="error-box"><strong>Could not load call data.</strong><p>${esc(err.message || 'Try again in a moment.')}</p></div>`;
  }
}

boot();
