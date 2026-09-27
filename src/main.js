import './style.css';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { parsePack } from './data.js';
import { buildDrill, filterRows } from './drills.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'missed', label: 'Missed ownership' },
  { id: 'open-loops', label: 'Open loops (Super)' },
  { id: 'callback', label: 'Callback hygiene' },
  { id: 'method', label: 'Method & exclusions' },
];

const DATA_BASE = 'data';

/** @type {any} */
let state = {
  route: location.hash.replace(/^#\/?/, '') || 'overview',
  data: null,
  missedA: [],
  missedB: [],
  openLoops: [],
  callbackAction: [],
  callbackNever: [],
  exclusions: { selfNumbers: [], definitions: [], notes: [], caveats: [] },
  chart: null,
  missedFilter: 'all',
  missedExt: '',
  missedSearch: '',
  openLoopFilter: 'all',
  callbackSearch: '',
  drill: null,
  drillQuery: '',
  drillFocus: null,
  scrollTo: null,
};

async function fetchText(path) {
  const res = await fetch(`${DATA_BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.text();
}

async function loadAll() {
  const [jsonText, aText, bText, olText, cbText, exText] = await Promise.all([
    fetchText('latest.json'),
    fetchText('Missed_ownership_A_no_callback.csv'),
    fetchText('Missed_ownership_B_called_back.csv'),
    fetchText('open_loops_super.csv'),
    fetchText('callback_hygiene_ultatel.csv'),
    fetchText('exclusions_method.csv'),
  ]);

  const pack = parsePack({ jsonText, aText, bText, olText, cbText, exText });
  state.data = pack.data;
  state.missedA = pack.missedA;
  state.missedB = pack.missedB;
  state.openLoops = pack.openLoops;
  state.callbackAction = pack.callbackAction;
  state.callbackNever = pack.callbackNever;
  state.exclusions = pack.exclusions;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kpiCard(label, value, hint = '', tone = '', drill = '') {
  const hintHtml = hint ? `<span class="hint">${esc(hint)}</span>` : '';
  const inner = `
      <span class="label">${esc(label)} <span class="drill-cue" aria-hidden="true">›</span></span>
      <span class="value">${esc(value)}</span>
      ${hintHtml}`;
  if (!drill) {
    return `<div class="kpi ${tone}">${inner}</div>`;
  }
  return `<button type="button" class="kpi kpi-btn ${tone}" data-drill="${esc(drill)}" aria-haspopup="dialog" aria-label="View details for ${esc(label)}, ${esc(value)}">${inner}</button>`;
}

function kpiSplit(tone, main, subs) {
  return `
    <div class="kpi kpi-split ${tone}">
      <button type="button" class="kpi-hit" data-drill="${esc(main.drill)}" aria-haspopup="dialog" aria-label="View details for ${esc(main.label)}, ${esc(main.value)}">
        <span class="label">${esc(main.label)} <span class="drill-cue" aria-hidden="true">›</span></span>
        <span class="value">${esc(main.value)}</span>
      </button>
      <div class="kpi-subs">
        ${subs
          .map(
            (s) =>
              `<button type="button" data-drill="${esc(s.drill)}" aria-haspopup="dialog">${esc(s.label)}</button>`
          )
          .join('')}
      </div>
    </div>`;
}

function statusPill(label, value, status) {
  const active = status !== 'all' && !state.missedExt && !state.missedSearch && state.missedFilter === status;
  return `<button type="button" class="pill pill-btn ${active ? 'active' : ''}" data-miss-status="${esc(status)}" aria-pressed="${active}">
    <strong>${esc(label)}</strong> ${esc(value)}
  </button>`;
}

function loopPill(label, value, filter) {
  const active = state.openLoopFilter === filter;
  return `<button type="button" class="pill pill-btn ${active ? 'active' : ''}" data-loop-filter="${esc(filter)}" aria-pressed="${active}">
    <strong>${esc(label)}</strong> ${esc(value)}
  </button>`;
}

function renderShell() {
  const app = document.querySelector('#app');
  const meta = state.data?.meta || {};
  app.innerHTML = `
    <button class="mobile-toggle" id="menu-btn" aria-label="Menu">☰ Menu</button>
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
      <nav class="nav" id="nav">
        ${NAV.map(
          (n) => `
          <button data-route="${n.id}" class="${state.route === n.id ? 'active' : ''}">
            <span class="dot"></span>${esc(n.label)}
          </button>`
        ).join('')}
      </nav>
      <div class="sidebar-meta">
        <strong>${esc(meta.window_label || '')}</strong>
        Generated ${esc(meta.generated_at || '')}<br/>
        TZ: America/Los_Angeles
      </div>
    </aside>
    <main class="main" id="content"></main>
    <div id="drill-root"></div>
  `;

  document.getElementById('app').addEventListener('click', onAppClick);

  document.getElementById('nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-route]');
    if (!btn) return;
    navigate(btn.dataset.route);
    document.getElementById('sidebar').classList.remove('open');
  });

  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function navigate(route) {
  closeDrill({ restoreFocus: false });
  state.route = route;
  location.hash = route;
  document.querySelectorAll('#nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.route === route);
  });
  renderPage();
}

function renderPage() {
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
  const el = document.getElementById('content');
  switch (state.route) {
    case 'missed':
      el.innerHTML = renderMissed();
      bindMissed();
      drawMissChart();
      break;
    case 'open-loops':
      el.innerHTML = renderOpenLoops();
      break;
    case 'callback':
      el.innerHTML = renderCallback();
      bindCallback();
      break;
    case 'method':
      el.innerHTML = renderMethod();
      break;
    default:
      el.innerHTML = renderOverview();
  }
  scrollPending();
}

function renderOverview() {
  const { meta, kpis } = state.data;
  return `
    <div class="page-header">
      <h2>Overview</h2>
      <p>Ultatel PBX + HireSuper hygiene snapshot — live metrics only, no invented numbers. Click a metric to see the rows behind it.</p>
      <div class="meta-pills">
        <span class="pill"><strong>Window</strong> ${esc(meta.window_label)}</span>
        <span class="pill"><strong>Generated</strong> ${esc(meta.generated_at)}</span>
        <span class="pill"><strong>Super loops</strong> ${esc(meta.super_open_loops_window)}</span>
      </div>
    </div>

    <div class="banner">
      <div class="icon">⚠</div>
      <div>
        <strong>Caveats</strong>
        <ul>
          ${meta.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}
        </ul>
      </div>
    </div>

    <h3 style="margin:0 0 0.65rem;font-size:0.85rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">Ultatel volume</h3>
    <div class="kpi-grid">
      ${kpiCard('IN-Bound', kpis.ultatel_inbound, 'Total CDR legs', 'info', 'in-bound')}
      ${kpiCard('IN answered', kpis.ultatel_inbound_answered, '', 'ok', 'in-answered')}
      ${kpiSplit('warn', { label: 'IN no answer', value: kpis.ultatel_inbound_no_answer, drill: 'in-no-answer' }, [
        { label: `Cleaned ${kpis.ultatel_inbound_no_answer_cleaned}`, drill: 'cleaned-na' },
      ])}
      ${kpiSplit('', { label: 'OUT-Bound', value: kpis.ultatel_outbound, drill: 'outbound' }, [
        { label: `${kpis.ultatel_outbound_answered} ans`, drill: 'out-answered' },
        { label: `${kpis.ultatel_outbound_no_answer} NA`, drill: 'out-na' },
      ])}
    </div>

    <h3 style="margin:1rem 0 0.65rem;font-size:0.85rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">Callback hygiene (24h rule)</h3>
    <div class="kpi-grid">
      ${kpiCard('No-callback', kpis.no_callback_24h_unique, 'Unique callers', 'danger', 'no-callback')}
      ${kpiCard('Never dialed', kpis.never_company_dialed, 'Zero company OUT', 'warn', 'never-dialed')}
      ${kpiCard('Dialed earlier only', kpis.dialed_earlier_only, 'Not within 24h', '', 'dialed-earlier')}
      ${kpiCard('Dialed after 24h', kpis.dialed_later_after_24h, 'Late callback', '', 'dialed-later')}
    </div>

    <h3 style="margin:1rem 0 0.65rem;font-size:0.85rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">HireSuper</h3>
    <div class="kpi-grid">
      ${kpiCard('AI inbound', kpis.super_ai_inbound, 'Reporting Sep 20–26', 'accent', 'super-inbound')}
      ${kpiCard('Transferred', kpis.super_transferred, '', 'info', 'super-transferred')}
      ${kpiSplit('warn', { label: 'Needs human help', value: kpis.super_needs_human_help, drill: 'super-help' }, [
        { label: `${kpis.super_needs_help_pct}% of AI inbound`, drill: 'super-help' },
      ])}
      ${kpiSplit('danger', { label: 'Open loops', value: kpis.super_open_loops, drill: 'open-loops' }, [
        { label: `Overlap ${kpis.super_ultatel_overlap}`, drill: 'open-overlap' },
        { label: `Super-only ${kpis.super_only_open_loops}`, drill: 'open-super-only' },
      ])}
      ${kpiSplit('', { label: 'AI talk time', value: kpis.super_ai_talk, drill: 'super-talk' }, [
        { label: `Avg ${kpis.super_avg_talk}`, drill: 'super-avg' },
      ])}
      ${kpiSplit('', { label: 'Actions / SMS', value: `${kpis.super_actions} / ${kpis.super_sms_sessions}`, drill: 'super-activity' }, [
        { label: `${kpis.super_actions} actions`, drill: 'super-actions' },
        { label: `${kpis.super_sms_sessions} SMS`, drill: 'super-sms' },
      ])}
    </div>

    <div class="panel">
      <h3>Sources</h3>
      <ul class="caveat-list">
        ${meta.sources.map((s) => `<li>${esc(s)}</li>`).join('')}
      </ul>
      <p class="hint" style="margin:0.75rem 0 0;color:var(--text-muted);font-size:0.85rem;">
        ${esc(meta.timezone_note)}
      </p>
    </div>
  `;
}

function renderMissed() {
  const miss = state.data.miss_by_extension;
  const totals = state.data.missed_totals || {};
  const merged = getMissedFiltered();
  return `
    <div class="page-header">
      <h2>Missed ownership</h2>
      <p>One row per cleaned inbound NO ANSWER. Sorted no-callback first, then newest miss. Click a total, a bar, or an extension to filter the event table.</p>
      <div class="meta-pills">
        ${statusPill('No-callback rows', totals.no_callback_24h ?? state.missedA.length, 'no-callback')}
        ${statusPill('Called back', totals.called_back_24h ?? state.missedB.length, 'called-back')}
        ${statusPill('Total cleaned NA', totals.total_cleaned_na ?? state.missedA.length + state.missedB.length, 'all')}
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3>Misses by extension</h3>
        <p class="panel-note">Click a bar to filter the event table.</p>
        <div class="chart-wrap"><canvas id="miss-chart"></canvas></div>
      </div>
      <div class="panel">
        <h3>Extension breakdown</h3>
        <p class="panel-note">Click a row to filter the event table.</p>
        <div class="table-scroll" style="max-height:280px">
          <table class="data">
            <thead><tr><th>Extension</th><th>Misses</th></tr></thead>
            <tbody>
              ${Object.entries(miss)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => {
                  const on = state.missedExt === k;
                  return `<tr class="${on ? 'is-active' : ''}" data-miss-ext="${esc(k)}" tabindex="0" role="button" aria-pressed="${on}" aria-label="Filter to ${esc(k)}, ${v} misses">
                    <td>${esc(k)}</td>
                    <td class="mono">${v}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="panel" id="missed-events">
      <h3>
        Event table
        <span class="count" id="missed-count">${merged.length} rows</span>
      </h3>
      <div id="miss-banner-slot">${missedFilterBannerHtml()}</div>
      <div class="toolbar">
        <input type="search" id="missed-search" placeholder="Search caller, extension, DID…" value="${esc(state.missedSearch)}" />
        <div class="seg" id="missed-seg">
          <button data-f="all" class="${state.missedFilter === 'all' ? 'active' : ''}">All</button>
          <button data-f="no-callback" class="${state.missedFilter === 'no-callback' ? 'active' : ''}">No-callback</button>
          <button data-f="called-back" class="${state.missedFilter === 'called-back' ? 'active' : ''}">Called back</button>
        </div>
      </div>
      <div class="table-scroll" id="missed-table-wrap">
        ${missedTableHtml(merged)}
      </div>
    </div>
  `;
}

function getMissedFiltered() {
  let rows = [...state.missedA, ...state.missedB];
  if (state.missedFilter === 'no-callback') rows = state.missedA;
  if (state.missedFilter === 'called-back') rows = state.missedB;
  if (state.missedExt) {
    rows = rows.filter((r) => r['Who should have taken it'] === state.missedExt);
  }
  const q = state.missedSearch.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(q))
    );
  }
  return rows;
}

function missedFilterBannerHtml() {
  const bits = [];
  if (state.missedFilter === 'no-callback') bits.push('no-callback events');
  else if (state.missedFilter === 'called-back') bits.push('events called back within 24h');
  else bits.push('missed events');
  if (state.missedExt) bits.push(`for <strong>${esc(state.missedExt)}</strong>`);
  if (!state.missedExt && state.missedFilter === 'all') return '';
  return `
    <div class="filter-banner">
      <span>Showing ${bits.join(' ')}.</span>
      <button type="button" class="btn small" data-miss-clear>Clear filter</button>
    </div>`;
}

function missedTableHtml(rows) {
  if (!rows.length) return `<div class="empty">No matching rows.</div>`;
  return `
    <table class="data">
      <thead>
        <tr>
          <th>Status</th>
          <th>Caller</th>
          <th>Miss (PT)</th>
          <th>Who should have taken it</th>
          <th>Ring group / DID</th>
          <th>AI path?</th>
          <th>Super note</th>
          <th>Call ID</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const badge =
              r._status === 'no-callback'
                ? `<span class="badge no-cb">No-callback</span>`
                : `<span class="badge cb">Called back</span>`;
            return `<tr>
              <td>${badge}</td>
              <td class="mono">${esc(r.Caller)}</td>
              <td class="mono">${esc(r['Miss datetime (PT)'])}</td>
              <td>${esc(r['Who should have taken it'])}</td>
              <td class="muted">${esc(r['Ring group / DID / Description'])}</td>
              <td>${esc(r['AI path?'])}</td>
              <td class="muted">${esc(r['Super handoff / open-loop note'])}</td>
              <td class="mono muted">${esc(r['Call ID'])}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

function bindMissed() {
  const search = document.getElementById('missed-search');
  const seg = document.getElementById('missed-seg');
  search?.addEventListener('input', () => {
    state.missedSearch = search.value;
    refreshMissedTable();
  });
  seg?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-f]');
    if (!btn) return;
    state.missedFilter = btn.dataset.f;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    refreshMissedTable();
  });
}

function refreshMissedTable() {
  const rows = getMissedFiltered();
  const wrap = document.getElementById('missed-table-wrap');
  const count = document.getElementById('missed-count');
  const banner = document.getElementById('miss-banner-slot');
  if (wrap) wrap.innerHTML = missedTableHtml(rows);
  if (count) count.textContent = `${rows.length} rows`;
  if (banner) banner.innerHTML = missedFilterBannerHtml();
  document.querySelectorAll('#missed-seg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.f === state.missedFilter);
  });
  document.querySelectorAll('[data-miss-status]').forEach((b) => {
    const on =
      b.dataset.missStatus !== 'all' &&
      !state.missedExt &&
      !state.missedSearch &&
      b.dataset.missStatus === state.missedFilter;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll('[data-miss-ext]').forEach((row) => {
    const on = row.dataset.missExt === state.missedExt;
    row.classList.toggle('is-active', on);
    row.setAttribute('aria-pressed', String(on));
  });
}

function barColor(ext) {
  if (!state.missedExt) return 'rgba(20, 184, 166, 0.65)';
  return ext === state.missedExt ? 'rgba(94, 234, 212, 0.95)' : 'rgba(20, 184, 166, 0.22)';
}

function drawMissChart() {
  const canvas = document.getElementById('miss-chart');
  if (!canvas) return;
  const entries = Object.entries(state.data.miss_by_extension).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([k]) => {
    const short = k.split('—')[0].trim();
    const name = k.includes('—') ? k.split('—')[1].trim() : '';
    return name && name !== short ? `${short} ${name.split(' ')[0]}` : short;
  });
  state.chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Missed (NO ANSWER)',
          data: entries.map(([, v]) => v),
          backgroundColor: entries.map(([k]) => barColor(k)),
          borderColor: entries.map(([k]) =>
            state.missedExt === k ? 'rgba(94, 234, 212, 1)' : 'rgba(94, 234, 212, 0.9)'
          ),
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 42,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onHover: (event, elements) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      onClick: (_event, elements) => {
        if (!elements.length) return;
        applyMissedExt(entries[elements[0].index][0]);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => entries[items[0].dataIndex][0],
            afterTitle: () => 'Click to filter the event table',
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0, font: { size: 11 } },
          grid: { color: 'rgba(36, 48, 73, 0.6)' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(36, 48, 73, 0.6)' },
        },
      },
    },
  });
}

function renderOpenLoops() {
  const k = state.data.kpis;
  const rows = getOpenLoopsFiltered();
  return `
    <div class="page-header">
      <h2>Open loops (Super)</h2>
      <p>Unresolved Action Required after failed transfer or message-taken. Source: HireSuper Activity. Click a total to filter this list.</p>
      <div class="meta-pills">
        ${loopPill('Total', k.super_open_loops, 'all')}
        ${loopPill('Ultatel overlap', k.super_ultatel_overlap, 'overlap')}
        ${loopPill('Super-only', k.super_only_open_loops, 'super-only')}
        <span class="pill">${esc(state.data.meta.super_open_loops_window)}</span>
      </div>
    </div>
    <div class="panel" id="loops-table">
      <h3>Action Required <span class="count">${rows.length} loops</span></h3>
      ${openLoopBannerHtml()}
      <div class="table-scroll">
        ${openLoopTableHtml(rows)}
      </div>
    </div>
  `;
}

function getOpenLoopsFiltered() {
  if (state.openLoopFilter === 'overlap') {
    return state.openLoops.filter((r) => (r['In Ultatel no-callback list?'] || '').toLowerCase() === 'yes');
  }
  if (state.openLoopFilter === 'super-only') {
    return state.openLoops.filter((r) => (r['In Ultatel no-callback list?'] || '').toLowerCase() !== 'yes');
  }
  return state.openLoops;
}

function openLoopBannerHtml() {
  if (state.openLoopFilter === 'overlap') {
    return `<div class="filter-banner"><span>Showing open loops that are also on the Ultatel no-callback list.</span><button type="button" class="btn small" data-loop-filter="all">Show all ${esc(state.openLoops.length)}</button></div>`;
  }
  if (state.openLoopFilter === 'super-only') {
    return `<div class="filter-banner"><span>Showing Super-only loops (not on the Ultatel no-callback list).</span><button type="button" class="btn small" data-loop-filter="all">Show all</button></div>`;
  }
  return '';
}

function openLoopTableHtml(rows) {
  if (!rows.length) return `<div class="empty">No matching rows.</div>`;
  return `
    <table class="data">
      <thead>
        <tr>
          <th>Caller</th>
          <th>Super open-loop note</th>
          <th>In Ultatel no-callback?</th>
          <th>Ultatel miss attempts</th>
          <th>Last Ultatel miss (PT)</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const inList = (r['In Ultatel no-callback list?'] || '').toLowerCase() === 'yes';
            return `<tr>
              <td class="mono">${esc(r.Caller)}</td>
              <td>${esc(r['Super open-loop note / handoff scenario'])}</td>
              <td>${inList ? '<span class="badge yes">Yes</span>' : '<span class="badge no">No</span>'}</td>
              <td class="mono">${esc(r['Ultatel miss attempts'])}</td>
              <td class="mono muted">${esc(r['Last Ultatel miss (PT)'])}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

function renderCallback() {
  const k = state.data.kpis;
  const filtered = getCallbackFiltered();
  return `
    <div class="page-header">
      <h2>Callback hygiene</h2>
      <p>Unique callers with ≥1 inbound NO ANSWER and no company OUT-Bound within 24 hours (Ultatel PBX only). Click a metric to open that subset.</p>
    </div>

    <div class="kpi-grid">
      ${kpiCard('No-callback (24h)', k.no_callback_24h_unique, 'Action list', 'danger', 'no-callback')}
      ${kpiCard('Never dialed', k.never_company_dialed, 'Zero OUT in export', 'warn', 'never-dialed')}
      ${kpiCard('Dialed earlier only', k.dialed_earlier_only, 'Not within 24h', '', 'dialed-earlier')}
      ${kpiCard('Dialed after 24h', k.dialed_later_after_24h, 'Late callback', 'info', 'dialed-later')}
    </div>

    <div class="panel" id="cb-action">
      <h3>
        Action list
        <button type="button" class="count count-btn" data-drill="no-callback" aria-haspopup="dialog">${filtered.length} of ${state.callbackAction.length}</button>
      </h3>
      <div class="toolbar">
        <input type="search" id="cb-search" placeholder="Search caller, note, extension…" value="${esc(state.callbackSearch)}" />
      </div>
      <div class="table-scroll" id="cb-table-wrap">
        ${callbackTableHtml(filtered)}
      </div>
    </div>

    <div class="panel" id="cb-never">
      <h3>Never dialed (verified) <button type="button" class="count count-btn" data-drill="never-dialed" aria-haspopup="dialog">${state.callbackNever.length}</button></h3>
      <p style="margin:0 0 0.75rem;color:var(--text-muted);font-size:0.88rem;">
        Stricter bar inside the ${k.no_callback_24h_unique}: zero company OUT-Bound in the Sep 20–26 Ultatel export.
      </p>
      <div class="table-scroll" style="max-height:360px">
        ${neverTableHtml(state.callbackNever)}
      </div>
    </div>
  `;
}

function neverTableHtml(rows) {
  if (!rows.length) return `<div class="empty">No matching rows.</div>`;
  return `
    <table class="data">
      <thead>
        <tr>
          <th>Caller</th>
          <th>Missed attempts</th>
          <th>Last miss (PT)</th>
          <th>On Super open list?</th>
          <th>Verification</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const yes = (r['On Super open list?'] || '').toLowerCase() === 'yes';
            return `<tr>
              <td class="mono">${esc(r.Caller)}</td>
              <td class="mono">${esc(r['Missed attempts'])}</td>
              <td class="mono">${esc(r['Last miss (PT)'])}</td>
              <td>${yes ? '<span class="badge yes">Yes</span>' : '<span class="badge no">No</span>'}</td>
              <td class="muted">${esc(r.Verification)}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

function getCallbackFiltered() {
  const q = state.callbackSearch.trim().toLowerCase();
  if (!q) return state.callbackAction;
  return state.callbackAction.filter((r) =>
    Object.values(r).some((v) => String(v).toLowerCase().includes(q))
  );
}

function callbackTableHtml(rows) {
  if (!rows.length) return `<div class="empty">No matching rows.</div>`;
  return `
    <table class="data">
      <thead>
        <tr>
          <th>#</th>
          <th>Caller</th>
          <th>Misses</th>
          <th>Last miss (PT)</th>
          <th>Super?</th>
          <th>Super note</th>
          <th>Last extension</th>
          <th>AI path?</th>
          <th>What to do</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const yes = (r['On Super open list?'] || '').toLowerCase() === 'yes';
            return `<tr>
              <td class="mono">${esc(r.Priority)}</td>
              <td class="mono">${esc(r.Caller)}</td>
              <td class="mono">${esc(r['Missed attempts'])}</td>
              <td class="mono">${esc(r['Last miss (PT)'])}</td>
              <td>${yes ? '<span class="badge yes">Yes</span>' : '<span class="badge no">No</span>'}</td>
              <td>${esc(r['Super note'])}</td>
              <td class="muted">${esc(r['Last extension tried'])}</td>
              <td>${esc(r['AI ring group in path?'])}</td>
              <td class="muted">${esc(r['What to do'])}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

function bindCallback() {
  const search = document.getElementById('cb-search');
  search?.addEventListener('input', () => {
    state.callbackSearch = search.value;
    const rows = getCallbackFiltered();
    const wrap = document.getElementById('cb-table-wrap');
    const count = document.getElementById('cb-count');
    if (wrap) wrap.innerHTML = callbackTableHtml(rows);
    if (count) count.textContent = `${rows.length} of ${state.callbackAction.length}`;
  });
}

function renderMethod() {
  const ex = state.exclusions;
  const meta = state.data.meta;
  return `
    <div class="page-header">
      <h2>Method &amp; exclusions</h2>
      <p>Self-numbers, definitions, 24h join rule, and known gaps. From the live workbook + JSON meta.</p>
    </div>

    <div class="panel">
      <h3>JSON meta caveats</h3>
      <ul class="caveat-list">
        ${meta.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}
      </ul>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3>Self-numbers / company From exclusions</h3>
        <div class="table-scroll" style="max-height:420px">
          <table class="data">
            <thead>
              <tr><th>Number</th><th>Why excluded</th><th>IN NA events</th></tr>
            </thead>
            <tbody>
              ${ex.selfNumbers
                .map(
                  (r) => `<tr>
                    <td class="mono">${esc(r.number)}</td>
                    <td>${esc(r.why)}</td>
                    <td><button type="button" class="num-btn" data-drill="self-events" data-self-number="${esc(r.number)}" aria-haspopup="dialog" aria-label="View exclusion detail for ${esc(r.number)}, ${esc(r.events)} events">${esc(r.events)}</button></td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h3>Key numbering notes</h3>
        <dl class="def-list">
          ${ex.notes.map((n) => `<dt>${esc(n.key)}</dt><dd>${esc(n.value)}</dd>`).join('')}
        </dl>
      </div>
    </div>

    <div class="panel">
      <h3>Flags &amp; definitions</h3>
      <dl class="def-list">
        ${ex.definitions.map((d) => `<dt>${esc(d.term)}</dt><dd>${esc(d.meaning)}</dd>`).join('')}
      </dl>
    </div>

    <div class="panel">
      <h3>24h callback join &amp; crosswalk</h3>
      <ul class="caveat-list">
        ${ex.method.map((m) => `<li>${esc(m)}</li>`).join('')}
      </ul>
    </div>

    <div class="panel">
      <h3>Verification caveats / limits of proof</h3>
      <ul class="caveat-list">
        ${ex.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function exclusionTableHtml(rows) {
  if (!rows.length) return `<div class="empty">No matching rows.</div>`;
  return `
    <table class="data">
      <thead>
        <tr><th>Number</th><th>Why excluded</th><th>IN NA events</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
              <td class="mono">${esc(r.number)}</td>
              <td>${esc(r.why)}</td>
              <td class="mono">${esc(r.events)}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function currentPack() {
  return {
    data: state.data,
    missedA: state.missedA,
    missedB: state.missedB,
    openLoops: state.openLoops,
    callbackAction: state.callbackAction,
    callbackNever: state.callbackNever,
    exclusions: state.exclusions,
  };
}

function tableHtml(kind, rows) {
  if (kind === 'missed') return missedTableHtml(rows);
  if (kind === 'callback') return callbackTableHtml(rows);
  if (kind === 'never') return neverTableHtml(rows);
  if (kind === 'loops') return openLoopTableHtml(rows);
  if (kind === 'exclusion') return exclusionTableHtml(rows);
  return '';
}

function summaryHtml(lines) {
  if (!lines?.length) return '';
  return `
    <div class="drill-summary">
      <h3>Recorded in this export</h3>
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th>Metric</th><th>Value</th><th>Source note</th></tr></thead>
          <tbody>
            ${lines
              .map(
                (l) => `<tr>
                  <td>${esc(l.metric)}</td>
                  <td class="mono">${esc(l.count)}</td>
                  <td class="muted">${esc(l.note)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openDrill(id, trigger, dataset = {}) {
  const spec = buildDrill(id, currentPack(), { selfNumber: dataset.selfNumber || '' });
  if (!spec) return;
  if (trigger && !trigger.closest?.('#drill-root')) state.drillFocus = trigger;
  state.drill = spec;
  state.drillQuery = '';
  renderDrill();
  document.body.classList.add('drill-open');
  document.getElementById('drill-panel')?.focus();
}

function closeDrill({ restoreFocus = true } = {}) {
  if (!state.drill && !document.body.classList.contains('drill-open')) {
    state.drill = null;
    return;
  }
  state.drill = null;
  state.drillQuery = '';
  const root = document.getElementById('drill-root');
  if (root) root.innerHTML = '';
  document.body.classList.remove('drill-open');
  const focus = state.drillFocus;
  state.drillFocus = null;
  if (restoreFocus && focus && document.contains(focus)) focus.focus();
}

function renderDrill() {
  const spec = state.drill;
  const root = document.getElementById('drill-root');
  if (!spec || !root) return;
  const rows = spec.rows || [];
  const shown = spec.table ? filterRows(rows, state.drillQuery) : [];
  const mismatch =
    spec.table &&
    spec.warnMismatch !== false &&
    spec.headline !== '' &&
    spec.headline != null &&
    Number(spec.headline) !== rows.length;
  root.innerHTML = `
    <div class="drill-backdrop" id="drill-backdrop">
      <div class="drill-panel" id="drill-panel" role="dialog" aria-modal="true" aria-labelledby="drill-title" tabindex="-1">
        <header class="drill-head">
          <div class="drill-head-copy">
            <div class="drill-crumb">
              <button type="button" class="linkish" data-goto="${esc(spec.route || 'overview')}">${esc(spec.crumb || 'Overview')}</button>
              <span aria-hidden="true">/</span>
              <span>${esc(spec.title)}</span>
            </div>
            <h2 id="drill-title">${esc(spec.title)}</h2>
            <p class="drill-source">Source: ${esc(spec.source || '')}</p>
          </div>
          <div class="drill-actions">
            <button type="button" class="btn" id="drill-back">Back to overview</button>
            <button type="button" class="btn primary" id="drill-close">Close</button>
          </div>
        </header>
        <div class="drill-body">
          ${spec.note ? `<p class="drill-note">${esc(spec.note)}</p>` : ''}
          ${
            spec.unavailable
              ? `<div class="drill-missing"><strong>Detail not in this export</strong><p>${esc(spec.reason || '')}</p></div>`
              : ''
          }
          ${
            spec.headline !== '' && spec.headline != null
              ? `<div class="meta-pills drill-stats">
                  <span class="pill"><strong>Headline</strong> ${esc(spec.headline)}</span>
                  ${spec.table ? `<span class="pill"><strong>Rows</strong> <span id="drill-shown">${shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}</span></span>` : ''}
                </div>`
              : ''
          }
          ${mismatch ? `<div class="drill-mismatch">Headline is ${esc(spec.headline)}; this file has ${rows.length} rows. Showing the file as-is.</div>` : ''}
          ${summaryHtml(spec.summary)}
          ${
            spec.related?.length
              ? `<div class="drill-related">
                  ${spec.related.map((r) => `<button type="button" class="btn" data-drill="${esc(r.id)}">${esc(r.label)}</button>`).join('')}
                </div>`
              : ''
          }
          ${
            spec.jumps?.length
              ? `<div class="drill-related">
                  ${spec.jumps.map((j, i) => `<button type="button" class="btn" data-jump="${i}">${esc(j.label)}</button>`).join('')}
                </div>`
              : ''
          }
          ${
            spec.table
              ? `<div class="toolbar">
                  <input type="search" id="drill-search" placeholder="Filter these rows…" value="${esc(state.drillQuery)}" />
                </div>
                <div id="drill-results">${tableHtml(spec.table, shown)}</div>`
              : ''
          }
        </div>
      </div>
    </div>`;

  document.getElementById('drill-close')?.addEventListener('click', () => closeDrill());
  document.getElementById('drill-back')?.addEventListener('click', () => {
    closeDrill({ restoreFocus: false });
    if (state.route !== 'overview') navigate('overview');
  });
  document.getElementById('drill-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'drill-backdrop') closeDrill();
  });
  const search = document.getElementById('drill-search');
  search?.addEventListener('input', () => {
    state.drillQuery = search.value;
    refreshDrillResults();
  });
}

function refreshDrillResults() {
  const spec = state.drill;
  if (!spec?.table) return;
  const rows = spec.rows || [];
  const shown = filterRows(rows, state.drillQuery);
  const el = document.getElementById('drill-results');
  const count = document.getElementById('drill-shown');
  if (el) el.innerHTML = tableHtml(spec.table, shown);
  if (count) count.textContent = shown.length === rows.length ? String(rows.length) : `${shown.length} of ${rows.length}`;
}

function applyMissedExt(ext) {
  if (state.missedExt === ext) state.missedExt = '';
  else {
    state.missedExt = ext;
    state.missedFilter = 'all';
    state.missedSearch = '';
  }
  state.scrollTo = 'missed-events';
  // Defer so a Chart.js click handler is not destroyed mid-dispatch.
  setTimeout(() => {
    if (state.route !== 'missed') navigate('missed');
    else renderPage();
  }, 0);
}

function applyMissedStatus(status) {
  state.missedFilter = status;
  state.missedExt = '';
  state.missedSearch = '';
  closeDrill({ restoreFocus: false });
  state.scrollTo = 'missed-events';
  if (state.route !== 'missed') navigate('missed');
  else renderPage();
}

function clearMissedFilters() {
  state.missedFilter = 'all';
  state.missedExt = '';
  state.missedSearch = '';
  if (state.route === 'missed') renderPage();
}

function applyLoopFilter(filter) {
  state.openLoopFilter = filter;
  closeDrill({ restoreFocus: false });
  state.scrollTo = 'loops-table';
  if (state.route !== 'open-loops') navigate('open-loops');
  else renderPage();
}

function runJump(jump) {
  if (!jump) return;
  if (jump.kind === 'missed') {
    applyMissedStatus(jump.status || 'all');
    return;
  }
  if (jump.kind === 'loops') {
    applyLoopFilter(jump.filter || 'all');
    return;
  }
  if (jump.kind === 'callback') {
    closeDrill({ restoreFocus: false });
    state.scrollTo = jump.anchor || 'cb-action';
    if (state.route !== 'callback') navigate('callback');
    else renderPage();
  }
}

function scrollPending() {
  if (!state.scrollTo) return;
  const id = state.scrollTo;
  state.scrollTo = null;
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function onAppClick(e) {
  const jumpBtn = e.target.closest('[data-jump]');
  if (jumpBtn && state.drill?.jumps) {
    runJump(state.drill.jumps[Number(jumpBtn.dataset.jump)]);
    return;
  }
  const goto = e.target.closest('[data-goto]');
  if (goto) {
    const route = goto.dataset.goto;
    closeDrill({ restoreFocus: false });
    if (state.route !== route) navigate(route);
    return;
  }
  const drillBtn = e.target.closest('[data-drill]');
  if (drillBtn) {
    openDrill(drillBtn.dataset.drill, drillBtn, drillBtn.dataset);
    return;
  }
  if (e.target.closest('[data-miss-clear]')) {
    clearMissedFilters();
    return;
  }
  const statusBtn = e.target.closest('[data-miss-status]');
  if (statusBtn) {
    applyMissedStatus(statusBtn.dataset.missStatus);
    return;
  }
  const extBtn = e.target.closest('[data-miss-ext]');
  if (extBtn) {
    applyMissedExt(extBtn.dataset.missExt);
    return;
  }
  const loopBtn = e.target.closest('[data-loop-filter]');
  if (loopBtn) {
    applyLoopFilter(loopBtn.dataset.loopFilter);
  }
}

function onAppKeydown(e) {
  if (e.key === 'Escape' && state.drill) {
    e.preventDefault();
    closeDrill();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.dataset?.missExt && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    applyMissedExt(e.target.dataset.missExt);
    return;
  }
  if (e.key !== 'Tab' || !state.drill) return;
  const panel = document.getElementById('drill-panel');
  if (!panel) return;
  const list = [...panel.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.tabIndex !== -1
  );
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

async function boot() {
  const app = document.querySelector('#app');
  app.innerHTML = `<div class="loading"><div class="spinner"></div><div>Loading call hygiene data…</div></div>`;
  try {
    await loadAll();
    renderShell();
    renderPage();
    document.addEventListener('keydown', onAppKeydown);
    window.addEventListener('hashchange', () => {
      const route = location.hash.replace(/^#\/?/, '') || 'overview';
      if (route !== state.route) navigate(route);
    });
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="error-box"><strong>Failed to load dashboard data</strong><p>${esc(err.message)}</p><p>Ensure <code>data/latest.json</code> and CSVs are present under the site root.</p></div>`;
  }
}

boot();
