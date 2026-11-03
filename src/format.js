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

/** True when copy is about a 24-hour callback window. The page does not show that rule. */
export function mentionsCallbackWindow(text) {
  return /called back late|under\s*24|(?:^|[^0-9])24\s*-?\s*h(?:ours?)?(?![a-z])/i.test(String(text ?? ''));
}

export function reconcileText(summary) {
  const text = summary?.definitions?.reconcile;
  if (!isPresent(text) || mentionsCallbackWindow(text)) return '';
  return String(text).trim();
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

/**
 * Called back when any company outbound happened after the last miss.
 * Otherwise the caller has not been called back yet.
 */
export function callbackStatus(row) {
  const when = String(row?.first_outbound_after_miss_ct ?? '').trim();
  if (when) return { status: 'Called back', when: mentionsCallbackWindow(when) ? '' : when };
  return { status: 'Not called back yet', when: '' };
}

export function sinceMiss(row) {
  const clock = String(row?.clock ?? '').trim();
  if (clock && !mentionsCallbackWindow(clock)) return clock;
  if (!isPresent(row?.hours_since_last_miss)) return '';
  const hours = String(row.hours_since_last_miss);
  return mentionsCallbackWindow(hours) ? '' : `${hours}h`;
}

const DEFINITION_TERMS = {
  total_calls: 'Calls received',
  answered_calls: 'Calls answered',
  unanswered_callers: 'Callers not answered',
  not_called_back: 'Not called back yet',
  reconcile: 'How these numbers fit',
  transfer_failed_calls: 'Transfers from Super not answered',
  transfer_failed_callers: 'Callers whose Super transfer was not answered',
};

function humanize(key) {
  const words = String(key).replace(/_/g, ' ').trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const HIDDEN_DEFINITION_KEYS = new Set(['never_called', 'called_back_late', 'not_called_back_under_24h']);

export function definitionEntries(definitions) {
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return [];
  return Object.entries(definitions)
    .filter(([key, text]) => isPresent(text) && !HIDDEN_DEFINITION_KEYS.has(key))
    .map(([key, text]) => ({
      key,
      term: DEFINITION_TERMS[key] || humanize(key),
      text: String(text).trim(),
    }))
    .filter((entry) => !mentionsCallbackWindow(entry.term) && !mentionsCallbackWindow(entry.text));
}

export function freshnessText(data) {
  const parts = [];
  const generated = String(data?.meta?.generated_at ?? '').trim();
  const end = String(data?.summary?.export_end_ct ?? '').trim();
  const source = String(data?.summary?.source ?? '').trim();
  if (generated && !mentionsCallbackWindow(generated)) parts.push(`Prepared ${generated}.`);
  if (end && !mentionsCallbackWindow(end)) parts.push(`Export through ${end}.`);
  if (source && !mentionsCallbackWindow(source)) parts.push(source.endsWith('.') ? source : `${source}.`);
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
