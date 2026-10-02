/**
 * 메모장 렌더러 전용 스타일 — 로컬 .css import 대신 TS 문자열로 두고 렌더러 루트에서 한 번 넣는다(Local-Rules §17).
 * 색·간격은 공통 토큰만 쓴다. 높이는 위젯 칸을 채우고(루트 height 100%) 보기 영역만 스크롤한다.
 * 입력칸은 shared Textarea(Mantine 겹 래퍼)를 감싼 .mcm-memo__field 안에서 남는 높이를 채운다.
 */
export const MEMO_STYLE_HREF = "mcm-widget-memo";

export const MEMO_CSS = `
.mcm-memo { display: flex; flex-direction: column; gap: var(--spacing-xs); height: 100%; min-height: 0; box-sizing: border-box; }
.mcm-memo__bar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
.mcm-memo__bar--end { justify-content: flex-end; }
.mcm-memo__actions { display: flex; align-items: center; gap: var(--spacing-xs); }
.mcm-memo__view { flex: 1 1 0; min-height: 0; overflow: auto; }
.mcm-memo__edit { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: var(--spacing-xs); }
.mcm-memo__count { font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.mcm-memo__count--over { color: var(--color-danger); }
.mcm-memo__error { flex: 0 0 auto; font-size: var(--font-size-sm); color: var(--color-danger); overflow-wrap: anywhere; }
.mcm-memo__field { flex: 1 1 0; min-height: 80px; display: flex; flex-direction: column; }
.mcm-memo__field div { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.mcm-memo__field textarea { flex: 1 1 0; min-height: 0; height: auto; resize: none; }
.mcm-memo__field--code textarea { font-family: var(--font-family-mono); }
`;
