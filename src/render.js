import {
  answeredSplit,
  calledBackRows,
  calledBackValue,
  calledBackWhen,
  callerName,
  definitionEntries,
  displayValue,
  filterRows,
  freshnessText,
  displayGroupEntries,
  groupDomId,
  groupLabel,
  hasMissedType,
  missedTypeEntries,
  showCalledBack,
  superCallView,
  voicemailNote,
  waitingText,
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

function statCard({ label, value, lines = [], extra = '', tone = '' }) {
  const lineHtml = lines.filter(Boolean).map((line) => `<p class="sub">${esc(line)}</p>`).join('');
  return `
    <article class="stat ${tone}">
      <p class="label">${esc(label)}</p>
      <p class="num">${esc(displayValue(value))}</p>
      ${lineHtml}
      ${extra}
    </article>`;
}

function chipButton({ id, pressed, filter, group = '', type = '', label, count = null }) {
  const groupAttr = group ? ` data-group="${esc(group)}"` : '';
  const typeAttr = type ? ` data-type="${esc(type)}"` : '';
  const countHtml = count === null || count === undefined || String(count) === '' ? '' : ` <strong>${esc(count)}</strong>`;
  return `<button type="button" class="chip" id="${esc(id)}" data-filter="${esc(filter)}"${groupAttr}${typeAttr} aria-pressed="${pressed}">${esc(label)}${countHtml}</button>`;
}

function groupChips(entries, total, selected) {
  const chips = [
    chipButton({ id: 'group-all', pressed: !selected, filter: 'all-groups', label: 'All groups', count: total }),
    ...entries.map(([name, count]) =>
      chipButton({
        id: groupDomId(name),
        pressed: selected === name,
        filter: 'group',
        group: name,
        label: name,
        count,
      })
    ),
  ];
  return `<div class="chips" role="group" aria-label="Filter by call group">${chips.join('')}</div>`;
}

function typeChips(entries, selected) {
  if (!entries.length) return '';
  const chips = [
    chipButton({ id: 'type-all', pressed: !selected, filter: 'all-types', label: 'All' }),
    ...entries.map(([name, count]) =>
      chipButton({
        id: `type-${groupDomId(name).slice('group-'.length)}`,
        pressed: selected === name,
        filter: 'type',
        type: name,
        label: name,
        count,
      })
    ),
  ];
  return `
    <div class="type-block">
      <p class="transfer-kicker">What happened</p>
      <div class="chips" role="group" aria-label="Filter by what happened">${chips.join('')}</div>
    </div>`;
}

function superNote(note) {
  return note ? `<span class="super-link-note">${esc(note)}</span>` : '';
}

function superCell(row) {
  const view = superCallView(row);
  const note = superNote(view.note);
  if (view.kind === 'link') {
    const tip = view.title || 'View this call in Super';
    const title = view.title ? `<span class="super-title">${esc(view.title)}</span>` : '';
    const more = view.text
      ? `<details class="super-details"><summary>Summary</summary><p>${esc(view.text)}</p></details>`
      : '';
    return `<td class="super-cell"><a class="super-link" href="${esc(view.link)}" target="_blank" rel="noopener noreferrer" title="${esc(tip)}">View call ↗</a>${title}${note}${more}</td>`;
  }
  if (view.kind === 'direct') {
    return `<td class="super-cell"><span class="super-muted">Direct line — no Super call</span>${note}</td>`;
  }
  return `<td class="super-cell"><span class="super-muted">—</span>${note}</td>`;
}

function tableHtml(rows, { showType, showWaiting, showCallback, showSuper }) {
  const columns = 4 + (showType ? 1 : 0) + (showWaiting ? 1 : 0) + (showCallback ? 1 : 0) + (showSuper ? 1 : 0);
  if (!rows.length) {
    return `<div class="table-scroll"><table class="callers"><tbody><tr><td class="empty" colspan="${columns}">No callers match.</td></tr></tbody></table></div>`;
  }
  const head = `
    <tr>
      <th scope="col">Caller</th>
      <th scope="col">Last missed</th>
      <th scope="col">Misses</th>
      <th scope="col">Call group</th>
      ${showType ? '<th scope="col">What happened</th>' : ''}
      ${showWaiting ? '<th scope="col">Waiting</th>' : ''}
      ${showCallback ? '<th scope="col">Called back</th>' : ''}
      ${showSuper ? '<th scope="col">Super call</th>' : ''}
    </tr>`;
  const body = rows
    .map((row) => {
      const typeCell = showType ? `<td>${esc(row?.missed_type ?? '')}</td>` : '';
      const waitCell = showWaiting ? `<td>${esc(waitingText(row))}</td>` : '';
      const backCell = showCallback ? `<td>${esc(calledBackWhen(row))}</td>` : '';
      const superHtml = showSuper ? superCell(row) : '';
      return `<tr>
        <td>${phoneHtml(row)}</td>
        <td>${esc(row?.last_missed_ct ?? '')}</td>
        <td class="num-cell">${esc(displayValue(row?.missed_calls))}</td>
        <td>${esc(groupLabel(row?.call_group))}</td>
        ${typeCell}
        ${waitCell}
        ${backCell}
        ${superHtml}
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
 * Owner page. Numbers come from latest.json summary, not_called_back, called_back, and group counts.
 */
export function renderPage(data, state = {}) {
  const summary = data?.summary;
  if (!summary || typeof summary !== 'object') {
    return `<div class="error-box"><strong>This export has no summary.</strong><p>The page needs the summary in the latest call file.</p></div>`;
  }

  const list = state.list === 'called' && showCalledBack(data) ? 'called' : 'missed';
  const group = state.group || '';
  const type = state.type || '';
  const missedRows = Array.isArray(data.not_called_back) ? data.not_called_back : [];
  const backRows = calledBackRows(data);
  const activeRows = list === 'called' ? backRows : missedRows;
  const shown = filterRows(activeRows, group, type);
  const showType = hasMissedType(list === 'called' ? backRows : missedRows) || missedTypeEntries(data).length > 0;
  const showWaiting = activeRows.some((row) => String(row?.waiting ?? '').trim());
  const showCallback = list === 'called';
  const showSuper = activeRows.some((row) => superCallView(row).kind !== 'empty');
  const windowLabel = windowHeading(summary);
  const fresh = freshnessText(data);
  const calledValue = calledBackValue(data);
  const groups =
    list === 'called'
      ? displayGroupEntries(
          backRows.reduce((counts, row) => {
            const name = groupLabel(row?.call_group);
            if (name) counts[name] = (counts[name] || 0) + 1;
            return counts;
          }, {})
        )
      : displayGroupEntries(data.not_called_back_by_group || summary.not_called_back_by_group);
  const groupTotal = list === 'called' ? displayValue(calledValue ?? backRows.length) : displayValue(summary.not_called_back ?? missedRows.length);
  const noun = shown.length === 1 ? 'caller' : 'callers';
  const shownLabel = [group, type].filter(Boolean).length
    ? `${shown.length} ${noun}`
    : `${shown.length} ${noun}`;

  const calledCard = showCalledBack(data)
    ? statCard({ label: 'Called back', value: calledValue, tone: 'ok' })
    : '';

  const tabs = showCalledBack(data)
    ? `<div class="tabs" role="tablist" aria-label="Which callers">
        <button type="button" class="tab" id="tab-missed" data-list="missed" aria-selected="${list === 'missed'}">Not called back yet</button>
        <button type="button" class="tab" id="tab-called" data-list="called" aria-selected="${list === 'called'}">Called back</button>
      </div>`
    : '';

  return `
    <div class="page">
      <header class="mast">
        <p class="brand">Pollard Properties</p>
        <h1>Call hygiene</h1>
        ${windowLabel ? `<p class="window">${esc(windowLabel)}</p>` : ''}
      </header>

      <section class="stats" aria-label="This period">
        ${statCard({ label: 'Calls received', value: summary.total_calls })}
        ${statCard({
          label: 'Calls answered',
          value: summary.answered_calls,
          lines: [answeredSplit(summary), voicemailNote(summary)],
          tone: 'ok',
        })}
        ${statCard({
          label: 'Callers not answered',
          value: summary.unanswered_callers,
          lines: ['People, not calls'],
          tone: 'miss',
        })}
      </section>

      <section class="outcomes" aria-label="Callbacks">
        ${calledCard}
        ${statCard({
          label: 'Not called back yet',
          value: summary.not_called_back,
          tone: 'miss',
          extra: typeChips(missedTypeEntries(data), list === 'missed' ? type : ''),
        })}
      </section>

      <section class="followup" id="callback-detail" aria-labelledby="list-title">
        <h2 id="list-title" class="sr-only">${list === 'called' ? 'Called back' : 'Not called back yet'}</h2>
        ${tabs}
        ${groupChips(groups, groupTotal, group)}
        <p class="showing">${esc(shownLabel)}</p>
        ${showSuper ? `<p class="super-note">Super call links open in Super and need you to be signed in.</p>` : ''}
        ${tableHtml(shown, { showType, showWaiting, showCallback, showSuper })}
      </section>

      <footer class="foot">
        ${definitionsHtml(summary)}
        ${fresh ? `<p class="fresh">${esc(fresh)}</p>` : ''}
      </footer>
    </div>`;
}
