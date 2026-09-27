import { parseCsv, rowsToObjects, findHeaderRow } from './csv.js';

export function parseExclusions(rows) {
  const result = { selfNumbers: [], definitions: [], notes: [], caveats: [], method: [] };
  let mode = null;
  for (const r of rows) {
    const c0 = (r[0] || '').trim();
    const c1 = (r[1] || '').trim();
    const c2 = (r[2] || '').trim();
    if (!c0 && !c1) continue;
    if (c0 === 'Self-numbers / company From exclusions') {
      mode = 'self-header';
      continue;
    }
    if (c0 === 'Number' && mode === 'self-header') {
      mode = 'self';
      continue;
    }
    if (c0 === 'Key numbering notes') {
      mode = 'notes';
      continue;
    }
    if (c0 === 'Flags & definitions') {
      mode = 'def-header';
      continue;
    }
    if (c0 === 'Term' && mode === 'def-header') {
      mode = 'def';
      continue;
    }
    if (c0.startsWith('24h callback join method')) {
      mode = 'method';
      continue;
    }
    if (c0.startsWith('Super vs Ultatel')) {
      mode = 'method';
      continue;
    }
    if (c0.startsWith('Verification caveats')) {
      mode = 'caveats';
      continue;
    }
    if (mode === 'self' && c0.startsWith('(')) {
      result.selfNumbers.push({ number: c0, why: c1, events: c2 });
    } else if (mode === 'notes' && c0) {
      result.notes.push({ key: c0, value: c1 });
    } else if (mode === 'def' && c0) {
      result.definitions.push({ term: c0, meaning: c1 });
    } else if (mode === 'method' && c0) {
      result.method.push(c0);
    } else if (mode === 'caveats') {
      const text = c0.replace(/^•\s*/, '').trim();
      if (text) result.caveats.push(text);
    }
  }
  return result;
}

/** Action list + never-dialed section from callback_hygiene_ultatel.csv. */
export function parseCallbackCsv(text) {
  const cbRows = parseCsv(text);
  const actionHeader = findHeaderRow(cbRows, 'Priority');
  let neverIdx = -1;
  for (let i = actionHeader + 1; i < cbRows.length; i++) {
    if ((cbRows[i][0] || '').trim() === 'Caller') {
      neverIdx = i;
      break;
    }
  }
  const actionEnd = neverIdx > 0 ? neverIdx - 1 : cbRows.length;
  let actionSliceEnd = actionEnd;
  while (actionSliceEnd > actionHeader + 1 && !(cbRows[actionSliceEnd - 1]?.[0] || '').trim()) {
    actionSliceEnd--;
  }
  const callbackAction =
    actionHeader >= 0
      ? rowsToObjects(cbRows.slice(0, actionSliceEnd), actionHeader).filter(
          (r) => r.Priority && /^\d+$/.test(r.Priority)
        )
      : [];
  const callbackNever =
    neverIdx >= 0
      ? rowsToObjects(cbRows, neverIdx).filter((r) => r.Caller && r.Caller.startsWith('('))
      : [];
  return { callbackAction, callbackNever };
}

export function parsePack({ jsonText, aText, bText, olText, cbText, exText }) {
  const data = JSON.parse(jsonText);
  const missedA = rowsToObjects(parseCsv(aText), 0).map((r) => ({ ...r, _status: 'no-callback' }));
  const missedB = rowsToObjects(parseCsv(bText), 0).map((r) => ({ ...r, _status: 'called-back' }));

  const olRows = parseCsv(olText);
  const olHeader = findHeaderRow(olRows, 'Caller');
  const openLoops = olHeader >= 0 ? rowsToObjects(olRows, olHeader) : [];

  const { callbackAction, callbackNever } = parseCallbackCsv(cbText);
  const exclusions = parseExclusions(parseCsv(exText));

  return { data, missedA, missedB, openLoops, callbackAction, callbackNever, exclusions };
}
