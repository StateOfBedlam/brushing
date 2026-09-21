import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeState, addDays, missEventsOn, isDateStr } from '../logic.js';

let n = 0;
const brush = (date, slot = 'night', flossed = false) => ({ id: `e${n++}`, type: 'brush', slot, date, flossed });
const floss = (date) => ({ id: `e${n++}`, type: 'floss', date });
const miss = (date) => ({ id: `e${n++}`, type: 'miss', date });

const TODAY = '2026-09-20';

test('addDays crosses month, year and DST boundaries', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09'); // US DST start
  assert.equal(addDays('2026-11-01', -1), '2026-10-31'); // US DST end
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
});

test('isDateStr rejects malformed and impossible dates', () => {
  assert.ok(isDateStr('2026-09-20'));
  assert.ok(!isDateStr('2026-02-30'));
  assert.ok(!isDateStr('2026-9-20'));
  assert.ok(!isDateStr(undefined));
});

test('no events: streak 0, today pending, nothing on hold', () => {
  const s = computeState([], TODAY);
  assert.equal(s.current.length, 0);
  assert.equal(s.best, 0);
  assert.equal(s.onHold, false);
  assert.equal(s.days.length, 1);
  assert.equal(s.days[0].status, 'pending');
});

test('first brush tonight gives streak 1', () => {
  const s = computeState([brush(TODAY, 'night', true)], TODAY);
  assert.equal(s.current.length, 1);
  assert.equal(s.best, 1);
  assert.equal(s.days.at(-1).flossed, true);
});

test('today pending does not break the streak', () => {
  const events = [brush('2026-09-18'), brush('2026-09-19', 'morning')];
  const s = computeState(events, TODAY);
  assert.equal(s.days.at(-1).status, 'pending');
  assert.equal(s.current.length, 2);
  assert.equal(s.onHold, false);
});

test('morning OR night is enough for a day to count', () => {
  const events = [brush('2026-09-18', 'morning'), brush('2026-09-19', 'night'), brush(TODAY, 'morning'), brush(TODAY, 'night')];
  assert.equal(computeState(events, TODAY).current.length, 3);
});

test('floss alone does not count as brushed', () => {
  const s = computeState([brush('2026-09-19'), floss(TODAY)], TODAY);
  assert.equal(s.days.at(-1).status, 'pending');
  assert.equal(s.days.at(-1).flossed, true);
  assert.equal(s.current.length, 1);
});

test('missed day ends a streak and records it in history', () => {
  const events = [
    brush('2026-09-14'), brush('2026-09-15'), brush('2026-09-16'),
    miss('2026-09-17'),
    brush('2026-09-18'), brush('2026-09-19'),
  ];
  const s = computeState(events, TODAY);
  assert.equal(s.current.length, 2);
  assert.equal(s.current.start, '2026-09-18');
  assert.deepEqual(s.history, [{ start: '2026-09-14', end: '2026-09-16', length: 3, endedBy: 'missed' }]);
  assert.equal(s.best, 3);
});

test('zero-length streaks are not listed', () => {
  const s = computeState([miss('2026-09-17'), miss('2026-09-18'), brush('2026-09-19')], TODAY);
  assert.deepEqual(s.history, []);
  assert.equal(s.current.length, 1);
});

test('best streak includes the current one', () => {
  const events = [brush('2026-09-14'), miss('2026-09-15'), brush('2026-09-16'), brush('2026-09-17'), brush('2026-09-18'), brush('2026-09-19')];
  const s = computeState(events, TODAY);
  assert.equal(s.current.length, 4);
  assert.equal(s.best, 4);
});

test('unresolved day puts the streak on hold instead of silently breaking it', () => {
  const events = [brush('2026-09-16'), brush('2026-09-17'), brush('2026-09-19')];
  const s = computeState(events, TODAY);
  assert.deepEqual(s.unresolved, ['2026-09-18']);
  assert.equal(s.onHold, true);
  assert.equal(s.history[0].endedBy, 'unresolved');
});

test('backfilling an unresolved day recalculates everything', () => {
  const events = [brush('2026-09-16'), brush('2026-09-17'), brush('2026-09-19')];
  const s = computeState([...events, brush('2026-09-18', 'morning')], TODAY);
  assert.equal(s.onHold, false);
  assert.equal(s.current.length, 4);
  assert.equal(s.current.start, '2026-09-16');
  assert.deepEqual(s.history, []);
});

test('resolving an unresolved day as missed ends the earlier streak', () => {
  const events = [brush('2026-09-16'), brush('2026-09-17'), brush('2026-09-19'), miss('2026-09-18')];
  const s = computeState(events, TODAY);
  assert.equal(s.onHold, false);
  assert.equal(s.current.length, 1);
  assert.equal(s.history[0].endedBy, 'missed');
  assert.equal(s.history[0].length, 2);
});

test('days before the first-ever entry are not unresolved', () => {
  const s = computeState([brush('2026-09-19')], TODAY);
  assert.equal(s.firstDate, '2026-09-19');
  assert.deepEqual(s.unresolved, []);
});

test('brush added to a missed day wins, and the miss marker can be found for removal', () => {
  const m = miss('2026-09-18');
  const events = [brush('2026-09-17'), m, brush('2026-09-18'), brush('2026-09-19')];
  const s = computeState(events, TODAY);
  assert.equal(s.days.find((d) => d.date === '2026-09-18').status, 'brushed');
  assert.equal(s.current.length, 3);
  assert.deepEqual(missEventsOn(events, '2026-09-18'), [m]);
  assert.deepEqual(missEventsOn(events, '2026-09-17'), []);
});

test('future-dated events are ignored', () => {
  const s = computeState([brush('2026-09-25')], TODAY);
  assert.equal(s.current.length, 0);
  assert.equal(s.firstDate, null);
});
