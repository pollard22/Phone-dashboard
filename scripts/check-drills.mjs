import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { renderPage } from '../src/render.js';
import {
  filterRows,
  mentionsCallbackWindow,
  sinceMiss,
  superCallView,
  transferFailedGroups,
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
assert.equal(summary.called_back, 22);
assert.equal(summary.not_called_back, 52);
assert.equal(summary.never_called, 36);
assert.equal(summary.transfer_failed_callers, 75);
assert.equal(summary.transfer_failed_calls, 117);
assert.equal(data.not_called_back.length, 52);
assert.equal(data.called_back.length, 22);
assert.equal(
  Object.values(data.not_called_back_by_group).reduce((sum, n) => sum + n, 0),
  52
);
assert.equal(
  Object.values(summary.not_called_back_by_missed_type).reduce((sum, n) => sum + n, 0),
  52
);
for (const [group, count] of Object.entries(data.not_called_back_by_group)) {
  assert.equal(filterRows(data.not_called_back, group).length, count, group);
}
for (const [type, count] of Object.entries(summary.not_called_back_by_missed_type)) {
  assert.equal(filterRows(data.not_called_back, '', type).length, count, type);
}
assert.equal(filterRows(data.not_called_back, 'Leasing', 'Went to voicemail').length > 0, true);

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
assert.match(html, /Called back[\s\S]*?>22</);
assert.match(html, /Not called back yet[\s\S]*?>52</);
assert.match(html, /People, not calls/);
assert.doesNotMatch(html, /never called/i);
assert.doesNotMatch(html, /incl\. 75 callers whose transfer from Super went unanswered/);
assert.doesNotMatch(html, /class="reconcile"/);
assert.match(html, /Super transfer not answered[\s\S]*?<strong>33<\/strong>/);
assert.match(html, /Went to voicemail[\s\S]*?<strong>10<\/strong>/);
assert.match(html, /Rang, not answered[\s\S]*?<strong>9<\/strong>/);
assert.match(html, /What happened/);
assert.match(html, /Super call links open in Super and need you to be signed in\./);
assert.equal((html.match(/class="super-link"/g) || []).length, 21);
assert.equal((html.match(/View call ↗/g) || []).length, 21);
assert.match(html, /target="_blank" rel="noopener noreferrer"/);
assert.match(html, /Transfer to front desk/);
assert.equal((html.match(/Direct line — no Super call/g) || []).length, 5);
assert.equal(superCallView({ super_link: 'javascript:alert(1)', super_link_status: 'linked' }).kind, 'empty');
assert.match(html, /Brenden Walker/);
assert.match(html, /Super transfers nobody picked up/);
assert.match(html, />117</);
assert.match(html, /26 attempts couldn't be tied to a caller/);
assert.equal(mentionsCallbackWindow(html), false);
assert.doesNotMatch(html, /Open loops|Ultatel stale|Cleaned|IN no answer|Needs human help|AI talk time/i);
assert.equal((html.match(/<tr>/g) || []).length, 53);
assert.match(html, />8\.2h</);

const leasing = renderPage(data, { list: 'missed', group: 'Leasing', type: '' });
assert.match(leasing, />39 callers</);
assert.equal((leasing.match(/<tr>/g) || []).length, 40);

const typed = renderPage(data, { list: 'missed', group: '', type: 'Went to voicemail' });
assert.equal((typed.match(/<tr>/g) || []).length, 11);

const calledHtml = renderPage(data, { list: 'called', group: '', type: '' });
assert.match(calledHtml, /\(217\) 257-6622/);
assert.match(calledHtml, /Mon Nov 2, 2026 4:50 PM CT/);
assert.match(calledHtml, /<th scope="col">Called back<\/th>/);
assert.equal((calledHtml.match(/<tr>/g) || []).length, 23);
assert.equal(mentionsCallbackWindow(calledHtml), false);

const evil = structuredClone(data);
evil.not_called_back[0].caller_name = '<img src=x onerror=alert(1)>';
const escaped = renderPage(evil, {});
assert.equal(escaped.includes('<img'), false);
assert.match(escaped, /&lt;img src=x onerror=alert\(1\)&gt;/);

for (const file of ['src/main.js', 'src/render.js', 'src/format.js', 'src/style.css']) {
  const source = read(file);
  assert.doesNotMatch(source, /chart\.js|super_open_loops|ultatel_inbound|miss_by_extension|stale-note/);
}

assert.ok(read('public/data/called_back.csv').length > 0);
assert.ok(read('public/data/transfer_failed.csv').length > 0);

console.log('owner page matches the Nov 3e pack');
