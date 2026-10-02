/**
 * 포털 홈 화면 전용 스타일 — 로컬 .css import 대신 TS 문자열로 두고 페이지 루트에서 한 번 넣는다(Local-Rules §17).
 * 색·간격은 공통 토큰만 쓴다. 카드·KPI·배지·차트 모습은 shared(dashboard·badge·charts)가 정한다.
 * 선택·안읽음·심각도는 배경 톤·작은 점·배지로만 구분한다(한 변 컬러 바 금지, Local-Rules §8).
 */
export const HOME_STYLE_HREF = "mcm-home";

export const HOME_CSS = `
.mcm-home-welcome { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; min-height: 30px; }
.mcm-home-welcome__hello { margin: 0; font-size: var(--font-size-title); font-weight: 700; color: var(--color-text); }
.mcm-home-welcome__date { font-size: var(--font-size-sm); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.mcm-home-welcome__right { margin-left: auto; display: flex; align-items: center; gap: var(--spacing-sm); flex-wrap: wrap; }

.mcm-home-urgent { display: flex; align-items: center; gap: var(--spacing-md); box-sizing: border-box; padding: 5px 10px; background: var(--color-danger-soft); border: 1px solid color-mix(in srgb, var(--color-danger) 35%, transparent); border-radius: var(--radius-md); }
.mcm-home-urgent__label { flex-shrink: 0; font-size: var(--font-size-sm); font-weight: 700; color: var(--color-danger); white-space: nowrap; }
.mcm-home-urgent__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text); }

.mcm-home-scroll { flex: 1 1 0; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; }
.mcm-home-nlist { list-style: none; margin: 0; padding: 0; }
.mcm-home-nlist__item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 3px 8px; padding: 7px 10px; border-bottom: 1px solid var(--color-border-light); cursor: pointer; outline: none; }
.mcm-home-nlist__item:hover { background: var(--color-bg-hover); }
.mcm-home-nlist__item:focus-visible { background: var(--color-bg-hover); box-shadow: inset 0 0 0 1px var(--color-focus); }
.mcm-home-nlist__item[aria-selected="true"] { background: var(--color-selection); }
.mcm-home-nlist__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: var(--color-text); }
.mcm-home-nlist__meta { grid-column: 2 / 4; display: flex; gap: var(--spacing-sm); min-width: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.mcm-home-nlist__pin { color: var(--color-primary); font-weight: 600; }

.mcm-home-viewer { padding: var(--spacing-md) 14px; }
.mcm-home-viewer__head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding-bottom: var(--spacing-sm); margin-bottom: var(--spacing-md); border-bottom: 1px solid var(--color-border-light); }
.mcm-home-viewer__title { flex-basis: 100%; margin: 0; font-size: 14px; font-weight: 700; line-height: 1.35; color: var(--color-text); overflow-wrap: anywhere; }
.mcm-home-viewer__meta { font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }

.mcm-home-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-sm); padding: 28px 12px; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mcm-home-state--error { color: var(--color-danger); }

.mcm-home-nf { list-style: none; margin: 0; padding: 0; }
.mcm-home-nf__item { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 1px 10px; padding: 7px 10px 7px 14px; border-bottom: 1px solid var(--color-border-light); cursor: pointer; outline: none; }
.mcm-home-nf__item:hover { background: var(--color-bg-hover); }
.mcm-home-nf__item:focus-visible { background: var(--color-bg-hover); box-shadow: inset 0 0 0 1px var(--color-focus); }
.mcm-home-nf__item--unread::before { content: ""; position: absolute; left: 4px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: var(--color-primary); }
.mcm-home-nf__icon { grid-row: span 2; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-size: var(--font-size-xs); font-weight: 700; }
.mcm-home-nf__icon--primary { background: var(--color-primary-soft); color: var(--color-primary); }
.mcm-home-nf__icon--danger { background: var(--color-danger-soft); color: var(--color-danger); }
.mcm-home-nf__icon--success { background: var(--color-success-soft); color: var(--color-success); }
.mcm-home-nf__icon--warning { background: var(--color-warning-soft); color: var(--color-warning); }
.mcm-home-nf__icon--neutral { background: var(--color-bg-hover); color: var(--color-text-muted); }
.mcm-home-nf__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-secondary); }
.mcm-home-nf__item--unread .mcm-home-nf__title { font-weight: 700; color: var(--color-text); }
.mcm-home-nf__time { font-size: var(--font-size-xs); color: var(--color-text-muted); white-space: nowrap; }
.mcm-home-nf__sub { grid-column: 2 / 4; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-xs); color: var(--color-text-muted); }

.mcm-home-alarm { list-style: none; margin: 0; padding: 0; }
.mcm-home-alarm__item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--color-border-light); }
.mcm-home-alarm__item:last-child { border-bottom: 0; }
.mcm-home-alarm__title { display: block; font-weight: 500; color: var(--color-text); }
.mcm-home-alarm__detail { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.mcm-home-alarm__time { font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }

/* 기존 차트(Donut·HBar·StackedBar)는 크기를 바꾸지 않으므로, 카드 높이·폭이 바뀌면 본문 가운데에 둔다. */
.mcm-home-chart-center { display: flex; align-items: center; justify-content: center; min-height: 100%; box-sizing: border-box; }
.mcm-home-hscroll { overflow-x: auto; }
.mcm-home-chart-center.mcm-home-hscroll { justify-content: safe center; }

.mcm-home-quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--spacing-sm); }
.mcm-home-quick__btn { width: 100%; }
.mcm-home-quick__mod { margin-left: 6px; font-size: var(--font-size-xs); font-weight: 400; color: var(--color-text-muted); }

.mcm-home-toolbar { padding: 6px 10px; border-bottom: 1px solid var(--color-border-light); }
.mcm-home-sub { font-size: var(--font-size-xs); color: var(--color-text-muted); white-space: nowrap; }

.mcm-home { display: flex; flex-direction: column; gap: var(--spacing-sm); padding-bottom: var(--spacing-xl); min-width: 0; }
`;
