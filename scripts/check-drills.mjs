import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { renderPage } from '../src/render.js';
import {
  filterRows,
  mentionsCallbackWindow,
  reconcileText,
  sinceMiss,
  transferFailedGroups,
  transferFailedLine,
  unattributedNote,
} from '../src/format.js';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const data = JSON.parse(read('public/data/latest.json'));
const summary = data.summary;

assert.equal(summary.total_calls, 473);
assert.equal(summary.answered_calls, 393);
assert.equal(summary.answered_by_super + summary.answered_by_staff, 393);
assert.equal(summary.unanswered_callers, 74);
assert.equal(summary.not_called_back, 56);
assert.equal(summary.transfer_failed_callers, 75);
assert.equal(summary.transfer_failed_calls, 117);
assert.equal(data.not_called_back.length, 56);
assert.equal(
  Object.values(data.not_called_back_by_group).reduce((sum, n) => sum + n, 0),
  56
);
assert.equal(
  Object.values(summary.not_called_back_by_missed_type).reduce((sum, n) => sum + n, 0),
  56
);
for (const [group, count] of Object.entries(data.not_called_back_by_group)) {
  assert.equal(filterRows(data.not_called_back, group).length, count, group);
}
for (const [type, count] of Object.entries(summary.not_called_back_by_missed_type)) {
  assert.equal(filterRows(data.not_called_back, '', type).length, count, type);
}
assert.equal(filterRows(data.not_called_back, 'Leasing', 'Went to voicemail').length > 0, true);

const reconcile = reconcileText(summary);
assert.match(reconcile, /74 callers we didn't answer/);
assert.equal(mentionsCallbackWindow(reconcile), false);
assert.doesNotMatch(reconcile, /never called/i);
assert.match(transferFailedLine(summary), /incl\. 75 callers whose transfer from Super went unanswered/);
assert.deepEqual(transferFailedGroups(data)[0], ['Leasing', 102]);
assert.match(unattributedNote(data), /26 attempts couldn't be tied to a caller/);
for (const row of data.not_called_back) {
  assert.equal(mentionsCallbackWindow(sinceMiss(row)), false, row.phone);
}

const html = renderPage(data, { list: 'missed', group: '', type: '' });
assert.match(html, /Calls received[\s\S]*?>473</);
assert.match(html, /Calls answered[\s\S]*?>393</);
assert.match(html, /Super 367 · Staff 26/);
assert.match(html, /Voicemail is not counted as answered/);
assert.match(html, /Callers not answered[\s\S]*?>74</);
assert.match(html, /People, not calls/);
assert.match(html, /incl\. 75 callers whose transfer from Super went unanswered/);
assert.match(html, /Not called back yet[\s\S]*?>56</);
assert.match(html, /Super transfer not answered[\s\S]*?<strong>35<\/strong>/);
assert.match(html, /Went to voicemail[\s\S]*?<strong>11<\/strong>/);
assert.match(html, /Rang, not answered[\s\S]*?<strong>10<\/strong>/);
assert.match(html, /What happened/);
assert.match(html, /Brenden Walker/);
assert.match(html, /Super transfers nobody picked up/);
assert.match(html, />117</);
assert.match(html, /26 attempts couldn't be tied to a caller/);
assert.equal(mentionsCallbackWindow(html), false);
assert.doesNotMatch(html, /never called/i);
assert.doesNotMatch(html, /Open loops|Ultatel stale|Cleaned|IN no answer|Needs human help|AI talk time/i);
assert.equal((html.match(/<tr>/g) || []).length, 57);

const leasing = renderPage(data, { list: 'missed', group: 'Leasing', type: '' });
assert.match(leasing, />42 callers</);
assert.equal((leasing.match(/<tr>/g) || []).length, 43);

const typed = renderPage(data, { list: 'missed', group: '', type: 'Went to voicemail' });
assert.equal((typed.match(/<tr>/g) || []).length, 12);
assert.doesNotMatch(typed, /Brenden Walker/);

const next = structuredClone(data);
next.summary.called_back = 22;
next.summary.not_called_back = 52;
next.summary.definitions.reconcile += ' (36 of those never called this week)';
next.called_back = [
  {
    phone: '(111) 222-3333',
    caller_name: 'Ada Lovelace',
    callback_ct: 'Mon Nov 2, 2026 1:00 PM CT',
    call_group: 'Leasing',
    missed_type: 'Rang, not answered',
    last_missed_ct: 'Mon Nov 2, 2026 9:00 AM CT',
    missed_calls: 1,
    waiting: '4h',
  },
];
const calledHtml = renderPage(next, { list: 'called', group: '', type: '' });
assert.match(calledHtml, /Called back[\s\S]*?>22</);
assert.match(calledHtml, /Not called back yet[\s\S]*?>52</);
assert.match(calledHtml, /Ada Lovelace/);
assert.match(calledHtml, /Mon Nov 2, 2026 1:00 PM CT/);
assert.doesNotMatch(calledHtml, /never called/i);
assert.equal(mentionsCallbackWindow(reconcileText(next.summary)), false);
assert.doesNotMatch(reconcileText(next.summary), /never called/i);

const evil = structuredClone(data);
evil.not_called_back[0].caller_name = '<img src=x onerror=alert(1)>';
const escaped = renderPage(evil, {});
assert.equal(escaped.includes('<img'), false);
assert.match(escaped, /&lt;img src=x onerror=alert\(1\)&gt;/);

for (const file of ['src/main.js', 'src/render.js', 'src/format.js', 'src/style.css']) {
  const source = read(file);
  assert.doesNotMatch(source, /chart\.js|super_open_loops|ultatel_inbound|miss_by_extension|stale-note/);
}

assert.ok(read('public/data/transfer_failed.csv').includes('What happened') || read('public/data/transfer_failed.csv').length > 0);

console.log('owner page matches the Nov 3d pack');
