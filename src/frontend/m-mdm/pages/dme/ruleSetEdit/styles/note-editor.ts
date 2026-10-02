/**
 * 캔버스 메모에 마크다운 편집기 붙이기 — 편집기 자체 모습(글 모양·도구 막대·MD 원문 칸)은 shared `@dk-oasis/shared/markdown-editor` 가
 * 자기 `<style>` 로 넣는다. 여기는 React Flow·`.rsf-note` 에 걸린 규칙만 둔다(shared 는 화면 클래스를 모른다).
 * 편집 중 표시는 shared 의 `.cm-md-editing` 으로 고른다.
 * 오른쪽 패널에서 메모를 고르면 「메모」 구역이 패널의 남은 높이를 채운다(`.rsf-panel-fill` — 메모 패널에만 붙는다, 다른 종류 패널 배치는 그대로).
 */
export const NOTE_EDITOR_CSS = `
/* 캔버스 메모 — 편집 중에는 도구 막대(floating)가 메모 위로 나가도록 메모의 넘침 자르기를 푼다. */
.rsf-note:has(.cm-md-editing) { overflow: visible; }
/* 편집 중인 메모 노드는 받는 노드(고른 노드 1000 + 1, FlowCanvas SELECT_ELEVATION)보다 위에 그린다 — 메모 위로 뜬 도구 막대가 그 밑에 깔리지 않게.
   React Flow 가 노드 감싸개에 z-index 를 인라인으로 주므로 !important 로 이긴다(편집하는 동안만). */
.react-flow__node:has(.cm-md-editing) { z-index: 1002 !important; }
/* 오른쪽 패널 메모 — 스크롤 칸(.rsf-props) → 패널(.rsf-side) → 메모 패널 → 펼친 「메모」 구역 → 구역 본문을 세로 flex 로 이어
   shared MarkdownField(fill)가 남은 높이를 채운다. 편집 칸(서식·MD)이 늘고 넘치면 칸 안에서 스크롤하며, 「지우기」는 맨 아래에 놓인다.
   구역을 접으면 늘리지 않는다. 다른 종류(노드·선·세트) 패널은 .rsf-panel-fill 이 없어 배치가 그대로다. */
.rsf-props:has(> .rsf-side > .rsf-panel-fill) { display: flex; flex-direction: column; }
.rsf-side:has(> .rsf-panel-fill) { flex: 1 1 0; min-height: 0; }
.rsf-panel-fill { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.rsf-panel-fill > .rsf-section[data-open="true"] { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.rsf-panel-fill > .rsf-section[data-open="true"] > .rsf-section-body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
`;
