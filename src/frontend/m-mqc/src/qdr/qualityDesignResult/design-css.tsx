/**
 * 품질설계결과·시뮬레이션 공용 스타일(라벨-값 격자, 단계 띠, 안내 줄, 칩). 의미 토큰만 쓴다.
 * 포털이 원격 모듈 CSS 파일을 싣지 않으므로 <DesignStyle /> 가 <style href precedence> 로 한 번만 넣는다.
 */
const MONO = "var(--font-family-mono)";

export const DESIGN_CSS = `
.mqc-qd-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px 10px}
.mqc-qd-kv-item{display:grid;grid-template-columns:120px 1fr;align-items:center;gap:6px;min-width:0}
.mqc-qd-kv-item.wide{grid-column:1/-1}
.mqc-qd-kv-item label{color:var(--color-text-secondary);font-size:var(--font-size-xs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mqc-qd-kv-v{min-height:24px;display:flex;align-items:center;gap:4px;padding:0 6px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-bg-readonly);font-size:var(--font-size-sm);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.mqc-qd-kv-v.b{font-weight:700;border-color:var(--color-primary);background:var(--color-primary-soft)}
.mqc-qd-kv-v.warn{border-color:var(--color-warning);background:var(--color-warning-soft)}
.mqc-qd-kv-v.pick{cursor:pointer}
.mqc-qd-kv-v.pick:hover{border-color:var(--color-primary)}
.mqc-qd-kv-v.on{box-shadow:0 0 0 2px var(--color-primary-soft);border-color:var(--color-primary)}
.mqc-qd-kv-v.bad{border-color:var(--color-danger);background:var(--color-danger-soft)}
.mqc-qd-blocks{display:grid;gap:8px}
.mqc-qd-sub{font-weight:600;font-size:var(--font-size-sm);margin:4px 0 2px}
.mqc-qd-muted{color:var(--color-text-muted);font-size:var(--font-size-sm)}
.mqc-qd-mono{font-family:${MONO}}
.mqc-qd-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.mqc-qd-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0}
.mqc-qd-head b{font-size:var(--font-size-lg)}
.mqc-qd-spacer{flex:1 1 auto}
.mqc-qd-notice{padding:6px 10px;border-radius:var(--radius-sm);font-size:var(--font-size-sm);background:var(--color-warning-soft);color:var(--color-warning)}
.mqc-qd-notice.info{background:var(--color-primary-soft);color:var(--color-primary)}
.mqc-qd-notice.danger{background:var(--color-danger-soft);color:var(--color-danger)}
.mqc-qd-stages{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}
.mqc-qd-stage{border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:4px 6px;background:var(--color-bg);text-align:left;font:inherit;min-width:0}
.mqc-qd-stage.btn{cursor:pointer}
.mqc-qd-stage.btn:hover{border-color:var(--color-primary)}
.mqc-qd-stage.on{border-color:var(--color-primary);box-shadow:0 0 0 2px var(--color-primary-soft)}
.mqc-qd-stage.ok{background:var(--color-success-soft)}
.mqc-qd-stage.no{background:var(--color-danger-soft)}
.mqc-qd-stage.wa{background:var(--color-warning-soft)}
.mqc-qd-stage.gy{background:var(--color-bg-hover)}
.mqc-qd-stage.adv{opacity:.65;border-style:dashed}
.mqc-qd-stage-t{font-weight:600;font-size:var(--font-size-xs);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mqc-qd-stage-s{color:var(--color-text-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mqc-qd-anoms{display:grid;gap:3px}
.mqc-qd-anom{display:flex;gap:6px;align-items:baseline;font-size:var(--font-size-sm)}
.mqc-qd-chips{display:flex;flex-wrap:wrap;gap:4px}
.mqc-qd-chip{border:1px solid var(--color-border);border-radius:99px;padding:1px 9px;background:var(--color-bg);font:inherit;font-size:var(--font-size-xs);cursor:pointer;color:var(--color-text)}
.mqc-qd-chip:hover{border-color:var(--color-primary);color:var(--color-primary)}
.mqc-qd-chip.on{background:var(--color-primary-soft);border-color:var(--color-primary);color:var(--color-primary)}
.mqc-qd-sections{display:grid;gap:6px;padding-bottom:12px}
.mqc-qd-card{border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:6px 8px;background:var(--color-bg);display:grid;gap:4px}
.mqc-qd-card.err{border-color:var(--color-danger)}
.mqc-qd-ev{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:var(--font-size-xs)}
.mqc-qd-link{border:none;background:none;padding:0;color:var(--color-primary);cursor:pointer;font:inherit;font-size:var(--font-size-xs);text-decoration:underline}
.mqc-qd-pane{display:grid;gap:8px;align-content:start;padding:4px 2px 12px}
.mqc-qd-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 8px}
.mqc-qd-field{display:grid;gap:2px;min-width:0}
.mqc-qd-field label{font-size:var(--font-size-xs);color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mqc-qd-field.dirty label{color:var(--color-primary);font-weight:600}
.mqc-qd-field.req label::after{content:" *";color:var(--color-danger)}
.mqc-qd-details summary{cursor:pointer;font-size:var(--font-size-sm);color:var(--color-text-secondary)}
`;

export function DesignStyle() {
  return (
    <style href="mqc-qd" precedence="default">
      {DESIGN_CSS}
    </style>
  );
}
