/** Minimal CSV parser that handles quoted fields. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      if (c === '\r') i++;
    } else if (c === '\r') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

export function rowsToObjects(rows, headerIndex = 0) {
  const headers = rows[headerIndex].map((h) => h.trim());
  return rows.slice(headerIndex + 1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim();
    });
    return obj;
  });
}

/** Find first row whose first cell equals `label` (exact or startsWith). */
export function findHeaderRow(rows, label, { startsWith = false } = {}) {
  return rows.findIndex((r) => {
    const cell = (r[0] || '').trim();
    return startsWith ? cell.startsWith(label) : cell === label;
  });
}
