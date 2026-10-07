/**
 * noticeMgmt 화면 전용 스타일 — 페이지 루트에서 React 19 `<style href precedence>` 로 한 번만 넣는다.
 * m-* 로컬 `.css` import 는 포털이 싣지 않으므로 쓰지 않는다(Local-Rules §17). 색·간격은 의미 토큰만 쓴다.
 * 홈 미리보기 팝업 머리글은 홈 공지 뷰어(m-mcm home `home-styles.ts` 의 .mcm-home-viewer*)와 같은 값이다.
 */
export const NOTICE_MGMT_STYLE_HREF = "mls-notice-mgmt";

export const NOTICE_MGMT_CSS = `
.nm-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--spacing-sm); }
.nm-hint { font-size: var(--font-size-xs); color: var(--color-text-muted); line-height: 1.4; }
.nm-section { border-top: 1px solid var(--color-border-light); }
.nm-section__head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--spacing-sm); min-height: 32px; box-sizing: border-box; padding: 3px 10px; background: var(--color-bg-header); border-bottom: 1px solid var(--color-border-light); }
.nm-section__title { margin: 0; font-size: 13px; font-weight: 700; color: var(--color-text); }
.nm-section__sub { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.nm-section__tools { margin-left: auto; }
.nm-section__body { padding: var(--spacing-sm) 10px; }
/* 상세 패널은 세로 flex — 위 입력표는 내용 높이, 본문 구역(.nm-body)이 남은 높이를 모두 채운다.
   편집기 사슬(.nm-body → __inner → .nm-editor → Textarea·MarkdownField fill)은 모두 flex 1 1 0 + min-height 0 이다.
   좁은 화면에서도 편집기가 찌그러지지 않게 본문 구역은 최소 320px, 그보다 작으면 .nm-detail 이 스크롤한다. */
.nm-detail { flex: 1 1 0; min-height: 0; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; }
.nm-detail > table { flex: none; }
.nm-body { flex: 1 1 0; min-height: 320px; display: flex; flex-direction: column; }
.nm-body__inner { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.nm-editor { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.nm-editor--locked { pointer-events: none; }
.nm-editor > .mantine-Textarea-root { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.nm-editor .mantine-Input-wrapper { flex: 1 1 0; min-height: 0; }
.nm-editor textarea.form-textarea { height: 100%; resize: none; }
.nm-editor textarea.nm-mono { font-family: var(--font-family-mono); font-size: var(--font-size-sm); }
.nm-editor__foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--spacing-md); padding-top: 4px; font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.nm-editor__foot--over { color: var(--color-danger); font-weight: 600; }
.nm-empty { font-size: var(--font-size-sm); color: var(--color-text-muted); }
.nm-viewer { padding: var(--spacing-md) 14px; }
.nm-viewer__head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding-bottom: var(--spacing-sm); margin-bottom: var(--spacing-md); border-bottom: 1px solid var(--color-border-light); }
.nm-viewer__title { flex-basis: 100%; margin: 0; font-size: 14px; font-weight: 700; line-height: 1.35; color: var(--color-text); overflow-wrap: anywhere; }
.nm-viewer__meta { font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
`;
