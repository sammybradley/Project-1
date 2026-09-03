/* ============================================================================
   HistoryCard.jsx — the last-14-days card: intake chart against the base
   target, averages, and the weigh-in trend. Ported from legacy
   renderHistory() in app.js.
   ========================================================================== */

import * as FC_CALC from '../lib/calc.js';
import * as FC_STORE from '../lib/store.js';

export default function HistoryCard({ ctx }) {
  const hist = FC_STORE.history(14, ctx.s.profile, ctx.s.goal);
  const target = ctx.planned.baseTarget;
  const max = Math.max(target * 1.35, ...hist.map(h => h.intake), 1);
  const logged = hist.filter(h => h.entries > 0);

  const avgIntake = logged.length ? Math.round(logged.reduce((a, h) => a + h.intake, 0) / logged.length) : 0;
  const avgBurn = logged.length ? Math.round(logged.reduce((a, h) => a + h.burn, 0) / logged.length) : 0;
  const avgWater = logged.length ? Math.round(logged.reduce((a, h) => a + h.water, 0) / logged.length) : 0;
  const onTarget = logged.filter(h => Math.abs(h.intake - target) <= target * 0.08).length;

  const weighIns = hist.filter(h => h.weightKg != null);
  let trend = null;
  if (weighIns.length >= 2) {
    const change = weighIns[weighIns.length - 1].weightKg - weighIns[0].weightKg;
    trend = <div className="note">Weigh-ins over this stretch: {change > 0 ? '+' : ''}{FC_CALC.showWeight(change, ctx.units, 1)} {FC_CALC.weightUnit(ctx.units)} across {weighIns.length} check-ins.</div>;
  }

  return (
    <section className="card span-2" id="card-history" aria-labelledby="h-history">
      <div className="card-head">
        <h2 id="h-history">Last 14 days</h2>
        <span className="badge" id="history-badge">{logged.length
          ? logged.length + ' day' + (logged.length === 1 ? '' : 's') + ' logged'
          : 'nothing logged yet'}</span>
      </div>
      <div id="history-body">
        <div className="chart" style={{ position: 'relative' }}>
          <div className="chart-target" style={{ position: 'absolute', left: 0, right: 0, bottom: ((target / max) * 100).toFixed(1) + '%' }}></div>
          {hist.map(h => {
            const pct = (h.intake / max) * 100;
            const cls = h.entries === 0 ? 'none' : (h.intake > target * 1.05 ? 'over' : '');
            const label = h.entries === 0 ? 'no log' : Math.round(h.intake) + ' kcal';
            return (
              <div className="chart-col" key={h.key} title={h.date.toLocaleDateString() + ' — ' + label}>
                <div className={'chart-bar ' + cls} style={{ height: Math.max(2, pct).toFixed(1) + '%' }}></div>
              </div>
            );
          })}
        </div>
        <div className="chart-labels">
          {hist.map((h, i) =>
            <span key={h.key}>{i % 2 === 0 || i === hist.length - 1 ? h.date.getDate() : ''}</span>)}
        </div>
        <div className="legend">
          <span><i className="swatch" style={{ background: 'var(--accent)' }}></i>at or under target</span>
          <span><i className="swatch" style={{ background: 'var(--danger)' }}></i>over target</span>
          <span><i className="swatch" style={{ background: 'var(--line-strong)' }}></i>dashed line = {target} kcal base target</span>
        </div>
        {logged.length ? <div className="stat-grid">
          <div className="stat"><b>{avgIntake}</b><span>avg kcal eaten</span></div>
          <div className="stat"><b>{avgBurn}</b><span>avg kcal burned</span></div>
          <div className="stat"><b>{FC_CALC.showVolume(avgWater, ctx.units)} {FC_CALC.volumeUnit(ctx.units)}</b><span>avg water</span></div>
          <div className="stat"><b>{onTarget}/{logged.length}</b><span>days within 8% of target</span></div>
        </div> : <p className="empty">Log a day or two and the pattern shows up here.</p>}
        {trend}
      </div>
    </section>
  );
}
