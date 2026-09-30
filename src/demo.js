import './style.css';
import './demo.css';
import { demoWindow, formatPct } from './demoData.js';

const NAV = [
  { id: 'overview', label: 'Overview', href: '#overview', here: true },
  { id: 'missed', label: 'Missed ownership', href: 'index.html#missed' },
  { id: 'open-loops', label: 'Open loops (Super)', href: 'index.html#open-loops' },
  { id: 'callback', label: 'Callback hygiene', href: 'index.html#callback' },
  { id: 'method', label: 'Method & exclusions', href: 'index.html#method' },
];

const state = {
  windowId: '7d',
  drillId: null,
  drillQuery: '',
  drillFilter: 'all',
  drillFocus: null,
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readWindow() {
  return location.hash === '#24h' ? '24h' : '7d';
}

function currentWindow() {
  return demoWindow(state.windowId);
}

function badge(row) {
  if (row.kind === 'answered' || row.bucket === 'called-back') return 'cb';
  if (row.kind === 'excluded') return 'no';
  if (row.bucket === 'outside-24h') return 'info';
  if (row.kind === 'super') return 'yes';
  return 'no-cb';
}

function card(label, value, hint, tone, drill, extraClass = '') {
  return `
    <button type="button" class="kpi kpi-btn ${tone} ${extraClass}" data-drill="${esc(drill)}" aria-haspopup="dialog" aria-label="View demo rows for ${esc(label)}, ${esc(value)}">
      <span class="label">${esc(label)} <span class="drill-cue" aria-hidden="true">›</span></span>
      <span class="value">${esc(value)}</span>
      <span class="hint">${hint}</span>
    </button>`;
}

function renderOverview() {
  const windowPack = currentWindow();
  const k = windowPack.kpis;
  const calledPct = formatPct(k.calledBack, k.eligible);
  const missedPct = formatPct(k.notCalledBack, k.eligible);
  const answeredShare = formatPct(k.answered, k.received);
  const missedShare = formatPct(k.notPickedUp, k.received);
  const superCard =
    k.superLoops == null
      ? ''
      : card(
          'Super open loops',
          String(k.superLoops),
          'Demo placeholder · 7-day window only',
          'accent',
          'super-loops'
        );
  const superGap =
    k.superLoops == null
      ? `
        <div class="panel demo-gap">
          <h3>Super open loops</h3>
          <p>Shown on Last 7 days in this demo. The 24-hour window has no Super figure.</p>
        </div>`
      : '';

  return `
    <div class="demo-banner" role="status">
      <strong>Demo data</strong>
      <span>Placeholder numbers for layout review. This page does not read the live Ultatel or HireSuper pack.</span>
    </div>

    <div class="page-header">
      <h2>Overview</h2>
      <p>Calls received, how many we picked up, and what share of missed callers we called back within 24 hours.</p>
      <div class="window-bar">
        <div class="window-switch" role="group" aria-label="Time window">
          <button type="button" data-window="24h" aria-pressed="${state.windowId === '24h'}">Last 24 hours</button>
          <button type="button" data-window="7d" aria-pressed="${state.windowId === '7d'}">Last 7 days</button>
        </div>
        <p class="window-active" id="window-status" aria-live="polite">
          Active window: <strong>${esc(windowPack.label)}</strong>
          <span>${esc(windowPack.rangeLabel)}</span>
        </p>
      </div>
    </div>

    <h3 class="section-label">Call volume</h3>
    <div class="kpi-grid volume">
      ${card('Calls received', k.received, 'Inbound calls in this window', 'info kpi-lead', 'received')}
      ${card('Answered', k.answered, `${esc(answeredShare)} of calls received`, 'ok', 'answered')}
      ${card(
        'Not picked up',
        k.notPickedUp,
        `${esc(missedShare)} of calls received · ${esc(k.cleaned)} cleaned no-answer`,
        'warn',
        'not-picked-up'
      )}
    </div>

    <h3 class="section-label">Callback rate</h3>
    <p class="section-lead">
      <button type="button" class="text-drill" data-drill="eligible" aria-haspopup="dialog">
        ${esc(k.eligible)} eligible missed callers
      </button>
      had a cleaned inbound no-answer. The rates below are the share we called back within 24 hours, and the share we did not.
    </p>
    <div class="kpi-grid rates">
      ${card(
        'Called back within 24h',
        calledPct,
        `${esc(k.calledBack)} of ${esc(k.eligible)} eligible missed callers`,
        'ok',
        'called-back',
        'kpi-rate'
      )}
      ${card(
        'Not called back within 24h',
        missedPct,
        `${esc(k.notCalledBack)} of ${esc(k.eligible)} · ${esc(k.neverDialed)} never company-dialed · ${esc(k.outside24h)} dialed outside 24h`,
        'danger',
        'not-called-back',
        'kpi-rate'
      )}
    </div>

    <h3 class="section-label">Also in this window</h3>
    <div class="kpi-grid secondary">
      ${card(
        'Never company-dialed',
        k.neverDialed,
        `Of the ${esc(k.notCalledBack)} not called back within 24h`,
        'warn',
        'never-dialed'
      )}
      ${superCard}
    </div>
    ${superGap}

    <div class="panel demo-rule">
      <h3>Callback rule</h3>
      <p>
        Unchanged from the live dashboard: a cleaned inbound no-answer counts as called back when a company outbound
        matches that caller within 24 hours. Company and self From numbers stay out of that cleaned set.
        The counts on this page are placeholders, so the rule is here for layout context only.
      </p>
    </div>
  `;
}

function renderShell() {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <button class="mobile-toggle" id="menu-btn" aria-label="Menu" type="button">☰ Menu</button>
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <div class="logo">PP</div>
          <div>
            <h1>Pollard Properties</h1>
            <p class="sub">Call Hygiene</p>
          </div>
        </div>
      </div>
      <nav class="nav" aria-label="Sections">
        ${NAV.map((item) =>
          item.here
            ? `<button type="button" class="active" data-demo-nav="overview"><span class="dot"></span>${esc(item.label)}</button>`
            : `<a href="${esc(item.href)}"><span class="dot"></span>${esc(item.label)}</a>`
        ).join('')}
        <a class="nav-aux" href="index.html">Current dashboard</a>
      </nav>
      <div class="sidebar-meta">
        <strong>Layout demo</strong>
        Placeholder data only<br />
        TZ: America/Los_Angeles
      </div>
    </aside>
    <main class="main" id="content"></main>
    <div id="drill-root"></div>
  `;
}

function tableHtml(rows) {
  if (!rows.length) return `<div class="empty">No matching demo rows.</div>`;
  return `
    <div class="table-scroll">
      <table class="data">
        <thead>
          <tr>
            <th>Caller</th>
            <th>Who they called</th>
            <th>Date</th>
            <th>Time</th>
            <th>What happened</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `<tr>
                <td class="mono">${esc(row.caller)}</td>
                <td>${esc(row.who)}</td>
                <td class="mono">${esc(row.date)}</td>
                <td class="mono">${esc(row.time)}</td>
                <td><span class="badge ${badge(row)}">${esc(row.detail)}</span></td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function drillSpec(id) {
  const windowPack = currentWindow();
  const k = windowPack.kpis;
  const rows = windowPack.rows;
  const source = `Demo placeholder · ${windowPack.rangeLabel}`;
  const base = { id, source, windowLabel: windowPack.label };
  switch (id) {
    case 'received':
      return {
        ...base,
        title: 'Calls received',
        headline: k.received,
        note: 'Demo inbound legs: answered, plus every inbound no-answer, including company/self From numbers.',
        rows: rows.received,
      };
    case 'answered':
      return {
        ...base,
        title: 'Answered',
        headline: k.answered,
        note: 'Demo inbound legs marked answered.',
        rows: rows.answered,
      };
    case 'not-picked-up':
      return {
        ...base,
        title: 'Not picked up',
        headline: k.notPickedUp,
        note: `Demo inbound NO ANSWER. ${k.cleaned} cleaned events feed the callback rates. ${k.excluded} company/self From legs stay in this volume list and out of those rates.`,
        rows: rows.notPickedUp,
        filterable: true,
        related: [
          { id: 'called-back', label: 'Called back within 24h' },
          { id: 'not-called-back', label: 'Not called back within 24h' },
        ],
      };
    case 'eligible':
      return {
        ...base,
        title: 'Eligible missed callers',
        headline: k.eligible,
        note: 'Demo unique callers with at least one cleaned inbound no-answer. This is the denominator for both callback rates.',
        rows: rows.eligible,
        related: [
          { id: 'called-back', label: 'Called back within 24h' },
          { id: 'not-called-back', label: 'Not called back within 24h' },
        ],
      };
    case 'called-back':
      return {
        ...base,
        title: 'Called back within 24h',
        headline: k.calledBack,
        percent: formatPct(k.calledBack, k.eligible),
        note: `${k.calledBack} of ${k.eligible} eligible missed callers (${formatPct(k.calledBack, k.eligible)}) have a demo company outbound within 24 hours.`,
        rows: rows.calledBack,
        related: [{ id: 'not-called-back', label: 'Not called back within 24h' }],
      };
    case 'not-called-back':
      return {
        ...base,
        title: 'Not called back within 24h',
        headline: k.notCalledBack,
        percent: formatPct(k.notCalledBack, k.eligible),
        note: `${k.notCalledBack} of ${k.eligible} eligible missed callers (${formatPct(k.notCalledBack, k.eligible)}). ${k.neverDialed} were never company-dialed in this demo window. ${k.outside24h} were dialed outside 24 hours.`,
        rows: rows.notCalledBack,
        related: [
          { id: 'never-dialed', label: 'Never company-dialed' },
          { id: 'called-back', label: 'Called back within 24h' },
        ],
      };
    case 'never-dialed':
      return {
        ...base,
        title: 'Never company-dialed',
        headline: k.neverDialed,
        note: `Demo subset of the ${k.notCalledBack} callers not called back within 24 hours: no company outbound anywhere in this window.`,
        rows: rows.neverDialed,
        related: [{ id: 'not-called-back', label: 'Not called back within 24h' }],
      };
    case 'super-loops':
      if (!rows.superLoops) return null;
      return {
        ...base,
        title: 'Super open loops',
        headline: k.superLoops,
        note: 'Demo placeholder for the 7-day window. Not a HireSuper Activity scan.',
        rows: rows.superLoops,
      };
    default:
      return null;
  }
}

function visibleRows(spec) {
  let rows = spec.rows || [];
  if (spec.filterable && state.drillFilter === 'cleaned') {
    rows = rows.filter((row) => row.kind === 'missed');
  }
  const query = state.drillQuery.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) =>
    [row.caller, row.who, row.date, row.time, row.detail].join(' ').toLowerCase().includes(query)
  );
}

function renderDrill() {
  const root = document.getElementById('drill-root');
  const spec = state.drillId ? drillSpec(state.drillId) : null;
  if (!spec || !root) {
    if (root) root.innerHTML = '';
    document.body.classList.remove('drill-open');
    state.drillId = null;
    return;
  }
  const shown = visibleRows(spec);
  const total = spec.filterable && state.drillFilter === 'cleaned' ? spec.rows.filter((row) => row.kind === 'missed').length : spec.rows.length;
  root.innerHTML = `
    <div class="drill-backdrop" id="drill-backdrop">
      <div class="drill-panel" id="drill-panel" role="dialog" aria-modal="true" aria-labelledby="drill-title" tabindex="-1">
        <header class="drill-head">
          <div class="drill-head-copy">
            <div class="drill-crumb">
              <span>Overview</span>
              <span aria-hidden="true">/</span>
              <span>${esc(spec.windowLabel)}</span>
            </div>
            <h2 id="drill-title">${esc(spec.title)}</h2>
            <p class="drill-source">Source: ${esc(spec.source)}</p>
          </div>
          <div class="drill-actions">
            <button type="button" class="btn primary" id="drill-close">Close</button>
          </div>
        </header>
        <div class="drill-body">
          <p class="drill-note">${esc(spec.note || '')}</p>
          <div class="meta-pills drill-stats">
            <span class="pill"><strong>Demo</strong> placeholder</span>
            <span class="pill"><strong>Window</strong> ${esc(spec.windowLabel)}</span>
            ${spec.percent ? `<span class="pill"><strong>Rate</strong> ${esc(spec.percent)}</span>` : ''}
            <span class="pill"><strong>Rows</strong> <span id="drill-shown">${shown.length === total ? total : `${shown.length} of ${total}`}</span></span>
          </div>
          ${
            spec.related?.length
              ? `<div class="drill-related">
                  ${spec.related.map((item) => `<button type="button" class="btn" data-drill="${esc(item.id)}">${esc(item.label)}</button>`).join('')}
                </div>`
              : ''
          }
          <div class="toolbar">
            ${
              spec.filterable
                ? `<div class="seg" role="group" aria-label="No-answer filter">
                    <button type="button" data-drill-filter="all" class="${state.drillFilter === 'all' ? 'active' : ''}">All no-answer</button>
                    <button type="button" data-drill-filter="cleaned" class="${state.drillFilter === 'cleaned' ? 'active' : ''}">Cleaned only</button>
                  </div>`
                : ''
            }
            <input type="search" id="drill-search" placeholder="Filter these demo rows…" value="${esc(state.drillQuery)}" />
          </div>
          <div id="drill-results">${tableHtml(shown)}</div>
        </div>
      </div>
    </div>`;
  document.body.classList.add('drill-open');
  document.getElementById('drill-panel')?.focus();
}

function refreshDrillResults() {
  const spec = state.drillId ? drillSpec(state.drillId) : null;
  if (!spec) return;
  const shown = visibleRows(spec);
  const total =
    spec.filterable && state.drillFilter === 'cleaned'
      ? spec.rows.filter((row) => row.kind === 'missed').length
      : spec.rows.length;
  const results = document.getElementById('drill-results');
  const count = document.getElementById('drill-shown');
  if (results) results.innerHTML = tableHtml(shown);
  if (count) count.textContent = shown.length === total ? String(total) : `${shown.length} of ${total}`;
  document.querySelectorAll('[data-drill-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.drillFilter === state.drillFilter);
  });
}

function openDrill(id, trigger) {
  if (!drillSpec(id)) return;
  if (trigger && !trigger.closest?.('#drill-root')) state.drillFocus = trigger;
  state.drillId = id;
  state.drillQuery = '';
  state.drillFilter = 'all';
  renderDrill();
}

function closeDrill({ restoreFocus = true } = {}) {
  state.drillId = null;
  state.drillQuery = '';
  state.drillFilter = 'all';
  const root = document.getElementById('drill-root');
  if (root) root.innerHTML = '';
  document.body.classList.remove('drill-open');
  const focus = state.drillFocus;
  state.drillFocus = null;
  if (restoreFocus && focus && document.contains(focus)) focus.focus();
}

function applyWindow(id) {
  state.windowId = id === '24h' ? '24h' : '7d';
  const nextHash = `#${state.windowId}`;
  if (location.hash !== nextHash) history.replaceState(null, '', nextHash);
  document.getElementById('content').innerHTML = renderOverview();
  if (state.drillId) {
    state.drillQuery = '';
    state.drillFilter = 'all';
    if (!drillSpec(state.drillId)) closeDrill({ restoreFocus: false });
    else renderDrill();
  }
}

function onClick(event) {
  const windowButton = event.target.closest('[data-window]');
  if (windowButton) {
    applyWindow(windowButton.dataset.window);
    return;
  }
  const filterButton = event.target.closest('[data-drill-filter]');
  if (filterButton && state.drillId) {
    state.drillFilter = filterButton.dataset.drillFilter;
    refreshDrillResults();
    return;
  }
  if (event.target.closest('#drill-close') || event.target.id === 'drill-backdrop') {
    closeDrill();
    return;
  }
  const drillButton = event.target.closest('[data-drill]');
  if (drillButton) {
    openDrill(drillButton.dataset.drill, drillButton);
    return;
  }
  if (event.target.closest('#menu-btn')) {
    document.getElementById('sidebar')?.classList.toggle('open');
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && state.drillId) {
    event.preventDefault();
    closeDrill();
    return;
  }
  if (event.key !== 'Tab' || !state.drillId) return;
  const panel = document.getElementById('drill-panel');
  if (!panel) return;
  const list = [...panel.querySelectorAll('button, input, a, [href], [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.tabIndex !== -1
  );
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function boot() {
  state.windowId = readWindow();
  if (location.hash !== `#${state.windowId}`) history.replaceState(null, '', `#${state.windowId}`);
  renderShell();
  document.getElementById('content').innerHTML = renderOverview();
  document.querySelector('#app').addEventListener('click', onClick);
  document.querySelector('#app').addEventListener('input', (event) => {
    if (event.target.id !== 'drill-search') return;
    state.drillQuery = event.target.value;
    refreshDrillResults();
  });
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', () => {
    const next = readWindow();
    if (next !== state.windowId) applyWindow(next);
  });
}

boot();
