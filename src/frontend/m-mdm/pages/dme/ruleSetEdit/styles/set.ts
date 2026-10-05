/**
 * 룰 세트(SET) 노드(하위 세트 spec §9) — BPMN call activity 처럼 굵은 전체 테두리(한 변 색 바가 아니다, Local-Rules §8)·룰 노드와 같은 여백·
 * 입력·출력 개수 칩, 속성 패널·메시지 줄의 세트 링크 단추. 색은 의미 토큰만 쓴다.
 * `border` 줄임 속성을 쓰지 않고 `border-width` 만 둔다 — 상태 규칙(base 의 `.rsf-node[data-state]` 색, catch 의 caught 점선)이 그대로 이긴다.
 * 연결 손잡이 클래스 `.rsf-link`(styles/connect.ts)와 겹치지 않게 링크 단추는 `.rsf-set-link` 다.
 */
export const SET_CSS = `
.rsf-node.rsf-set { border-width: 3px; padding: 4px 28px 4px 8px; }
.rsf-set-io { display: flex; gap: 4px; margin-top: 2px; }
.rsf-set-chip {
  font-size: var(--font-size-xs); line-height: 15px; padding: 0 6px; border-radius: 999px; white-space: nowrap;
  background: var(--color-bg-header); color: var(--color-text-secondary); border: 1px solid var(--color-border);
}
.rsf-set-link { padding: 0; border: 0; background: none; color: var(--color-primary); font: inherit; cursor: pointer; text-decoration: underline; text-align: left; }
.rsf-set-links { margin: 0; display: flex; flex-wrap: wrap; gap: var(--spacing-xs) var(--spacing-sm); align-items: center; }
`;
