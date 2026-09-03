/* ============================================================================
   App.jsx — screen switching, derived context, banner + day rollover.
   Ports the boot / tick / context / banner logic from legacy/js/app.js.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as FC_CALC from './lib/calc.js';
import * as FC_STORE from './lib/store.js';
import { useStore, useClock, nowMinutes } from './hooks.js';
import Setup from './components/Setup.jsx';
import TopBar from './components/TopBar.jsx';
import Banner from './components/Banner.jsx';
import TodayCard from './components/TodayCard.jsx';
import GoalCard from './components/GoalCard.jsx';
import TimelineCard from './components/TimelineCard.jsx';
import MealsCard from './components/MealsCard.jsx';
import LogCard from './components/LogCard.jsx';
import CoachCard from './components/CoachCard.jsx';
import HistoryCard from './components/HistoryCard.jsx';

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

/* One bundle of derived numbers, rebuilt on every render. */
function context(nowMin) {
  const s = FC_STORE.get();
  const day = FC_STORE.today();
  const planned = FC_CALC.plan(s.profile, s.goal, day);
  const sched = FC_CALC.schedule(s.profile, planned);
  const events = FC_CALC.annotateSchedule(sched, day, nowMin);

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

export default function App() {
  useStore();
  const { dayKey } = useClock();

  /* Boot parity: dashboard shows first only when a plan is already saved. */
  const s = FC_STORE.get();
  const hasPlan = !!(s.profile && s.goal);

  const [screen, setScreen] = useState(hasPlan ? 'dashboard' : 'setup');
  const [editing, setEditing] = useState(false);
  const [banner, setBanner] = useState(null);
  const [mealSlot, setMealSlot] = useState('auto');

  const bannerTimer = useRef();

  /* Mirrors legacy banner(): null clears immediately, anything else shows
     for 7 seconds before auto-clearing. */
  const showBanner = useCallback((msg, kind) => {
    clearTimeout(bannerTimer.current);
    if (!msg) { setBanner(null); return; }
    setBanner({ msg: msg, kind: kind });
    bannerTimer.current = setTimeout(() => { setBanner(null); }, 7000);
  }, []);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  /* The calorie count resets at 12:00 AM because each day is stored under its
     own local-date key. useClock notices the change; this effect redraws. */
  const lastDayKey = useRef(dayKey);
  useEffect(() => {
    if (dayKey === lastDayKey.current) return;
    lastDayKey.current = dayKey;
    setMealSlot('auto');
    showBanner('Midnight — a new day. Calories, water and activity are back to zero.');
  }, [dayKey, showBanner]);

  const onEdit = useCallback(() => { setEditing(true); setScreen('setup'); }, []);
  const onDone = useCallback(() => { setEditing(false); setScreen('dashboard'); }, []);
  const onCancel = useCallback(() => { setEditing(false); setScreen('dashboard'); }, []);

  const onJump = useCallback(slot => {
    setMealSlot(slot);
    const el = document.getElementById('card-meals');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const onSlotChange = useCallback(slot => { setMealSlot(slot); }, []);

  /* No profile or no goal → setup is the only screen (legacy render()). */
  if (!hasPlan || screen === 'setup') {
    return <Setup isEdit={editing} onDone={onDone} onCancel={onCancel} />;
  }

  const nowMin = nowMinutes();
  const ctx = context(nowMin);

  return (
    <>
      <TopBar nowMin={nowMin} onEdit={onEdit} showBanner={showBanner} />
      <Banner banner={banner} />
      <main className="wrap">
        <div className="grid">
          <TodayCard ctx={ctx} />
          <GoalCard ctx={ctx} />
          <TimelineCard ctx={ctx} nowMin={nowMin} onJump={onJump} />
          <MealsCard ctx={ctx} nowMin={nowMin} mealSlot={mealSlot} onSlotChange={onSlotChange} showBanner={showBanner} />
          <LogCard ctx={ctx} showBanner={showBanner} />
          <CoachCard ctx={ctx} nowMin={nowMin} />
          <HistoryCard ctx={ctx} />
        </div>
        <footer className="foot">
          <p>Fuelcast is a class project, not medical advice. Formulas: Mifflin-St Jeor RMR ·
            7,700 kcal per kg of body mass · 0.5-1 %/wk loss and 0.25-0.5 %/wk gain for lean-mass
            retention · ~33 ml water per kg plus ~600 ml per training hour · 20-40 g protein every 3-4 waking hours.</p>
        </footer>
      </main>
    </>
  );
}
