/* ============================================================================
   hooks.js — the two hooks that wire the plain-JS store and the clock into
   React, plus the shared "what minute is it" helper. This replaces legacy
   app.js's tick(): a 20-second interval (and a visibilitychange listener,
   so a backgrounded tab catches up the moment it is shown again) keeps the
   timetable's due/missed states and the midnight reset current.
   ========================================================================== */

import { useSyncExternalStore, useState, useEffect } from 'react';
import * as FC_STORE from './lib/store.js';

/* Re-render whenever the store mutates. The returned version number is only
   a change counter — callers read actual state straight from FC_STORE. */
export function useStore() {
  return useSyncExternalStore(FC_STORE.subscribe, FC_STORE.getSnapshot);
}

/* tick is just a counter so consumers re-render each interval; dayKey is the
   local calendar date, so a consumer that watches it sees midnight happen. */
export function useClock() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    const id = setInterval(bump, 20000);
    const onVis = () => { if (document.visibilityState === 'visible') bump(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return { tick, dayKey: FC_STORE.todayKey() };
}

/* Minutes since local midnight — computed fresh during render so a stale
   interval can never show a stale clock. */
export function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
