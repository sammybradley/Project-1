import * as FC_CALC from '../lib/calc.js';
import * as FC_STORE from '../lib/store.js';

/* ======================================================= RENDER: GOAL */

export default function GoalCard({ ctx }) {
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

  let actualBlock = null;
  if (goal.type !== 'maintain' && actual) {
    if (actual.wrongWay) {
      actualBlock = (
        <div className="note warn"><strong>At your logged pace:</strong> the last {actual.samples} logged days average {actual.avgDelta > 0 ? '+' : ''}{actual.avgDelta} kcal a day against your burn, which moves you away from the target. Closing that gap puts the date above back in reach.</div>
      );
    } else if (!actual.done) {
      actualBlock = (
        <div className="note"><strong>At your logged pace:</strong> {FC_CALC.humanDuration(actual.days)} ({actual.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}), from {actual.samples} logged day{actual.samples === 1 ? '' : 's'} averaging {actual.avgDelta > 0 ? '+' : ''}{actual.avgDelta} kcal against burn.</div>
      );
    }
  }

  return (
    <section className="card" id="card-goal" aria-labelledby="h-goal">
      <div className="card-head"><h2 id="h-goal">Goal &amp; forecast</h2></div>
      <div id="goal-body">
        <div className="eta">
          <div className="eta-big">{etaBig}</div>
          <div className="eta-sub">{etaSub}</div>
        </div>
        {goal.type === 'maintain' ? null : (
          <>
            <div className="weights">
              <span>Start <b>{FC_CALC.showWeight(startKg, units, 1)}</b></span>
              <span>Now <b>{FC_CALC.showWeight(profile.weightKg, units, 1)}</b></span>
              <span>Goal <b>{FC_CALC.showWeight(goal.targetWeightKg, units, 1)} {wu}</b></span>
            </div>
            <div className="progress-track" role="img" aria-label={Math.round(progress) + ' percent of the way to goal'}>
              <div className="progress-fill" style={{ width: progress.toFixed(1) + '%' }}></div>
            </div>
            <p className="hint">{Math.round(progress)}% of the way there · {FC_CALC.showWeight(Math.abs(goal.targetWeightKg - profile.weightKg), units, 1)} {wu} to go</p>
          </>
        )}
        <div className="stat-grid">
          <div className="stat"><b>{planned.baseTarget}</b><span>base kcal / day</span></div>
          <div className="stat"><b>{deltaLabel}</b><span>daily gap</span></div>
          <div className="stat"><b>{FC_CALC.showWeight(Math.abs(planned.effectiveKgWeek), units, 2)} {wu}</b><span>per week</span></div>
          <div className="stat"><b>{planned.macros.protein} g</b><span>protein / day</span></div>
        </div>
        {actualBlock}
      </div>
    </section>
  );
}
