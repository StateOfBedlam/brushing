// Pure functions: everything shown in the app is derived from the event log.
// No DOM or storage access here, so this file can be tested with `node --test`.

// ---- Dates (always local calendar dates as "YYYY-MM-DD" strings) ----

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Calendar arithmetic in UTC so daylight-saving changes can't skip or repeat a day.
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
}

// ---- Day summaries ----

function emptyDay(date) {
  return { date, morning: false, night: false, flossed: false, missed: false, events: [] };
}

// Group events by the day they count for.
export function summarizeDays(events) {
  const days = new Map();
  for (const e of events) {
    if (!isDateStr(e.date)) continue;
    if (!days.has(e.date)) days.set(e.date, emptyDay(e.date));
    const day = days.get(e.date);
    day.events.push(e);
    if (e.type === 'brush') {
      if (e.slot === 'morning') day.morning = true;
      if (e.slot === 'night') day.night = true;
      if (e.flossed) day.flossed = true;
    } else if (e.type === 'floss') {
      day.flossed = true;
    } else if (e.type === 'miss') {
      day.missed = true;
    }
  }
  return days;
}

// 'brushed' | 'missed' | 'pending' (today, no brush yet) | 'unresolved' (past, no brush, not marked missed)
export function dayStatus(day, today) {
  if (day.morning || day.night) return 'brushed';
  if (day.missed) return 'missed';
  return day.date === today ? 'pending' : 'unresolved';
}

// ---- Full derived state ----

export function computeState(events, today) {
  const summaries = summarizeDays(events);
  const dates = [...summaries.keys()].filter((d) => d <= today).sort();
  const firstDate = dates[0] ?? null;

  // Every day from the first-ever entry through today, oldest first.
  const days = [];
  if (firstDate) {
    for (let d = firstDate; d <= today; d = addDays(d, 1)) {
      const day = summaries.get(d) ?? emptyDay(d);
      days.push({ ...day, status: dayStatus(day, today) });
    }
  } else {
    days.push({ ...emptyDay(today), status: 'pending' });
  }

  const unresolved = days.filter((d) => d.status === 'unresolved').map((d) => d.date);

  // Walk the days, splitting into runs of consecutive brushed days.
  // Whatever run is still open at the end is the current streak.
  const runs = [];
  let run = null;
  for (const day of days) {
    if (day.status === 'brushed') {
      if (run) {
        run.end = day.date;
        run.length++;
      } else {
        run = { start: day.date, end: day.date, length: 1 };
      }
    } else if (day.status === 'pending') {
      // Today with no brush yet never breaks anything.
    } else {
      if (run) runs.push({ ...run, endedBy: day.status });
      run = null;
    }
  }

  const current = run ?? { start: null, end: null, length: 0 };
  const best = Math.max(current.length, ...runs.map((r) => r.length), 0);

  return {
    firstDate,
    days,
    unresolved,
    onHold: unresolved.length > 0,
    current,
    best,
    history: runs.reverse(), // newest first
  };
}

// When logging a brush on a day marked Missed, these miss events should be removed.
export function missEventsOn(events, date) {
  return events.filter((e) => e.type === 'miss' && e.date === date);
}
