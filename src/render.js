import {
  answeredSplit,
  callbackStatus,
  callerName,
  definitionEntries,
  displayValue,
  filterRows,
  freshnessText,
  groupDomId,
  groupEntries,
  hasMissedType,
  reconcileText,
  sinceMiss,
  transferFailedGroups,
  transferFailedLine,
  windowHeading,
} from './format.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function phoneHtml(row) {
  const phone = String(row?.phone ?? '').trim();
  const digits = String(row?.phone_digits ?? '').replace(/\D/g, '');
  const name = callerName(row);
  let phoneCell = esc(phone);
  if (digits) {
    const href = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    phoneCell = `<a class="phone" href="tel:${href}">${esc(phone || digits)}</a>`;
  }
  const nameCell = name ? `<span class="caller-name">${esc(name)}</span>` : '';
  return `<div class="caller">${phoneCell}${nameCell}</div>`;
}

function callbackHtml(row) {
  const { status, when } = callbackStatus(row);
  const tone = status === 'Called back' ? 'ok' : '';
  const tag = `<span class="tag ${tone}">${esc(status)}</span>`;
  if (!when) return tag;
  return `<div class="callback">${tag}<span class="callback-when">${esc(when)}</span></div>`;
}

function clockHtml(row) {
  const text = sinceMiss(row);
  return text ? esc(text) : '';
}

function statCard({ label, value, sub, extra = '', tone = '' }) {
  const subHtml = sub ? `<p class="sub">${esc(sub)}</p>` : '';
  return `
    <article class="stat ${tone}">
      <p class="label">${esc(label)}</p>
      <p class="num">${esc(displayValue(value))}</p>
      ${subHtml}
      ${extra}
    </article>`;
}

function transferBlock(data) {
  const line = transferFailedLine(data?.summary);
  const groups = transferFailedGroups(data);
  if (!line && !groups.length) return '';
  const lineHtml = line ? `<p class="transfer-note">${esc(line)}</p>` : '';
  const chips = groups.length
    ? `<div class="transfer-groups">
        <p class="transfer-kicker">By group</p>
        <div class="chips" aria-label="Transfers from Super that went unanswered, by call group">
          ${groups
            .map(
              ([name, count]) =>
                `<span class="chip static">${esc(name)} <strong>${esc(count)}</strong></span>`
            )
            .join('')}
        </div>
      </div>`
    : '';
  return `<div class="transfer-block">${lineHtml}${chips}</div>`;
}

function groupChips(summary, rows, byGroup, selected) {
  const entries = groupEntries(byGroup);
  const total = displayValue(
    summary?.not_called_back !== undefined && summary?.not_called_back !== null && String(summary.not_called_back).trim() !== ''
      ? summary.not_called_back
      : rows.length
  );
  const allPressed = !selected;
  const chips = [
    `<button type="button" class="chip" id="group-all" data-filter="all" aria-pressed="${allPressed}">All <strong>${esc(total)}</strong></button>`,
    ...entries.map(([name, count]) => {
      const pressed = selected === name;
      return `<button type="button" class="chip" id="${esc(groupDomId(name))}" data-filter="group" data-group="${esc(name)}" aria-pressed="${pressed}">${esc(name)} <strong>${esc(count)}</strong></button>`;
    }),
  ];
  return `<div class="chips" role="group" aria-label="Filter by call group">${chips.join('')}</div>`;
}

function tableHtml(rows, showType) {
  const columns = showType ? 8 : 7;
  if (!rows.length) {
    return `<div class="table-scroll"><table class="callers"><tbody><tr><td class="empty" colspan="${columns}">No callers in this group.</td></tr></tbody></table></div>`;
  }
  const head = `
    <tr>
      <th scope="col">Caller</th>
      <th scope="col">Last missed</th>
      <th scope="col">Missed calls</th>
      ${showType ? '<th scope="col">What happened</th>' : ''}
      <th scope="col">Call group</th>
      <th scope="col">Routed to</th>
      <th scope="col">Time since miss</th>
      <th scope="col">Callback</th>
    </tr>`;
  const body = rows
    .map((row) => {
      const typeCell = showType ? `<td>${esc(row?.missed_type ?? '')}</td>` : '';
      return `<tr>
        <td>${phoneHtml(row)}</td>
        <td>${esc(row?.last_missed_ct ?? '')}</td>
        <td class="num-cell">${esc(displayValue(row?.missed_calls))}</td>
        ${typeCell}
        <td>${esc(row?.call_group ?? '')}</td>
        <td>${esc(row?.routed_to ?? '')}</td>
        <td>${clockHtml(row)}</td>
        <td>${callbackHtml(row)}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="table-scroll">
      <table class="callers">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function definitionsHtml(summary) {
  const entries = definitionEntries(summary?.definitions);
  if (!entries.length) return '';
  return `
    <div class="definitions">
      <h2>What the numbers mean</h2>
      <dl>
        ${entries.map((entry) => `<dt>${esc(entry.term)}</dt><dd>${esc(entry.text)}</dd>`).join('')}
      </dl>
    </div>`;
}

/**
 * Owner page. Binds to summary, not_called_back, and not_called_back_by_group.
 * Optional transfer fields and missed_type render only when the export includes them.
 */
export function renderPage(data, state = {}) {
  const summary = data?.summary;
  if (!summary || typeof summary !== 'object') {
    return `<div class="error-box"><strong>This export has no summary.</strong><p>The page needs the summary in the latest call file.</p></div>`;
  }

  const open = Boolean(state.open);
  const group = state.group || '';
  const rows = Array.isArray(data.not_called_back) ? data.not_called_back : [];
  const shown = filterRows(rows, group);
  const showType = hasMissedType(rows);
  const windowLabel = windowHeading(summary);
  const split = answeredSplit(summary);
  const reconcile = reconcileText(summary);
  const fresh = freshnessText(data);
  const shownLabel = group
    ? `${shown.length} ${shown.length === 1 ? 'caller' : 'callers'} in ${group}`
    : `${shown.length} ${shown.length === 1 ? 'caller' : 'callers'}`;

  return `
    <div class="page">
      <header class="mast">
        <p class="brand">Pollard Properties</p>
        <h1>Call hygiene</h1>
        ${windowLabel ? `<p class="window">${esc(windowLabel)}</p>` : ''}
      </header>

      <section class="stats" aria-label="This period">
        ${statCard({ label: 'Calls received', value: summary.total_calls })}
        ${statCard({ label: 'Calls answered', value: summary.answered_calls, sub: split, tone: 'ok' })}
        ${statCard({
          label: 'Callers not answered',
          value: summary.unanswered_callers,
          sub: 'People, not calls',
          extra: transferBlock(data),
          tone: 'miss',
        })}
      </section>

      <section class="followup" aria-labelledby="followup-title">
        <h2 id="followup-title">
          <button type="button" class="followup-toggle" id="followup-toggle" data-action="toggle" aria-expanded="${open}" aria-controls="callback-detail">
            <span class="label">Not called back yet</span>
            <span class="num">${esc(displayValue(summary.not_called_back))}</span>
            <span class="cue">${open ? 'Hide the list' : 'See callers and call groups'}</span>
          </button>
        </h2>
        ${reconcile ? `<p class="reconcile">${esc(reconcile)}</p>` : ''}
        <div id="callback-detail" class="detail" ${open ? '' : 'hidden'}>
          ${groupChips(summary, rows, data.not_called_back_by_group, group)}
          <p class="showing">${esc(shownLabel)}</p>
          ${tableHtml(shown, showType)}
        </div>
      </section>

      <footer class="foot">
        ${definitionsHtml(summary)}
        ${fresh ? `<p class="fresh">${esc(fresh)}</p>` : ''}
      </footer>
    </div>`;
}
