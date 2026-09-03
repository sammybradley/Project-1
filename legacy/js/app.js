/* ============================================================================
   app.js — wiring: setup form, dashboard rendering, logging, midnight reset.
   ========================================================================== */

(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

  /* View state that never needs persisting. */
  const view = { mealSlot: 'auto', mealQuery: '', logPanel: 'food' };
  let lastDayKey = FC_STORE.todayKey();

  /* ======================================================== SETUP SCREEN */

  function fillStaticSelects() {
    $('#base-activity').innerHTML = FC_CALC.BASE_ACTIVITY
      .map(a => `<option value="${a.id}">${esc(a.label)}</option>`).join('');

    const dietOpts = FC_DATA.DIET_FILTERS
      .map(d => `<option value="${d.id}">${esc(d.label)}</option>`).join('');
    $('#diet-select').innerHTML = dietOpts;
    $('#meal-diet').innerHTML = dietOpts;

    $('#activity-names').innerHTML = FC_DATA.ACTIVITIES
      .map(a => `<option value="${esc(a.name)}"></option>`).join('');
  }

  function currentSetupUnits() {
    const checked = $('#setup-form input[name="units"]:checked');
    return checked ? checked.value : 'imperial';
  }

  function renderPaceOptions(type, selected) {
    const opts = FC_CALC.paceOptions(type);
    const units = currentSetupUnits();
    const form = $('#setup-form');
    const weightKg = readSetupWeightKg(form, units) || 80;
    $('#pace-options').innerHTML = opts.map(p => {
      const perWeekKg = p.pct * weightKg;
      const shown = FC_CALC.showWeight(perWeekKg, units, 2);
      const rate = p.pct === 0 ? 'hold' : shown + ' ' + FC_CALC.weightUnit(units) + '/wk';
      return `<label class="pace-opt">
        <input type="radio" name="pace" value="${p.id}"${p.id === selected ? ' checked' : ''}>
        <span><strong>${esc(p.label)}</strong><em>${esc(rate)}</em></span>
      </label>`;
    }).join('');
    if (!$('#pace-options input:checked')) {
      const first = $('#pace-options input');
      if (first) first.checked = true;
    }
    const chosen = opts.find(p => p.id === ($('#pace-options input:checked') || {}).value) || opts[0];
    $('#pace-hint').textContent = type === 'maintain'
      ? 'Calories sit at maintenance; the plan just holds you steady.'
      : chosen.note
        ? 'Chosen: ' + chosen.label.toLowerCase() + ' — ' + chosen.note + '.'
        : '';
  }

  function readSetupWeightKg(form, units) {
    if (units === 'metric') return num(form.weightKg.value);
    return FC_CALC.lbToKg(num(form.weight.value));
  }

  function applySetupUnits(units, convert) {
    const form = $('#setup-form');
    $$('[data-units]').forEach(el => { el.hidden = el.dataset.units !== units; });
    $$('.u').forEach(el => { el.textContent = units === 'metric' ? 'kg' : 'lb'; });
    if (convert) {
      if (units === 'metric') {
        form.weightKg.value = FC_CALC.round(FC_CALC.lbToKg(num(form.weight.value)), 1);
        const totalIn = num(form.heightFt.value) * 12 + num(form.heightIn.value);
        form.heightCm.value = FC_CALC.round(FC_CALC.inToCm(totalIn), 1);
        form.targetWeight.value = FC_CALC.round(FC_CALC.lbToKg(num(form.targetWeight.value)), 1);
      } else {
        form.weight.value = FC_CALC.round(FC_CALC.kgToLb(num(form.weightKg.value)), 1);
        const totalIn = FC_CALC.cmToIn(num(form.heightCm.value));
        form.heightFt.value = Math.floor(totalIn / 12);
        form.heightIn.value = Math.round(totalIn % 12);
        form.targetWeight.value = FC_CALC.round(FC_CALC.kgToLb(num(form.targetWeight.value)), 1);
      }
    }
    renderPaceOptions($('#setup-form input[name="goalType"]:checked').value,
      ($('#pace-options input:checked') || {}).value);
  }

  function showSetup(isEdit) {
    const s = FC_STORE.get();
    const form = $('#setup-form');
    const units = s.prefs.units;

    $('input[name="units"][value="' + units + '"]').checked = true;
    $$('[data-units]').forEach(el => { el.hidden = el.dataset.units !== units; });
    $$('.u').forEach(el => { el.textContent = units === 'metric' ? 'kg' : 'lb'; });

    if (s.profile) {
      form.sex.value = s.profile.sex;
      form.age.value = s.profile.age;
      form.baseActivity.value = s.profile.baseActivity;
      form.wakeTime.value = s.profile.wakeTime;
      form.sleepTime.value = s.profile.sleepTime;
      if (units === 'metric') {
        form.heightCm.value = FC_CALC.round(s.profile.heightCm, 1);
        form.weightKg.value = FC_CALC.round(s.profile.weightKg, 1);
      } else {
        const totalIn = FC_CALC.cmToIn(s.profile.heightCm);
        form.heightFt.value = Math.floor(totalIn / 12);
        form.heightIn.value = Math.round(totalIn % 12);
        form.weight.value = FC_CALC.round(FC_CALC.kgToLb(s.profile.weightKg), 1);
      }
    }
    if (s.goal) {
      $('input[name="goalType"][value="' + s.goal.type + '"]').checked = true;
      form.targetWeight.value = FC_CALC.showWeight(s.goal.targetWeightKg, units, 1);
    }
    $('#diet-select').value = s.prefs.diet;

    renderPaceOptions($('#setup-form input[name="goalType"]:checked').value, s.goal ? s.goal.pace : 'steady');
    toggleGoalFields();

    $('#setup-cancel').hidden = !isEdit;
    $('#setup-error').hidden = true;
    $('#setup').hidden = false;
    $('#app').hidden = true;
    window.scrollTo(0, 0);
  }

  function toggleGoalFields() {
    const type = $('#setup-form input[name="goalType"]:checked').value;
    const isMaintain = type === 'maintain';
    $('#target-field').hidden = isMaintain;
    $('#pace-field').hidden = isMaintain;
  }

  function submitSetup(e) {
    e.preventDefault();
    const form = $('#setup-form');
    const units = currentSetupUnits();
    const err = msg => { const b = $('#setup-error'); b.textContent = msg; b.hidden = false; b.scrollIntoView({ block: 'center' }); };

    const age = num(form.age.value);
    const heightCm = units === 'metric' ? num(form.heightCm.value)
      : FC_CALC.inToCm(num(form.heightFt.value) * 12 + num(form.heightIn.value));
    const weightKg = readSetupWeightKg(form, units);
    const type = form.goalType.value;

    if (age < 13 || age > 100) return err('Enter an age between 13 and 100.');
    if (heightCm < 120 || heightCm > 230) return err('That height looks off — check the numbers.');
    if (weightKg < 30 || weightKg > 320) return err('That weight looks off — check the numbers.');

    let targetKg = weightKg;
    if (type !== 'maintain') {
      targetKg = units === 'metric' ? num(form.targetWeight.value) : FC_CALC.lbToKg(num(form.targetWeight.value));
      if (targetKg < 30 || targetKg > 320) return err('Enter a target weight in a realistic range.');
      if (type === 'lose' && targetKg >= weightKg) return err('Your target is not below your current weight — pick a lower target, or switch to Maintain.');
      if (type === 'gain' && targetKg <= weightKg) return err('Your target is not above your current weight — pick a higher target, or switch to Maintain.');
      const pctChange = Math.abs(targetKg - weightKg) / weightKg;
      if (pctChange > 0.5) return err('That target is more than half your body weight away. Set a nearer milestone first.');
    }

    FC_STORE.setPref('units', units);
    FC_STORE.setPref('diet', $('#diet-select').value);
    FC_STORE.setProfile({
      sex: form.sex.value,
      age: age,
      heightCm: heightCm,
      weightKg: weightKg,
      baseActivity: form.baseActivity.value,
      wakeTime: form.wakeTime.value,
      sleepTime: form.sleepTime.value
    });
    FC_STORE.setGoal({
      type: type,
      targetWeightKg: targetKg,
      pace: type === 'maintain' ? 'steady' : (($('#pace-options input:checked') || {}).value || 'steady')
    });

    $('#meal-diet').value = $('#diet-select').value;
    showDashboard();
  }

  /* ============================================================ CONTEXT */

  /* One bundle of derived numbers, rebuilt on every render. */
  function context() {
    const s = FC_STORE.get();
    const day = FC_STORE.today();
    const planned = FC_CALC.plan(s.profile, s.goal, day);
    const sched = FC_CALC.schedule(s.profile, planned);
    const events = FC_CALC.annotateSchedule(sched, day, nowMinutes());

    const eaten = day.food.reduce((a, f) => a + num(f.kcal), 0);
    const protein = day.food.reduce((a, f) => a + num(f.protein), 0);
    const carbs = day.food.reduce((a, f) => a + num(f.carbs), 0);
    const fat = day.food.reduce((a, f) => a + num(f.fat), 0);
    const water = day.water.reduce((a, w) => a + num(w.ml), 0);

    return {
      s: s, day: day, planned: planned, sched: sched, events: events,
      units: s.prefs.units,
      eaten: eaten, protein: protein, carbs: carbs, fat: fat, water: water,
      remaining: planned.targetToday - eaten
    };
  }

  /* Calories still open, shared across the eating occasions still to come.
     This is what makes the recommendations react to a big lunch. */
  function nextSlotTarget(ctx) {
    const nowAbs = FC_CALC.nowAbsolute(ctx.sched, nowMinutes());
    /* Only slots still ahead of us — a breakfast missed at 7 AM should not be
       what the app suggests at 8 PM. */
    let upcoming = ctx.events.filter(e => e.type === 'meal' && !e.done && e.at >= nowAbs - 45);
    if (!upcoming.length) upcoming = ctx.events.filter(e => e.type === 'meal' && !e.done && e.at >= nowAbs - 180);
    const weights = { breakfast: 25, lunch: 30, dinner: 30, snack: 12 };
    const proteinOpen = Math.max(0, ctx.planned.macros.protein - ctx.protein);
    if (!upcoming.length) {
      /* Every scheduled occasion is behind us. Anything still owed is offered
         as a snack, not as one enormous meal. */
      return {
        slot: 'snack',
        kcal: FC_CALC.clamp(Math.max(0, ctx.remaining), 150, 450),
        protein: Math.max(15, Math.min(35, proteinOpen)),
        none: true
      };
    }
    const totalW = upcoming.reduce((a, e) => a + weights[e.slot], 0);
    const first = upcoming[0];
    const share = weights[first.slot] / totalW;
    return {
      slot: first.slot,
      at: first.at,
      kcal: Math.max(150, Math.round(Math.max(0, ctx.remaining) * share / 5) * 5),
      protein: Math.max(15, Math.round(proteinOpen * share)),
      due: first.due
    };
  }

  /* ======================================================== RENDER: TOP */

  function renderTopbar() {
    const now = new Date();
    $('#today-label').textContent = now.toLocaleDateString(undefined,
      { weekday: 'short', month: 'short', day: 'numeric' });

    const mins = 1440 - (now.getHours() * 60 + now.getMinutes());
    const h = Math.floor(mins / 60), m = mins % 60;
    $('#reset-countdown').textContent = 'resets in ' + (h ? h + 'h ' : '') + m + 'm';
  }

  let bannerTimer;
  function banner(msg, kind) {
    const b = $('#banner');
    clearTimeout(bannerTimer);
    if (!msg) { b.hidden = true; return; }
    b.textContent = msg;
    b.className = 'banner' + (kind ? ' ' + kind : '');
    b.hidden = false;
    bannerTimer = setTimeout(() => { b.hidden = true; }, 7000);
  }

  /* ====================================================== RENDER: TODAY */

  function renderToday(ctx) {
    const p = ctx.planned, u = ctx.units;
    const pct = p.targetToday > 0 ? (ctx.eaten / p.targetToday) * 100 : 0;
    const over = ctx.eaten > p.targetToday;
    const left = p.targetToday - ctx.eaten;

    const burnBadge = p.burn.total > 0
      ? (p.burn.source === 'tracker' ? 'Tracker: ' + p.burn.tracker + ' active kcal'
        : ctx.day.activity.length + (ctx.day.activity.length === 1 ? ' session logged' : ' sessions logged'))
      : 'No activity logged yet';
    $('#today-source').textContent = burnBadge;

    const bar = (name, val, target, cls, unit) => {
      const w = target > 0 ? Math.min(100, (val / target) * 100) : 0;
      const isOver = val > target * 1.05 && target > 0;
      return `<div class="bar-row">
        <span class="n">${esc(name)}</span>
        <span class="track"><span class="fill ${cls}${isOver ? ' over' : ''}" style="width:${w.toFixed(1)}%"></span></span>
        <span class="v">${Math.round(val)} / ${Math.round(target)}${esc(unit)}</span>
      </div>`;
    };

    const macroNote = (ctx.carbs + ctx.fat) === 0 && ctx.eaten > 0
      ? '<p class="hint">Carbs and fat fill in when you log from the meal list; typed-in entries only need calories and protein.</p>'
      : '';

    $('#today-body').innerHTML = `
      <div class="today-top">
        <div class="ring" style="--pct:${Math.min(100, Math.max(0, pct)).toFixed(1)};--ring-color:${over ? 'var(--danger)' : 'var(--accent)'}"
             role="img" aria-label="${Math.round(ctx.eaten)} of ${p.targetToday} calories eaten">
          <span class="ring-in">
            <b>${Math.abs(Math.round(left))}</b>
            <span>${over ? 'kcal over' : 'kcal left'}</span>
          </span>
        </div>
        <div class="tallies">
          <div class="tally"><span class="op"></span><span class="label">Base target</span><b>${p.baseTarget}</b></div>
          <div class="tally"><span class="op">+</span><span class="label">Burned in activity</span><b>${p.burn.total}</b></div>
          <div class="tally total"><span class="op">=</span><span class="label">Today you can eat</span><b>${p.targetToday} kcal</b></div>
          <div class="tally"><span class="op">−</span><span class="label">Eaten so far</span><b>${Math.round(ctx.eaten)}</b></div>
        </div>
      </div>
      <div class="bars">
        ${bar('Protein', ctx.protein, p.macros.protein, 'protein', ' g')}
        ${bar('Carbs', ctx.carbs, p.macros.carbs, 'carbs', ' g')}
        ${bar('Fat', ctx.fat, p.macros.fat, 'fat', ' g')}
        ${bar('Water', FC_CALC.showVolume(ctx.water, u), FC_CALC.showVolume(p.waterMl, u), 'water', ' ' + FC_CALC.volumeUnit(u))}
      </div>
      ${macroNote}
      ${p.waterExtraMl > 0 ? `<div class="note">Water target is up ${FC_CALC.showVolume(p.waterExtraMl, u)} ${esc(FC_CALC.volumeUnit(u))} today to cover ${p.trainingMinutes} min of training.</div>` : ''}
      ${p.floored ? `<div class="note warn"><strong>Held at a floor.</strong> The pace you picked would put you under ${p.hardFloor} kcal, so the plan sits there instead. The forecast below already uses this slower, safer rate.</div>` : ''}
      ${p.belowResting && !p.floored ? `<div class="note">This target sits below your resting burn of ${p.resting} kcal — ordinary for a deficit, and the movement you log adds back on top of it. Going faster than this is where lean mass starts to go.</div>` : ''}
      ${p.restingFromTracker ? '<div class="note">Using your tracker’s resting-calorie reading instead of the estimate.</div>' : ''}
    `;
  }

  /* ======================================================= RENDER: GOAL */

  function renderGoal(ctx) {
    const { s, planned, units } = ctx;
    const goal = s.goal, profile = s.profile;
    const wu = FC_CALC.weightUnit(units);
    const f = FC_CALC.forecast(profile, goal, planned);
    const hist = FC_STORE.history(21, profile, goal);
    const actual = FC_CALC.forecastFromHistory(profile, goal, hist);

    let etaBig, etaSub;
    if (goal.type === 'maintain') {
      etaBig = 'Holding steady';
      etaSub = 'Eating at maintenance — no arrival date to count down.';
    } else if (f.done) {
      etaBig = 'Goal reached';
      etaSub = 'You are at your target weight. Switch to Maintain to lock it in.';
    } else if (!f.reachable) {
      etaBig = 'No arrival date';
      etaSub = 'The current settings do not move you toward the target.';
    } else {
      etaBig = FC_CALC.humanDuration(f.days);
      etaSub = 'On track for ' + f.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    }

    const startKg = goal.startWeightKg != null ? goal.startWeightKg : profile.weightKg;
    const progress = goal.type === 'maintain' ? 0
      : FC_CALC.goalProgress(startKg, profile.weightKg, goal.targetWeightKg);

    const deltaLabel = planned.dailyDelta === 0 ? 'maintenance'
      : (planned.dailyDelta < 0 ? Math.abs(planned.dailyDelta) + ' kcal deficit' : '+' + planned.dailyDelta + ' kcal surplus');

    let actualBlock = '';
    if (goal.type !== 'maintain' && actual) {
      if (actual.wrongWay) {
        actualBlock = `<div class="note warn"><strong>At your logged pace:</strong> the last ${actual.samples} logged days average
          ${actual.avgDelta > 0 ? '+' : ''}${actual.avgDelta} kcal a day against your burn, which moves you away from the target.
          Closing that gap puts the date above back in reach.</div>`;
      } else if (!actual.done) {
        actualBlock = `<div class="note"><strong>At your logged pace:</strong> ${esc(FC_CALC.humanDuration(actual.days))}
          (${actual.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}),
          from ${actual.samples} logged day${actual.samples === 1 ? '' : 's'} averaging
          ${actual.avgDelta > 0 ? '+' : ''}${actual.avgDelta} kcal against burn.</div>`;
      }
    }

    $('#goal-body').innerHTML = `
      <div class="eta">
        <div class="eta-big">${esc(etaBig)}</div>
        <div class="eta-sub">${esc(etaSub)}</div>
      </div>
      ${goal.type === 'maintain' ? '' : `
        <div class="weights">
          <span>Start <b>${FC_CALC.showWeight(startKg, units, 1)}</b></span>
          <span>Now <b>${FC_CALC.showWeight(profile.weightKg, units, 1)}</b></span>
          <span>Goal <b>${FC_CALC.showWeight(goal.targetWeightKg, units, 1)} ${esc(wu)}</b></span>
        </div>
        <div class="progress-track" role="img" aria-label="${Math.round(progress)} percent of the way to goal">
          <div class="progress-fill" style="width:${progress.toFixed(1)}%"></div>
        </div>
        <p class="hint">${Math.round(progress)}% of the way there ·
          ${FC_CALC.showWeight(Math.abs(goal.targetWeightKg - profile.weightKg), units, 1)} ${esc(wu)} to go</p>
      `}
      <div class="stat-grid">
        <div class="stat"><b>${planned.baseTarget}</b><span>base kcal / day</span></div>
        <div class="stat"><b>${esc(deltaLabel)}</b><span>daily gap</span></div>
        <div class="stat"><b>${FC_CALC.showWeight(Math.abs(planned.effectiveKgWeek), units, 2)} ${esc(wu)}</b><span>per week</span></div>
        <div class="stat"><b>${planned.macros.protein} g</b><span>protein / day</span></div>
      </div>
      ${actualBlock}
    `;
  }

  /* =================================================== RENDER: TIMELINE */

  function renderTimeline(ctx) {
    const now = nowMinutes();
    const nowAbs = FC_CALC.nowAbsolute(ctx.sched, now);
    const u = ctx.units;

    const next = ctx.events.find(e => !e.done && e.at >= nowAbs - 15);
    const missedMeals = ctx.events.filter(e => e.type === 'meal' && e.missed).length;
    $('#timeline-next').textContent = next
      ? (next.due ? 'Due now: ' + (next.type === 'water' ? 'water' : next.label.toLowerCase())
        : 'Next: ' + (next.type === 'water' ? 'water' : next.label.toLowerCase()) + ' at ' + FC_CALC.fmtTime(next.at))
      : (missedMeals ? 'Nothing left today' : 'All done');

    /* Only the row you could act on right now carries a button and a
       subtitle — thirteen buttons down the card is just noise. */
    const actionable = ctx.events.find(e => !e.done && e.at >= nowAbs - 60) || null;

    let inserted = false;
    const rows = ctx.events.map(e => {
      let marker = '';
      if (!inserted && e.at > nowAbs) {
        inserted = true;
        marker = `<li class="now-line"><span>${esc(FC_CALC.fmtTime(now))}</span></li>`;
      }
      /* "eat", not "meal" — `.meal` is the recommendation-card style and would
         wrap every timeline row in a bordered box. */
      const cls = ['tl', e.type === 'water' ? 'water' : 'eat',
        e.done ? 'done' : '', e.due ? 'due' : ''].filter(Boolean).join(' ');

      const isNext = e === actionable;
      const title = e.type === 'water'
        ? `Drink ${FC_CALC.showVolume(e.ml, u)} ${esc(FC_CALC.volumeUnit(u))}`
        : esc(e.label);
      const sub = e.type === 'water'
        ? (isNext || e.due ? 'Keeps you on pace for the day’s total' : '')
        : (e.done && e.loggedName ? esc(e.loggedName)
          : '~' + e.kcal + ' kcal · ' + e.protein + ' g protein');

      /* A water checkpoint you sailed past still ticks off as soon as the
         day's running total catches up, so it is never called "missed". */
      const badge = e.due ? '<span class="pill">now</span>'
        : (e.missed && !e.done && e.type === 'meal' ? '<span class="pill miss">missed</span>' : '');

      const action = (!e.done && (isNext || e.due)) ? (e.type === 'water'
        ? `<button class="btn btn-tiny" data-water="${e.ml}">Log it</button>`
        : `<button class="btn btn-tiny" data-jump="${esc(e.slot)}">See options</button>`) : '';

      return marker + `<li class="${cls}">
        <span class="tl-time">${esc(FC_CALC.fmtTime(e.at))}</span>
        <span class="tl-pin"></span>
        <span class="tl-body">
          <span class="tl-title">${title} ${badge}</span>
          ${sub ? '<span class="tl-sub">' + sub + '</span>' : ''}
          ${action ? '<span class="meal-actions" style="margin-top:6px">' + action + '</span>' : ''}
        </span>
      </li>`;
    }).join('');

    const tail = inserted ? '' : `<li class="now-line"><span>${esc(FC_CALC.fmtTime(now))}</span></li>`;
    $('#timeline-body').innerHTML = `<ul class="timeline">${rows}${tail}</ul>
      <p class="hint">Meals sit 3-4 hours apart across your waking day, eating stops about two hours
        before bed, and water is paced so you are not catching up at midnight. Times shift with the
        wake and sleep hours in your plan.</p>`;
  }

  /* ====================================================== RENDER: MEALS */

  function renderMeals(ctx) {
    const target = nextSlotTarget(ctx);
    const slot = view.mealSlot === 'auto' ? target.slot : view.mealSlot;
    const dietId = FC_STORE.get().prefs.diet;
    const diet = FC_DATA.DIET_FILTERS.find(d => d.id === dietId) || FC_DATA.DIET_FILTERS[0];

    $$('#meal-tabs .tab').forEach(t => t.classList.toggle('is-on', t.dataset.slot === view.mealSlot));
    $('#meals-target').textContent = view.mealSlot === 'auto'
      ? `Aim ~${target.kcal} kcal · ${target.protein} g protein`
      : `Filtered to ${slot}`;

    const list = FC_CALC.recommend(FC_DATA.MEALS, {
      slot: slot,
      kcal: target.kcal,
      protein: target.protein,
      dir: ctx.planned.dir,
      dietTest: diet.test,
      query: view.mealQuery,
      maxMinutes: 10,
      postWorkout: ctx.planned.burn.total > 250
    }).slice(0, 8);

    if (!list.length) {
      $('#meals-body').innerHTML = '<p class="empty">Nothing matches that filter. Try clearing the search or the food preference.</p>';
      return;
    }

    $('#meals-body').innerHTML = list.map((m, i) => {
      const diff = m.kcal - target.kcal;
      const fit = view.mealSlot === 'auto'
        ? (Math.abs(diff) <= 60 ? 'right on target' : (diff > 0 ? '+' + diff + ' kcal over the slot' : diff + ' kcal under'))
        : m.minutes + ' min';
      return `<article class="meal${i === 0 ? ' top' : ''}">
        <div class="meal-top">
          <span class="meal-name">${esc(m.name)}</span>
          <span class="meal-kcal">${m.kcal} kcal</span>
        </div>
        <div class="macro-line">
          <span><b>${m.protein}</b> g protein</span>
          <span><b>${m.carbs}</b> g carbs</span>
          <span><b>${m.fat}</b> g fat</span>
          <span class="tag">${m.minutes} min</span>
          ${m.tags.slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
        <div class="meal-items">${esc(m.items)}</div>
        <div class="meal-actions">
          <button class="btn btn-tiny btn-primary" data-log-meal="${esc(m.id)}">Log this</button>
          <span class="fit">${esc(fit)}</span>
        </div>
      </article>`;
    }).join('');
  }

  /* ======================================================== RENDER: LOG */

  function renderLog(ctx) {
    const u = ctx.units;
    const d = ctx.day;
    const row = (kind, id, name, meta, at) => `<li class="entry">
      <span class="e-name">${esc(name)}</span>
      <span class="e-meta">${esc(meta)}</span>
      <span class="e-time">${at != null ? esc(FC_CALC.fmtTime(at)) : ''}</span>
      <button class="x" data-del-kind="${kind}" data-del-id="${id}" aria-label="Remove ${esc(name)}">×</button>
    </li>`;

    const foodRows = d.food.map(f => row('food', f.id, f.name,
      Math.round(num(f.kcal)) + ' kcal' + (f.protein ? ' · ' + Math.round(num(f.protein)) + ' g P' : ''), f.at)).join('');
    const waterRows = d.water.map(w => row('water', w.id, 'Water',
      FC_CALC.showVolume(num(w.ml), u) + ' ' + FC_CALC.volumeUnit(u), w.at)).join('');
    const actRows = d.activity.map(a => row('activity', a.id, a.name,
      Math.round(num(a.minutes)) + ' min · ' + Math.round(num(a.kcal)) + ' kcal', a.at)).join('');

    const wearableBits = [];
    if (num(d.wearable.activeKcal)) wearableBits.push(num(d.wearable.activeKcal) + ' active kcal');
    if (num(d.wearable.restingKcal)) wearableBits.push(num(d.wearable.restingKcal) + ' resting kcal');
    if (num(d.wearable.steps)) wearableBits.push(num(d.wearable.steps).toLocaleString() + ' steps');

    $('#log-list').innerHTML = `
      ${d.food.length ? `<div class="log-group-title">Food · ${Math.round(ctx.eaten)} kcal</div><ul class="entries">${foodRows}</ul>` : ''}
      ${d.water.length ? `<div class="log-group-title">Water · ${FC_CALC.showVolume(ctx.water, u)} ${esc(FC_CALC.volumeUnit(u))}</div><ul class="entries">${waterRows}</ul>` : ''}
      ${d.activity.length ? `<div class="log-group-title">Activity · ${ctx.planned.burn.logged} kcal</div><ul class="entries">${actRows}</ul>` : ''}
      ${wearableBits.length ? `<div class="log-group-title">From your tracker</div><ul class="entries"><li class="entry"><span class="e-name">${esc(wearableBits.join(' · '))}</span></li></ul>` : ''}
      ${d.weightKg ? `<div class="log-group-title">Weigh-in</div><ul class="entries"><li class="entry"><span class="e-name">${FC_CALC.showWeight(d.weightKg, u, 1)} ${esc(FC_CALC.weightUnit(u))} today</span></li></ul>` : ''}
      ${(!d.food.length && !d.water.length && !d.activity.length && !wearableBits.length) ? '<p class="empty">Nothing logged yet today. Everything resets to zero at midnight.</p>' : ''}
    `;

    $('#water-unit').textContent = FC_CALC.volumeUnit(u);
    $('#weight-unit').textContent = FC_CALC.weightUnit(u);

    /* Quick-add sizes people actually pour, in whichever unit is on. */
    const chips = u === 'metric' ? [250, 500, 1000]
      : [8, 16, 32].map(oz => Math.round(FC_CALC.ozToMl(oz)));
    $('#water-chips').innerHTML = chips.map(ml =>
      `<button class="btn btn-chip" data-water="${ml}">+ ${FC_CALC.showVolume(ml, u)} ${esc(FC_CALC.volumeUnit(u))}</button>`
    ).join('');
  }

  /* ====================================================== RENDER: COACH */

  function renderCoach(ctx) {
    const { planned, s } = ctx;
    const week = FC_STORE.weekActivity();
    const wt = FC_CALC.weeklyActivityTarget(planned);
    const kg = s.profile.weightKg;
    const steps = num(ctx.day.wearable.steps);

    let lead, opts = '';
    const over = ctx.eaten - planned.targetToday;

    if (over > 50) {
      const gap = FC_CALC.gapOptions(over, kg, FC_DATA.ACTIVITIES).slice(0, 4);
      lead = `You are <strong>${Math.round(over)} kcal</strong> past today's number. Any one of these puts you back level:`;
      opts = '<div class="opt-row">' + gap.map(g =>
        `<span class="opt">${esc(g.name)} <b>${g.minutes} min</b></span>`).join('') + '</div>';
    } else if (planned.burn.total === 0 && nowMinutes() > 15 * 60) {
      const gap = FC_CALC.gapOptions(250, kg, FC_DATA.ACTIVITIES).slice(0, 3);
      lead = 'Nothing logged today. A single easy session keeps the weekly total on pace and earns back a few hundred calories of food:';
      opts = '<div class="opt-row">' + gap.map(g =>
        `<span class="opt">${esc(g.name)} <b>${g.minutes} min</b></span>`).join('') + '</div>';
    } else if (planned.burn.total > 0) {
      lead = `<strong>${planned.burn.total} kcal</strong> burned today, which raised what you can eat to
        <strong>${planned.targetToday} kcal</strong>. Eat the difference — training on a hole in the budget is how the muscle goes.`;
    } else {
      lead = 'Nothing logged yet. Add a walk or a session and today’s food target rises to match it.';
    }

    const minPct = Math.min(100, (week.minutes / wt.minutes) * 100);
    const daysGone = week.dayOfWeek + 1;
    const pace = week.minutes >= wt.minutes * (daysGone / 7)
      ? 'ahead of pace for the week' : 'behind pace for the week';

    $('#coach-body').innerHTML = `
      <p class="coach-lead">${lead}</p>
      ${opts}
      <div class="bars" style="margin-top:16px">
        <div class="bar-row">
          <span class="n">This week</span>
          <span class="track"><span class="fill protein" style="width:${minPct.toFixed(1)}%"></span></span>
          <span class="v">${week.minutes} / ${wt.minutes} min</span>
        </div>
        <div class="bar-row">
          <span class="n">Strength</span>
          <span class="track"><span class="fill fat" style="width:${Math.min(100, (week.strength / wt.strengthSessions) * 100).toFixed(1)}%"></span></span>
          <span class="v">${week.strength} / ${wt.strengthSessions} days</span>
        </div>
        ${steps ? `<div class="bar-row">
          <span class="n">Steps</span>
          <span class="track"><span class="fill water" style="width:${Math.min(100, (steps / wt.steps) * 100).toFixed(1)}%"></span></span>
          <span class="v">${steps.toLocaleString()} / ${wt.steps.toLocaleString()}</span>
        </div>` : ''}
      </div>
      <p class="hint">Target for your goal: ${wt.minutes} minutes of moderate movement and
        ${wt.strengthSessions} strength days a week, ${wt.steps.toLocaleString()} steps a day.
        You are ${esc(pace)}. Name a session "strength training" and it counts toward the strength row.</p>
    `;
  }

  /* ==================================================== RENDER: HISTORY */

  function renderHistory(ctx) {
    const hist = FC_STORE.history(14, ctx.s.profile, ctx.s.goal);
    const target = ctx.planned.baseTarget;
    const max = Math.max(target * 1.35, ...hist.map(h => h.intake), 1);
    const logged = hist.filter(h => h.entries > 0);

    const cols = hist.map(h => {
      const pct = (h.intake / max) * 100;
      const cls = h.entries === 0 ? 'none' : (h.intake > target * 1.05 ? 'over' : '');
      const label = h.entries === 0 ? 'no log' : Math.round(h.intake) + ' kcal';
      return `<div class="chart-col" title="${h.date.toLocaleDateString()} — ${esc(label)}">
        <div class="chart-bar ${cls}" style="height:${Math.max(2, pct).toFixed(1)}%"></div>
      </div>`;
    }).join('');

    const labels = hist.map((h, i) =>
      `<span>${i % 2 === 0 || i === hist.length - 1 ? h.date.getDate() : ''}</span>`).join('');

    const avgIntake = logged.length ? Math.round(logged.reduce((a, h) => a + h.intake, 0) / logged.length) : 0;
    const avgBurn = logged.length ? Math.round(logged.reduce((a, h) => a + h.burn, 0) / logged.length) : 0;
    const avgWater = logged.length ? Math.round(logged.reduce((a, h) => a + h.water, 0) / logged.length) : 0;
    const onTarget = logged.filter(h => Math.abs(h.intake - target) <= target * 0.08).length;

    const weighIns = hist.filter(h => h.weightKg != null);
    let trend = '';
    if (weighIns.length >= 2) {
      const change = weighIns[weighIns.length - 1].weightKg - weighIns[0].weightKg;
      trend = `<div class="note">Weigh-ins over this stretch: ${change > 0 ? '+' : ''}${FC_CALC.showWeight(change, ctx.units, 1)} ${esc(FC_CALC.weightUnit(ctx.units))} across ${weighIns.length} check-ins.</div>`;
    }

    $('#history-badge').textContent = logged.length
      ? logged.length + ' day' + (logged.length === 1 ? '' : 's') + ' logged'
      : 'nothing logged yet';

    $('#history-body').innerHTML = `
      <div class="chart" style="position:relative">
        <div class="chart-target" style="position:absolute;left:0;right:0;bottom:${((target / max) * 100).toFixed(1)}%"></div>
        ${cols}
      </div>
      <div class="chart-labels">${labels}</div>
      <div class="legend">
        <span><i class="swatch" style="background:var(--accent)"></i>at or under target</span>
        <span><i class="swatch" style="background:var(--danger)"></i>over target</span>
        <span><i class="swatch" style="background:var(--line-strong)"></i>dashed line = ${target} kcal base target</span>
      </div>
      ${logged.length ? `<div class="stat-grid">
        <div class="stat"><b>${avgIntake}</b><span>avg kcal eaten</span></div>
        <div class="stat"><b>${avgBurn}</b><span>avg kcal burned</span></div>
        <div class="stat"><b>${FC_CALC.showVolume(avgWater, ctx.units)} ${esc(FC_CALC.volumeUnit(ctx.units))}</b><span>avg water</span></div>
        <div class="stat"><b>${onTarget}/${logged.length}</b><span>days within 8% of target</span></div>
      </div>` : '<p class="empty">Log a day or two and the pattern shows up here.</p>'}
      ${trend}
    `;
  }

  /* ============================================================= RENDER */

  function render() {
    const s = FC_STORE.get();
    if (!s.profile || !s.goal) { showSetup(false); return; }
    const ctx = context();
    renderTopbar();
    renderToday(ctx);
    renderGoal(ctx);
    renderTimeline(ctx);
    renderMeals(ctx);
    renderLog(ctx);
    renderCoach(ctx);
    renderHistory(ctx);
  }

  function showDashboard() {
    $('#setup').hidden = true;
    $('#app').hidden = false;
    $('#meal-diet').value = FC_STORE.get().prefs.diet;
    render();
  }

  /* ============================================================= EVENTS */

  function bindSetup() {
    $('#setup-form').addEventListener('submit', submitSetup);
    $('#setup-cancel').addEventListener('click', () => showDashboard());

    $$('#setup-form input[name="units"]').forEach(r =>
      r.addEventListener('change', () => applySetupUnits(r.value, true)));

    $$('#setup-form input[name="goalType"]').forEach(r =>
      r.addEventListener('change', () => {
        toggleGoalFields();
        renderPaceOptions(r.value, ($('#pace-options input:checked') || {}).value);
      }));

    $('#pace-options').addEventListener('change', () =>
      renderPaceOptions($('#setup-form input[name="goalType"]:checked').value,
        ($('#pace-options input:checked') || {}).value));

    ['weight', 'weightKg'].forEach(n => {
      const el = $('#setup-form [name="' + n + '"]');
      if (el) el.addEventListener('change', () =>
        renderPaceOptions($('#setup-form input[name="goalType"]:checked').value,
          ($('#pace-options input:checked') || {}).value));
    });
  }

  function bindDashboard() {
    $('#btn-edit').addEventListener('click', () => showSetup(true));

    $('#btn-export').addEventListener('click', () => {
      const blob = new Blob([FC_STORE.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fuelcast-' + FC_STORE.todayKey() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('Erase your plan and every logged day from this browser?')) return;
      FC_STORE.reset();
      location.reload();
    });

    /* Meal slot tabs + filters */
    $('#meal-tabs').addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      view.mealSlot = tab.dataset.slot;
      render();
    });
    $('#meal-diet').addEventListener('change', e => {
      FC_STORE.setPref('diet', e.target.value);
      $('#diet-select').value = e.target.value;
      render();
    });
    let searchTimer;
    $('#meal-search').addEventListener('input', e => {
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(() => { view.mealQuery = v; renderMeals(context()); }, 180);
    });

    /* Log tabs */
    $('#log-tabs').addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      view.logPanel = tab.dataset.panel;
      $$('#log-tabs .tab').forEach(t => t.classList.toggle('is-on', t === tab));
      $$('#card-log .panel').forEach(p => { p.hidden = p.dataset.panel !== view.logPanel; });
    });

    /* One delegated click handler for everything the cards render. */
    document.addEventListener('click', e => {
      const logMeal = e.target.closest('[data-log-meal]');
      if (logMeal) {
        const meal = FC_DATA.MEALS.find(m => m.id === logMeal.dataset.logMeal);
        if (meal) {
          FC_STORE.addFood({
            name: meal.name, kcal: meal.kcal, protein: meal.protein,
            carbs: meal.carbs, fat: meal.fat, at: nowMinutes(), mealId: meal.id
          });
          banner(meal.name + ' logged — ' + meal.kcal + ' kcal.');
          render();
        }
        return;
      }

      const water = e.target.closest('[data-water]');
      if (water) {
        FC_STORE.addWater(num(water.dataset.water), nowMinutes());
        render();
        return;
      }

      const jump = e.target.closest('[data-jump]');
      if (jump) {
        view.mealSlot = jump.dataset.jump;
        render();
        $('#card-meals').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const del = e.target.closest('[data-del-id]');
      if (del) {
        FC_STORE.remove(del.dataset.delKind, del.dataset.delId);
        render();
      }
    });

    /* Quick-add forms */
    $('#form-food').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      FC_STORE.addFood({
        name: f.elements.name.value.trim() || 'Food',
        kcal: Math.max(0, num(f.kcal.value)),
        protein: Math.max(0, num(f.protein.value)),
        at: nowMinutes()
      });
      f.reset();
      render();
    });

    $('#form-water').addEventListener('submit', e => {
      e.preventDefault();
      const amount = num(e.target.amount.value);
      if (amount <= 0) return;
      const ml = FC_STORE.get().prefs.units === 'metric' ? amount : FC_CALC.ozToMl(amount);
      FC_STORE.addWater(Math.round(ml), nowMinutes());
      e.target.reset();
      render();
    });

    $('#form-activity').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const name = f.elements.name.value.trim() || 'Activity';
      const minutes = Math.max(1, num(f.minutes.value));
      let kcal = num(f.kcal.value);
      if (!kcal) {
        /* No number from the wearable? Estimate from the MET table. */
        const match = FC_DATA.ACTIVITIES.find(a => a.name.toLowerCase() === name.toLowerCase())
          || FC_DATA.ACTIVITIES.find(a => name.toLowerCase().includes(a.id));
        const met = match ? match.met : 5;
        kcal = Math.round(FC_CALC.kcalPerMinute(met, FC_STORE.get().profile.weightKg) * minutes);
        banner('Estimated ' + kcal + ' kcal for ' + minutes + ' min of ' + name.toLowerCase() + '.');
      } else {
        banner(null);
      }
      FC_STORE.addActivity({ name: name, minutes: minutes, kcal: kcal, at: nowMinutes() });
      f.reset();
      render();
    });

    $('#form-wearable').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const patch = {};
      if (f.activeKcal.value !== '') patch.activeKcal = Math.max(0, num(f.activeKcal.value));
      if (f.restingKcal.value !== '') patch.restingKcal = Math.max(0, num(f.restingKcal.value));
      if (f.steps.value !== '') patch.steps = Math.max(0, num(f.steps.value));
      FC_STORE.setWearable(patch);
      banner('Tracker numbers saved — today’s targets updated.');
      render();
    });

    $('#form-weight').addEventListener('submit', e => {
      e.preventDefault();
      const v = num(e.target.weight.value);
      if (v <= 0) return;
      const kg = FC_STORE.get().prefs.units === 'metric' ? v : FC_CALC.lbToKg(v);
      if (kg < 30 || kg > 320) { banner('That weight is outside the range the app handles.', 'warn'); return; }
      FC_STORE.checkInWeight(kg);
      e.target.reset();
      banner('Weigh-in saved — the forecast has been redrawn.');
      render();
    });
  }

  /* ================================================ CLOCK & DAY ROLLOVER */

  /* The calorie count resets at 12:00 AM because each day is stored under its
     own local-date key. This tick notices the change and redraws. */
  function tick() {
    const key = FC_STORE.todayKey();
    if (key !== lastDayKey) {
      lastDayKey = key;
      view.mealSlot = 'auto';
      banner('Midnight — a new day. Calories, water and activity are back to zero.');
      render();
      return;
    }
    if ($('#app').hidden) return;
    renderTopbar();
    const ctx = context();
    renderTimeline(ctx);
    renderMeals(ctx);
  }

  /* ================================================================ BOOT */

  function boot() {
    fillStaticSelects();
    bindSetup();
    bindDashboard();

    const s = FC_STORE.get();
    if (s.profile && s.goal) showDashboard(); else showSetup(false);

    setInterval(tick, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
