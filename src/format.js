/** Plain values for the owner page. Numbers stay in latest.json. */

export function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function windowHeading(summary) {
  const label = String(summary?.window_label ?? '').trim();
  if (!label) return '';
  if (/central time/i.test(label)) return label;
  return `${label} (Central Time)`;
}

export function answeredSplit(summary) {
  if (!isPresent(summary?.answered_by_super) || !isPresent(summary?.answered_by_staff)) return '';
  return `Super ${summary.answered_by_super} · Staff ${summary.answered_by_staff}`;
}

export function callbackBreakdown(summary) {
  if (!summary) return '';
  const parts = [];
  if (isPresent(summary.never_called)) parts.push(`${summary.never_called} never called`);
  if (isPresent(summary.called_back_late)) parts.push(`${summary.called_back_late} called back late`);
  if (isPresent(summary.not_called_back_under_24h)) {
    parts.push(`${summary.not_called_back_under_24h} still within 24h`);
  }
  return parts.join(' · ');
}

export function reconcileText(summary) {
  const text = summary?.definitions?.reconcile;
  return isPresent(text) ? String(text).trim() : '';
}

/**
 * One line under "Callers not answered". Empty when the export has neither field.
 * Callers are the people count; calls are included when that field is present too.
 */
export function transferFailedLine(summary) {
  const callers = summary?.transfer_failed_callers;
  const calls = summary?.transfer_failed_calls;
  const hasCallers = isPresent(callers);
  const hasCalls = isPresent(calls);
  if (hasCallers && hasCalls) {
    return `incl. ${callers} whose transfer from Super went unanswered (${calls} calls)`;
  }
  if (hasCallers) return `incl. ${callers} whose transfer from Super went unanswered`;
  if (hasCalls) return `incl. ${calls} calls whose transfer from Super went unanswered`;
  return '';
}

function chipEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter(
    ([key, count]) => isPresent(key) && isPresent(count) && (typeof count === 'number' || typeof count === 'string')
  );
}

/** Prefer summary.transfer_failed_by_group, then a top-level object with the same name. */
export function transferFailedGroups(data) {
  const fromSummary = chipEntries(data?.summary?.transfer_failed_by_group);
  if (fromSummary.length) return fromSummary;
  return chipEntries(data?.transfer_failed_by_group);
}

export function groupEntries(byGroup) {
  return chipEntries(byGroup);
}

export function filterRows(rows, group) {
  const list = Array.isArray(rows) ? rows : [];
  if (!group) return list;
  return list.filter((row) => row?.call_group === group);
}

export function hasMissedType(rows) {
  return (Array.isArray(rows) ? rows : []).some((row) => isPresent(row?.missed_type));
}

export function callerName(row) {
  return String(row?.caller_name ?? '').trim();
}

export function callbackText(row) {
  const when = String(row?.first_outbound_after_miss_ct ?? '').trim();
  if (when) return when;
  const ever = row?.ever_called_in_window;
  if (ever === false || String(ever).trim().toLowerCase() === 'false') return 'Never called';
  return 'None yet';
}

export function sinceMiss(row) {
  const clock = String(row?.clock ?? '').trim();
  if (clock) return clock;
  if (!isPresent(row?.hours_since_last_miss)) return '';
  return String(row.hours_since_last_miss);
}

const DEFINITION_TERMS = {
  total_calls: 'Calls received',
  answered_calls: 'Calls answered',
  unanswered_callers: 'Callers not answered',
  not_called_back: 'Not called back yet',
  never_called: 'Never called',
  called_back_late: 'Called back late',
  not_called_back_under_24h: 'Still within 24 hours',
  reconcile: 'How these numbers fit',
  transfer_failed_calls: 'Transfers from Super not answered',
  transfer_failed_callers: 'Callers whose Super transfer was not answered',
};

function humanize(key) {
  const words = String(key).replace(/_/g, ' ').trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function definitionEntries(definitions) {
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return [];
  return Object.entries(definitions)
    .filter(([, text]) => isPresent(text))
    .map(([key, text]) => ({
      key,
      term: DEFINITION_TERMS[key] || humanize(key),
      text: String(text).trim(),
    }));
}

export function freshnessText(data) {
  const parts = [];
  const generated = String(data?.meta?.generated_at ?? '').trim();
  const end = String(data?.summary?.export_end_ct ?? '').trim();
  const source = String(data?.summary?.source ?? '').trim();
  if (generated) parts.push(`Prepared ${generated}.`);
  if (end) parts.push(`Export through ${end}.`);
  if (source) parts.push(source.endsWith('.') ? source : `${source}.`);
  return parts.join(' ');
}

export function displayValue(value) {
  return isPresent(value) ? String(value) : '—';
}

export function groupDomId(group) {
  const slug = String(group || 'all')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `group-${slug || 'item'}`;
}
