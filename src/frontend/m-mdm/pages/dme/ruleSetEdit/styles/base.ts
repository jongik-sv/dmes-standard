/**
 * 룰 세트 편집 화면 기본 스타일(캔버스·노드·툴바·오른쪽 패널·아래 패널·검사 결과) — 2단계 `rsf-styles.ts` 의 `RSF_CSS` 본문을 그대로 옮겼다.
 * 영역별 새 규칙은 이 파일이 아니라 `styles/` 의 자기 영역 파일(drag·menu·props·debug·collapse)에 넣는다(3단계 계획 Task 0 Step 12).
 * 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 */
export const BASE_CSS = `
/* 룰 세트 흐름 캔버스 — 시안 06-rule-set-flow.html 의 노드 모양. 색은 한 곳(.rsf-canvas)에서 토큰으로 옮긴다. */
.rsf-canvas {
  --rsf-canvas-bg: var(--color-bg-light);
  --rsf-node-bg: var(--color-bg);
  --rsf-border: var(--color-border-strong);
  --rsf-edge: var(--color-text-muted-light);
  --rsf-par-bar: var(--color-text);
  --rsf-memo-bg: var(--color-danger-soft);
  --rsf-memo-border: var(--color-danger);
  --rsf-memo-text: var(--color-text);
  --rsf-group-bg: var(--color-primary-soft);
  --rsf-group-border: var(--color-selection-border);
  --rsf-ring: var(--color-focus-shadow);
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  background: var(--rsf-canvas-bg);
  outline: none;
}
.rsf-canvas .react-flow { background: var(--rsf-canvas-bg); }

/* 노드 공통 */
.rsf-node {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background: var(--rsf-node-bg);
  border: 1px solid var(--rsf-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
  transition: opacity 0.18s, box-shadow 0.18s, border-color 0.18s;
}
.rsf-node:hover { border-color: var(--color-text-muted); }
.rsf-node[data-selected="true"] { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--rsf-ring); }
.rsf-node[data-state="run"] { border-color: var(--color-success); box-shadow: 0 0 0 2px var(--color-success-soft); }
.rsf-node[data-state="current"] { border-color: var(--color-primary); border-width: 2px; box-shadow: 0 0 0 4px var(--rsf-ring); }
.rsf-node[data-state="error"] { border-color: var(--color-danger); box-shadow: 0 0 0 3px var(--color-danger-soft); }
.rsf-node[data-state="dim"] { opacity: 0.3; }
.rsf-node[data-state="pending"] { opacity: 0.6; }
.rsf-flash { animation: rsf-flash 0.4s ease-in-out 3; }
@keyframes rsf-flash {
  0%, 100% { box-shadow: 0 0 0 0 var(--rsf-ring); }
  50% { box-shadow: 0 0 0 10px var(--rsf-ring); }
}

/* 룰 */
.rsf-rule { padding: 6px 28px 6px 10px; }
.rsf-title { font-size: var(--font-size-md); font-weight: 600; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rsf-sub { font-size: var(--font-size-xs); color: var(--color-text-muted); line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rsf-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 15px; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rsf-open {
  position: absolute; right: 4px; top: 4px; width: 20px; height: 20px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: var(--radius-sm); background: none; color: var(--color-text-muted); cursor: pointer;
}
.rsf-open:hover { background: var(--color-bg-hover); border-color: var(--color-border); color: var(--color-primary); }
.rsf-mark {
  position: absolute; right: -5px; top: -5px; width: 11px; height: 11px; border-radius: 50%;
  border: 2px solid var(--rsf-node-bg); background: var(--color-warning);
}
.rsf-mark[data-severity="REJECT"] { background: var(--color-danger); }

/* 시작·끝 */
.rsf-terminal { display: flex; align-items: center; justify-content: center; border-radius: 999px; font-weight: 600; border-width: 1.5px; background: var(--color-bg-header); }

/* IF */
.rsf-if { display: flex; align-items: center; gap: 10px; padding: 0 10px 0 12px; border-color: var(--color-primary); }
.rsf-diamond { width: 16px; height: 16px; flex: none; transform: rotate(45deg); border: 1.5px solid var(--color-primary); background: var(--color-primary-soft); border-radius: 2px; }
.rsf-if .rsf-title { font-size: var(--font-size-lg); }

/* 병렬 막대 · 합류 원 */
.rsf-par { background: var(--rsf-par-bar); border: 0; border-radius: 3px; box-shadow: none; }
.rsf-par[data-selected="true"] { outline: 2px solid var(--color-primary); outline-offset: 3px; box-shadow: none; }
.rsf-par[data-state="run"], .rsf-par[data-state="current"] { background: var(--color-success); box-shadow: none; }
.rsf-par-label { position: absolute; left: 16px; bottom: calc(100% + 4px); font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); white-space: nowrap; }
.rsf-merge { border-radius: 50%; border: 2px solid var(--rsf-border); box-shadow: none; }
.rsf-merge[data-state="run"] { background: var(--color-success-soft); border-color: var(--color-success); }

/* 겹침 배지 · 칩 */
.rsf-seq {
  position: absolute; left: -9px; top: -9px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; box-sizing: border-box;
  background: var(--color-success); color: var(--color-on-primary); font: 600 10px/18px ui-monospace, monospace; text-align: center;
}
.rsf-node[data-state="error"] .rsf-seq { background: var(--color-danger); }
.rsf-chip {
  position: absolute; left: calc(50% + 8px); top: calc(100% + 5px); white-space: nowrap; pointer-events: none; z-index: 2;
  font: 500 10.5px/16px ui-monospace, monospace; padding: 0 6px; border-radius: 3px;
  background: var(--color-success-soft); color: var(--color-success); border: 1px solid var(--color-success);
}
.rsf-node[data-state="error"] .rsf-chip { background: var(--color-danger-soft); color: var(--color-danger); border-color: var(--color-danger); }

/* 메모 · 그룹 */
.rsf-note {
  box-sizing: border-box; width: 100%; height: 100%; padding: 6px 9px 8px; overflow: hidden; cursor: pointer;
  background: var(--rsf-memo-bg); border: 1px solid var(--rsf-memo-border); color: var(--rsf-memo-text);
  border-radius: 2px; font-size: var(--font-size-sm); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere;
}
.rsf-note[data-selected="true"] { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.rsf-note textarea {
  width: 100%; height: 100%; resize: none; border: 0; padding: 0; background: transparent; color: inherit; font: inherit; outline: none;
}
.rsf-group {
  box-sizing: border-box; width: 100%; height: 100%; pointer-events: none;
  border: 1px dashed var(--rsf-group-border); background: var(--rsf-group-bg); border-radius: 6px;
}
.rsf-group[data-selected="true"] { border-style: solid; border-color: var(--color-primary); }
.rsf-group-title {
  position: absolute; left: 8px; top: 5px; pointer-events: auto; padding: 2px 4px; border-radius: 3px; cursor: pointer;
  font-size: var(--font-size-xs); font-weight: 700; color: var(--color-text-secondary); white-space: nowrap;
}
.rsf-group-title:hover { background: var(--color-bg-hover); }

/* 연결점 — 그리기 연결점·네 변 잇기 손잡이·몸통 받기는 styles/connect.ts(추가 Task C1) */

/* 선 이름표 · 변수 칩 */
.rsf-elabel { position: absolute; pointer-events: none; white-space: nowrap; }
/* 변수 칩은 아래 노드(z-index 0)에 가리지 않게 노드 위에 둔다. 고른 노드(React Flow 가 1000 으로 올림)는 칩 위다. */
.rsf-elabel-chips { z-index: 1; }
.rsf-branch {
  font-size: var(--font-size-xs); font-weight: 600; line-height: 18px; padding: 0 7px; border-radius: 9px;
  background: var(--color-bg); border: 1px solid var(--rsf-border); color: var(--color-text-secondary);
}
.rsf-branch[data-state="chosen"] { background: var(--color-success-soft); border-color: var(--color-success); color: var(--color-success); }
.rsf-branch[data-state="dim"] { opacity: 0.35; }
.rsf-vchips { display: flex; gap: 3px; }
.rsf-vchip {
  font: 500 10px/16px ui-monospace, monospace; padding: 0 5px; border-radius: 3px;
  background: var(--color-bg-light); border: 1px solid var(--color-border); color: var(--color-text-secondary);
}

/* 룰 찾기 */
.rsf-cands { list-style: none; margin: var(--spacing-sm) 0 0; padding: 0; }
.rsf-cand {
  display: flex; align-items: center; gap: var(--spacing-sm); width: 100%; padding: 4px var(--spacing-sm); text-align: left; cursor: pointer;
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); margin-bottom: 2px; color: var(--color-text);
}
.rsf-cand:hover { background: var(--color-bg-hover); }
.rsf-cand-id { flex: none; width: 140px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--font-size-sm); overflow: hidden; text-overflow: ellipsis; }
.rsf-cand-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 룰 세트 편집 — 툴바·오른쪽 패널·아래 패널(2단계 계획 Task 10). 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8). */

/* 툴바 */
.rsf-toolbar { padding: var(--spacing-xs) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); }
.rsf-toolbar-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs) var(--spacing-sm); }
.rsf-toolbar-group { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.rsf-toolbar-end { margin-left: auto; }
.rsf-toolbar-sep { align-self: stretch; width: 1px; margin: 2px 0; background: var(--color-border); }
.rsf-toolbar-message { padding-top: var(--spacing-xs); }

/* 본문 — 캔버스 패널 안(팔레트 | 캔버스) */
.rsf-body { display: flex; flex: 1 1 0; min-height: 0; min-width: 0; }
.rsf-canvas-host { flex: 1 1 0; min-width: 0; min-height: 0; position: relative; }

/* 오른쪽 패널 */
.rsf-props { flex: 1 1 0; min-height: 0; overflow-y: auto; }
.rsf-panel { padding: var(--spacing-sm) var(--spacing-md); }
.rsf-panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: var(--spacing-xs); }
.rsf-panel-title { margin: 0 0 var(--spacing-xs); font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.rsf-panel-head .rsf-panel-title { margin: 0; }
.rsf-panel-sub { margin: var(--spacing-sm) 0 var(--spacing-xs); font-weight: 600; }
.rsf-panel-note { margin: var(--spacing-xs) 0; font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.rsf-panel-block { padding-top: var(--spacing-sm); }
.rsf-panel-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--spacing-xs); padding-top: var(--spacing-sm); }
.rsf-muted { color: var(--color-text-muted); }
.rsf-vars { list-style: none; margin: 0; padding: 0; }
.rsf-vars > li { padding: 4px 0; border-bottom: 1px solid var(--color-border-light); }
.rsf-var-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.rsf-var-origin { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.rsf-prop-checks p { margin: 2px 0 0; font-size: var(--font-size-sm); }
.rsf-branches { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsf-branch-box { display: flex; flex-direction: column; gap: 4px; padding: var(--spacing-xs); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); background: var(--color-bg-light); }
.rsf-branch-head { display: flex; align-items: center; gap: 4px; }
.rsf-branch-else { margin: 0; font-size: var(--font-size-sm); }

/* 아래 패널 */
.rsf-bottom { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.rsf-bottom[data-collapsed="true"] { flex: none; }
.rsf-bottom-head { display: flex; align-items: center; gap: var(--spacing-sm); padding: 0 var(--spacing-sm); }
.rsf-bottom-body { flex: 1 1 0; min-height: 0; overflow: auto; padding: var(--spacing-xs) var(--spacing-md); }
.rsf-bottom-bar { flex: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); }

/* 검사 결과 */
.rsf-checks-summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); margin: 0 0 var(--spacing-xs); font-weight: 600; }
.rsf-checks-hint { font-weight: 400; color: var(--color-text-secondary); }
.rsf-checks-list { list-style: none; margin: 0; padding: 0; }
.rsf-check {
  display: flex; align-items: center; gap: var(--spacing-sm); width: 100%; min-height: var(--form-height); padding: 2px var(--spacing-xs);
  text-align: left; border: 1px solid transparent; border-radius: var(--radius-sm); background: none; color: var(--color-text); font: inherit; cursor: pointer;
}
.rsf-check:hover:not(:disabled) { background: var(--color-bg-hover); border-color: var(--color-border-light); }
.rsf-check:disabled { cursor: default; }
.rsf-check-text { flex: 1; min-width: 0; }
.rsf-check-node { flex: none; color: var(--color-text-muted); }

/* 룰 세트 디버거 노드 상세·값 표(2단계 계획 Task 11 — TraceDetail·ValueTable). 시뮬레이션 탭을 지워도 남는다. */
/* 값 표 — 가로로 길면 표 안에서만 스크롤한다 */
.rsim-values { min-width: 0; }
.rsim-values-scroll { max-width: 100%; overflow-x: auto; }

/* 목록·노드 상세 */
.rsim-list { margin: 0; padding-left: var(--spacing-lg); }
.rsim-list li { padding: 2px 0; overflow-wrap: anywhere; }
.rsim-errors { color: var(--color-danger); }
.rsim-errors details { color: var(--color-text-secondary); }
.rsim-branch-head { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); margin-right: var(--spacing-xs); }
.rsim-cond { color: var(--color-text-secondary); margin-right: var(--spacing-xs); }
.rsim-msg { color: var(--color-danger); }
.rsim-badges { display: inline-flex; flex-wrap: wrap; gap: var(--spacing-xs); }
.rsim-hits { margin: 0; overflow-wrap: anywhere; }
.rsim-pairs { border-collapse: collapse; font-size: var(--font-size-sm); }
.rsim-pairs th { text-align: left; padding: 2px var(--spacing-sm) 2px 0; font-weight: 600; vertical-align: top; }
.rsim-pairs td { padding: 2px 0; overflow-wrap: anywhere; }

/* 3단계 본문 틀(계획 Task 0) — 왼쪽 패널(룰 패널·디버그 입력)과 스크롤하지 않는 아래 탭 */
.rsf-rule-panel { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; overflow-y: auto; }
.rsf-bottom-body[data-scroll="false"] { overflow: hidden; display: flex; flex-direction: column; }
`;
