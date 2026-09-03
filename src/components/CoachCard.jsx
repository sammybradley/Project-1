/* ============================================================================
   CoachCard.jsx — the Move card: what to do about today's balance, plus the
   weekly movement bars. Ported from legacy renderCoach() in app.js.
   ========================================================================== */

import * as FC_CALC from '../lib/calc.js';
import * as FC_STORE from '../lib/store.js';
import { ACTIVITIES } from '../lib/data.js';

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

export default function CoachCard({ ctx, nowMin }) {
  const { planned, s } = ctx;
  const week = FC_STORE.weekActivity();
  const wt = FC_CALC.weeklyActivityTarget(planned);
  const kg = s.profile.weightKg;
  const steps = num(ctx.day.wearable.steps);

  let lead, opts = null;
  const over = ctx.eaten - planned.targetToday;

  if (over > 50) {
    const gap = FC_CALC.gapOptions(over, kg, ACTIVITIES).slice(0, 4);
    lead = <>You are <strong>{Math.round(over)} kcal</strong> past today's number. Any one of these puts you back level:</>;
    opts = <div className="opt-row">{gap.map(g =>
      <span className="opt" key={g.id}>{g.name} <b>{g.minutes} min</b></span>)}</div>;
  } else if (planned.burn.total === 0 && nowMin > 15 * 60) {
    const gap = FC_CALC.gapOptions(250, kg, ACTIVITIES).slice(0, 3);
    lead = 'Nothing logged today. A single easy session keeps the weekly total on pace and earns back a few hundred calories of food:';
    opts = <div className="opt-row">{gap.map(g =>
      <span className="opt" key={g.id}>{g.name} <b>{g.minutes} min</b></span>)}</div>;
  } else if (planned.burn.total > 0) {
    lead = <><strong>{planned.burn.total} kcal</strong> burned today, which raised what you can eat to{' '}
      <strong>{planned.targetToday} kcal</strong>. Eat the difference — training on a hole in the budget is how the muscle goes.</>;
  } else {
    lead = 'Nothing logged yet. Add a walk or a session and today’s food target rises to match it.';
  }

  const minPct = Math.min(100, (week.minutes / wt.minutes) * 100);
  const daysGone = week.dayOfWeek + 1;
  const pace = week.minutes >= wt.minutes * (daysGone / 7)
    ? 'ahead of pace for the week' : 'behind pace for the week';

  return (
    <section className="card" id="card-coach" aria-labelledby="h-coach">
      <div className="card-head"><h2 id="h-coach">Move</h2></div>
      <div id="coach-body">
        <p className="coach-lead">{lead}</p>
        {opts}
        <div className="bars" style={{ marginTop: '16px' }}>
          <div className="bar-row">
            <span className="n">This week</span>
            <span className="track"><span className="fill protein" style={{ width: minPct.toFixed(1) + '%' }}></span></span>
            <span className="v">{week.minutes} / {wt.minutes} min</span>
          </div>
          <div className="bar-row">
            <span className="n">Strength</span>
            <span className="track"><span className="fill fat" style={{ width: Math.min(100, (week.strength / wt.strengthSessions) * 100).toFixed(1) + '%' }}></span></span>
            <span className="v">{week.strength} / {wt.strengthSessions} days</span>
          </div>
          {steps ? <div className="bar-row">
            <span className="n">Steps</span>
            <span className="track"><span className="fill water" style={{ width: Math.min(100, (steps / wt.steps) * 100).toFixed(1) + '%' }}></span></span>
            <span className="v">{steps.toLocaleString()} / {wt.steps.toLocaleString()}</span>
          </div> : null}
        </div>
        <p className="hint">Target for your goal: {wt.minutes} minutes of moderate movement and{' '}
          {wt.strengthSessions} strength days a week, {wt.steps.toLocaleString()} steps a day.
          You are {pace}. Name a session "strength training" and it counts toward the strength row.</p>
      </div>
    </section>
  );
}
