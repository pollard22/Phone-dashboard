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

function mentionsNeverCalled(text) {
  return /never called/i.test(String(text ?? ''));
}

/** Keep the reconcile sentence, dropping any clause that states a 24-hour rule. */
export function reconcileText(summary) {
  let text = String(summary?.definitions?.reconcile ?? '').trim();
  if (!isPresent(text)) return '';
  text = text.replace(/\s*\([^)]*24\s*-?\s*h[^)]*\)/gi, '');
  const parts = text.split(/(\s*[.;]\s*)/);
  let out = '';
  for (let i = 0; i < parts.length; i += 2) {
    const clause = parts[i] || '';
    const sep = parts[i + 1] || '';
    if (!clause.trim()) continue;
    if (mentionsCallbackWindow(clause)) continue;
    out += clause + sep;
  }
  out = out.replace(/\s+/g, ' ').replace(/[;,\s]+$/, '').trim();
  if (out && !/[.!?]$/.test(out)) out += '.';
  return out;
}

export function neverCalledLine(summary) {
  if (!isPresent(summary?.never_called)) return '';
  const label = String(summary?.labels?.never_called || 'Never called this week').trim();
  return `${summary.never_called} ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

export function voicemailNote(summary) {
  const text = String(summary?.definitions?.answered_calls ?? '');
  if (/voicemail/i.test(text) && /not counted as answered/i.test(text)) {
    return 'Voicemail is not counted as answered';
  }
  return '';
}

/**
 * One line under "Callers not answered". Empty when the export has neither field.
 * Callers are the people count; calls are included when that field is present too.
 */
export function transferFailedLine(summary) {
  if (isPresent(summary?.transfer_failed_callers)) {
    return `incl. ${summary.transfer_failed_callers} callers whose transfer from Super went unanswered`;
  }
  if (isPresent(summary?.transfer_failed_calls)) {
    return `incl. ${summary.transfer_failed_calls} calls whose transfer from Super went unanswered`;
  }
  return '';
}

function chipEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter(
    ([key, count]) => isPresent(key) && isPresent(count) && (typeof count === 'number' || typeof count === 'string')
  );
}

/** Group counts for transfers nobody picked up. First object that has entries wins. */
export function transferFailedGroups(data) {
  const candidates = [
    data?.summary?.transfer_failed_by_group,
    data?.transfer_failed_by_group,
    data?.super_transfers_unanswered?.failed_attempts_by_group,
    data?.super_transfers_unanswered?.by_group,
  ];
  for (const candidate of candidates) {
    const entries = chipEntries(candidate);
    if (entries.length) return entries;
  }
  return [];
}

export function missedTypeEntries(data) {
  const fromSummary = chipEntries(data?.summary?.not_called_back_by_missed_type);
  if (fromSummary.length) return fromSummary;
  return chipEntries(data?.not_called_back_by_missed_type);
}

export function unattributedNote(data) {
  const count = data?.super_transfers_unanswered?.unattributed_failed_attempts;
  if (!isPresent(count) || Number(count) === 0) return '';
  const noun = Number(count) === 1 ? 'attempt' : 'attempts';
  return `${count} ${noun} couldn't be tied to a caller.`;
}

export function showCalledBack(data) {
  return isPresent(data?.summary?.called_back) || (Array.isArray(data?.called_back) && data.called_back.length > 0);
}

export function calledBackValue(data) {
  if (isPresent(data?.summary?.called_back)) return data.summary.called_back;
  if (Array.isArray(data?.called_back)) return data.called_back.length;
  return null;
}

export function calledBackRows(data) {
  return Array.isArray(data?.called_back) ? data.called_back : [];
}

export function groupEntries(byGroup) {
  return chipEntries(byGroup);
}

export function filterRows(rows, group, type) {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((row) => {
    if (group && row?.call_group !== group) return false;
    if (type && row?.missed_type !== type) return false;
    return true;
  });
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

export function waitingText(row) {
  if (row && Object.prototype.hasOwnProperty(row, 'waiting')) {
    const waiting = String(row.waiting ?? '').trim();
    if (!waiting || mentionsCallbackWindow(waiting) || mentionsNeverCalled(waiting)) return '';
    return waiting;
  }
  const clock = sinceMiss(row);
  return mentionsNeverCalled(clock) ? '' : clock;
}

export function safeHttpUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.href;
  } catch {
    return '';
  }
}

/** Link, direct-line note, or empty. Empty covers "not found" and a blank status. */
export function superCallView(row) {
  const link = safeHttpUrl(row?.super_link);
  const title = String(row?.super_summary_title ?? '').trim();
  const text = String(row?.super_summary_text ?? '').trim();
  if (link) return { kind: 'link', link, title, text };
  if (String(row?.super_link_status ?? '').trim() === 'no Super call') return { kind: 'direct' };
  return { kind: 'empty' };
}

export function calledBackWhen(row) {
  const when = String(row?.callback_ct ?? row?.first_outbound_after_miss_ct ?? '').trim();
  if (!when || mentionsCallbackWindow(when)) return '';
  return when;
}

const DEFINITION_TERMS = {
  total_calls: 'Calls received',
  answered_calls: 'Calls answered',
  unanswered_callers: 'Callers not answered',
  called_back: 'Called back',
  not_called_back: 'Not called back yet',
  never_called: 'Never called this week',
  waiting: 'Waiting',
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
    .filter(
      (entry) =>
        entry.key !== 'reconcile' &&
        !mentionsCallbackWindow(entry.term) &&
        !mentionsCallbackWindow(entry.text) &&
        !mentionsNeverCalled(entry.term) &&
        !mentionsNeverCalled(entry.text)
    );
}

export function freshnessText(data) {
  const parts = [];
  const generated = String(data?.meta?.generated_at ?? '').trim();
  const end = String(data?.summary?.export_end_ct ?? '').trim();
  const source = String(data?.summary?.source ?? '').trim();
  if (generated && !mentionsCallbackWindow(generated)) parts.push(`Prepared ${generated}.`);
  if (end && !mentionsCallbackWindow(end)) parts.push(`Export through ${end}.`);
  const sourceSentences = source
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !mentionsCallbackWindow(sentence) && !/open[- ]loop/i.test(sentence));
  if (sourceSentences.length) {
    const joined = sourceSentences.join(' ');
    parts.push(joined.endsWith('.') ? joined : `${joined}.`);
  }
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
