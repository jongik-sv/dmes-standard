/**
 * commPermBench 화면 전용 스타일 — 페이지 루트에서 React 19 `<style href precedence>` 로 한 번만 넣는다.
 * m-* 로컬 `.css` import 는 포털이 싣지 않으므로 쓰지 않는다(Local-Rules §17). 색은 의미 토큰과 그 섞음(color-mix)만 쓴다.
 * 모양 정본 = docs/perm-bench/mock-v16.html CSS(1~494줄). 클래스 이름은 시안 이름에 `pb-` 를 붙였다.
 *
 * 역할 색 칩 12가지: 공용 토큰에 역할 팔레트가 없어 기본 색 토큰(파랑·초록·주황·빨강·회색)을 섞어 만든다.
 */
export const PERM_BENCH_STYLE_HREF = "mcm-perm-bench";

export const PERM_BENCH_CSS = `
.pb-root { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow: hidden; font-size: 13px; }
.pb-muted { color: var(--color-text-muted); } .pb-faint { color: var(--color-text-placeholder); }
.pb-small { font-size: 12px; } .pb-mono { font-family: var(--font-family-mono); font-size: 12px; }
.pb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 10px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg); }
.pb-bar__tag { font-weight: 700; color: var(--color-primary); }
.pb-crumb b { font-weight: 600; } .pb-crumb i { font-style: normal; color: var(--color-text-placeholder); margin: 0 4px; }
.pb-flash { padding: 2px 8px; border-radius: 8px; background: var(--color-success-soft); color: var(--color-success); font-size: 12px; }
.pb-err { padding: 2px 8px; border-radius: 8px; background: var(--color-danger-soft); color: var(--color-danger); font-size: 12px; }
.pb-sp { flex: 1; }
.pb-phase { padding: 2px 8px; border-radius: 10px; background: var(--color-warning-soft); color: var(--color-warning); font-size: 12px; font-weight: 600; }
.pb-work { flex: 1 1 0; min-height: 0; overflow: auto; padding-bottom: 6px; }
/* 칸 높이 = 작업 영역 높이(칸 안에서 스크롤). 격자 높이는 page.tsx 가 ResizableColumns style 로 준다 */
.pb-work > .cm-rc > .cm-rc-cell { min-height: 0; }
.pb-menu-grid { display: flex; flex-direction: column; }

/* 칸 */
.pb-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; max-height: 100%; background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); }
.pb-panel-head { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid var(--color-border-light); flex-wrap: wrap; }
.pb-panel-head h3 { margin: 0; font-size: 14px; font-weight: 700; }
.pb-count { font-size: 12px; padding: 0 7px; border-radius: 9px; background: var(--color-primary-soft); color: var(--color-primary); font-variant-numeric: tabular-nums; }
.pb-icobtns { display: inline-flex; gap: 4px; margin-left: auto; }
.pb-colhint { padding: 7px 10px; font-size: 12px; color: var(--color-text-muted); border-bottom: 1px solid var(--color-border-light); display: flex; flex-direction: column; gap: 6px; }
.pb-scroll { flex: 1 1 0; min-height: 120px; overflow: auto; padding: 4px; }
.pb-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pb-toolbar > .pb-grow { flex: 1 1 140px; min-width: 0; }

/* 원래 프로그램 링크 아이콘(↗) */
.pb-go { position: relative; }
.pb-go::after { content: "↗"; position: absolute; top: -3px; right: -2px; font-size: 9px; font-weight: 700; line-height: 1; color: var(--color-primary); pointer-events: none; }
/* Mantine Button 뿌리는 overflow: hidden 이라 단추 안쪽 모서리에 둔다 */
.form-button.pb-go::after { top: 1px; right: 2px; }
.pb-go:disabled::after, .pb-go[data-disabled]::after { color: var(--color-text-placeholder); }
.pb-pen { border: 0; background: none; padding: 0 2px; cursor: pointer; color: var(--color-text-placeholder); vertical-align: -2px; line-height: 0; }
.pb-pen:disabled { cursor: default; }
.pb-pen:not(:disabled):hover { color: var(--color-primary); }

/* 고르기 목록(사람·그룹·역할) */
.pb-pick { display: flex; align-items: center; gap: 6px; padding: 0 6px; border: 1px solid transparent; border-radius: var(--radius-md); }
.pb-pick:hover { background: var(--color-bg-hover); }
.pb-pick.is-on { background: var(--color-selection); border-color: var(--color-selection-border); }
.pb-pick__nm { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; padding: 5px 0; border: 0; background: none; cursor: pointer; text-align: left; font: inherit; color: inherit; }
.pb-pick__nm > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-pick__nm small { font-size: 11px; color: var(--color-text-muted); line-height: 1.35; }
.pb-pick__nm:disabled { cursor: not-allowed; } .pb-pick__nm:disabled > span { color: var(--color-text-placeholder); }
.pb-pick__go { color: var(--color-primary); font-weight: 700; }
.pb-empty-note { padding: 8px; display: block; font-size: 12px; color: var(--color-text-muted); }

/* 상태 꼬리표 */
.pb-st { display: inline-flex; align-items: center; margin-left: 4px; padding: 0 6px; border-radius: 8px; font-size: 11px; font-weight: 600; line-height: 18px; white-space: nowrap; vertical-align: 1px; }
.pb-st.add { background: var(--color-success-soft); color: var(--color-success); }
.pb-st.del { background: var(--color-danger-soft); color: var(--color-danger); }
.pb-st.mod, .pb-st.block { background: var(--color-warning-soft); color: var(--color-warning); }

/* 역할·그룹 칩 */
.pb-rchip { --pb-rc: var(--color-chart-5); display: inline-block; padding: 0 7px; border: 1px solid color-mix(in srgb, var(--pb-rc) 30%, transparent); border-radius: 9px; background: color-mix(in srgb, var(--pb-rc) 14%, var(--color-bg)); color: color-mix(in srgb, var(--pb-rc) 82%, var(--color-text)); font-size: 11px; font-weight: 500; line-height: 18px; white-space: nowrap; }
.pb-rc0 { --pb-rc: var(--color-primary); }
.pb-rc1 { --pb-rc: color-mix(in srgb, var(--color-success) 60%, var(--color-primary)); }
.pb-rc2 { --pb-rc: var(--color-warning); }
.pb-rc3 { --pb-rc: color-mix(in srgb, var(--color-primary) 55%, var(--color-danger)); }
.pb-rc4 { --pb-rc: color-mix(in srgb, var(--color-danger) 80%, var(--color-primary)); }
.pb-rc5 { --pb-rc: var(--color-success); }
.pb-rc6 { --pb-rc: color-mix(in srgb, var(--color-chart-2) 55%, var(--color-success)); }
.pb-rc7 { --pb-rc: color-mix(in srgb, var(--color-danger) 60%, var(--color-primary)); }
.pb-rc8 { --pb-rc: color-mix(in srgb, var(--color-warning) 65%, var(--color-success)); }
.pb-rc9 { --pb-rc: color-mix(in srgb, var(--color-primary) 70%, var(--color-chart-5)); }
.pb-rc10 { --pb-rc: color-mix(in srgb, var(--color-warning) 55%, var(--color-danger)); }
.pb-rc11 { --pb-rc: var(--color-chart-5); }
.pb-rchip.is-off { text-decoration: line-through; opacity: 0.6; }
.pb-gchip { display: inline-block; padding: 0 7px; border: 1px solid var(--color-border-strong); border-radius: 9px; font-size: 11px; line-height: 18px; white-space: nowrap; background: var(--color-bg); }

/* 메뉴 칸 그리드 */
.pb-menu-grid { flex: 1 1 0; min-height: 240px; }
.pb-menu-grid .pb-row-lvl0 .ag-cell { font-weight: 600; background: var(--color-bg-header); }
.pb-mname { display: inline-flex; align-items: center; gap: 4px; min-width: 0; white-space: nowrap; }
.pb-mname .pb-tw { display: inline-block; width: 12px; color: var(--color-text-muted); }
.pb-mname .pb-pen { opacity: 0; }
.pb-menu-grid .ag-row-hover .pb-pen, .pb-mname .pb-pen:focus-visible { opacity: 1; }
.pb-mname.is-dim > .pb-nmt { color: var(--color-text-placeholder); }
.pb-tri { margin: 0; vertical-align: middle; }
.pb-notice { font-size: 12px; color: var(--color-warning); }

/* 미리보기 */
.pb-pad { padding: 10px; }
.pb-appwin { border: 1px solid var(--color-border-strong); border-radius: 8px; overflow: hidden; background: var(--color-bg); }
.pb-appbar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: var(--color-text); color: var(--color-bg); font-size: 12px; }
.pb-appbody { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 520px; }
.pb-appnav { border-right: 1px solid var(--color-border-light); background: var(--color-bg-light); font-size: 12px; max-height: 620px; overflow: auto; padding: 4px 0; }
.pb-appnav button { display: flex; width: 100%; align-items: center; gap: 4px; border: 0; background: none; text-align: left; padding: 3px 8px; cursor: pointer; font: inherit; color: inherit; }
.pb-appnav button:hover { background: var(--color-selection); }
.pb-appnav .lv0 { font-weight: 600; } .pb-appnav .lv1 { padding-left: 18px; color: var(--color-text-muted); } .pb-appnav .lv2 { padding-left: 30px; }
.pb-appnav .is-on { background: var(--color-selection); color: var(--color-primary); font-weight: 600; }
.pb-appnav .pb-n { margin-left: auto; color: var(--color-text-placeholder); font-variant-numeric: tabular-nums; }
.pb-appnav .pb-sl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-rones { display: inline-flex; flex-shrink: 0; gap: 2px; margin-left: auto; padding-left: 4px; }
.pb-rone { width: 16px; padding: 0; border-radius: 4px; font-size: 10px; font-weight: 700; line-height: 15px; text-align: center; }
.pb-rmore { color: var(--color-text-placeholder); font-size: 10px; line-height: 15px; }
.pb-appmain { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pb-appmain h3 { margin: 0; font-size: 16px; }
.pb-appcrumb { font-size: 11px; color: var(--color-text-muted); }
.pb-apptools { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; padding: 8px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg-light); }
.pb-apppops { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; padding: 8px; border: 1px dashed var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-bg); }
.pb-apptools > .pb-lbl, .pb-apppops > .pb-lbl { align-self: center; margin-right: 2px; color: var(--color-text-muted); font-size: 12px; font-weight: 600; }
.pb-abwrap { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.pb-abroles { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-height: 16px; }
.pb-abtn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border: 1px solid var(--color-primary); border-radius: var(--radius-sm); background: var(--color-primary); color: var(--color-on-primary); font-size: 13px; cursor: help; }
.pb-abtn.is-locked { background: var(--color-bg); color: var(--color-text-placeholder); border-color: var(--color-border-strong); border-style: dashed; }
.pb-pbtn { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border: 1px solid var(--color-primary); border-radius: 12px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 12.5px; cursor: help; }
.pb-pbtn code { font-family: var(--font-family-mono); font-size: 10.5px; opacity: 0.75; }
.pb-pbtn.is-locked { border-color: var(--color-border-strong); background: var(--color-bg-light); color: var(--color-text-placeholder); }
.pb-rtag { padding: 0; border: 0; background: none; font: inherit; line-height: 0; }
button.pb-rtag { cursor: pointer; }
.pb-rtag .pb-rchip { font-size: 10px; line-height: 15px; padding: 0 5px; }
.pb-rtag.is-cur .pb-rchip { outline: 1.5px solid var(--color-primary); outline-offset: 1px; }
button.pb-rtag:hover .pb-rchip, button.pb-rtag:focus-visible .pb-rchip { border-color: currentColor; }
.pb-cantopen { padding: 18px; border: 1px dashed var(--color-border-strong); border-radius: var(--radius-md); color: var(--color-text-muted); }

/* 퍼미션 */
.pb-appperm { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg-light); }
.pb-sub { margin: 0; font-size: 13px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.pb-sub .pb-small { font-weight: 400; }
.pb-stack { display: flex; flex-direction: column; gap: 10px; }
.pb-rpick { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pb-rpick button { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px 3px 3px; border: 1px solid var(--color-border-light); border-radius: 13px; background: var(--color-bg); color: var(--color-text-muted); font: inherit; font-size: 12px; cursor: pointer; }
.pb-rpick button:hover { border-color: var(--color-border-strong); color: var(--color-text); }
.pb-rpick button[aria-pressed="true"] { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); background: var(--color-primary-soft); color: var(--color-text); }
.pb-pk { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: var(--color-text-muted); }
.pb-pk .pb-mono { padding: 1px 6px; border: 1px solid var(--color-border-light); border-radius: 4px; background: var(--color-bg-light); color: var(--color-text); }
.pb-psub { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin: 0; font-size: 12.5px; }
.pb-ripple { font-size: 11px; color: var(--color-primary); }
.pb-bad { color: var(--color-danger); }
.pb-openroles { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--color-border-strong); }
.pb-openroles ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.pb-openroles li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding: 4px 6px; border-radius: 4px; font-size: 12px; }
.pb-openroles li small { flex-basis: 100%; font-size: 11px; color: var(--color-text-muted); }
.pb-openroles li.is-on { background: var(--color-selection); }
.pb-openroles li.is-other { color: var(--color-text-placeholder); }
.pb-openroles li.is-other .pb-rchip { filter: grayscale(1); opacity: 0.55; }
.pb-openroles li.is-none { color: var(--color-text-muted); }
.pb-btnlist { font-family: var(--font-family-mono); font-size: 11px; }
.pb-who { border: 0; background: none; padding: 0; cursor: pointer; color: var(--color-primary); text-align: left; font: inherit; font-size: 12px; }
.pb-who:hover { text-decoration: underline; }
`;
