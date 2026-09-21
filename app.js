// UI. All numbers shown are derived from the event log by logic.js on every render.

import { computeState, toDateStr, addDays, missEventsOn, isDateStr } from './logic.js';
import * as store from './storage.js';

const app = document.getElementById('app');
const logSheet = document.getElementById('log-sheet');
const daySheet = document.getElementById('day-sheet');
const importSheet = document.getElementById('import-sheet');
const importFile = document.getElementById('import-file');

let data = null;
let loadFailure = null; // { error, raw } — while set, nothing is ever written to storage

const HISTORY_DAYS = 30;

// ---- Helpers ----

const today = () => toDateStr(new Date());

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Local time with offset, e.g. 2026-09-21T00:34:12-07:00
function nowWithOffset() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${toDateStr(d)}T${time}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(dateStr, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseDate(dateStr).toLocaleDateString(undefined, opts);
}

function dayLabel(dateStr) {
  const t = today();
  if (dateStr === t) return 'Today';
  if (dateStr === addDays(t, -1)) return 'Yesterday';
  return fmtDate(dateStr);
}

function fmtLoggedAt(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- Writing ----

function commit(next) {
  if (loadFailure) return false;
  const r = store.save(next);
  if (!r.ok) {
    alert(`Couldn't save: ${r.error}\n\nYour previous data is unchanged.`);
    return false;
  }
  data = next;
  render();
  return true;
}

function withEvents(events) {
  return { ...data, events };
}

function logEvent({ type, slot, date, flossed }) {
  let events = data.events;
  if (type === 'brush') {
    const misses = missEventsOn(events, date);
    if (misses.length) {
      if (!confirm(`${fmtDate(date)} is marked Missed. Log a brush and remove the Missed marker?`)) return false;
      const ids = new Set(misses.map((e) => e.id));
      events = events.filter((e) => !ids.has(e.id));
    }
  }
  const event = { id: uuid(), type, date, loggedAt: nowWithOffset() };
  if (type === 'brush') Object.assign(event, { slot, flossed: !!flossed, note: '' });
  if (type === 'floss') event.note = '';
  return commit(withEvents([...events, event]));
}

function markMissed(dates) {
  const events = dates.map((date) => ({ id: uuid(), type: 'miss', date, loggedAt: nowWithOffset() }));
  return commit(withEvents([...data.events, ...events]));
}

function deleteEvent(id) {
  return commit(withEvents(data.events.filter((e) => e.id !== id)));
}

// ---- Rendering ----

function render() {
  if (loadFailure) return renderLoadFailure();

  const t = today();
  const s = computeState(data.events, t);
  const todayDay = s.days.at(-1);

  app.innerHTML = `
    ${renderStreak(s)}
    ${s.onHold ? `<div class="banner">Streak on hold: ${plural(s.unresolved.length, 'day')} below ${s.unresolved.length === 1 ? 'needs' : 'need'} an answer.</div>` : ''}
    ${renderToday(todayDay)}
    ${renderPrompts(s.unresolved)}
    <h2>Last ${HISTORY_DAYS} days</h2>
    ${renderHistory(s)}
    <p class="legend">M morning · N night · F floss. Tap a day to see or change it.</p>
    <h2>Past streaks</h2>
    ${renderStreakHistory(s)}
    <footer>
      <button class="ghost" data-action="export">Export</button>
      <button class="ghost" data-action="import">Import</button>
    </footer>
    <p class="note">${plural(data.events.length, 'entry', 'entries')} saved on this device. Export now and then to keep a backup.</p>
  `;
}

function renderStreak(s) {
  const n = s.current.length;
  return `
    <section class="card streak ${s.onHold ? 'held' : ''}">
      <div class="num">${n}</div>
      <div class="label">${s.onHold ? 'day streak · on hold' : 'day streak'}</div>
      <div class="best">Best: ${plural(s.best, 'day')}</div>
    </section>`;
}

function renderToday(day) {
  const slot = (name, label) => {
    const done = day[name];
    return `
      <button class="slot ${done ? 'done' : ''}" data-action="${done ? 'day' : 'log'}" data-slot="${name}" data-date="${day.date}">
        ${label}${done ? ' ✓' : ''}
        <span class="sub">${done ? 'Done' : 'Tap to log'}</span>
      </button>`;
  };
  return `
    <section class="card">
      <div class="today-title"><strong>Today</strong><span>${fmtDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>
      <div class="slots">
        ${slot('morning', 'Morning Brush')}
        ${slot('night', 'Night Brush')}
      </div>
      <div class="floss-row">
        <button class="small ghost" data-action="floss" data-date="${day.date}">${day.flossed ? 'Flossed today ✓ · log again' : 'Floss only'}</button>
      </div>
    </section>`;
}

function renderPrompts(unresolved) {
  if (!unresolved.length) return '';
  const newestFirst = [...unresolved].reverse();
  return `
    <h2>Needs an answer</h2>
    <section class="card">
      ${newestFirst.map((date) => `
        <div class="prompt">
          <div class="q">Did you brush on ${esc(fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' }))}?</div>
          <div class="actions">
            <button class="primary" data-action="log" data-slot="night" data-date="${date}">Log a brush</button>
            <button class="danger" data-action="miss" data-date="${date}">I missed it</button>
          </div>
        </div>`).join('')}
      ${unresolved.length > 3 ? `<div class="prompt"><button class="ghost" data-action="miss-all">Mark all ${unresolved.length} as missed</button></div>` : ''}
    </section>`;
}

function renderHistory(s) {
  if (!s.firstDate) return `<section class="card list"><div class="empty">Nothing logged yet. Log your first brush above.</div></section>`;
  const rows = [...s.days].reverse().slice(0, HISTORY_DAYS);
  const mark = (on, letter) => `<span class="mark ${on ? 'on' : ''}">${letter}</span>`;
  return `
    <section class="card list">
      ${rows.map((d) => `
        <button class="row" data-action="day" data-date="${d.date}">
          <span class="date">${esc(dayLabel(d.date))}${dayLabel(d.date) !== fmtDate(d.date) ? `<small>${esc(fmtDate(d.date))}</small>` : ''}</span>
          ${d.status === 'missed' ? '<span class="tag missed">Missed</span>' : ''}
          ${d.status === 'unresolved' ? '<span class="tag unresolved">?</span>' : ''}
          <span class="marks">${mark(d.morning, 'M')}${mark(d.night, 'N')}${mark(d.flossed, 'F')}</span>
        </button>`).join('')}
    </section>`;
}

function renderStreakHistory(s) {
  if (!s.history.length) return `<section class="card list"><div class="empty">No ended streaks yet.</div></section>`;
  const range = (r) => (r.start === r.end ? fmtDate(r.start) : `${fmtDate(r.start, { month: 'short', day: 'numeric' })} – ${fmtDate(r.end, { month: 'short', day: 'numeric', year: 'numeric' })}`);
  return `
    <section class="card list">
      ${s.history.map((r) => `
        <div class="streak-row">
          <span>${esc(range(r))}<br><small>${r.endedBy === 'missed' ? 'Ended by a missed day' : 'On hold, day after is unanswered'}</small></span>
          <strong>${plural(r.length, 'day')}</strong>
        </div>`).join('')}
    </section>`;
}

function renderLoadFailure() {
  const raw = loadFailure.raw ?? '';
  app.innerHTML = `
    <section class="card error stack">
      <strong>Couldn't read your saved data.</strong>
      <div>Nothing has been changed or overwritten. Export the raw data to keep a copy, then ask for help fixing it.</div>
      <div><small>${esc(loadFailure.error)}</small></div>
      <pre>${esc(raw.length > 2000 ? raw.slice(0, 2000) + '…' : raw)}</pre>
      <button class="primary" data-action="export-raw">Export raw data</button>
      <button class="ghost" data-action="import">Replace with a backup…</button>
    </section>`;
}

// ---- Sheets ----

function closeOnBackdrop(dialog) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}
[logSheet, daySheet, importSheet].forEach(closeOnBackdrop);

function openLogSheet({ type, slot = 'night', date = today() }) {
  const isBrush = type === 'brush';
  logSheet.innerHTML = `
    <form class="sheet">
      <h3>${isBrush ? 'Log a brush' : 'Log flossing'}</h3>
      ${isBrush ? `
        <div class="seg" role="radiogroup" aria-label="When">
          <label><input type="radio" name="slot" value="morning" ${slot === 'morning' ? 'checked' : ''}>Morning</label>
          <label><input type="radio" name="slot" value="night" ${slot === 'night' ? 'checked' : ''}>Night</label>
        </div>` : ''}
      <label class="field">Counts for <input type="date" name="date" value="${date}" max="${today()}" required></label>
      ${isBrush ? `<label class="field">Flossed too <input type="checkbox" name="flossed"></label>` : ''}
      <div class="sheet-actions">
        <button type="button" class="ghost" data-close>Cancel</button>
        <button type="submit" class="primary">Save</button>
      </div>
    </form>`;
  const form = logSheet.querySelector('form');
  form.querySelector('[data-close]').onclick = () => logSheet.close();
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const d = f.get('date');
    if (!isDateStr(d) || d > today()) return alert('Pick a date that is today or earlier.');
    const ok = logEvent({ type, date: d, slot: f.get('slot'), flossed: f.get('flossed') === 'on' });
    if (ok) logSheet.close();
  };
  logSheet.showModal();
}

function eventLabel(e) {
  if (e.type === 'brush') return `${e.slot === 'morning' ? 'Morning' : 'Night'} brush${e.flossed ? ' + floss' : ''}`;
  if (e.type === 'floss') return 'Floss';
  if (e.type === 'miss') return 'Marked missed';
  return esc(e.type);
}

function openDaySheet(date) {
  const s = computeState(data.events, today());
  const day = s.days.find((d) => d.date === date);
  if (!day) return;
  const entries = [...day.events].sort((a, b) => String(a.loggedAt).localeCompare(String(b.loggedAt)));
  const statusText = { brushed: 'Brushed', missed: 'Missed', pending: 'Not brushed yet', unresolved: 'No answer yet' }[day.status];
  daySheet.innerHTML = `
    <div class="sheet">
      <h3>${esc(fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>
      <div>${statusText}</div>
      <div>
        ${entries.length ? entries.map((e) => `
          <div class="entry">
            <span>${eventLabel(e)}<small>Logged ${esc(fmtLoggedAt(e.loggedAt))}</small></span>
            <button class="small danger" data-delete="${esc(e.id)}">Delete</button>
          </div>`).join('') : '<div class="empty" style="padding:0">No entries.</div>'}
      </div>
      <div class="grid2">
        <button data-log="morning">+ Morning</button>
        <button data-log="night">+ Night</button>
        <button data-log="floss">+ Floss only</button>
        ${day.status === 'unresolved' || day.status === 'pending' ? '<button class="danger" data-miss>Mark missed</button>' : ''}
      </div>
      <button class="ghost" data-close>Close</button>
    </div>`;
  daySheet.querySelector('[data-close]').onclick = () => daySheet.close();
  daySheet.querySelectorAll('[data-delete]').forEach((b) => {
    b.onclick = () => {
      const e = data.events.find((x) => x.id === b.dataset.delete);
      if (e && confirm(`Delete "${eventLabel(e)}" on ${fmtDate(date)}?`) && deleteEvent(e.id)) openDaySheet(date);
    };
  });
  daySheet.querySelectorAll('[data-log]').forEach((b) => {
    b.onclick = () => {
      daySheet.close();
      const v = b.dataset.log;
      openLogSheet(v === 'floss' ? { type: 'floss', date } : { type: 'brush', slot: v, date });
    };
  });
  const missBtn = daySheet.querySelector('[data-miss]');
  if (missBtn) missBtn.onclick = () => {
    if (date === today() && !confirm('Mark today as missed? This ends your current streak.')) return;
    if (markMissed([date])) daySheet.close();
  };
  if (!daySheet.open) daySheet.showModal();
}

// ---- Import / export ----

async function exportText(text) {
  const name = store.exportFilename(today());
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file) return;
  const result = store.parseImport(await file.text());
  if (!result.ok) return alert(`That file can't be imported:\n${result.error}`);
  openImportSheet(result);
});

function openImportSheet({ data: incoming, summary }) {
  const range = summary.count ? `${fmtDate(summary.first, { month: 'short', day: 'numeric', year: 'numeric' })} to ${fmtDate(summary.last, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'no dates';
  const canMerge = !loadFailure;
  importSheet.innerHTML = `
    <div class="sheet">
      <h3>Import backup</h3>
      <div>${plural(summary.count, 'entry', 'entries')}, ${esc(range)}.</div>
      ${canMerge ? `<div class="note" style="text-align:left">Merge adds entries you don't already have. Replace discards everything on this device first.</div>` : ''}
      ${canMerge ? '<button class="primary" data-merge>Merge</button>' : ''}
      <button class="danger" data-replace>Replace all</button>
      <button class="ghost" data-close>Cancel</button>
    </div>`;
  importSheet.querySelector('[data-close]').onclick = () => importSheet.close();
  const mergeBtn = importSheet.querySelector('[data-merge]');
  if (mergeBtn) mergeBtn.onclick = () => {
    if (commit(store.mergeData(data, incoming))) importSheet.close();
  };
  importSheet.querySelector('[data-replace]').onclick = () => {
    const msg = loadFailure
      ? 'Replace the unreadable saved data with this backup? Export the raw data first if you might need it.'
      : `Replace all ${plural(data.events.length, 'entry', 'entries')} on this device with this backup? This can't be undone.`;
    if (!confirm(msg)) return;
    const wasFailure = loadFailure;
    loadFailure = null;
    data = data ?? store.emptyData();
    if (commit(incoming)) importSheet.close();
    else loadFailure = wasFailure;
  };
  importSheet.showModal();
}

// ---- Events ----

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, date, slot } = el.dataset;
  switch (action) {
    case 'log': return openLogSheet({ type: 'brush', slot, date });
    case 'floss': return openLogSheet({ type: 'floss', date });
    case 'day': return openDaySheet(date);
    case 'miss': return markMissed([date]);
    case 'miss-all': {
      const { unresolved } = computeState(data.events, today());
      if (confirm(`Mark all ${unresolved.length} unanswered days as missed?`)) markMissed(unresolved);
      return;
    }
    case 'export': return exportText(store.serialize(data));
    case 'export-raw': return exportText(loadFailure.raw ?? '');
    case 'import': return importFile.click();
  }
});

// The date may have changed while the app sat in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

// ---- Start ----

function start() {
  const r = store.load();
  if (!r.ok) {
    loadFailure = { error: r.error, raw: r.raw };
  } else {
    data = r.data;
    if (r.migrated) {
      // Keep the pre-migration copy before writing the upgraded data.
      try {
        const raw = localStorage.getItem(store.STORAGE_KEY);
        localStorage.setItem(`${store.STORAGE_KEY}:pre-migration-backup`, raw);
      } catch {}
      store.save(data);
    }
  }
  // Ask the browser not to evict our storage under pressure.
  navigator.storage?.persist?.().catch(() => {});
  render();
}

start();
