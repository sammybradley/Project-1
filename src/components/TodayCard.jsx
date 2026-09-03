import * as FC_CALC from '../lib/calc.js';

/* ====================================================== RENDER: TODAY */

export default function TodayCard({ ctx }) {
  const p = ctx.planned, u = ctx.units;
  const pct = p.targetToday > 0 ? (ctx.eaten / p.targetToday) * 100 : 0;
  const over = ctx.eaten > p.targetToday;
  const left = p.targetToday - ctx.eaten;

  const burnBadge = p.burn.total > 0
    ? (p.burn.source === 'tracker' ? 'Tracker: ' + p.burn.tracker + ' active kcal'
      : ctx.day.activity.length + (ctx.day.activity.length === 1 ? ' session logged' : ' sessions logged'))
    : 'No activity logged yet';

  const bar = (name, val, target, cls, unit) => {
    const w = target > 0 ? Math.min(100, (val / target) * 100) : 0;
    const isOver = val > target * 1.05 && target > 0;
    return (
      <div className="bar-row">
        <span className="n">{name}</span>
        <span className="track"><span className={'fill ' + cls + (isOver ? ' over' : '')} style={{ width: w.toFixed(1) + '%' }}></span></span>
        <span className="v">{Math.round(val)} / {Math.round(target)}{unit}</span>
      </div>
    );
  };

  const macroNote = (ctx.carbs + ctx.fat) === 0 && ctx.eaten > 0;

  return (
    <section className="card span-2" id="card-today" aria-labelledby="h-today">
      <div className="card-head">
        <h2 id="h-today">Today</h2>
        <span className="badge" id="today-source">{burnBadge}</span>
      </div>
      <div id="today-body">
        <div className="today-top">
          <div className="ring" style={{ '--pct': Math.min(100, Math.max(0, pct)).toFixed(1), '--ring-color': over ? 'var(--danger)' : 'var(--accent)' }}
               role="img" aria-label={Math.round(ctx.eaten) + ' of ' + p.targetToday + ' calories eaten'}>
            <span className="ring-in">
              <b>{Math.abs(Math.round(left))}</b>
              <span>{over ? 'kcal over' : 'kcal left'}</span>
            </span>
          </div>
          <div className="tallies">
            <div className="tally"><span className="op"></span><span className="label">Base target</span><b>{p.baseTarget}</b></div>
            <div className="tally"><span className="op">+</span><span className="label">Burned in activity</span><b>{p.burn.total}</b></div>
            <div className="tally total"><span className="op">=</span><span className="label">Today you can eat</span><b>{p.targetToday} kcal</b></div>
            <div className="tally"><span className="op">−</span><span className="label">Eaten so far</span><b>{Math.round(ctx.eaten)}</b></div>
          </div>
        </div>
        <div className="bars">
          {bar('Protein', ctx.protein, p.macros.protein, 'protein', ' g')}
          {bar('Carbs', ctx.carbs, p.macros.carbs, 'carbs', ' g')}
          {bar('Fat', ctx.fat, p.macros.fat, 'fat', ' g')}
          {bar('Water', FC_CALC.showVolume(ctx.water, u), FC_CALC.showVolume(p.waterMl, u), 'water', ' ' + FC_CALC.volumeUnit(u))}
        </div>
        {macroNote ? <p className="hint">Carbs and fat fill in when you log from the meal list; typed-in entries only need calories and protein.</p> : null}
        {p.waterExtraMl > 0 ? <div className="note">Water target is up {FC_CALC.showVolume(p.waterExtraMl, u)} {FC_CALC.volumeUnit(u)} today to cover {p.trainingMinutes} min of training.</div> : null}
        {p.floored ? <div className="note warn"><strong>Held at a floor.</strong> The pace you picked would put you under {p.hardFloor} kcal, so the plan sits there instead. The forecast below already uses this slower, safer rate.</div> : null}
        {p.belowResting && !p.floored ? <div className="note">This target sits below your resting burn of {p.resting} kcal — ordinary for a deficit, and the movement you log adds back on top of it. Going faster than this is where lean mass starts to go.</div> : null}
        {p.restingFromTracker ? <div className="note">Using your tracker’s resting-calorie reading instead of the estimate.</div> : null}
      </div>
    </section>
  );
}
