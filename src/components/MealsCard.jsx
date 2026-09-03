import { useEffect, useRef, useState } from 'react';
import * as FC_CALC from '../lib/calc.js';
import * as FC_STORE from '../lib/store.js';
import { MEALS, DIET_FILTERS } from '../lib/data.js';
import { nowMinutes } from '../hooks.js';

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

const TABS = [
  { slot: 'auto', label: 'Up next' },
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'dinner', label: 'Dinner' },
  { slot: 'snack', label: 'Snacks' }
];

/* ====================================================== RENDER: MEALS */

/* View state that never needs persisting — module-level so the typed search
   survives an Edit plan round trip, like legacy's view.mealQuery. */
let mealQuery = '';

export default function MealsCard({ ctx, nowMin, mealSlot, onSlotChange, showBanner }) {
  const [query, setQuery] = useState(mealQuery);
  const searchTimer = useRef();
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const target = nextSlotTarget(ctx);
  const slot = mealSlot === 'auto' ? target.slot : mealSlot;
  const dietId = FC_STORE.get().prefs.diet;
  const diet = DIET_FILTERS.find(d => d.id === dietId) || DIET_FILTERS[0];

  const targetText = mealSlot === 'auto'
    ? 'Aim ~' + target.kcal + ' kcal · ' + target.protein + ' g protein'
    : 'Filtered to ' + slot;

  const list = FC_CALC.recommend(MEALS, {
    slot: slot,
    kcal: target.kcal,
    protein: target.protein,
    dir: ctx.planned.dir,
    dietTest: diet.test,
    query: query,
    maxMinutes: 10,
    postWorkout: ctx.planned.burn.total > 250
  }).slice(0, 8);

  return (
    <section className="card span-2" id="card-meals" aria-labelledby="h-meals">
      <div className="card-head">
        <h2 id="h-meals">What to eat next</h2>
        <span className="badge" id="meals-target">{targetText}</span>
      </div>
      <div className="controls">
        <div className="tabs" id="meal-tabs" role="tablist" aria-label="Meal slot">
          {TABS.map(t => (
            <button key={t.slot} className={'tab' + (t.slot === mealSlot ? ' is-on' : '')}
                    data-slot={t.slot} role="tab"
                    onClick={() => onSlotChange(t.slot)}>{t.label}</button>
          ))}
        </div>
        <div className="controls-right">
          <select id="meal-diet" aria-label="Food preference" value={dietId}
                  onChange={e => FC_STORE.setPref('diet', e.target.value)}>
            {DIET_FILTERS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <input type="search" id="meal-search" placeholder="Search meals…" aria-label="Search meals"
                 onChange={e => {
                   clearTimeout(searchTimer.current);
                   const v = e.target.value;
                   searchTimer.current = setTimeout(() => { setQuery(v); }, 180);
                 }} />
        </div>
      </div>
      <div id="meals-body" className="meal-list">
        {!list.length ? (
          <p className="empty">Nothing matches that filter. Try clearing the search or the food preference.</p>
        ) : list.map((m, i) => {
          const diff = m.kcal - target.kcal;
          const fit = mealSlot === 'auto'
            ? (Math.abs(diff) <= 60 ? 'right on target' : (diff > 0 ? '+' + diff + ' kcal over the slot' : diff + ' kcal under'))
            : m.minutes + ' min';
          return (
            <article key={m.id} className={'meal' + (i === 0 ? ' top' : '')}>
              <div className="meal-top">
                <span className="meal-name">{m.name}</span>
                <span className="meal-kcal">{m.kcal} kcal</span>
              </div>
              <div className="macro-line">
                <span><b>{m.protein}</b> g protein</span>
                <span><b>{m.carbs}</b> g carbs</span>
                <span><b>{m.fat}</b> g fat</span>
                <span className="tag">{m.minutes} min</span>
                {m.tags.slice(0, 2).map(t => <span key={t} className="tag">{t}</span>)}
              </div>
              <div className="meal-items">{m.items}</div>
              <div className="meal-actions">
                <button className="btn btn-tiny btn-primary" data-log-meal={m.id}
                        onClick={() => {
                          FC_STORE.addFood({
                            name: m.name, kcal: m.kcal, protein: m.protein,
                            carbs: m.carbs, fat: m.fat, at: nowMinutes(), mealId: m.id
                          });
                          showBanner(m.name + ' logged — ' + m.kcal + ' kcal.');
                        }}>Log this</button>
                <span className="fit">{fit}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
