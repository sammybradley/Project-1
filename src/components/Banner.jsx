/* ============================================================================
   Banner.jsx — the #banner strip. The 7-second auto-clear lives in App's
   showBanner (mirrors legacy banner()); this only renders the current state.
   ========================================================================== */

export default function Banner({ banner }) {
  return (
    <div id="banner"
      className={'banner' + (banner && banner.kind ? ' ' + banner.kind : '')}
      hidden={!banner}>
      {banner ? banner.msg : ''}
    </div>
  );
}
