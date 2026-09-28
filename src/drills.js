/**
 * Drill catalog. Every row list comes from the loaded pack.
 * Aggregates with no call-level file return an honest unavailable panel
 * plus the overview summary lines that actually record the number.
 */

export function overviewMetric(overviewRows, name) {
  const hit = (overviewRows || []).find((r) => r && r[0] === name);
  if (!hit) return null;
  return { metric: String(hit[0]), count: hit[1], note: hit[2] || '' };
}

export function filterRows(rows, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
}

function yesNo(row, key) {
  return String(row[key] || '').toLowerCase() === 'yes';
}

export function dialedOtherRows(pack) {
  const never = new Set(pack.callbackNever.map((r) => r.Caller));
  return pack.callbackAction.filter((r) => r.Caller && !never.has(r.Caller));
}

function summary(overviewRows, names) {
  return names.map((name) => overviewMetric(overviewRows, name)).filter(Boolean);
}

function windowShort(pack) {
  const label = String(pack.data?.meta?.window_label || '');
  const cut = label.indexOf(' (');
  return cut > 0 ? label.slice(0, cut) : label;
}

/**
 * @param {string} id
 * @param {object} pack parsed data pack
 * @param {{ selfNumber?: string }} [context]
 */
export function buildDrill(id, pack, context = {}) {
  const k = pack.data?.kpis || {};
  const overview = pack.data?.overview_rows || [];
  const missed = [...pack.missedA, ...pack.missedB];
  const overlap = pack.openLoops.filter((r) => yesNo(r, 'In Ultatel no-callback list?'));
  const superOnly = pack.openLoops.filter((r) => !yesNo(r, 'In Ultatel no-callback list?'));
  const other = dialedOtherRows(pack);
  const earlier = Number(k.dialed_earlier_only);
  const later = Number(k.dialed_later_after_24h);
  const otherAligned = other.length === earlier + later;

  switch (id) {
    case 'in-bound':
      return {
        id,
        title: 'IN-Bound',
        crumb: 'Ultatel volume',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (Overview.csv)',
        headline: k.ultatel_inbound,
        unavailable: true,
        reason:
          'The full Ultatel Call Details leg list is not in this export. IN-Bound is an aggregate. The recorded split is answered plus NO ANSWER. The only call-level rows shipped are the cleaned NO ANSWER events.',
        summary: summary(overview, [
          'Ultatel inbound total (IN-Bound)',
          'Ultatel inbound ANSWERED',
          'Ultatel inbound NO ANSWER',
          'Ultatel inbound NO ANSWER after cleanup',
        ]),
        related: [{ id: 'cleaned-na', label: `View ${k.ultatel_inbound_no_answer_cleaned} cleaned NO ANSWER events` }],
      };

    case 'in-answered':
      return {
        id,
        title: 'IN answered',
        crumb: 'Ultatel volume',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (Overview.csv)',
        headline: k.ultatel_inbound_answered,
        unavailable: true,
        reason:
          'Answered inbound legs are not in this export. The count is the Type×Outcome aggregate only.',
        summary: summary(overview, ['Ultatel inbound ANSWERED']),
      };

    case 'in-no-answer':
      return {
        id,
        title: 'IN no answer',
        crumb: 'Ultatel volume',
        route: 'missed',
        source: 'Missed_ownership_A_no_callback.csv + Missed_ownership_B_called_back.csv',
        headline: k.ultatel_inbound_no_answer,
        note: `Headline ${k.ultatel_inbound_no_answer} counts every inbound NO ANSWER leg, including company/self From numbers. This export lists the ${k.ultatel_inbound_no_answer_cleaned} cleaned events below (${pack.missedA.length} no-callback + ${pack.missedB.length} called back). The excluded legs are a single total in exclusions_method.csv, not call-by-call rows.`,
        warnMismatch: false,
        table: 'missed',
        rows: missed,
        summary: summary(overview, [
          'Ultatel inbound NO ANSWER',
          'Ultatel inbound NO ANSWER after cleanup',
        ]),
        related: [{ id: 'self-excluded', label: 'Excluded self/company From totals' }],
        jumps: [
          { label: 'Show all in Missed ownership', kind: 'missed', status: 'all' },
          { label: 'No-callback events only', kind: 'missed', status: 'no-callback' },
          { label: 'Called back within 24h', kind: 'missed', status: 'called-back' },
        ],
      };

    case 'cleaned-na':
      return {
        id,
        title: 'Cleaned inbound NO ANSWER',
        crumb: 'Missed ownership',
        route: 'missed',
        source: 'Missed_ownership_A_no_callback.csv + Missed_ownership_B_called_back.csv',
        headline: k.ultatel_inbound_no_answer_cleaned,
        note: 'One row per inbound NO ANSWER after company/self From numbers are removed. Same events as Missed ownership.',
        table: 'missed',
        rows: missed,
        jumps: [
          { label: 'Show in Missed ownership', kind: 'missed', status: 'all' },
          { label: 'No-callback events only', kind: 'missed', status: 'no-callback' },
          { label: 'Called back within 24h', kind: 'missed', status: 'called-back' },
        ],
      };

    case 'no-callback':
      return {
        id,
        title: 'No-callback (24h)',
        crumb: 'Callback hygiene',
        route: 'callback',
        source: 'callback_hygiene_ultatel.csv → Action list',
        headline: k.no_callback_24h_unique,
        note: 'Unique callers with at least one cleaned inbound NO ANSWER and no company OUT-Bound within 24 hours. One row per caller, not per attempt.',
        table: 'callback',
        rows: pack.callbackAction,
        jumps: [{ label: 'Show action list on Callback hygiene', kind: 'callback', anchor: 'cb-action' }],
      };

    case 'never-dialed':
      return {
        id,
        title: 'Never dialed',
        crumb: 'Callback hygiene',
        route: 'callback',
        source: 'callback_hygiene_ultatel.csv → Never dialed (verified)',
        headline: k.never_company_dialed,
        note: `Stricter subset of the no-callback list: zero company OUT-Bound anywhere in the ${windowShort(pack) || 'this'} Ultatel export.`,
        table: 'never',
        rows: pack.callbackNever,
        jumps: [{ label: 'Show on Callback hygiene', kind: 'callback', anchor: 'cb-never' }],
      };

    case 'dialed-earlier':
      return {
        id,
        title: 'Dialed earlier only',
        crumb: 'Callback hygiene',
        route: 'callback',
        source: 'callback_hygiene_ultatel.csv → verification summary',
        headline: k.dialed_earlier_only,
        unavailable: true,
        reason: `Per-caller detail is not in this export. The verification summary records ${k.dialed_earlier_only} callers who were dialed earlier in the week but not within 24 hours of the miss, and the action list does not tag which callers those are.`,
        summary: summary(overview, ['Dialed earlier in week only (not within 24h)']),
        related: [
          {
            id: 'dialed-other',
            label: otherAligned
              ? `View the ${other.length} untagged callers (${earlier} earlier + ${later} later)`
              : `View action-list callers not in never-dialed (${other.length})`,
          },
        ],
      };

    case 'dialed-later':
      return {
        id,
        title: 'Dialed after 24h',
        crumb: 'Callback hygiene',
        route: 'callback',
        source: 'callback_hygiene_ultatel.csv → verification summary',
        headline: k.dialed_later_after_24h,
        unavailable: true,
        reason: `Per-caller detail is not in this export. The verification summary records ${k.dialed_later_after_24h} callers dialed later than 24 hours after the last miss, and the action list does not tag which callers those are.`,
        summary: summary(overview, ['Dialed later than 24h after last miss']),
        related: [
          {
            id: 'dialed-other',
            label: otherAligned
              ? `View the ${other.length} untagged callers (${earlier} earlier + ${later} later)`
              : `View action-list callers not in never-dialed (${other.length})`,
          },
        ],
      };

    case 'dialed-other': {
      const note = otherAligned
        ? `These ${other.length} callers are on the action list and are not in the never-dialed set. The export splits that remainder into ${earlier} dialed-earlier-only and ${later} dialed-later-than-24h, without a per-caller tag. This table is the union, not either bucket.`
        : `These ${other.length} callers are on the action list and are not in the never-dialed set. Dialed-earlier (${earlier}) plus dialed-later (${later}) is ${earlier + later}, which does not match this set difference, so the rows are not labeled as either bucket.`;
      return {
        id,
        title: 'Dialed at another time',
        crumb: 'Callback hygiene',
        route: 'callback',
        source: 'callback_hygiene_ultatel.csv → Action list minus Never dialed',
        headline: other.length,
        note,
        warnMismatch: false,
        table: 'callback',
        rows: other,
      };
    }

    case 'super-inbound':
      return {
        id,
        title: 'AI inbound',
        crumb: 'HireSuper',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (HireSuper Reporting)',
        headline: k.super_ai_inbound,
        unavailable: true,
        reason:
          'HireSuper Reporting call rows are not in this export. AI inbound is the Calls-tab aggregate for Sep 20–26, and it is not 1:1 with Ultatel CDR legs.',
        summary: summary(overview, ['Super Reporting inbound calls (AI answered)', 'Super vs Ultatel volume note']),
      };

    case 'super-transferred':
      return {
        id,
        title: 'Transferred',
        crumb: 'HireSuper',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (HireSuper Reporting)',
        headline: k.super_transferred,
        unavailable: true,
        reason: 'Individual transferred calls are not in this export. The count is the HireSuper Reporting aggregate.',
        summary: summary(overview, ['Super Reporting calls transferred']),
      };

    case 'super-help':
      return {
        id,
        title: 'Needs human help',
        crumb: 'HireSuper',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (HireSuper Reporting)',
        headline: k.super_needs_human_help,
        unavailable: true,
        reason:
          'Needs-human-help calls are not in this export as individual rows. The file records the count and the percent of AI inbound only.',
        summary: summary(overview, ['Super Reporting needs human help (calls)']),
      };

    case 'super-talk':
      return {
        id,
        title: 'AI talk time',
        crumb: 'HireSuper',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (HireSuper Reporting)',
        headline: k.super_ai_talk,
        unavailable: true,
        reason: 'Talk time is a reporting total, not a list of calls. Per-call durations are not in this export.',
        summary: summary(overview, ['Super Reporting AI talk time']),
      };

    case 'super-avg':
      return {
        id,
        title: 'Average call length',
        crumb: 'HireSuper',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (HireSuper Reporting)',
        headline: k.super_avg_talk,
        unavailable: true,
        reason: 'Average length is a reporting total. Per-call durations are not in this export.',
        summary: summary(overview, ['Super Reporting avg call length']),
      };

    case 'super-activity':
      return {
        id,
        title: 'Actions / SMS',
        crumb: 'HireSuper',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (HireSuper Reporting)',
        headline: `${k.super_actions} / ${k.super_sms_sessions}`,
        unavailable: true,
        reason:
          'Automated actions and SMS sessions are not in this export as individual rows. Both figures are reporting totals.',
        summary: summary(overview, [
          'Super Reporting actions (automated)',
          'Super Reporting SMS message sessions',
        ]),
        related: [
          { id: 'super-actions', label: `${k.super_actions} actions` },
          { id: 'super-sms', label: `${k.super_sms_sessions} SMS sessions` },
        ],
      };

    case 'super-actions':
      return {
        id,
        title: 'Automated actions',
        crumb: 'HireSuper',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (HireSuper Reporting)',
        headline: k.super_actions,
        unavailable: true,
        reason:
          'Per-action rows are not in this export. The source note records the composition (email and call transfers) as text on the summary line, not as separate records.',
        summary: summary(overview, ['Super Reporting actions (automated)']),
      };

    case 'super-sms':
      return {
        id,
        title: 'SMS sessions',
        crumb: 'HireSuper',
        route: 'overview',
        source: 'latest.json → kpis, overview_rows (HireSuper Reporting)',
        headline: k.super_sms_sessions,
        unavailable: true,
        reason:
          'SMS sessions are not in this export as individual rows. The source note mentions Needs Human Help (SMS) only as text on the summary line.',
        summary: summary(overview, ['Super Reporting SMS message sessions']),
      };

    case 'open-loops':
      return {
        id,
        title: 'Open loops',
        crumb: 'Open loops (Super)',
        route: 'open-loops',
        source: 'open_loops_super.csv',
        headline: k.super_open_loops,
        note: 'Unresolved Action Required after a failed transfer or a message taken. Source: HireSuper Activity.',
        table: 'loops',
        rows: pack.openLoops,
        jumps: [{ label: 'Show all on Open loops', kind: 'loops', filter: 'all' }],
      };

    case 'open-overlap':
      return {
        id,
        title: 'Ultatel overlap',
        crumb: 'Open loops (Super)',
        route: 'open-loops',
        source: 'open_loops_super.csv → In Ultatel no-callback list? = Yes',
        headline: k.super_ultatel_overlap,
        note: 'Open loops whose caller is also on the Ultatel 24h no-callback list.',
        table: 'loops',
        rows: overlap,
        jumps: [{ label: 'Filter Open loops to overlap', kind: 'loops', filter: 'overlap' }],
      };

    case 'open-super-only':
      return {
        id,
        title: 'Super-only open loops',
        crumb: 'Open loops (Super)',
        route: 'open-loops',
        source: 'open_loops_super.csv → In Ultatel no-callback list? = No',
        headline: k.super_only_open_loops,
        note: 'Open loops with no matching Ultatel no-callback caller. A No here does not mean the Super loop is closed.',
        table: 'loops',
        rows: superOnly,
        jumps: [{ label: 'Filter Open loops to Super-only', kind: 'loops', filter: 'super-only' }],
      };

    case 'self-excluded':
      return selfExcludedDrill(pack, null);

    case 'self-events':
      return selfExcludedDrill(pack, context.selfNumber || '');

    default:
      return null;
  }
}

function selfExcludedDrill(pack, number) {
  const rows = pack.exclusions?.selfNumbers || [];
  const focused = number ? rows.filter((r) => r.number === number) : rows.filter((r) => Number(r.events) > 0);
  const headline = focused.reduce((sum, r) => sum + (Number(r.events) || 0), 0);
  const known = !number || focused.length > 0;
  if (!known) {
    return {
      id: 'self-events',
      title: number ? `Excluded events · ${number}` : 'Excluded self/company From',
      crumb: 'Method & exclusions',
      route: 'method',
      source: 'exclusions_method.csv',
      headline: '',
      unavailable: true,
      reason: `No exclusion row for ${number} is in this export.`,
    };
  }
  const single = focused.length === 1 ? focused[0] : null;
  const legs = single ? Number(single.events) || 0 : headline;
  return {
    id: number ? 'self-events' : 'self-excluded',
    title: single ? `Excluded From · ${single.number}` : 'Excluded self/company From',
    crumb: 'Method & exclusions',
    route: 'method',
    source: 'exclusions_method.csv',
    headline: legs,
    note:
      legs > 0
        ? 'This file records how many inbound NO ANSWER events were dropped for each From number. Those call legs are not listed individually.'
        : 'This exclusion row is in the file. It has no inbound NO ANSWER events in the window.',
    unavailable: legs > 0,
    reason:
      legs > 0
        ? `Detail not in this export: ${legs} inbound NO ANSWER leg${legs === 1 ? '' : 's'} were excluded and are not listed call by call. The total below is the row that produces the count.`
        : '',
    table: 'exclusion',
    rows: focused,
    warnMismatch: false,
  };
}
