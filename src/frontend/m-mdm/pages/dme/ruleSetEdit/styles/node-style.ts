/**
 * 룰·빈 단계 노드 외관(S1) — 팔레트 토큰(이 파일 머리), 노드 규칙(Task 2), 크기 손잡이(Task 4).
 * 패널 색 견본이 캔버스 밖에서도 같은 토큰을 쓰도록 `:root` 에 둔다. 값은 shared 의미 토큰을 color-mix 로 섞는다(16진수·rgb() 금지).
 * 어두운 화면 값은 Mantine 이 붙이는 `[data-mantine-color-scheme="dark"]` 에 둔다 — 앱은 지금 밝은 테마만 쓴다(계획 Ruling 4).
 * `:root` 의 사용자 정의 속성은 `:root` 에서 풀리므로 `.rsf-canvas` 에만 있는 `--rsf-node-bg`·`--rsf-border` 를 섞지 않는다.
 */
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

export const NODE_STYLE_CSS = PALETTE;
