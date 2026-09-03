/* ============================================================================
   Setup.jsx — the setup / edit-plan screen. Ports legacy index.html's
   <main id="setup"> form plus app.js's setup behaviors (fillStaticSelects,
   currentSetupUnits, renderPaceOptions, readSetupWeightKg, applySetupUnits,
   showSetup, toggleGoalFields, submitSetup, bindSetup) as one controlled form.
   ========================================================================== */

import { useState, useEffect, useRef } from 'react';
import * as FC_CALC from '../lib/calc.js';
import * as FC_STORE from '../lib/store.js';
import { DIET_FILTERS } from '../lib/data.js';

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

/* Mirrors legacy readSetupWeightKg(form, units). */
function readSetupWeightKg(f, units) {
  if (units === 'metric') return num(f.weightKg);
  return FC_CALC.lbToKg(num(f.weight));
}

/* Initial field values — from the saved profile/goal/prefs when they exist
   (Edit plan), else the HTML defaults. Mirrors legacy showSetup(). */
function initialForm() {
  const s = FC_STORE.get();
  const units = s.prefs.units;

  const f = {
    units: units,
    sex: 'female',
    age: '30',
    heightFt: '5',
    heightIn: '8',
    weight: '180',
    heightCm: '173',
    weightKg: '82',
    baseActivity: FC_CALC.BASE_ACTIVITY[0].id,
    wakeTime: '07:00',
    sleepTime: '23:00',
    goalType: 'lose',
    targetWeight: '165',
    pace: 'steady',
    diet: s.prefs.diet
  };

  if (s.profile) {
    f.sex = s.profile.sex;
    f.age = String(s.profile.age);
    f.baseActivity = s.profile.baseActivity;
    f.wakeTime = s.profile.wakeTime;
    f.sleepTime = s.profile.sleepTime;
    if (units === 'metric') {
      f.heightCm = String(FC_CALC.round(s.profile.heightCm, 1));
      f.weightKg = String(FC_CALC.round(s.profile.weightKg, 1));
    } else {
      const totalIn = FC_CALC.cmToIn(s.profile.heightCm);
      f.heightFt = String(Math.floor(totalIn / 12));
      f.heightIn = String(Math.round(totalIn % 12));
      f.weight = String(FC_CALC.round(FC_CALC.kgToLb(s.profile.weightKg), 1));
    }
  }
  if (s.goal) {
    f.goalType = s.goal.type;
    f.targetWeight = String(FC_CALC.showWeight(s.goal.targetWeightKg, units, 1));
    f.pace = s.goal.pace;
  }
  return f;
}

export default function Setup({ isEdit, onDone, onCancel }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState(null); // { msg } — new object per err() so repeat errors re-scroll
  const errRef = useRef(null);

  /* Legacy showSetup ends with window.scrollTo(0, 0). */
  useEffect(() => { window.scrollTo(0, 0); }, []);

  /* Legacy err() scrolls the alert into view every time it fires. */
  useEffect(() => {
    if (error && errRef.current) errRef.current.scrollIntoView({ block: 'center' });
  }, [error]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const units = form.units;
  const unitLabel = units === 'metric' ? 'kg' : 'lb';

  /* Pace options — mirrors legacy renderPaceOptions(type, selected): per-week
     labels computed from the typed weight (fallback 80 kg); the selection is
     preserved when still present in the option list, else the first option. */
  const paceOpts = FC_CALC.paceOptions(form.goalType);
  const paceWeightKg = readSetupWeightKg(form, units) || 80;
  const effectivePace = paceOpts.some(p => p.id === form.pace) ? form.pace : paceOpts[0].id;
  const chosen = paceOpts.find(p => p.id === effectivePace) || paceOpts[0];
  const paceHint = form.goalType === 'maintain'
    ? 'Calories sit at maintenance; the plan just holds you steady.'
    : chosen.note
      ? 'Chosen: ' + chosen.label.toLowerCase() + ' — ' + chosen.note + '.'
      : '';

  const isMaintain = form.goalType === 'maintain';

  /* Units toggle CONVERTS the currently-typed values — legacy
     applySetupUnits(units, convert=true). */
  function changeUnits(next) {
    setForm(f => {
      const out = { ...f, units: next };
      if (next === 'metric') {
        out.weightKg = String(FC_CALC.round(FC_CALC.lbToKg(num(f.weight)), 1));
        const totalIn = num(f.heightFt) * 12 + num(f.heightIn);
        out.heightCm = String(FC_CALC.round(FC_CALC.inToCm(totalIn), 1));
        out.targetWeight = String(FC_CALC.round(FC_CALC.lbToKg(num(f.targetWeight)), 1));
      } else {
        out.weight = String(FC_CALC.round(FC_CALC.kgToLb(num(f.weightKg)), 1));
        const totalIn = FC_CALC.cmToIn(num(f.heightCm));
        out.heightFt = String(Math.floor(totalIn / 12));
        out.heightIn = String(Math.round(totalIn % 12));
        out.targetWeight = String(FC_CALC.round(FC_CALC.kgToLb(num(f.targetWeight)), 1));
      }
      return out;
    });
  }

  /* Legacy's goalType change handler re-renders the pace options with the
     currently-checked pace — so a selection lost to a shorter list (maintain)
     stays lost when switching back. Committing effectivePace reproduces that. */
  function changeGoalType(v) {
    setForm(f => ({ ...f, goalType: v, pace: effectivePace }));
  }

  function submitSetup(e) {
    e.preventDefault();
    const err = msg => setError({ msg });

    const age = num(form.age);
    const heightCm = units === 'metric' ? num(form.heightCm)
      : FC_CALC.inToCm(num(form.heightFt) * 12 + num(form.heightIn));
    const weightKg = readSetupWeightKg(form, units);
    const type = form.goalType;

    if (age < 13 || age > 100) return err('Enter an age between 13 and 100.');
    if (heightCm < 120 || heightCm > 230) return err('That height looks off — check the numbers.');
    if (weightKg < 30 || weightKg > 320) return err('That weight looks off — check the numbers.');

    let targetKg = weightKg;
    if (type !== 'maintain') {
      targetKg = units === 'metric' ? num(form.targetWeight) : FC_CALC.lbToKg(num(form.targetWeight));
      if (targetKg < 30 || targetKg > 320) return err('Enter a target weight in a realistic range.');
      if (type === 'lose' && targetKg >= weightKg) return err('Your target is not below your current weight — pick a lower target, or switch to Maintain.');
      if (type === 'gain' && targetKg <= weightKg) return err('Your target is not above your current weight — pick a higher target, or switch to Maintain.');
      const pctChange = Math.abs(targetKg - weightKg) / weightKg;
      if (pctChange > 0.5) return err('That target is more than half your body weight away. Set a nearer milestone first.');
    }

    FC_STORE.setPref('units', units);
    FC_STORE.setPref('diet', form.diet);
    FC_STORE.setProfile({
      sex: form.sex,
      age: age,
      heightCm: heightCm,
      weightKg: weightKg,
      baseActivity: form.baseActivity,
      wakeTime: form.wakeTime,
      sleepTime: form.sleepTime
    });
    FC_STORE.setGoal({
      type: type,
      targetWeightKg: targetKg,
      pace: type === 'maintain' ? 'steady' : (effectivePace || 'steady')
    });

    onDone();
  }

  return (
    <main id="setup" className="setup">
      <form id="setup-form" className="setup-card" noValidate onSubmit={submitSetup}>
        <header className="setup-head">
          <h1 className="brand"><span className="brand-mark">◔</span> Fuelcast</h1>
          <p className="lede">Enter what your tracker already knows about you. Fuelcast turns it into
            meals, snacks, water and the times to take them, then tells you the date you arrive.</p>
        </header>

        <fieldset className="fs">
          <legend>Units</legend>
          <div className="seg" role="radiogroup" aria-label="Units">
            <label>
              <input type="radio" name="units" value="imperial"
                checked={units === 'imperial'} onChange={() => changeUnits('imperial')} />
              <span>lb / ft / oz</span>
            </label>
            <label>
              <input type="radio" name="units" value="metric"
                checked={units === 'metric'} onChange={() => changeUnits('metric')} />
              <span>kg / cm / ml</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="fs">
          <legend>You</legend>
          <div className="row">
            <label className="field">
              <span>Sex <small>(for the metabolic formula)</small></span>
              <select name="sex" required value={form.sex} onChange={e => set('sex', e.target.value)}>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Prefer not to say</option>
              </select>
            </label>
            <label className="field">
              <span>Age</span>
              <input type="number" name="age" min="13" max="100" step="1" required inputMode="numeric"
                value={form.age} onChange={e => set('age', e.target.value)} />
            </label>
          </div>

          <div className="row" data-units="imperial" hidden={units !== 'imperial'}>
            <label className="field">
              <span>Height</span>
              <div className="inline">
                <input type="number" name="heightFt" min="3" max="8" step="1" inputMode="numeric" aria-label="Height, feet"
                  value={form.heightFt} onChange={e => set('heightFt', e.target.value)} />
                <em>ft</em>
                <input type="number" name="heightIn" min="0" max="11" step="1" inputMode="numeric" aria-label="Height, inches"
                  value={form.heightIn} onChange={e => set('heightIn', e.target.value)} />
                <em>in</em>
              </div>
            </label>
            <label className="field">
              <span>Current weight <em className="u">{unitLabel}</em></span>
              <input type="number" name="weight" min="60" max="700" step="0.1" required inputMode="decimal"
                value={form.weight} onChange={e => set('weight', e.target.value)} />
            </label>
          </div>

          <div className="row" data-units="metric" hidden={units !== 'metric'}>
            <label className="field">
              <span>Height <em className="unit">cm</em></span>
              <input type="number" name="heightCm" min="120" max="230" step="0.5" inputMode="decimal"
                value={form.heightCm} onChange={e => set('heightCm', e.target.value)} />
            </label>
            <label className="field">
              <span>Current weight <em className="u">{unitLabel}</em></span>
              <input type="number" name="weightKg" min="30" max="320" step="0.1" inputMode="decimal"
                value={form.weightKg} onChange={e => set('weightKg', e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Daily life, <strong>not</strong> counting workouts you log</span>
            <select name="baseActivity" id="base-activity"
              value={form.baseActivity} onChange={e => set('baseActivity', e.target.value)}>
              {FC_CALC.BASE_ACTIVITY.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
            <small className="hint">Workouts get added on top from what you log, so nothing is counted twice.</small>
          </label>

          <div className="row">
            <label className="field">
              <span>Usually wake at</span>
              <input type="time" name="wakeTime" required
                value={form.wakeTime} onChange={e => set('wakeTime', e.target.value)} />
            </label>
            <label className="field">
              <span>Usually asleep by</span>
              <input type="time" name="sleepTime" required
                value={form.sleepTime} onChange={e => set('sleepTime', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset className="fs">
          <legend>Your goal</legend>
          <div className="seg seg-3" role="radiogroup" aria-label="Goal type">
            <label>
              <input type="radio" name="goalType" value="lose"
                checked={form.goalType === 'lose'} onChange={() => changeGoalType('lose')} />
              <span>Lose fat</span>
            </label>
            <label>
              <input type="radio" name="goalType" value="maintain"
                checked={form.goalType === 'maintain'} onChange={() => changeGoalType('maintain')} />
              <span>Maintain</span>
            </label>
            <label>
              <input type="radio" name="goalType" value="gain"
                checked={form.goalType === 'gain'} onChange={() => changeGoalType('gain')} />
              <span>Gain</span>
            </label>
          </div>

          <label className="field" id="target-field" hidden={isMaintain}>
            <span>Target weight <em className="u">{unitLabel}</em></span>
            <input type="number" name="targetWeight" min="30" max="700" step="0.1" inputMode="decimal"
              value={form.targetWeight} onChange={e => set('targetWeight', e.target.value)} />
          </label>

          <div className="field" id="pace-field" hidden={isMaintain}>
            <span>How fast</span>
            <div className="pace" id="pace-options">
              {paceOpts.map(p => {
                const perWeekKg = p.pct * paceWeightKg;
                const shown = FC_CALC.showWeight(perWeekKg, units, 2);
                const rate = p.pct === 0 ? 'hold' : shown + ' ' + FC_CALC.weightUnit(units) + '/wk';
                return (
                  <label className="pace-opt" key={p.id}>
                    <input type="radio" name="pace" value={p.id}
                      checked={p.id === effectivePace} onChange={() => set('pace', p.id)} />
                    <span><strong>{p.label}</strong><em>{rate}</em></span>
                  </label>
                );
              })}
            </div>
            <small className="hint" id="pace-hint">{paceHint}</small>
          </div>

          <label className="field">
            <span>Food preference</span>
            <select name="diet" id="diet-select"
              value={form.diet} onChange={e => set('diet', e.target.value)}>
              {DIET_FILTERS.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </label>
        </fieldset>

        <p className="err" id="setup-error" role="alert" hidden={!error} ref={errRef}>{error ? error.msg : ''}</p>

        <div className="setup-actions">
          <button type="submit" className="btn btn-primary btn-lg">Build my plan</button>
          <button type="button" className="btn btn-ghost" id="setup-cancel" hidden={!isEdit}
            onClick={onCancel}>Cancel</button>
        </div>
        <p className="fineprint">Everything stays in this browser. No account, no server, nothing uploaded.</p>
      </form>
    </main>
  );
}
