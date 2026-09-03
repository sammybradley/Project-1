import { Fragment } from 'react';
import * as FC_CALC from '../lib/calc.js';
import * as FC_STORE from '../lib/store.js';
import { nowMinutes } from '../hooks.js';

/* =================================================== RENDER: TIMELINE */

export default function TimelineCard({ ctx, nowMin, onJump }) {
  const now = nowMin;
  const nowAbs = FC_CALC.nowAbsolute(ctx.sched, now);
  const u = ctx.units;

  const next = ctx.events.find(e => !e.done && e.at >= nowAbs - 15);
  const missedMeals = ctx.events.filter(e => e.type === 'meal' && e.missed).length;
  const badgeText = next
    ? (next.due ? 'Due now: ' + (next.type === 'water' ? 'water' : next.label.toLowerCase())
      : 'Next: ' + (next.type === 'water' ? 'water' : next.label.toLowerCase()) + ' at ' + FC_CALC.fmtTime(next.at))
    : (missedMeals ? 'Nothing left today' : 'All done');

  /* Only the row you could act on right now carries a button and a
     subtitle — thirteen buttons down the card is just noise. */
  const actionable = ctx.events.find(e => !e.done && e.at >= nowAbs - 60) || null;

  let inserted = false;
  const rows = ctx.events.map((e, i) => {
    let marker = null;
    if (!inserted && e.at > nowAbs) {
      inserted = true;
      marker = <li className="now-line"><span>{FC_CALC.fmtTime(now)}</span></li>;
    }
    /* "eat", not "meal" — `.meal` is the recommendation-card style and would
       wrap every timeline row in a bordered box. */
    const cls = ['tl', e.type === 'water' ? 'water' : 'eat',
      e.done ? 'done' : '', e.due ? 'due' : ''].filter(Boolean).join(' ');

    const isNext = e === actionable;
    const title = e.type === 'water'
      ? 'Drink ' + FC_CALC.showVolume(e.ml, u) + ' ' + FC_CALC.volumeUnit(u)
      : e.label;
    const sub = e.type === 'water'
      ? (isNext || e.due ? 'Keeps you on pace for the day’s total' : '')
      : (e.done && e.loggedName ? e.loggedName
        : '~' + e.kcal + ' kcal · ' + e.protein + ' g protein');

    /* A water checkpoint you sailed past still ticks off as soon as the
       day's running total catches up, so it is never called "missed". */
    const badge = e.due ? <span className="pill">now</span>
      : (e.missed && !e.done && e.type === 'meal' ? <span className="pill miss">missed</span> : null);

    const action = (!e.done && (isNext || e.due)) ? (e.type === 'water'
      ? <button className="btn btn-tiny" data-water={e.ml} onClick={() => FC_STORE.addWater(e.ml, nowMinutes())}>Log it</button>
      : <button className="btn btn-tiny" data-jump={e.slot} onClick={() => onJump(e.slot)}>See options</button>) : null;

    return (
      <Fragment key={i}>
        {marker}
        <li className={cls}>
          <span className="tl-time">{FC_CALC.fmtTime(e.at)}</span>
          <span className="tl-pin"></span>
          <span className="tl-body">
            <span className="tl-title">{title} {badge}</span>
            {sub ? <span className="tl-sub">{sub}</span> : null}
            {action ? <span className="meal-actions" style={{ marginTop: '6px' }}>{action}</span> : null}
          </span>
        </li>
      </Fragment>
    );
  });

  const tail = inserted ? null : <li className="now-line"><span>{FC_CALC.fmtTime(now)}</span></li>;

  return (
    <section className="card" id="card-timeline" aria-labelledby="h-timeline">
      <div className="card-head">
        <h2 id="h-timeline">Today's timing</h2>
        <span className="badge" id="timeline-next">{badgeText}</span>
      </div>
      <div id="timeline-body">
        <ul className="timeline">{rows}{tail}</ul>
        <p className="hint">Meals sit 3-4 hours apart across your waking day, eating stops about two hours before bed, and water is paced so you are not catching up at midnight. Times shift with the wake and sleep hours in your plan.</p>
      </div>
    </section>
  );
}
