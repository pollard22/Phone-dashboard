import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { renderPage } from '../src/render.js';
import {
  callbackText,
  filterRows,
  hasMissedType,
  transferFailedGroups,
  transferFailedLine,
} from '../src/format.js';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const data = JSON.parse(read('public/data/latest.json'));
const summary = data.summary;

assert.equal(summary.total_calls, 474);
assert.equal(summary.answered_calls, 451);
assert.equal(summary.answered_by_super + summary.answered_by_staff, summary.answered_calls);
assert.equal(summary.unanswered_callers, 11);
assert.equal(summary.not_called_back, 10);
assert.equal(data.not_called_back.length, summary.not_called_back);
assert.equal(
  Object.values(data.not_called_back_by_group).reduce((sum, n) => sum + n, 0),
  summary.not_called_back
);
assert.deepEqual(data.not_called_back_by_group, {
  Leasing: 5,
  'Main line (Super AI receptionist)': 3,
  'Direct line — Junior Ruiz (112)': 1,
  'Direct line — Rania Lombera (107)': 1,
});
for (const [group, count] of Object.entries(data.not_called_back_by_group)) {
  assert.equal(filterRows(data.not_called_back, group).length, count, group);
}
assert.match(summary.window_label, /Central Time/);
assert.equal(summary.transfer_failed_calls, undefined);
assert.equal(summary.transfer_failed_callers, undefined);
assert.equal(transferFailedLine(summary), '');
assert.deepEqual(transferFailedGroups(data), []);
assert.equal(hasMissedType(data.not_called_back), false);

const never = data.not_called_back.filter((row) => callbackText(row) === 'Never called');
const late = data.not_called_back.filter((row) => callbackText(row) !== 'Never called' && callbackText(row) !== 'None yet');
const noneYet = data.not_called_back.filter((row) => callbackText(row) === 'None yet');
assert.equal(never.length, summary.never_called);
assert.equal(late.length, summary.called_back_late);
assert.equal(noneYet.length, summary.not_called_back - summary.never_called - summary.called_back_late);

const closed = renderPage(data, { open: false, group: '' });
assert.match(closed, /Oct 27–Nov 2, 2026 \(Central Time\)/);
assert.match(closed, /Calls received[\s\S]*?>474</);
assert.match(closed, /Calls answered[\s\S]*?>451</);
assert.match(closed, /Super 367 · Staff 84/);
assert.match(closed, /Callers not answered[\s\S]*?>11</);
assert.match(closed, /People, not calls/);
assert.match(closed, /Not called back yet[\s\S]*?>10</);
assert.match(closed, /5 never called · 1 called back late · 2 still within 24h/);
assert.match(closed, /total_calls = answered_calls \+ missed_calls/);
assert.match(closed, /hidden/);
assert.doesNotMatch(closed, /transfer from Super/);
assert.doesNotMatch(closed, /Open loops|Ultatel stale|Cleaned|IN no answer|Needs human help|AI talk time/i);

const open = renderPage(data, { open: true, group: '' });
for (const row of data.not_called_back) {
  assert.match(open, new RegExp(row.phone.replace(/[()]/g, '\\$&')));
  assert.match(open, new RegExp(row.call_group.replace(/[()]/g, '\\$&')));
}
assert.doesNotMatch(open, /What happened/);
assert.match(open, /Fri Oct 30, 2026 12:12 PM CT/);
assert.match(open, /Never called/);
assert.match(open, /None yet/);

const leasing = renderPage(data, { open: true, group: 'Leasing' });
assert.match(leasing, /5 callers in Leasing/);
assert.match(leasing, /\(636\) 221-9737/);
assert.doesNotMatch(leasing, /\(631\) 552-1318/);
assert.doesNotMatch(leasing, /\(636\) 443-9354/);

const withTransfers = structuredClone(data);
withTransfers.summary.transfer_failed_callers = 4;
withTransfers.summary.transfer_failed_calls = 6;
withTransfers.summary.transfer_failed_by_group = { 'Test Group': 9 };
withTransfers.not_called_back[0].missed_type = 'Super transfer not answered';
withTransfers.not_called_back[1].missed_type = 'Rang, not answered';
const transferHtml = renderPage(withTransfers, { open: true, group: '' });
assert.match(transferHtml, /incl\. 4 whose transfer from Super went unanswered \(6 calls\)/);
assert.match(transferHtml, /class="chip static">Test Group <strong>9<\/strong>/);
assert.match(transferHtml, /What happened/);
assert.match(transferHtml, /Super transfer not answered/);
assert.match(transferHtml, /Rang, not answered/);
assert.equal(transferFailedLine({ transfer_failed_callers: 4 }), 'incl. 4 whose transfer from Super went unanswered');
assert.equal(transferFailedLine({ transfer_failed_calls: 6 }), 'incl. 6 calls whose transfer from Super went unanswered');
assert.equal(transferFailedLine({ transfer_failed_callers: 0, transfer_failed_calls: 0 }), 'incl. 0 whose transfer from Super went unanswered (0 calls)');
assert.deepEqual(transferFailedGroups({ transfer_failed_by_group: { Leasing: 2 } }), [['Leasing', 2]]);
assert.equal(hasMissedType(data.not_called_back), false);

const evil = structuredClone(data);
evil.not_called_back[0].caller_name = '<img src=x onerror=alert(1)>';
const escaped = renderPage(evil, { open: true, group: '' });
assert.equal(escaped.includes('<img'), false);
assert.match(escaped, /&lt;img src=x onerror=alert\(1\)&gt;/);

for (const file of ['src/main.js', 'src/render.js', 'src/format.js', 'src/style.css']) {
  const source = read(file);
  assert.doesNotMatch(source, /chart\.js|super_open_loops|ultatel_inbound|open_loops|miss_by_extension|stale-note/);
}

for (const file of [
  'public/data/not_called_back.csv',
  'public/data/latest.json',
  'public/data/open_loops_super.csv',
  'public/data/callback_hygiene_ultatel.csv',
  'public/data/Missed_ownership_A_no_callback.csv',
  'public/data/Missed_ownership_B_called_back.csv',
]) {
  assert.ok(read(file).length > 0, file);
}

console.log('owner page matches the Nov 3 pack');
