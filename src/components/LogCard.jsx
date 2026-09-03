/* ============================================================================
   LogCard.jsx — the Log card: quick-add forms (food, water, activity,
   tracker numbers, weight) plus today's entry list with delete.
   Ported from legacy renderLog() + the form handlers in app.js.
   ========================================================================== */

import { useState } from 'react';
import * as FC_CALC from '../lib/calc.js';
import * as FC_STORE from '../lib/store.js';
import { ACTIVITIES } from '../lib/data.js';
import { nowMinutes } from '../hooks.js';

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

export default function LogCard({ ctx, showBanner }) {
  /* View state that never needs persisting. */
  const [logPanel, setLogPanel] = useState('food');

  const u = ctx.units;
  const d = ctx.day;

  /* ------------------------------------------------------- quick-add forms */

  function submitFood(e) {
    e.preventDefault();
    const f = e.target;
    FC_STORE.addFood({
      name: f.elements.name.value.trim() || 'Food',
      kcal: Math.max(0, num(f.kcal.value)),
      protein: Math.max(0, num(f.protein.value)),
      at: nowMinutes()
    });
    f.reset();
  }

  function submitWater(e) {
    e.preventDefault();
    const amount = num(e.target.amount.value);
    if (amount <= 0) return;
    const ml = FC_STORE.get().prefs.units === 'metric' ? amount : FC_CALC.ozToMl(amount);
    FC_STORE.addWater(Math.round(ml), nowMinutes());
    e.target.reset();
  }

  function submitActivity(e) {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.name.value.trim() || 'Activity';
    const minutes = Math.max(1, num(f.minutes.value));
    let kcal = num(f.kcal.value);
    if (!kcal) {
      /* No number from the wearable? Estimate from the MET table. */
      const match = ACTIVITIES.find(a => a.name.toLowerCase() === name.toLowerCase())
        || ACTIVITIES.find(a => name.toLowerCase().includes(a.id));
      const met = match ? match.met : 5;
      kcal = Math.round(FC_CALC.kcalPerMinute(met, FC_STORE.get().profile.weightKg) * minutes);
      showBanner('Estimated ' + kcal + ' kcal for ' + minutes + ' min of ' + name.toLowerCase() + '.');
    } else {
      showBanner(null);
    }
    FC_STORE.addActivity({ name: name, minutes: minutes, kcal: kcal, at: nowMinutes() });
    f.reset();
  }

  function submitWearable(e) {
    e.preventDefault();
    const f = e.target;
    const patch = {};
    if (f.activeKcal.value !== '') patch.activeKcal = Math.max(0, num(f.activeKcal.value));
    if (f.restingKcal.value !== '') patch.restingKcal = Math.max(0, num(f.restingKcal.value));
    if (f.steps.value !== '') patch.steps = Math.max(0, num(f.steps.value));
    FC_STORE.setWearable(patch);
    showBanner('Tracker numbers saved — today’s targets updated.');
  }

  function submitWeight(e) {
    e.preventDefault();
    const v = num(e.target.weight.value);
    if (v <= 0) return;
    const kg = FC_STORE.get().prefs.units === 'metric' ? v : FC_CALC.lbToKg(v);
    if (kg < 30 || kg > 320) { showBanner('That weight is outside the range the app handles.', 'warn'); return; }
    FC_STORE.checkInWeight(kg);
    e.target.reset();
    showBanner('Weigh-in saved — the forecast has been redrawn.');
  }

  /* ------------------------------------------------------------ entry list */

  const row = (kind, id, name, meta, at) => (
    <li className="entry" key={id}>
      <span className="e-name">{name}</span>
      <span className="e-meta">{meta}</span>
      <span className="e-time">{at != null ? FC_CALC.fmtTime(at) : ''}</span>
      <button className="x" data-del-kind={kind} data-del-id={id} aria-label={'Remove ' + name}
        onClick={() => FC_STORE.remove(kind, id)}>×</button>
    </li>
  );

  const foodRows = d.food.map(f => row('food', f.id, f.name,
    Math.round(num(f.kcal)) + ' kcal' + (f.protein ? ' · ' + Math.round(num(f.protein)) + ' g P' : ''), f.at));
  const waterRows = d.water.map(w => row('water', w.id, 'Water',
    FC_CALC.showVolume(num(w.ml), u) + ' ' + FC_CALC.volumeUnit(u), w.at));
  const actRows = d.activity.map(a => row('activity', a.id, a.name,
    Math.round(num(a.minutes)) + ' min · ' + Math.round(num(a.kcal)) + ' kcal', a.at));

  const wearableBits = [];
  if (num(d.wearable.activeKcal)) wearableBits.push(num(d.wearable.activeKcal) + ' active kcal');
  if (num(d.wearable.restingKcal)) wearableBits.push(num(d.wearable.restingKcal) + ' resting kcal');
  if (num(d.wearable.steps)) wearableBits.push(num(d.wearable.steps).toLocaleString() + ' steps');

  /* Quick-add sizes people actually pour, in whichever unit is on. */
  const chips = u === 'metric' ? [250, 500, 1000]
    : [8, 16, 32].map(oz => Math.round(FC_CALC.ozToMl(oz)));

  const tab = (panel, label) => (
    <button className={'tab' + (logPanel === panel ? ' is-on' : '')} data-panel={panel} role="tab"
      onClick={() => setLogPanel(panel)}>{label}</button>
  );

  return (
    <section className="card span-2" id="card-log" aria-labelledby="h-log">
      <div className="card-head"><h2 id="h-log">Log</h2></div>
      <div className="tabs" id="log-tabs" role="tablist" aria-label="What to log">
        {tab('food', 'Food')}
        {tab('water', 'Water')}
        {tab('activity', 'Activity')}
        {tab('weight', 'Weight')}
      </div>

      <div className="panel" data-panel="food" hidden={logPanel !== 'food'}>
        <form id="form-food" className="mini-form" onSubmit={submitFood}>
          <input type="text" name="name" placeholder="What did you eat?" required aria-label="Food name" />
          <input type="number" name="kcal" placeholder="kcal" min="0" max="5000" step="1" required inputMode="numeric" aria-label="Calories" />
          <input type="number" name="protein" placeholder="protein g" min="0" max="400" step="1" inputMode="numeric" aria-label="Protein grams" />
          <button className="btn btn-primary" type="submit">Add</button>
        </form>
      </div>

      <div className="panel" data-panel="water" hidden={logPanel !== 'water'}>
        <div className="quick-row" id="water-chips">
          {chips.map(ml => (
            <button className="btn btn-chip" data-water={ml} key={ml}
              onClick={() => FC_STORE.addWater(ml, nowMinutes())}>+ {FC_CALC.showVolume(ml, u)} {FC_CALC.volumeUnit(u)}</button>
          ))}
        </div>
        <form id="form-water" className="mini-form" onSubmit={submitWater}>
          <input type="number" name="amount" placeholder="custom amount" min="1" max="4000" step="1" required inputMode="numeric" aria-label="Water amount" />
          <span className="unit-tag" id="water-unit">{FC_CALC.volumeUnit(u)}</span>
          <button className="btn btn-primary" type="submit">Add</button>
        </form>
      </div>

      <div className="panel" data-panel="activity" hidden={logPanel !== 'activity'}>
        <form id="form-activity" className="mini-form" onSubmit={submitActivity}>
          <input type="text" name="name" placeholder="Activity (e.g. Strength training)" required aria-label="Activity name" list="activity-names" />
          <datalist id="activity-names">
            {ACTIVITIES.map(a => <option value={a.name} key={a.id}></option>)}
          </datalist>
          <input type="number" name="minutes" placeholder="min" min="1" max="600" step="1" required inputMode="numeric" aria-label="Minutes" />
          <input type="number" name="kcal" placeholder="kcal burned" min="0" max="5000" step="1" inputMode="numeric" aria-label="Calories burned" />
          <button className="btn btn-primary" type="submit">Add</button>
        </form>
        <p className="hint">Leave calories blank and Fuelcast estimates them from the activity, your weight and the duration.</p>

        <form id="form-wearable" className="mini-form wearable" onSubmit={submitWearable}>
          <strong className="mini-label">Straight from the tracker</strong>
          <input type="number" name="activeKcal" placeholder="active kcal today" min="0" max="8000" step="1" inputMode="numeric" aria-label="Active calories from tracker" />
          <input type="number" name="restingKcal" placeholder="resting kcal" min="0" max="5000" step="1" inputMode="numeric" aria-label="Resting calories from tracker" />
          <input type="number" name="steps" placeholder="steps" min="0" max="100000" step="1" inputMode="numeric" aria-label="Steps" />
          <button className="btn" type="submit">Save</button>
        </form>
        <p className="hint">Your tracker's active-calorie total already includes your workouts, so Fuelcast uses
          whichever is larger — the tracker figure or your logged sessions — never both.</p>
      </div>

      <div className="panel" data-panel="weight" hidden={logPanel !== 'weight'}>
        <form id="form-weight" className="mini-form" onSubmit={submitWeight}>
          <input type="number" name="weight" placeholder="today's weight" min="30" max="700" step="0.1" required inputMode="decimal" aria-label="Today's weight" />
          <span className="unit-tag" id="weight-unit">{FC_CALC.weightUnit(u)}</span>
          <button className="btn btn-primary" type="submit">Check in</button>
        </form>
        <p className="hint">Weighing in updates every target and pushes the forecast date forward or back.</p>
      </div>

      <div id="log-list">
        {d.food.length ? <>
          <div className="log-group-title">Food · {Math.round(ctx.eaten)} kcal</div>
          <ul className="entries">{foodRows}</ul>
        </> : null}
        {d.water.length ? <>
          <div className="log-group-title">Water · {FC_CALC.showVolume(ctx.water, u)} {FC_CALC.volumeUnit(u)}</div>
          <ul className="entries">{waterRows}</ul>
        </> : null}
        {d.activity.length ? <>
          <div className="log-group-title">Activity · {ctx.planned.burn.logged} kcal</div>
          <ul className="entries">{actRows}</ul>
        </> : null}
        {wearableBits.length ? <>
          <div className="log-group-title">From your tracker</div>
          <ul className="entries"><li className="entry"><span className="e-name">{wearableBits.join(' · ')}</span></li></ul>
        </> : null}
        {d.weightKg ? <>
          <div className="log-group-title">Weigh-in</div>
          <ul className="entries"><li className="entry"><span className="e-name">{FC_CALC.showWeight(d.weightKg, u, 1)} {FC_CALC.weightUnit(u)} today</span></li></ul>
        </> : null}
        {(!d.food.length && !d.water.length && !d.activity.length && !wearableBits.length)
          ? <p className="empty">Nothing logged yet today. Everything resets to zero at midnight.</p> : null}
      </div>
    </section>
  );
}
