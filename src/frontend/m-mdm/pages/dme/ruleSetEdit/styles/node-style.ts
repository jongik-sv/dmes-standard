/**
 * 룰·빈 단계 노드 외관(S1) — 팔레트 토큰(이 파일 머리), 노드 규칙(Task 2), 크기 손잡이(Task 4).
 * 패널 색 견본이 캔버스 밖에서도 같은 토큰을 쓰도록 `:root` 에 둔다. 값은 shared 의미 토큰을 color-mix 로 섞는다(16진수·rgb() 금지).
 * 어두운 화면 값은 Mantine 이 붙이는 `[data-mantine-color-scheme="dark"]` 에 둔다 — 앱은 지금 밝은 테마만 쓴다(계획 Ruling 4).
 * `:root` 의 사용자 정의 속성은 `:root` 에서 풀리므로 `.rsf-canvas` 에만 있는 `--rsf-node-bg`·`--rsf-border` 를 섞지 않는다.
 */
import { NODE_COLORS } from "../node-style";

const PALETTE = `
:root {
  --rsf-c-blue-border: var(--color-primary);
  --rsf-c-blue-bg: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg));
  --rsf-c-green-border: var(--color-success);
  --rsf-c-green-bg: color-mix(in srgb, var(--color-success) 12%, var(--color-bg));
  --rsf-c-yellow-border: var(--color-warning);
  --rsf-c-yellow-bg: var(--color-input-cell);
  --rsf-c-orange-border: color-mix(in srgb, var(--color-warning) 55%, var(--color-danger));
  --rsf-c-orange-bg: color-mix(in srgb, var(--color-warning) 7%, color-mix(in srgb, var(--color-danger) 5%, var(--color-bg)));
  --rsf-c-red-border: var(--color-danger);
  --rsf-c-red-bg: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg));
  --rsf-c-purple-border: color-mix(in srgb, var(--color-primary) 50%, var(--color-danger));
  --rsf-c-purple-bg: color-mix(in srgb, var(--color-primary) 6%, color-mix(in srgb, var(--color-danger) 6%, var(--color-bg)));
}
:root[data-mantine-color-scheme="dark"] {
  --rsf-c-blue-border: color-mix(in srgb, var(--color-primary) 65%, white);
  --rsf-c-blue-bg: color-mix(in srgb, var(--color-primary) 30%, var(--mantine-color-body));
  --rsf-c-green-border: color-mix(in srgb, var(--color-success) 65%, white);
  --rsf-c-green-bg: color-mix(in srgb, var(--color-success) 30%, var(--mantine-color-body));
  --rsf-c-yellow-border: color-mix(in srgb, var(--color-warning) 65%, white);
  --rsf-c-yellow-bg: color-mix(in srgb, var(--color-warning) 30%, var(--mantine-color-body));
  --rsf-c-orange-border: color-mix(in srgb, color-mix(in srgb, var(--color-warning) 55%, var(--color-danger)) 65%, white);
  --rsf-c-orange-bg: color-mix(in srgb, color-mix(in srgb, var(--color-warning) 55%, var(--color-danger)) 30%, var(--mantine-color-body));
  --rsf-c-red-border: color-mix(in srgb, var(--color-danger) 65%, white);
  --rsf-c-red-bg: color-mix(in srgb, var(--color-danger) 30%, var(--mantine-color-body));
  --rsf-c-purple-border: color-mix(in srgb, color-mix(in srgb, var(--color-primary) 50%, var(--color-danger)) 65%, white);
  --rsf-c-purple-bg: color-mix(in srgb, color-mix(in srgb, var(--color-primary) 50%, var(--color-danger)) 30%, var(--mantine-color-body));
}
`;

/**
 * 노드 규칙(계획 Task 2, Ruling 7) — 색·모양은 `.rsf-node:where([…])` 로 우선순위 (0,1,0)이다. base(`.rsf-node`) 뒤에 와서 기본 테두리는 이기고,
 * 상태 규칙(선택·디버그·끌어 놓기 대상·hover, 모두 0,2,0)에는 진다(S-D3). `--rsf-border` 는 바꾸지 않는다 — pending 이 그 회색을 쓴다.
 * 채움은 `--rsf-node-bg` 를 노드에서 다시 정해 검사 점 테두리·값 고침 표시도 같은 채움을 따른다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 */
const COLOR_RULES = NODE_COLORS.filter((c) => c !== "default")
  .map((c) => `.rsf-node:where([data-color="${c}"]) { --rsf-node-bg: var(--rsf-c-${c}-bg); border-color: var(--rsf-c-${c}-border); }`)
  .join("\n");

const NODE_RULES = `
${COLOR_RULES}
.rsf-node:where([data-shape="square"]) { border-radius: 0; }
.rsf-node:where([data-shape="pill"]) { border-radius: 999px; padding-left: 16px; padding-right: 34px; }
.rsf-node.rsf-task:where([data-shape="pill"]) { padding-left: 16px; padding-right: 16px; } /* .rsf-node.rsf-task(0,2,0)의 padding 을 이기려고 같은 우선순위로 */
.rsf-node.rsf-rule[data-no-open="true"] { padding-right: 10px; }
.rsf-node.rsf-rule[data-no-open="true"]:where([data-shape="pill"]) { padding-right: 16px; } /* 위 규칙(0,3,0)이 알약의 34px 를 이기므로 알약+열기 숨김은 둥근 끝 여백(16px)으로 되돌린다 */
.rsf-node:where([data-shape="pill"]) .rsf-open { right: 10px; }

/* 아이콘 + 제목 한 줄(아이콘은 제목 첫 줄에 맞춘다) */
.rsf-title-row { display: flex; align-items: flex-start; gap: 4px; min-width: 0; }
.rsf-title-row > .rsf-title { flex: 1 1 auto; min-width: 0; }
.rsf-node-icon { flex: none; display: inline-flex; width: 16px; height: 16px; color: var(--color-text-secondary); }

/* 높이를 키운 노드의 제목 — 줄바꿈하고 남는 줄 수만큼 보인 뒤 말줄임(S-D11). 줄 수는 노드가 인라인 --rsf-lines 로 준다. */
.rsf-title[data-lines] {
  white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--rsf-lines); line-clamp: var(--rsf-lines); overflow: hidden;
}
`;

/**
 * 노드 크기 손잡이(계획 Task 4, Ruling 16) — 오른쪽·아래 변 가운데에는 네 변 잇기 손잡이(.rsf-link, z-index 6)가 있어 75% 자리에 둔다.
 * 몸통 받기(.rsf-drop, z-index 5)·잇기 손잡이보다 위. 누름을 받는 표시라 nodrag nopan 을 단다.
 */
const GRIP_RULES = `
.rsf-node-grip {
  position: absolute; box-sizing: border-box; width: 10px; height: 10px; z-index: 7; pointer-events: auto; touch-action: none;
  background: var(--color-bg); border: 1.5px solid var(--color-primary); border-radius: 2px;
}
.rsf-node-grip:hover { background: var(--color-primary-soft); }
.rsf-node-grip[data-grip="e"] { right: -5px; top: calc(75% - 5px); cursor: ew-resize; }
.rsf-node-grip[data-grip="s"] { left: calc(75% - 5px); bottom: -5px; cursor: ns-resize; }
.rsf-node-grip[data-grip="se"] { right: -5px; bottom: -5px; cursor: nwse-resize; }
`;

export const NODE_STYLE_CSS = [PALETTE, NODE_RULES, GRIP_RULES].join("\n");
