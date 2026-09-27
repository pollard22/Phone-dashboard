import './style.css';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { parseCsv, rowsToObjects, findHeaderRow } from './csv.js';

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
  missedSearch: '',
  callbackSearch: '',
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

  state.data = JSON.parse(jsonText);

  const aRows = parseCsv(aText);
  const bRows = parseCsv(bText);
  state.missedA = rowsToObjects(aRows, 0).map((r) => ({ ...r, _status: 'no-callback' }));
  state.missedB = rowsToObjects(bRows, 0).map((r) => ({ ...r, _status: 'called-back' }));

  const olRows = parseCsv(olText);
  const olHeader = findHeaderRow(olRows, 'Caller');
  state.openLoops = rowsToObjects(olRows, olHeader);

  const cbRows = parseCsv(cbText);
  const actionHeader = findHeaderRow(cbRows, 'Priority');
  const neverHeader = findHeaderRow(cbRows, 'Caller', { startsWith: false });
  // Second "Caller" header is the never-dialed section (after Priority section)
  let neverIdx = -1;
  for (let i = actionHeader + 1; i < cbRows.length; i++) {
    if ((cbRows[i][0] || '').trim() === 'Caller') {
      neverIdx = i;
      break;
    }
  }
  const actionEnd = neverIdx > 0 ? neverIdx - 1 : cbRows.length;
  // trim blank rows before never section
  let actionSliceEnd = actionEnd;
  while (actionSliceEnd > actionHeader + 1 && !(cbRows[actionSliceEnd - 1]?.[0] || '').trim()) {
    actionSliceEnd--;
  }
  state.callbackAction = rowsToObjects(cbRows.slice(0, actionSliceEnd), actionHeader).filter(
    (r) => r.Priority && /^\d+$/.test(r.Priority)
  );
  if (neverIdx >= 0) {
    state.callbackNever = rowsToObjects(cbRows, neverIdx).filter((r) => r.Caller && r.Caller.startsWith('('));
  }

  state.exclusions = parseExclusions(parseCsv(exText));
}

function parseExclusions(rows) {
  const result = { selfNumbers: [], definitions: [], notes: [], caveats: [], method: [] };
  let mode = null;
  for (const r of rows) {
    const c0 = (r[0] || '').trim();
    const c1 = (r[1] || '').trim();
    const c2 = (r[2] || '').trim();
    if (!c0 && !c1) continue;
    if (c0 === 'Self-numbers / company From exclusions') {
      mode = 'self-header';
      continue;
    }
    if (c0 === 'Number' && mode === 'self-header') {
      mode = 'self';
      continue;
    }
    if (c0 === 'Key numbering notes') {
      mode = 'notes';
      continue;
    }
    if (c0 === 'Flags & definitions') {
      mode = 'def-header';
      continue;
    }
    if (c0 === 'Term' && mode === 'def-header') {
      mode = 'def';
      continue;
    }
    if (c0.startsWith('24h callback join method')) {
      mode = 'method';
      continue;
    }
    if (c0.startsWith('Super vs Ultatel')) {
      mode = 'method';
      continue;
    }
    if (c0.startsWith('Verification caveats')) {
      mode = 'caveats';
      continue;
    }
    if (mode === 'self' && c0.startsWith('(')) {
      result.selfNumbers.push({ number: c0, why: c1, events: c2 });
    } else if (mode === 'notes' && c0) {
      result.notes.push({ key: c0, value: c1 });
    } else if (mode === 'def' && c0) {
      result.definitions.push({ term: c0, meaning: c1 });
    } else if (mode === 'method' && c0) {
      result.method.push(c0);
    } else if (mode === 'caveats') {
      const text = c0.replace(/^•\s*/, '').trim();
      if (text) result.caveats.push(text);
    }
  }
  return result;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kpiCard(label, value, hint = '', tone = '') {
  return `
    <div class="kpi ${tone}">
      <div class="label">${esc(label)}</div>
      <div class="value">${esc(value)}</div>
      ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
    </div>`;
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
  `;

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
}

function renderOverview() {
  const { meta, kpis } = state.data;
  return `
    <div class="page-header">
      <h2>Overview</h2>
      <p>Ultatel PBX + HireSuper hygiene snapshot — live metrics only, no invented numbers.</p>
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
      ${kpiCard('IN-Bound', kpis.ultatel_inbound, 'Total CDR legs', 'info')}
      ${kpiCard('IN answered', kpis.ultatel_inbound_answered, '', 'ok')}
      ${kpiCard('IN no answer', kpis.ultatel_inbound_no_answer, `Cleaned ${kpis.ultatel_inbound_no_answer_cleaned}`, 'warn')}
      ${kpiCard('OUT-Bound', kpis.ultatel_outbound, `${kpis.ultatel_outbound_answered} ans / ${kpis.ultatel_outbound_no_answer} NA`)}
    </div>

    <h3 style="margin:1rem 0 0.65rem;font-size:0.85rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">Callback hygiene (24h rule)</h3>
    <div class="kpi-grid">
      ${kpiCard('No-callback', kpis.no_callback_24h_unique, 'Unique callers', 'danger')}
      ${kpiCard('Never dialed', kpis.never_company_dialed, 'Zero company OUT', 'warn')}
      ${kpiCard('Dialed earlier only', kpis.dialed_earlier_only, 'Not within 24h')}
      ${kpiCard('Dialed after 24h', kpis.dialed_later_after_24h, 'Late callback')}
    </div>

    <h3 style="margin:1rem 0 0.65rem;font-size:0.85rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">HireSuper</h3>
    <div class="kpi-grid">
      ${kpiCard('AI inbound', kpis.super_ai_inbound, 'Reporting Sep 20–26', 'accent')}
      ${kpiCard('Transferred', kpis.super_transferred, '', 'info')}
      ${kpiCard('Needs human help', kpis.super_needs_human_help, `${kpis.super_needs_help_pct}% of AI inbound`, 'warn')}
      ${kpiCard('Open loops', kpis.super_open_loops, `Overlap ${kpis.super_ultatel_overlap} · Super-only ${kpis.super_only_open_loops}`, 'danger')}
      ${kpiCard('AI talk time', kpis.super_ai_talk, `Avg ${kpis.super_avg_talk}`)}
      ${kpiCard('Actions / SMS', `${kpis.super_actions} / ${kpis.super_sms_sessions}`, 'Automated actions · SMS sessions')}
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
      <p>One row per cleaned inbound NO ANSWER. Sorted no-callback first, then newest miss.</p>
      <div class="meta-pills">
        <span class="pill"><strong>No-callback rows</strong> ${totals.no_callback_24h ?? state.missedA.length}</span>
        <span class="pill"><strong>Called back</strong> ${totals.called_back_24h ?? state.missedB.length}</span>
        <span class="pill"><strong>Total cleaned NA</strong> ${totals.total_cleaned_na ?? state.missedA.length + state.missedB.length}</span>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3>Misses by extension</h3>
        <div class="chart-wrap"><canvas id="miss-chart"></canvas></div>
      </div>
      <div class="panel">
        <h3>Extension breakdown</h3>
        <div class="table-scroll" style="max-height:280px">
          <table class="data">
            <thead><tr><th>Extension</th><th>Misses</th></tr></thead>
            <tbody>
              ${Object.entries(miss)
                .sort((a, b) => b[1] - a[1])
                .map(
                  ([k, v]) =>
                    `<tr><td>${esc(k)}</td><td class="mono">${v}</td></tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>
        Event table
        <span class="count" id="missed-count">${merged.length} rows</span>
      </h3>
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
  const q = state.missedSearch.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(q))
    );
  }
  return rows;
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
  if (wrap) wrap.innerHTML = missedTableHtml(rows);
  if (count) count.textContent = `${rows.length} rows`;
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
          backgroundColor: 'rgba(20, 184, 166, 0.65)',
          borderColor: 'rgba(94, 234, 212, 0.9)',
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 42,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => entries[items[0].dataIndex][0],
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
  const rows = state.openLoops;
  return `
    <div class="page-header">
      <h2>Open loops (Super)</h2>
      <p>Unresolved Action Required after failed transfer or message-taken. Source: HireSuper Activity.</p>
      <div class="meta-pills">
        <span class="pill"><strong>Total</strong> ${k.super_open_loops}</span>
        <span class="pill"><strong>Ultatel overlap</strong> ${k.super_ultatel_overlap}</span>
        <span class="pill"><strong>Super-only</strong> ${k.super_only_open_loops}</span>
        <span class="pill">${esc(state.data.meta.super_open_loops_window)}</span>
      </div>
    </div>
    <div class="panel">
      <h3>Action Required <span class="count">${rows.length} loops</span></h3>
      <div class="table-scroll">
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
        </table>
      </div>
    </div>
  `;
}

function renderCallback() {
  const k = state.data.kpis;
  const filtered = getCallbackFiltered();
  return `
    <div class="page-header">
      <h2>Callback hygiene</h2>
      <p>Unique callers with ≥1 inbound NO ANSWER and no company OUT-Bound within 24 hours (Ultatel PBX only).</p>
    </div>

    <div class="kpi-grid">
      ${kpiCard('No-callback (24h)', k.no_callback_24h_unique, 'Action list', 'danger')}
      ${kpiCard('Never dialed', k.never_company_dialed, 'Zero OUT in export', 'warn')}
      ${kpiCard('Dialed earlier only', k.dialed_earlier_only, 'Not within 24h')}
      ${kpiCard('Dialed after 24h', k.dialed_later_after_24h, 'Late callback', 'info')}
    </div>

    <div class="panel">
      <h3>
        Action list
        <span class="count" id="cb-count">${filtered.length} of ${state.callbackAction.length}</span>
      </h3>
      <div class="toolbar">
        <input type="search" id="cb-search" placeholder="Search caller, note, extension…" value="${esc(state.callbackSearch)}" />
      </div>
      <div class="table-scroll" id="cb-table-wrap">
        ${callbackTableHtml(filtered)}
      </div>
    </div>

    <div class="panel">
      <h3>Never dialed (verified) <span class="count">${state.callbackNever.length}</span></h3>
      <p style="margin:0 0 0.75rem;color:var(--text-muted);font-size:0.88rem;">
        Stricter bar inside the ${k.no_callback_24h_unique}: zero company OUT-Bound in the Sep 20–26 Ultatel export.
      </p>
      <div class="table-scroll" style="max-height:360px">
        <table class="data">
          <thead>
            <tr>
              <th>Caller</th>
              <th>Missed attempts</th>
              <th>Last miss (PT)</th>
              <th>On Super open list?</th>
            </tr>
          </thead>
          <tbody>
            ${state.callbackNever
              .map((r) => {
                const yes = (r['On Super open list?'] || '').toLowerCase() === 'yes';
                return `<tr>
                  <td class="mono">${esc(r.Caller)}</td>
                  <td class="mono">${esc(r['Missed attempts'])}</td>
                  <td class="mono">${esc(r['Last miss (PT)'])}</td>
                  <td>${yes ? '<span class="badge yes">Yes</span>' : '<span class="badge no">No</span>'}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
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
                    <td class="mono">${esc(r.events)}</td>
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

async function boot() {
  const app = document.querySelector('#app');
  app.innerHTML = `<div class="loading"><div class="spinner"></div><div>Loading call hygiene data…</div></div>`;
  try {
    await loadAll();
    renderShell();
    renderPage();
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
