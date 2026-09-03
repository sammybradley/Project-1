/* ============================================================================
   TopBar.jsx — brand, date label, midnight countdown, Edit/Export/Reset.
   Markup from legacy/index.html; countdown math from legacy renderTopbar().
   ========================================================================== */

import * as FC_STORE from '../lib/store.js';

export default function TopBar({ nowMin, onEdit, showBanner }) {
  const now = new Date();
  const todayLabel = now.toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric' });

  const mins = 1440 - nowMin;
  const h = Math.floor(mins / 60), m = mins % 60;
  const countdown = 'resets in ' + (h ? h + 'h ' : '') + m + 'm';

  const onExport = () => {
    const blob = new Blob([FC_STORE.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fuelcast-' + FC_STORE.todayKey() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const onReset = () => {
    if (!confirm('Erase your plan and every logged day from this browser?')) return;
    FC_STORE.reset();
    location.reload();
  };

  return (
    <header className="topbar">
      <div className="topbar-in">
        <h1 className="brand"><span className="brand-mark">◔</span> Fuelcast</h1>
        <div className="topbar-meta">
          <span id="today-label" className="today-label">{todayLabel}</span>
          <span className="dot">·</span>
          <span id="reset-countdown" className="countdown"
            title="Your daily calorie count resets at midnight">{countdown}</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost btn-sm" id="btn-edit" onClick={onEdit}>Edit plan</button>
          <button className="btn btn-ghost btn-sm" id="btn-export" onClick={onExport}>Export</button>
          <button className="btn btn-ghost btn-sm danger" id="btn-reset" onClick={onReset}>Reset</button>
        </div>
      </div>
    </header>
  );
}
