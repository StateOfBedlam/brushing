import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save, parseImport, mergeData, STORAGE_KEY, CURRENT_SCHEMA } from '../storage.js';

function memoryStorage(initial) {
  const map = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    raw: () => map.get(STORAGE_KEY),
  };
}

const ev = (id, date = '2026-09-20') => ({ id, type: 'brush', slot: 'night', date, loggedAt: '2026-09-20T22:00:00-07:00', flossed: false });

test('empty storage loads as empty data', () => {
  const r = load(memoryStorage());
  assert.ok(r.ok);
  assert.deepEqual(r.data, { schemaVersion: CURRENT_SCHEMA, events: [] });
});

test('save then load round-trips and keeps unknown fields', () => {
  const s = memoryStorage();
  const data = { schemaVersion: 1, events: [{ ...ev('a'), toothpaste: 'mint' }], futureThing: { x: 1 } };
  assert.ok(save(data, s).ok);
  assert.deepEqual(load(s).data, data);
});

test('corrupt data fails to load and the raw string is returned untouched', () => {
  const s = memoryStorage('{not json');
  const r = load(s);
  assert.equal(r.ok, false);
  assert.equal(r.raw, '{not json');
  assert.equal(s.raw(), '{not json');
});

test('data from a newer schema is refused, not overwritten', () => {
  const raw = JSON.stringify({ schemaVersion: CURRENT_SCHEMA + 1, events: [] });
  const r = load(memoryStorage(raw));
  assert.equal(r.ok, false);
  assert.match(r.error, /newer version/);
});

test('import validates events', () => {
  assert.equal(parseImport('nope').ok, false);
  assert.equal(parseImport(JSON.stringify({ schemaVersion: 1, events: [{ id: 'x', type: 'brush', slot: 'noon', date: '2026-09-20' }] })).ok, false);
  const r = parseImport(JSON.stringify({ schemaVersion: 1, events: [ev('a', '2026-09-18'), ev('b', '2026-09-20')] }));
  assert.ok(r.ok);
  assert.deepEqual(r.summary, { count: 2, first: '2026-09-18', last: '2026-09-20' });
});

test('merge is a union by id and keeps existing on conflict', () => {
  const existing = { schemaVersion: 1, events: [ev('a'), ev('b')] };
  const incoming = { schemaVersion: 1, events: [{ ...ev('b'), flossed: true }, ev('c')] };
  const merged = mergeData(existing, incoming);
  assert.deepEqual(merged.events.map((e) => e.id), ['a', 'b', 'c']);
  assert.equal(merged.events[1].flossed, false);
});
