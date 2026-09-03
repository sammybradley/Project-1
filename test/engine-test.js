/* Engine tests for Fuelcast.  Run with:  node test/engine-test.js
   Imports the ESM engine modules with a fake localStorage — no DOM, no
   dependencies, nothing to install. */
const mem = {};
globalThis.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
// The store reads localStorage at import time, so the fake must exist first —
// hence dynamic imports after the assignment above.
const FC_DATA = await import('../src/lib/data.js');
const FC_CALC = await import('../src/lib/calc.js');
const FC_STORE = await import('../src/lib/store.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + extra : '')); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('\n— unit conversions —');
ok('180 lb ≈ 81.6 kg', near(FC_CALC.lbToKg(180), 81.65, 0.02), FC_CALC.lbToKg(180));
ok('round-trips', near(FC_CALC.kgToLb(FC_CALC.lbToKg(180)), 180, 1e-9));
ok('5ft8 = 172.7 cm', near(FC_CALC.inToCm(68), 172.72, 0.01), FC_CALC.inToCm(68));
ok('16 oz ≈ 473 ml', near(FC_CALC.ozToMl(16), 473.2, 0.5), FC_CALC.ozToMl(16));

console.log('\n— Mifflin-St Jeor —');
// 30yo male, 81.65kg, 172.72cm: 10*81.65 + 6.25*172.72 - 5*30 + 5 = 816.5+1079.5-150+5 = 1751
const male = { sex: 'male', age: 30, heightCm: 172.72, weightKg: 81.65, baseActivity: 'light', wakeTime: '07:00', sleepTime: '23:00' };
ok('male RMR ≈ 1751', near(FC_CALC.bmr(male), 1751, 1), Math.round(FC_CALC.bmr(male)));
const female = Object.assign({}, male, { sex: 'female' });
ok('female RMR is 166 lower', near(FC_CALC.bmr(male) - FC_CALC.bmr(female), 166, 0.001));
ok('tracker resting overrides formula', FC_CALC.restingBurn(male, { restingKcal: 1900 }) === 1900);
ok('blank tracker falls back to formula', near(FC_CALC.restingBurn(male, {}), 1751, 1));

console.log('\n— burn is never double counted —');
const day = { activity: [{ minutes: 45, kcal: 400 }], wearable: { activeKcal: 620 } };
const b = FC_CALC.exerciseBurn(day);
ok('takes the larger source, not the sum', b.total === 620 && b.source === 'tracker', JSON.stringify(b));
ok('logged wins when it is larger', FC_CALC.exerciseBurn({ activity: [{ kcal: 800 }], wearable: { activeKcal: 300 } }).total === 800);
ok('nothing logged = 0', FC_CALC.exerciseBurn({}).total === 0);

console.log('\n— the plan —');
const goal = { type: 'lose', targetWeightKg: FC_CALC.lbToKg(165), pace: 'steady' };
const p0 = FC_CALC.plan(male, goal, { activity: [], wearable: {} });
ok('direction is downward', p0.dir === -1);
ok('base TDEE = RMR × 1.35', near(p0.baseTdee, 1751 * 1.35, 2), p0.baseTdee);
ok('deficit is negative', p0.dailyDelta < 0, p0.dailyDelta);
// steady = 0.6%/wk of 81.65kg = 0.49 kg/wk → 0.49*7700/7 = 539 kcal/day
ok('deficit ≈ 539 kcal', near(Math.abs(p0.dailyDelta), 539, 3), p0.dailyDelta);
ok('protein ≥ 1.8 g/kg of goal weight', p0.macros.protein >= 140, p0.macros.protein);
ok('macros add back to the target', near(p0.macros.protein * 4 + p0.macros.carbs * 4 + p0.macros.fat * 9, p0.targetToday, 6),
   p0.macros.protein * 4 + p0.macros.carbs * 4 + p0.macros.fat * 9 + ' vs ' + p0.targetToday);
ok('water ≈ 33 ml/kg', near(p0.waterMl, 33 * 81.65, 50), p0.waterMl);

console.log('\n— logging activity raises today’s food target —');
const p1 = FC_CALC.plan(male, goal, { activity: [{ minutes: 45, kcal: 400 }], wearable: {} });
ok('target rose by exactly the burn', p1.targetToday - p0.targetToday === 400, p1.targetToday - p0.targetToday);
ok('base target unchanged', p1.baseTarget === p0.baseTarget);
ok('water target rose for 45 min training', p1.waterMl > p0.waterMl, p1.waterMl + ' vs ' + p0.waterMl);

console.log('\n— safety floor —');
const tiny = { sex: 'female', age: 25, heightCm: 155, weightKg: 48, baseActivity: 'sedentary', wakeTime: '07:00', sleepTime: '23:00' };
const hardGoal = { type: 'lose', targetWeightKg: 44, pace: 'fast' };
const pf = FC_CALC.plan(tiny, hardGoal, {});
ok('never plans below the floor', pf.baseTarget >= pf.hardFloor, pf.baseTarget + ' vs ' + pf.hardFloor);
ok('flags that it was floored', pf.floored === true);
ok('effective rate is slower than requested', Math.abs(pf.effectiveKgWeek) < Math.abs(pf.requestedKgWeek),
   pf.effectiveKgWeek + ' vs ' + pf.requestedKgWeek);

ok('a routine deficit is NOT clamped', FC_CALC.plan(male, goal, {}).floored === false);
ok('a routine deficit lands where it was asked to', near(FC_CALC.plan(male, goal, {}).baseTarget, 1751 * 1.35 - 539, 3),
   FC_CALC.plan(male, goal, {}).baseTarget);
ok('men never plan under 1500', pf.hardFloor >= 1200 && FC_CALC.plan(Object.assign({}, tiny, { sex: 'male' }), hardGoal, {}).hardFloor === 1500);

console.log('\n— forecast —');
const f = FC_CALC.forecast(male, goal, p0);
// 15 lb = 6.8 kg at 0.49 kg/wk ≈ 13.9 weeks ≈ 97 days
ok('reaches goal in ~97 days', near(f.days, 97, 4), Math.round(f.days));
ok('duration reads in months and days', /month/.test(FC_CALC.humanDuration(f.days)) && /day/.test(FC_CALC.humanDuration(f.days)),
   FC_CALC.humanDuration(f.days));
ok('date is in the future', f.date > new Date());
ok('maintain has no arrival date', FC_CALC.forecast(male, { type: 'maintain', targetWeightKg: male.weightKg }, FC_CALC.plan(male, { type: 'maintain', targetWeightKg: male.weightKg, pace: 'steady' }, {})).maintenance === true);
ok('humanDuration(0) is "today"', FC_CALC.humanDuration(0) === 'today');
ok('humanDuration(45) = 1 month, 15 days', FC_CALC.humanDuration(45) === '1 month, 15 days', FC_CALC.humanDuration(45));
ok('humanDuration(Infinity) is graceful', /not reachable/.test(FC_CALC.humanDuration(Infinity)));

console.log('\n— progress —');
ok('halfway is 50%', near(FC_CALC.goalProgress(90, 85, 80), 50, 0.001));
ok('clamps past the goal', FC_CALC.goalProgress(90, 78, 80) === 100);
ok('clamps behind the start', FC_CALC.goalProgress(90, 92, 80) === 0);

console.log('\n— schedule —');
const sched = FC_CALC.schedule(male, p0);
const meals = sched.events.filter(e => e.type === 'meal');
const waters = sched.events.filter(e => e.type === 'water');
ok('has 3 meals plus snacks', meals.length >= 4 && meals.length <= 6, meals.length);
ok('first meal after waking', meals[0].at >= FC_CALC.minutesOf(male.wakeTime), FC_CALC.fmtTime(meals[0].at));
ok('last meal before bed', meals[meals.length - 1].at <= FC_CALC.minutesOf(male.sleepTime) - 60, FC_CALC.fmtTime(meals[meals.length - 1].at));
const gaps = meals.slice(1).map((m, i) => m.at - meals[i].at);
ok('gaps sit in the 2-4.5 h band', gaps.every(g => g >= 100 && g <= 270), gaps.join(','));
ok('meal calories sum to the day', near(meals.reduce((a, m) => a + m.kcal, 0), p0.targetToday, 40),
   meals.reduce((a, m) => a + m.kcal, 0) + ' vs ' + p0.targetToday);
ok('every main meal gets ≥ 20 g protein', meals.filter(m => m.slot !== 'snack').every(m => m.protein >= 20),
   meals.map(m => m.slot + ':' + m.protein).join(' '));
ok('water checkpoints cover the target', near(waters.reduce((a, w) => a + w.ml, 0), p0.waterMl, 250),
   waters.reduce((a, w) => a + w.ml, 0) + ' vs ' + p0.waterMl);
ok('events are in time order', sched.events.every((e, i, arr) => i === 0 || arr[i - 1].at <= e.at));

console.log('\n— overnight shift worker —');
const night = Object.assign({}, male, { wakeTime: '21:00', sleepTime: '13:00' });
const ns = FC_CALC.schedule(night, p0);
ok('handles a bedtime after midnight', ns.events.length > 4 && ns.events.every((e, i, a) => i === 0 || a[i - 1].at <= e.at));
ok('times wrap correctly for display', FC_CALC.fmtTime(1500) === '1:00 AM', FC_CALC.fmtTime(1500));

console.log('\n— schedule status —');
const ann = FC_CALC.annotateSchedule(sched, { food: [{ at: meals[0].at, name: 'Oats', kcal: 400 }], water: [{ ml: 2000 }] }, meals[0].at + 5);
ok('logged breakfast ticks off', ann.find(e => e.type === 'meal').done === true);
ok('cumulative water ticks off early checkpoints', ann.filter(e => e.type === 'water' && e.done).length >= 3,
   ann.filter(e => e.type === 'water' && e.done).length);
const ann2 = FC_CALC.annotateSchedule(sched, { food: [], water: [] }, meals[1].at);
ok('the current slot reads as due', ann2.filter(e => e.due).length >= 1);
ok('earlier untouched slots read as missed', ann2.filter(e => e.missed).length >= 1);

console.log('\n— the small hours —');
// 12:30 AM with a 11 PM bedtime: a fresh day, so breakfast is next, not missed.
const early = FC_CALC.annotateSchedule(sched, { food: [], water: [] }, 30);
ok('12:30 AM starts a fresh day when bedtime is 11 PM', early.every(e => !e.missed) && early.filter(e => e.upcoming).length === early.length,
   'missed=' + early.filter(e => e.missed).length + ' upcoming=' + early.filter(e => e.upcoming).length);
// Same clock time for a night-shift schedule: still mid-day, so earlier slots ARE missed.
const nsched = FC_CALC.schedule(night, p0);
const nightEarly = FC_CALC.annotateSchedule(nsched, { food: [], water: [] }, 30);
ok('12:30 AM is mid-day for a 9 PM-to-10 AM schedule', nightEarly.some(e => e.missed),
   'missed=' + nightEarly.filter(e => e.missed).length);
ok('nowAbsolute does not wrap a normal day', FC_CALC.nowAbsolute(sched, 30) === 30);
ok('nowAbsolute wraps an overnight day', FC_CALC.nowAbsolute(nsched, 30) === 1470, FC_CALC.nowAbsolute(nsched, 30));

console.log('\n— meal recommender —');
const rec = FC_CALC.recommend(FC_DATA.MEALS, { slot: 'lunch', kcal: 450, protein: 40, dir: -1, dietTest: () => true });
ok('returns lunches only', rec.every(m => m.slot === 'lunch'));
ok('sorted by score', rec.every((m, i) => i === 0 || rec[i - 1].score >= m.score));
ok('top pick is near the calorie slot', Math.abs(rec[0].kcal - 450) < 150, rec[0].name + ' ' + rec[0].kcal);
ok('cutting favours protein density', rec[0].protein / rec[0].kcal > 0.06, rec[0].name);
const bulk = FC_CALC.recommend(FC_DATA.MEALS, { slot: 'lunch', kcal: 800, protein: 50, dir: 1, dietTest: () => true });
ok('bulking surfaces a calorie-dense pick', bulk[0].kcal > 550, bulk[0].name + ' ' + bulk[0].kcal);
const bigGap = FC_CALC.recommend(FC_DATA.MEALS, { slot: 'snack', kcal: 420, protein: 30, dir: -1, dietTest: () => true });
ok('a big slot does not get a 130 kcal shake on protein density alone', bigGap[0].kcal >= 180, bigGap[0].name + ' ' + bigGap[0].kcal);
const smallGap = FC_CALC.recommend(FC_DATA.MEALS, { slot: 'snack', kcal: 160, protein: 22, dir: -1, dietTest: () => true });
ok('a small slot still gets a small, protein-dense pick', smallGap[0].kcal <= 230 && smallGap[0].protein >= 13, smallGap[0].name + ' ' + smallGap[0].kcal);
const vegan = FC_CALC.recommend(FC_DATA.MEALS, { slot: 'all', kcal: 450, protein: 30, dir: 0, dietTest: FC_DATA.DIET_FILTERS.find(d => d.id === 'vegan').test });
ok('vegan filter only returns vegan', vegan.length > 0 && vegan.every(m => m.tags.includes('vegan')), vegan.length);
const q = FC_CALC.recommend(FC_DATA.MEALS, { slot: 'all', kcal: 400, protein: 30, dir: 0, query: 'salmon', dietTest: () => true });
ok('search finds salmon dishes', q.length >= 2 && q.every(m => /salmon/i.test(m.name + m.items)), q.length);

console.log('\n— meal library sanity —');
FC_DATA.MEALS.forEach(m => {
  const kcalFromMacros = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  if (!near(kcalFromMacros, m.kcal, Math.max(60, m.kcal * 0.13)))
    { fail++; console.log('  FAIL macros do not match calories: ' + m.name + ' ' + kcalFromMacros + ' vs ' + m.kcal); }
});
ok('every meal’s macros match its calorie count', true);
ok('every slot has enough choice', ['breakfast', 'lunch', 'dinner', 'snack']
  .every(s => FC_DATA.MEALS.filter(m => m.slot === s).length >= 10));
ok('ids are unique', new Set(FC_DATA.MEALS.map(m => m.id)).size === FC_DATA.MEALS.length);
ok('vegan meals are also tagged vegetarian', FC_DATA.MEALS.filter(m => m.tags.includes('vegan')).every(m => m.tags.includes('vegetarian')));

console.log('\n— activity coach —');
const gapOpts = FC_CALC.gapOptions(400, 81.65, FC_DATA.ACTIVITIES);
ok('a jog takes fewer minutes than a walk', gapOpts.find(o => o.id === 'jog').minutes < gapOpts.find(o => o.id === 'walk').minutes);
ok('~35 min jog burns 400 kcal at 82 kg', near(gapOpts.find(o => o.id === 'jog').minutes, 35, 3), gapOpts.find(o => o.id === 'jog').minutes);
ok('weekly target is at least the 150 min guideline', FC_CALC.weeklyActivityTarget(p0).minutes >= 150);

console.log('\n— storage & the midnight reset —');
FC_STORE.setProfile(male);
FC_STORE.setGoal(goal);
FC_STORE.addFood({ name: 'Oats', kcal: 400, protein: 30, at: 480 });
FC_STORE.addWater(500, 500);
FC_STORE.addActivity({ name: 'Brisk walk', minutes: 30, kcal: 160, at: 600 });
ok('today has the entries', FC_STORE.today().food.length === 1 && FC_STORE.today().water.length === 1);
ok('start weight is captured', near(FC_STORE.get().goal.startWeightKg, male.weightKg, 0.001));

// Fast-forward: rename today's record to yesterday, exactly what midnight does.
const st = FC_STORE.get();
const todayK = FC_STORE.todayKey();
const y = new Date(); y.setDate(y.getDate() - 1);
st.days[FC_STORE.todayKey(y)] = st.days[todayK];
delete st.days[todayK];
ok('the new day starts empty', FC_STORE.today().food.length === 0 && FC_STORE.today().water.length === 0);
ok('yesterday is still on record', st.days[FC_STORE.todayKey(y)].food.length === 1);

const hist = FC_STORE.history(7, male, goal);
ok('history returns 7 days oldest-first', hist.length === 7 && hist[0].date < hist[6].date);
ok('yesterday shows its intake', hist[5].intake === 400, hist[5].intake);
ok('today reads zero', hist[6].intake === 0);
ok('unlogged days have no net delta', hist[0].netDelta === null);
ok('logged days compute a net delta', typeof hist[5].netDelta === 'number');

FC_STORE.checkInWeight(80);
ok('weigh-in updates the live profile', FC_STORE.get().profile.weightKg === 80);
ok('goal start weight is preserved across a weigh-in', near(FC_STORE.get().goal.startWeightKg, 81.65, 0.02), FC_STORE.get().goal.startWeightKg);

FC_STORE.setGoal({ type: 'lose', targetWeightKg: FC_CALC.lbToKg(165), pace: 'gentle' });
ok('changing only the pace keeps the original start weight', near(FC_STORE.get().goal.startWeightKg, 81.65, 0.02));
FC_STORE.setGoal({ type: 'lose', targetWeightKg: FC_CALC.lbToKg(150), pace: 'gentle' });
ok('a new target resets the start weight to now', near(FC_STORE.get().goal.startWeightKg, 80, 0.02), FC_STORE.get().goal.startWeightKg);

const round = FC_STORE.exportJSON();
FC_STORE.reset();
ok('reset clears everything', FC_STORE.get().profile === null);
FC_STORE.importJSON(round);
ok('export/import round-trips', FC_STORE.get().profile.weightKg === 80);

console.log('\n— forecast from logged days —');
const st2 = FC_STORE.get();
for (let i = 1; i <= 6; i++) {
  const d = new Date(); d.setDate(d.getDate() - i);
  st2.days[FC_STORE.todayKey(d)] = { food: [{ kcal: 1800, protein: 150 }], water: [], activity: [], wearable: {} };
}
const h2 = FC_STORE.history(14, st2.profile, st2.goal);
const fa = FC_CALC.forecastFromHistory(st2.profile, st2.goal, h2);
ok('builds a forecast from real days', fa && fa.samples >= 6, fa && fa.samples);
ok('a real deficit points at a real date', fa.days > 0 && isFinite(fa.days), fa && Math.round(fa.days));
for (let i = 1; i <= 6; i++) {
  const d = new Date(); d.setDate(d.getDate() - i);
  st2.days[FC_STORE.todayKey(d)].food = [{ kcal: 3600, protein: 100 }];
}
const fb = FC_CALC.forecastFromHistory(st2.profile, st2.goal, FC_STORE.history(14, st2.profile, st2.goal));
ok('eating over maintenance while cutting reports no date', fb.wrongWay === true, JSON.stringify(fb));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
