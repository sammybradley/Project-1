/* ============================================================================
   calc.js — the whole engine. Pure functions, no DOM, no storage, no network.
   Everything the app recommends is derived here from published formulas:
     * Mifflin-St Jeor resting metabolic rate
     * 7700 kcal per kg of body-mass change (3500 kcal/lb)
     * 0.5-1 %/week loss, 0.25-0.5 %/week gain for lean-mass retention
     * ~33 ml water per kg + ~600 ml per hour of training
     * 20-40 g protein per eating occasion, every 3-4 waking hours
   ========================================================================== */

export const KCAL_PER_KG = 7700;          // energy in a kg of body mass
const LB_PER_KG = 2.2046226218;
const ML_PER_OZ = 29.5735;
export const DAYS_PER_MONTH = 30.4375;

/* ---------------------------------------------------------------- units */
export const kgToLb = kg => kg * LB_PER_KG;
export const lbToKg = lb => lb / LB_PER_KG;
export const cmToIn = cm => cm / 2.54;
export const inToCm = inches => inches * 2.54;
export const mlToOz = ml => ml / ML_PER_OZ;
export const ozToMl = oz => oz * ML_PER_OZ;

/* Weight in the user's preferred unit, rounded for display. */
export function showWeight(kg, units, digits) {
  const d = digits === undefined ? 1 : digits;
  return units === 'metric' ? round(kg, d) : round(kgToLb(kg), d);
}
export function weightUnit(units) { return units === 'metric' ? 'kg' : 'lb'; }
export function showVolume(ml, units) {
  return units === 'metric' ? Math.round(ml) : Math.round(mlToOz(ml));
}
export function volumeUnit(units) { return units === 'metric' ? 'ml' : 'oz'; }

export const round = (n, d) => {
  const f = Math.pow(10, d || 0);
  return Math.round(n * f) / f;
};
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* -------------------------------------------------- energy expenditure */

/* Baseline daily activity, NOT counting workouts the user logs separately.
   Kept deliberately low so logged wearable burn can be added without
   double-counting the same exercise. */
export const BASE_ACTIVITY = [
  { id: 'sedentary', label: 'Desk job, little walking', factor: 1.20 },
  { id: 'light',     label: 'On my feet some of the day', factor: 1.35 },
  { id: 'active',    label: 'Active job / lots of walking', factor: 1.50 },
  { id: 'veryActive',label: 'Physical labour all day', factor: 1.70 }
];
export const activityFactor = id => (BASE_ACTIVITY.find(a => a.id === id) || BASE_ACTIVITY[0]).factor;

/* Mifflin-St Jeor. 'other' uses the midpoint of the two sex constants. */
export function bmr(profile) {
  const s = profile.sex === 'male' ? 5 : profile.sex === 'female' ? -161 : -78;
  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + s;
}

/* Resting burn: a wearable's own resting-calorie reading wins over the formula. */
export function restingBurn(profile, wearable) {
  const w = wearable && Number(wearable.restingKcal);
  return w > 0 ? w : bmr(profile);
}

/* Calories burned in exercise today. A tracker's "active calories" figure
   already includes every workout, so we take the larger of the two sources
   rather than adding them and counting the same session twice. */
export function exerciseBurn(day) {
  const logged = (day.activity || []).reduce((s, a) => s + (Number(a.kcal) || 0), 0);
  const tracker = Number(day.wearable && day.wearable.activeKcal) || 0;
  return {
    total: Math.max(logged, tracker),
    logged: logged,
    tracker: tracker,
    source: tracker > logged ? 'tracker' : 'logged'
  };
}

/* ------------------------------------------------------ goal → calories */

export const PACES = {
  lose: [
    { id: 'gentle', label: 'Gentle', pct: 0.0035, note: 'easiest to stick to' },
    { id: 'steady', label: 'Steady', pct: 0.0060, note: 'best muscle retention' },
    { id: 'fast',   label: 'Fast',   pct: 0.0100, note: 'upper safe limit' }
  ],
  gain: [
    { id: 'gentle', label: 'Gentle', pct: 0.0020, note: 'leanest gain' },
    { id: 'steady', label: 'Steady', pct: 0.0035, note: 'recommended lean bulk' },
    { id: 'fast',   label: 'Fast',   pct: 0.0050, note: 'more fat comes with it' }
  ],
  maintain: [ { id: 'steady', label: 'Hold steady', pct: 0, note: '' } ]
};

/* Direction is read from the numbers, not from the radio button, so a
   mismatched target can't produce a plan that walks the wrong way. */
export function direction(profile, goal) {
  if (goal.type === 'maintain') return 0;
  const diff = goal.targetWeightKg - profile.weightKg;
  if (Math.abs(diff) < 0.05) return 0;
  return diff < 0 ? -1 : 1;
}

export function paceOptions(type) { return PACES[type] || PACES.maintain; }

export function pacePct(goal) {
  const list = paceOptions(goal.type);
  const found = list.find(p => p.id === goal.pace) || list[Math.min(1, list.length - 1)];
  return found.pct;
}

/* The full daily plan: targets, macros, water, safety clamps. */
export function plan(profile, goal, day) {
  const dir = direction(profile, goal);
  const resting = restingBurn(profile, day && day.wearable);
  const baseTdee = resting * activityFactor(profile.baseActivity);
  const burn = exerciseBurn(day || {});

  /* Requested rate of change, in kg/week, signed. */
  const requestedKgWeek = dir * pacePct(goal) * profile.weightKg;
  const requestedDelta = requestedKgWeek * KCAL_PER_KG / 7;   // kcal/day, signed

  /* Never plan below the conventional minimum intake: 1500 kcal for men,
     1200 otherwise. (Resting burn is NOT the floor — a routine 500 kcal
     deficit lands under it for most sedentary people, and clamping there
     would make any real deficit impossible.) */
  const hardFloor = profile.sex === 'male' ? 1500 : 1200;
  const rawTarget = baseTdee + requestedDelta;
  const clampedBase = Math.max(rawTarget, hardFloor);
  const floored = dir < 0 && clampedBase > rawTarget + 1;
  const belowResting = clampedBase < resting;

  /* Effective (achievable) daily delta once the floor is respected. */
  const effectiveDelta = clampedBase - baseTdee;
  const effectiveKgWeek = effectiveDelta * 7 / KCAL_PER_KG;

  /* Today's target moves with what the tracker reports: burn more, eat more. */
  const targetToday = Math.round(clampedBase + burn.total);

  /* Macros. Protein is set per kg of a reference weight — for a cut we use
     the goal weight so a large deficit doesn't inflate the protein number. */
  const refKg = dir < 0 ? Math.max(goal.targetWeightKg, profile.weightKg * 0.8) : profile.weightKg;
  const gPerKg = dir < 0 ? 2.0 : dir > 0 ? 1.8 : 1.6;
  const protein = Math.round(refKg * gPerKg);
  const fat = Math.round(Math.max(refKg * 0.7, targetToday * 0.25 / 9));
  const carbs = Math.max(0, Math.round((targetToday - protein * 4 - fat * 9) / 4));

  /* Water: ~33 ml/kg baseline, plus ~600 ml per hour of training logged. */
  const trainingMinutes = (day && day.activity || []).reduce((s, a) => s + (Number(a.minutes) || 0), 0);
  const waterBase = 33 * profile.weightKg;
  const waterExtra = (trainingMinutes / 60) * 600;
  const waterMl = Math.round((waterBase + waterExtra) / 50) * 50;

  return {
    dir: dir,
    resting: Math.round(resting),
    restingFromTracker: !!(day && day.wearable && Number(day.wearable.restingKcal) > 0),
    baseTdee: Math.round(baseTdee),
    burn: burn,
    requestedKgWeek: requestedKgWeek,
    effectiveKgWeek: effectiveKgWeek,
    dailyDelta: Math.round(effectiveDelta),
    floored: floored,
    belowResting: belowResting,
    hardFloor: Math.round(hardFloor),
    baseTarget: Math.round(clampedBase),
    targetToday: targetToday,
    macros: { protein: protein, carbs: carbs, fat: fat },
    waterMl: waterMl,
    waterBaseMl: Math.round(waterBase),
    waterExtraMl: Math.round(waterExtra),
    trainingMinutes: trainingMinutes
  };
}

/* ---------------------------------------------------------- projection */

/* Days until the target weight at the plan's effective rate. */
export function forecast(profile, goal, planned) {
  if (planned.dir === 0 || goal.type === 'maintain') {
    return { reachable: true, maintenance: true, days: 0 };
  }
  const remainingKg = Math.abs(goal.targetWeightKg - profile.weightKg);
  if (remainingKg < 0.05) return { reachable: true, done: true, days: 0 };

  const perDay = Math.abs(planned.effectiveKgWeek) / 7;
  if (!(perDay > 0)) return { reachable: false, days: Infinity };

  const days = remainingKg / perDay;
  return {
    reachable: true,
    days: days,
    remainingKg: remainingKg,
    kgPerWeek: Math.abs(planned.effectiveKgWeek),
    date: addDays(new Date(), Math.ceil(days))
  };
}

/* Same maths, but driven by what the user actually logged rather than the
   plan — shown alongside the plan so the two can be compared. */
export function forecastFromHistory(profile, goal, history) {
  const usable = history.filter(d => d.netDelta !== null);
  if (usable.length < 3) return null;
  const avgDelta = usable.reduce((s, d) => s + d.netDelta, 0) / usable.length;
  const dir = direction(profile, goal);
  const perDayKg = avgDelta / KCAL_PER_KG;                 // signed
  const remainingKg = goal.targetWeightKg - profile.weightKg;  // signed
  if (Math.abs(remainingKg) < 0.05) return { days: 0, done: true, samples: usable.length };
  /* Moving the wrong way (or not at all) means no arrival date. */
  if (perDayKg === 0 || Math.sign(perDayKg) !== Math.sign(remainingKg)) {
    return { days: Infinity, samples: usable.length, wrongWay: true, avgDelta: Math.round(avgDelta) };
  }
  const days = Math.abs(remainingKg / perDayKg);
  return {
    days: days,
    samples: usable.length,
    avgDelta: Math.round(avgDelta),
    kgPerWeek: Math.abs(perDayKg * 7),
    date: addDays(new Date(), Math.ceil(days)),
    dirOk: dir === 0 || Math.sign(perDayKg) === dir
  };
}

export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

/* "3 months, 12 days" — the acceptance criterion asks for months AND days. */
export function humanDuration(days) {
  if (!isFinite(days)) return 'not reachable at this pace';
  const total = Math.max(0, Math.ceil(days));
  if (total === 0) return 'today';
  const months = Math.floor(total / DAYS_PER_MONTH);
  const rem = Math.round(total - months * DAYS_PER_MONTH);
  const parts = [];
  if (months) parts.push(months + (months === 1 ? ' month' : ' months'));
  if (rem || !months) parts.push(rem + (rem === 1 ? ' day' : ' days'));
  return parts.join(', ');
}

/* Percentage of the journey from the starting weight to the target. */
export function goalProgress(startKg, currentKg, targetKg) {
  const span = targetKg - startKg;
  if (Math.abs(span) < 0.05) return currentKg === targetKg ? 100 : 0;
  return clamp(((currentKg - startKg) / span) * 100, 0, 100);
}

/* ------------------------------------------------- the day's timetable */

export const minutesOf = hhmm => {
  const [h, m] = String(hhmm || '07:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fmtTime = mins => {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return h12 + ':' + mm + ' ' + (h24 < 12 ? 'AM' : 'PM');
};

/* Meals and water checkpoints spread across the waking day: eating starts
   ~30 min after waking, stops ~2 h before bed, and the gaps land in the
   3-4 hour band that keeps protein synthesis topped up. */
export function schedule(profile, planned) {
  const wake = minutesOf(profile.wakeTime);
  let sleep = minutesOf(profile.sleepTime);
  if (sleep <= wake) sleep += 1440;             // bedtime after midnight

  const start = wake + 30;
  const end = Math.max(start + 60, sleep - 120);
  const windowMin = end - start;

  /* More calories to place, and a longer day, means more eating occasions. */
  let snacks = planned.targetToday > 2800 ? 3 : planned.targetToday > 2100 ? 2 : 1;
  if (windowMin < 480) snacks = Math.min(snacks, 1);
  if (windowMin > 840) snacks = Math.min(3, snacks + 1);

  /* Interleave: breakfast, [snack], lunch, [snack], dinner, [snack] */
  const order = ['breakfast', 'lunch', 'dinner'];
  const seq = [];
  const snackAt = [1, 2, 3].slice(0, snacks);   // insert positions after meal i
  order.forEach((slot, i) => {
    seq.push({ slot: slot });
    if (snackAt.includes(i + 1) && i < 2) seq.push({ slot: 'snack' });
  });
  if (snackAt.includes(3)) seq.push({ slot: 'snack' });   // evening snack

  const weights = { breakfast: 25, lunch: 30, dinner: 30, snack: 12 };
  const totalWeight = seq.reduce((s, e) => s + weights[e.slot], 0);

  /* Protein: give every main meal at least 25 g when the budget allows,
     then share what's left in proportion to calories. */
  const mains = seq.filter(e => e.slot !== 'snack').length;
  const mainFloor = Math.min(30, Math.max(20, Math.floor(planned.macros.protein / (mains + 1))));

  const step = seq.length > 1 ? windowMin / (seq.length - 1) : 0;
  const events = seq.map((e, i) => {
    const share = weights[e.slot] / totalWeight;
    const kcal = Math.round(planned.targetToday * share / 5) * 5;
    const protein = e.slot === 'snack'
      ? Math.round(planned.macros.protein * share)
      : Math.max(mainFloor, Math.round(planned.macros.protein * share));
    return {
      type: 'meal',
      slot: e.slot,
      at: Math.round((start + step * i) / 5) * 5,
      kcal: kcal,
      protein: protein,
      label: e.slot === 'snack' ? 'Snack' : e.slot[0].toUpperCase() + e.slot.slice(1)
    };
  });

  /* Hydration checkpoints roughly every two hours, ending an hour before bed
     so the last glass isn't at lights-out. */
  const wStart = wake + 15, wEnd = sleep - 60;
  const count = Math.max(4, Math.min(9, Math.round((wEnd - wStart) / 120) + 1));
  const wStep = count > 1 ? (wEnd - wStart) / (count - 1) : 0;
  const per = Math.round(planned.waterMl / count / 25) * 25;
  for (let i = 0; i < count; i++) {
    events.push({
      type: 'water',
      at: Math.round((wStart + wStep * i) / 5) * 5,
      ml: per,
      label: 'Water'
    });
  }

  events.sort((a, b) => a.at - b.at);
  return { events: events, start: start, end: end, sleep: sleep, wake: wake };
}

/* Where "now" sits on the timetable. The small hours belong to the previous
   waking day only when bedtime is genuinely after midnight — otherwise 12:30 AM
   is the start of a fresh day (and the log has just reset), so the next meal is
   breakfast, not a pile of missed slots. */
export function nowAbsolute(sched, nowMin) {
  const wraps = sched.sleep > 1440;
  return (wraps && nowMin < sched.sleep - 1440) ? nowMin + 1440 : nowMin;
}

/* Marks each timetable entry done / due / upcoming against what's logged.
   Water entries are matched cumulatively: drink enough and the earlier
   checkpoints tick off on their own. */
export function annotateSchedule(sched, day, nowMin) {
  const meals = (day.food || []).slice().sort((a, b) => a.at - b.at);
  const usedMeals = new Set();
  let drunk = (day.water || []).reduce((s, w) => s + (Number(w.ml) || 0), 0);
  let waterSeen = 0;

  const nowAbs = nowAbsolute(sched, nowMin);

  return sched.events.map(ev => {
    const e = Object.assign({}, ev);

    if (ev.type === 'meal') {
      /* First unclaimed logged meal within ±2 h counts for this slot. */
      const hit = meals.find((m, i) => !usedMeals.has(i) && Math.abs(m.at - ev.at) <= 120);
      if (hit) usedMeals.add(meals.indexOf(hit));
      e.done = !!hit;
      e.loggedName = hit ? hit.name : null;
    } else {
      waterSeen += ev.ml;
      e.done = drunk >= waterSeen - 1;
    }
    const dueFrom = ev.at - 15, dueTo = ev.at + 45;
    e.due = !e.done && nowAbs >= dueFrom && nowAbs <= dueTo;
    e.missed = !e.done && nowAbs > dueTo;
    e.upcoming = !e.done && nowAbs < dueFrom;
    return e;
  });
}

/* ------------------------------------------------ meal recommendations */

/* Rule-based score, no model involved: how well does this dish fit the
   calories and protein still open in the slot, given the goal direction. */
export function scoreMeal(meal, opts) {
  const kcalTarget = opts.kcal, proteinTarget = opts.protein;
  /* Calorie fit: 1.0 on target, decaying either side. */
  const kcalMiss = Math.abs(meal.kcal - kcalTarget) / Math.max(120, kcalTarget);
  let score = 100 * Math.max(0, 1 - kcalMiss);

  /* Protein fit: reaching the slot's protein number matters more on a cut. */
  const pRatio = proteinTarget > 0 ? meal.protein / proteinTarget : 1;
  score += 45 * Math.min(1.15, pRatio);

  /* Goal-direction nudges. */
  if (opts.dir < 0) {
    /* Protein density, in grams per 100 kcal. Capped, or a 130 kcal shake
       would out-rank a properly sized meal on density alone. */
    const density = meal.protein / Math.max(1, meal.kcal / 100);
    score += 18 * Math.min(1, density / 3);
    if (meal.tags.includes('low-calorie')) score += 8;
    if (meal.tags.includes('calorie-dense')) score -= 16;
  } else if (opts.dir > 0) {
    if (meal.tags.includes('calorie-dense')) score += 14;
    if (meal.kcal < kcalTarget * 0.7) score -= 12;
  } else {
    if (meal.tags.includes('high-protein')) score += 6;
  }

  if (opts.maxMinutes && meal.minutes <= opts.maxMinutes) score += 5;
  if (opts.postWorkout && meal.tags.includes('post-workout')) score += 10;
  return score;
}

export function recommend(meals, opts) {
  const dietTest = opts.dietTest || (() => true);
  const q = (opts.query || '').trim().toLowerCase();
  return meals
    .filter(m => (opts.slot === 'all' || m.slot === opts.slot))
    .filter(dietTest)
    .filter(m => !q || m.name.toLowerCase().includes(q) || m.items.toLowerCase().includes(q))
    .map(m => Object.assign({}, m, { score: scoreMeal(m, opts) }))
    .sort((a, b) => b.score - a.score);
}

/* -------------------------------------------------------- activity coach */

export function kcalPerMinute(met, weightKg) { return met * 3.5 * weightKg / 200; }

/* Minutes of each activity needed to erase a calorie overshoot. */
export function gapOptions(gapKcal, weightKg, activities) {
  return activities.map(a => ({
    id: a.id,
    name: a.name,
    minutes: Math.max(1, Math.round(gapKcal / kcalPerMinute(a.met, weightKg)))
  })).sort((a, b) => a.minutes - b.minutes);
}

/* Weekly movement target: the standard 150 min moderate + 2 strength days,
   scaled up a little for an aggressive cut. */
export function weeklyActivityTarget(planned) {
  const base = 150;
  const extra = planned.dir < 0 ? Math.round(Math.abs(planned.effectiveKgWeek) * 100) : 0;
  return { minutes: clamp(base + extra, 150, 300), strengthSessions: planned.dir === 0 ? 2 : 3, steps: 8000 };
}
