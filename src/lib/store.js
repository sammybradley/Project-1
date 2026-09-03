/* ============================================================================
   store.js — all state lives in one localStorage key on this device.
   No accounts, no server, no database. Days are keyed by the LOCAL calendar
   date, which is what makes the daily calorie count reset at 12:00 AM: at
   midnight the key changes, so today's log is simply a new, empty record.
   ========================================================================== */

import * as FC_CALC from './calc.js';

const KEY = 'fuelcast.v1';

/* localStorage is absent in Node (the engine tests define a fake one on
   globalThis before importing this module). */
const LS = typeof localStorage !== 'undefined' ? localStorage : null;

/* React subscription plumbing — the only code that is new to this port.
   version is a monotonically increasing snapshot for useSyncExternalStore;
   every mutation bumps it and tells every listener. */
const listeners = new Set();
let version = 0;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getSnapshot() { return version; }
function notify() { version++; listeners.forEach(fn => fn()); }

export function todayKey(d) {
  const t = d || new Date();
  return t.getFullYear() + '-' +
    String(t.getMonth() + 1).padStart(2, '0') + '-' +
    String(t.getDate()).padStart(2, '0');
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function blankDay() {
  return { food: [], water: [], activity: [], wearable: {}, weightKg: null };
}

function defaults() {
  return {
    version: 1,
    profile: null,     // { sex, age, heightCm, weightKg, baseActivity, wakeTime, sleepTime }
    goal: null,        // { type, targetWeightKg, pace, startWeightKg, startedOn }
    prefs: { units: 'imperial', diet: 'all', mealSlot: 'auto' },
    days: {}
  };
}

let state = load();

function load() {
  try {
    const raw = LS ? LS.getItem(KEY) : null;
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const base = defaults();
    return Object.assign(base, parsed, { prefs: Object.assign(base.prefs, parsed.prefs || {}) });
  } catch (err) {
    console.warn('Fuelcast: could not read saved data, starting fresh.', err);
    return defaults();
  }
}

export function save() {
  try {
    if (LS) LS.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Fuelcast: could not save (private browsing?).', err);
  }
}

export function get() { return state; }

export function day(key) {
  const k = key || todayKey();
  if (!state.days[k]) state.days[k] = blankDay();
  const d = state.days[k];
  /* Older records may predate a field. */
  if (!d.food) d.food = [];
  if (!d.water) d.water = [];
  if (!d.activity) d.activity = [];
  if (!d.wearable) d.wearable = {};
  return d;
}

export function today() { return day(todayKey()); }

export function setProfile(p) { state.profile = p; save(); notify(); }

export function setGoal(g) {
  const prev = state.goal;
  /* Keep the original starting weight unless the target itself changed. */
  const sameTarget = prev && Math.abs(prev.targetWeightKg - g.targetWeightKg) < 0.01 && prev.type === g.type;
  state.goal = Object.assign({}, g, {
    startWeightKg: sameTarget ? prev.startWeightKg : (state.profile ? state.profile.weightKg : g.targetWeightKg),
    startedOn: sameTarget ? prev.startedOn : todayKey()
  });
  save();
  notify();
}

export function setPref(k, v) { state.prefs[k] = v; save(); notify(); }

const uid = () => Math.random().toString(36).slice(2, 9);

export function addFood(entry) { today().food.push(Object.assign({ id: uid() }, entry)); save(); notify(); }
export function addWater(ml, at) { today().water.push({ id: uid(), ml: ml, at: at }); save(); notify(); }
export function addActivity(entry) { today().activity.push(Object.assign({ id: uid() }, entry)); save(); notify(); }
export function setWearable(patch) { Object.assign(today().wearable, patch); save(); notify(); }

export function remove(kind, id) {
  const d = today();
  d[kind] = d[kind].filter(e => e.id !== id);
  save();
  notify();
}

/* A weight check-in updates both today's record and the live profile, so
   every downstream calculation uses the newest number. */
export function checkInWeight(kg) {
  today().weightKg = kg;
  if (state.profile) state.profile.weightKg = kg;
  save();
  notify();
}

/* Last n days, oldest first, with whatever was logged. netDelta is
   intake minus total burn — null when the day has no food logged at all. */
export function history(n, profile, goal) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = todayKey(d);
    const rec = state.days[k];
    const intake = rec ? rec.food.reduce((s, f) => s + (Number(f.kcal) || 0), 0) : 0;
    const water = rec ? rec.water.reduce((s, w) => s + (Number(w.ml) || 0), 0) : 0;
    const burn = rec ? FC_CALC.exerciseBurn(rec).total : 0;
    let netDelta = null;
    if (rec && rec.food.length && profile) {
      const resting = FC_CALC.restingBurn(profile, rec.wearable);
      const tdee = resting * FC_CALC.activityFactor(profile.baseActivity) + burn;
      netDelta = intake - tdee;
    }
    out.push({
      key: k, date: d, intake: intake, water: water, burn: burn,
      weightKg: rec ? rec.weightKg : null,
      netDelta: netDelta,
      entries: rec ? rec.food.length : 0
    });
  }
  return out;
}

/* Movement logged since the most recent Monday, for the weekly coach. */
export function weekActivity() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;            // 0 = Monday
  let minutes = 0, kcal = 0, sessions = 0, strength = 0, days = 0;
  for (let i = 0; i <= dow; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (dow - i));
    const rec = state.days[todayKey(d)];
    if (!rec || !rec.activity.length) continue;
    days++;
    rec.activity.forEach(a => {
      minutes += Number(a.minutes) || 0;
      kcal += Number(a.kcal) || 0;
      sessions++;
      if (/strength|weight|lift|resistance/i.test(a.name || '')) strength++;
    });
  }
  return { minutes: minutes, kcal: kcal, sessions: sessions, strength: strength, activeDays: days, dayOfWeek: dow };
}

export function exportJSON() { return JSON.stringify(state, null, 2); }

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Not a Fuelcast backup.');
  state = Object.assign(defaults(), parsed);
  save();
  notify();
}

export function reset() {
  state = defaults();
  try { if (LS) LS.removeItem(KEY); } catch (err) { /* nothing to clean up */ }
  notify();
}
