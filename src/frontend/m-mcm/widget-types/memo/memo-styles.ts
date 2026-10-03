/**
 * 메모장 렌더러 전용 스타일 — 로컬 .css import 대신 TS 문자열로 두고 렌더러 루트에서 한 번 넣는다(Local-Rules §17).
 * 색·간격은 공통 토큰만 쓴다. 높이는 위젯 칸을 채우고(루트 height 100%) 보기 영역만 스크롤한다.
 * text·html 입력칸은 shared Textarea(Mantine 겹 래퍼)를 감싼 .mcm-memo__field 안에서 남는 높이를 채운다.
 * md 편집기(shared MarkdownField fill)는 .mcm-memo__field 밖의 .mcm-memo__md 에 둔다 — `.mcm-memo__field div` 후손 규칙이
 * 편집기 안의 div(도구 막대·Tiptap 감싸개·ProseMirror 노드)에 걸려 모양을 망가뜨리지 않게. 저장 중 잠금은 --locked(누름 막기·흐리게)다.
 */
export const MEMO_STYLE_HREF = "mcm-widget-memo";

export const MEMO_CSS = `
.mcm-memo { display: flex; flex-direction: column; gap: var(--spacing-xs); height: 100%; min-height: 0; box-sizing: border-box; }
.mcm-memo__bar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
.mcm-memo__bar--end { justify-content: flex-end; }
.mcm-memo__actions { display: flex; align-items: center; gap: var(--spacing-xs); }
.mcm-memo__view { flex: 1 1 0; min-height: 0; overflow: auto; }
.mcm-memo__edit { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: var(--spacing-xs); container-type: inline-size; }
.mcm-memo__count { font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.mcm-memo__count--over { color: var(--color-danger); }
.mcm-memo__error { flex: 1 1 0; min-width: 0; font-size: var(--font-size-sm); color: var(--color-danger); overflow-wrap: anywhere; }
.mcm-memo__field { flex: 1 1 0; min-height: 80px; display: flex; flex-direction: column; }
.mcm-memo__field div { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.mcm-memo__field textarea { flex: 1 1 0; min-height: 0; height: auto; resize: none; }
.mcm-memo__field--code textarea { font-family: var(--font-family-mono); }
/* 최소 높이 190px — 도구 막대가 두 줄일 때 기준이다. shared 도구 막대(.cm-md-toolbar)는 flex-wrap: wrap 이라 본문 폭이 약 395px 미만이면
   두 줄이 된다: 단추 24px×2 + 줄 간격 2px + 안쪽 여백 2px×2 + 테두리 1px×2 = 56px(한 줄이면 30px). 여기에 도구 막대 아래 간격
   var(--spacing-xs)=4px, 편집 칸 최소 120px(.cm-md-inline .cm-md-body min-height, border-box 이면 120px·아니면 안쪽 여백·테두리 10px 가 더해져 130px)를
   더하면 180~190px 이다. 이보다 낮으면 편집기가 아래 [저장]·[취소] 줄을 덮는다. 작은 위젯은 틀 본문이 스크롤한다.
   링크 입력 칸(.cm-md-link-pop)이 absolute 로 상자 밖까지 뜨므로 overflow 로 가두지 않는다(잘림 방지). */
.mcm-memo__md { flex: 1 1 0; min-height: 190px; display: flex; flex-direction: column; }
/* 편집 영역 폭이 420px 이상이면 도구 막대가 한 줄(30px)이라 30 + 4 + 130 = 164px 면 된다. 190px 를 그대로 두면 기본 크기(8×10, 본문 약 236px)에서
   [저장] 줄이 칸 아래로 밀려 스크롤해야 보인다(2026-10-03 화면 확인). 폭 기준은 .mcm-memo__edit 의 container-type 이다. */
@container (min-width: 420px) { .mcm-memo__md { min-height: 164px; } }
.mcm-memo__md--locked { pointer-events: none; opacity: 0.7; }
`;
