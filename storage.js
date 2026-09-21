// Load / save / migrate / import / export.
// Functions take a `storage` argument (defaults to localStorage) so they can be tested in Node.

import { isDateStr } from './logic.js';

export const STORAGE_KEY = 'brushtracker:data';
export const CURRENT_SCHEMA = 1;

// migrations[n] upgrades data from schema n to n + 1.
// Always spread the old object so unknown fields survive.
const migrations = {
  // 1: (data) => ({ ...data, schemaVersion: 2, events: data.events.map((e) => ({ ...e })) }),
};

export function emptyData() {
  return { schemaVersion: CURRENT_SCHEMA, events: [] };
}

export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Data is not an object.');
  let d = { ...data };
  if (d.schemaVersion == null) d.schemaVersion = 1;
  if (!Number.isInteger(d.schemaVersion)) throw new Error(`Unknown schemaVersion: ${d.schemaVersion}`);
  if (d.schemaVersion > CURRENT_SCHEMA) {
    throw new Error(`Data is from a newer version of the app (schema ${d.schemaVersion}). Update the app before using it.`);
  }
  while (d.schemaVersion < CURRENT_SCHEMA) {
    const step = migrations[d.schemaVersion];
    if (!step) throw new Error(`No migration from schema ${d.schemaVersion}.`);
    d = step(d);
  }
  if (!Array.isArray(d.events)) throw new Error('Data has no events list.');
  return d;
}

// Returns { ok: true, data, migrated } or { ok: false, error, raw }.
// On failure the caller must NOT save anything, so the raw data stays intact.
export function load(storage = globalThis.localStorage) {
  let raw = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { ok: true, data: emptyData(), migrated: false };
    const parsed = JSON.parse(raw);
    const data = migrate(parsed);
    return { ok: true, data, migrated: data.schemaVersion !== parsed.schemaVersion };
  } catch (err) {
    return { ok: false, error: err.message || String(err), raw };
  }
}

export function save(data, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// ---- Import / export ----

export function exportFilename(today) {
  return `brushtracker-backup-${today}.json`;
}

export function serialize(data) {
  return JSON.stringify(data, null, 2);
}

const TYPES = new Set(['brush', 'floss', 'miss']);

export function validateEvent(e) {
  if (!e || typeof e !== 'object') return 'not an object';
  if (typeof e.id !== 'string' || !e.id) return 'missing id';
  if (!TYPES.has(e.type)) return `unknown type "${e.type}"`;
  if (!isDateStr(e.date)) return `bad date "${e.date}"`;
  if (e.type === 'brush' && e.slot !== 'morning' && e.slot !== 'night') return `bad slot "${e.slot}"`;
  return null;
}

// Returns { ok: true, data, summary: { count, first, last } } or { ok: false, error }.
export function parseImport(text) {
  let data;
  try {
    data = migrate(JSON.parse(text));
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
  for (const [i, e] of data.events.entries()) {
    const problem = validateEvent(e);
    if (problem) return { ok: false, error: `Event ${i + 1}: ${problem}.` };
  }
  const dates = data.events.map((e) => e.date).sort();
  return { ok: true, data, summary: { count: data.events.length, first: dates[0] ?? null, last: dates.at(-1) ?? null } };
}

// Union by id. Existing events win on conflict. Top-level fields from both are kept.
export function mergeData(existing, incoming) {
  const ids = new Set(existing.events.map((e) => e.id));
  const added = incoming.events.filter((e) => !ids.has(e.id));
  return { ...incoming, ...existing, events: [...existing.events, ...added] };
}
