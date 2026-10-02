/**
 * 룰·빈 단계 노드 외관(S1) — 팔레트 토큰(이 파일 머리), 노드 규칙(Task 2), 크기 손잡이(Task 4).
 * 메뉴 색 견본이 캔버스 밖에서도 같은 토큰을 쓰도록 `:root` 에 둔다. 값은 shared 의미 토큰을 color-mix 로 섞는다(16진수·rgb() 금지).
 * 어두운 화면 값은 Mantine 이 붙이는 `[data-mantine-color-scheme="dark"]` 에 둔다 — 앱은 지금 밝은 테마만 쓴다(계획 Ruling 4).
 * `:root` 의 사용자 정의 속성은 `:root` 에서 풀리므로 `.rsf-canvas` 에만 있는 `--rsf-node-bg`·`--rsf-border` 를 섞지 않는다.
 */
import { NODE_COLORS, type NodeColor } from "../node-style";

/** 기준색(shared 의미 토큰과 그 섞음). 주황·보라는 두 토큰의 섞음이다. */
const BASE: Readonly<Record<Exclude<NodeColor, "default">, string>> = {
  blue: "var(--color-primary)",
  orange: "color-mix(in srgb, var(--color-warning) 55%, var(--color-danger))",
  green: "var(--color-success)",
  red: "var(--color-danger)",
  purple: "color-mix(in srgb, var(--color-primary) 50%, var(--color-danger))",
};
const COLORS = NODE_COLORS.filter((c): c is Exclude<NodeColor, "default"> => c !== "default");

/**
 * Camunda 처럼 진하게(C3) — 채움은 기준색 28% 를 배경에, 테두리·제목 글자·아이콘은 기준색 65% 를 글자색(--color-text)에 섞는다.
 * 어두운 화면은 같은 규칙에 바탕만 Mantine 본문색, 테두리는 흰색 쪽으로 섞는다.
 */
const PALETTE = `
:root {
${COLORS.map((c) => `  --rsf-c-${c}-bg: color-mix(in srgb, ${BASE[c]} 28%, var(--color-bg));
  --rsf-c-${c}-border: color-mix(in srgb, ${BASE[c]} 65%, var(--color-text));`).join("\n")}
}
:root[data-mantine-color-scheme="dark"] {
${COLORS.map((c) => `  --rsf-c-${c}-bg: color-mix(in srgb, ${BASE[c]} 30%, var(--mantine-color-body));
  --rsf-c-${c}-border: color-mix(in srgb, ${BASE[c]} 65%, white);`).join("\n")}
}
`;

/**
 * 노드 규칙(계획 Task 2, Ruling 7) — 색·모양은 `.rsf-node:where([…])` 로 우선순위 (0,1,0)이다. base(`.rsf-node`) 뒤에 와서 기본 테두리는 이기고,
 * 상태 규칙(선택·디버그·끌어 놓기 대상·hover, 모두 0,2,0)에는 진다(S-D3). `--rsf-border` 는 바꾸지 않는다 — pending 이 그 회색을 쓴다.
 * 제목 글자색도 같은 진한 색이다 — pending 의 흐린 글자 규칙(0,2,0)이 이긴다. 선택은 색 없는 노드만 테두리를 파랑으로 바꾸고(base.ts) 색 칠한 노드는 바깥 고리만 준다(C5).
 * 채움은 `--rsf-node-bg` 를 노드에서 다시 정해 검사 점 테두리·값 고침 표시도 같은 채움을 따른다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 */
const COLOR_RULES = COLORS.map(
  (c) => `.rsf-node:where([data-color="${c}"]) { --rsf-node-bg: var(--rsf-c-${c}-bg); border-color: var(--rsf-c-${c}-border); color: var(--rsf-c-${c}-border); }`,
).join("\n");

const NODE_RULES = `
${COLOR_RULES}
.rsf-node:where([data-color]) .rsf-node-icon { color: inherit; }
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

/* 설명 아이콘(제목 옆, 마우스를 올리면 title 툴팁). 시작·끝·분기·병렬 라벨 옆에도 같은 모양. */
.rsf-desc-icon { flex: none; display: inline-flex; align-items: center; width: 14px; height: 14px; margin-left: 4px; color: var(--color-text-muted); cursor: help; }
.rsf-title-row > .rsf-desc-icon { margin-left: 0; margin-top: 1px; }
.rsf-node:where([data-color]) .rsf-desc-icon { color: inherit; }
.rsf-par-label .rsf-desc-icon { vertical-align: middle; }

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
/* 메모 크기 손잡이 — 메모 틀이 넘침을 숨기므로(overflow hidden) 손잡이는 틀 안쪽 가장자리에 둔다. 글 칸 위로 올린다. */
.rsf-note-grip {
  position: absolute; box-sizing: border-box; width: 10px; height: 10px; z-index: 7; pointer-events: auto; touch-action: none;
  background: var(--color-bg); border: 1.5px solid var(--color-primary); border-radius: 2px;
}
.rsf-note-grip:hover { background: var(--color-primary-soft); }
.rsf-note-grip[data-grip="e"] { right: 0; top: calc(50% - 5px); cursor: ew-resize; }
.rsf-note-grip[data-grip="s"] { left: calc(50% - 5px); bottom: 0; cursor: ns-resize; }
.rsf-note-grip[data-grip="se"] { right: 0; bottom: 0; cursor: nwse-resize; }
`;

export const NODE_STYLE_CSS = [PALETTE, NODE_RULES, GRIP_RULES].join("\n");
