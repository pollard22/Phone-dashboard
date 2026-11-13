/**
 * Shared "Mark resolved" store for the Pollard call hygiene page.
 * Bind this script to a Google Sheet (Extensions → Apps Script).
 * The web app appends one row per save or undo. Reads return the latest
 * row for each caller in the requested pack.
 *
 * Sheet tab: resolutions
 * Columns: pack_id, row_key, resolved, note, resolved_by, resolved_at_iso
 */
var SHEET_NAME = 'resolutions';
var HEADERS = ['pack_id', 'row_key', 'resolved', 'note', 'resolved_by', 'resolved_at_iso'];
var NOTE_MAX = 500;
var NAME_MAX = 80;
var KEY_MAX = 300;

function doGet(e) {
  e = e || {};
  var params = e.parameter || {};
  var packId = cleanKey_(params.pack_id);
  var callback = String(params.callback || '').trim();
  var payload = packId
    ? { resolutions: latestForPack_(packId) }
    : { ok: false, error: 'pack_id is required' };
  return respond_(payload, callback);
}

function doPost(e) {
  e = e || {};
  var data;
  try {
    data = JSON.parse((e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return respond_({ ok: false, error: 'Invalid JSON' });
  }
  if (!data || typeof data !== 'object') return respond_({ ok: false, error: 'Invalid JSON' });

  var packId = cleanKey_(data.pack_id);
  var rowKey = cleanKey_(data.row_key);
  if (!packId || !rowKey) return respond_({ ok: false, error: 'pack_id and row_key are required' });
  if (typeof data.resolved !== 'boolean') return respond_({ ok: false, error: 'resolved must be true or false' });

  var note = String(data.note == null ? '' : data.note).replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  var resolvedBy = String(data.resolved_by == null ? '' : data.resolved_by).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  var when = new Date().toISOString();

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getSheet_().appendRow([packId, rowKey, data.resolved, note, resolvedBy, when]);
  } finally {
    lock.releaseLock();
  }
  return respond_({ ok: true, resolved_at_iso: when });
}

function latestForPack_(packId) {
  var values = getSheet_().getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0].map(function (cell) { return String(cell || '').trim(); });
  var col = {};
  HEADERS.forEach(function (name) { col[name] = header.indexOf(name); });
  if (col.pack_id < 0 || col.row_key < 0) return [];

  var latest = {};
  var order = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[col.pack_id] || '').trim() !== packId) continue;
    var key = String(row[col.row_key] || '').trim();
    if (!key) continue;
    if (!Object.prototype.hasOwnProperty.call(latest, key)) order.push(key);
    latest[key] = {
      row_key: key,
      resolved: cellTrue_(col.resolved < 0 ? false : row[col.resolved]),
      note: col.note < 0 ? '' : String(row[col.note] || ''),
      resolved_by: col.resolved_by < 0 ? '' : String(row[col.resolved_by] || ''),
      resolved_at_iso: col.resolved_at_iso < 0 ? '' : iso_(row[col.resolved_at_iso]),
    };
  }
  return order.map(function (key) { return latest[key]; });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the resolutions spreadsheet.');
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 3).setNote('TRUE or FALSE');
  }
  return sheet;
}

function cleanKey_(value) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim();
  if (!text || text.length > KEY_MAX) return '';
  return text;
}

function cellTrue_(value) {
  return value === true || String(value).trim().toUpperCase() === 'TRUE';
}

function iso_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value || '').trim();
}

function respond_(payload, callback) {
  var body = JSON.stringify(payload);
  if (callback && /^[A-Za-z_$][\w.$]{0,80}$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
