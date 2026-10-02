/**
 * 챗봇 렌더러 전용 스타일 — 로컬 .css import 대신 TS 문자열로 두고 렌더러 루트에서 한 번 넣는다(Local-Rules §17).
 * 색·간격은 공통 토큰만 쓴다. 말풍선 구분은 배경 톤과 정렬로만 한다(한 변 컬러 바 금지, Local-Rules §8).
 * 높이는 위젯 칸을 채우고(루트 height 100%), 대화 목록만 스크롤한다. 입력 칸은 아래에 고정이다.
 */
export const CHAT_STYLE_HREF = "mcm-widget-chat";

export const CHAT_CSS = `
.mcm-chat { display: flex; flex-direction: column; height: 100%; min-height: 0; box-sizing: border-box; background: var(--color-bg); }

.mcm-chat__list { flex: 1 1 0; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: var(--spacing-md); padding: var(--spacing-lg); }
.mcm-chat__row { display: flex; flex-direction: column; gap: var(--spacing-xs); min-width: 0; }
.mcm-chat__row--user { align-items: flex-end; }
.mcm-chat__row--assistant { align-items: flex-start; }

.mcm-chat__bubble { max-width: 88%; box-sizing: border-box; padding: 7px 10px; border-radius: var(--radius-md); font-size: var(--font-size-md); line-height: 1.5; color: var(--color-text); overflow-wrap: anywhere; }
.mcm-chat__bubble--user { background: var(--color-primary-soft); white-space: pre-wrap; }
.mcm-chat__bubble--assistant { background: var(--color-bg-hover); }
.mcm-chat__bubble--pending { opacity: 0.6; }
.mcm-chat__bubble .cm-md-view > :first-child { margin-top: 0; }
.mcm-chat__bubble .cm-md-view > :last-child { margin-bottom: 0; }

.mcm-chat__links { display: flex; flex-direction: column; gap: var(--spacing-xs); max-width: 88%; }
.mcm-chat__link { display: flex; align-items: center; gap: var(--spacing-sm); min-width: 0; font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.mcm-chat__link-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mcm-chat__wait { font-size: var(--font-size-sm); color: var(--color-text-muted); }

.mcm-chat__composer { flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--spacing-xs); padding: var(--spacing-sm) var(--spacing-lg) var(--spacing-lg); border-top: 1px solid var(--color-border-light); }
.mcm-chat__error { font-size: var(--font-size-sm); color: var(--color-danger); overflow-wrap: anywhere; }
.mcm-chat__hint { font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mcm-chat__bar { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
.mcm-chat__count { font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.mcm-chat__count--low { color: var(--color-danger); }
`;
