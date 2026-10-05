/**
 * mermaid 도식 크기 계산(순수 함수) — MermaidDiagram(본문 안 도식)과 MermaidViewer(크게 보기 창)가 함께 쓴다.
 */

/** 본문 도식 단추로 고르는 배율 단계. */
export const MERMAID_ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
/** 크게 보기 창의 배율 단계 — 큰 도식을 한눈에 보도록 더 낮게, 세부를 보도록 더 높게 잡는다. */
export const MERMAID_VIEWER_ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
export const ZOOM_EPS = 0.001;

/** mermaid SVG 문자열에서 자연 크기(viewBox 의 너비·높이)를 읽는다. 없으면 null. */
export function naturalSizeOf(svg: string): { w: number; h: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  const vb = tag && /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*["']/.exec(tag);
  if (!vb) return null;
  const w = Number(vb[3]);
  const h = Number(vb[4]);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** 맞춤 배율 — 자연 크기(1)로 두되 본문 폭(frameW, 0 이면 모름)을 넘을 때만 폭에 맞춰 줄인다. 1 보다 커지지 않는다. */
export function fitScaleOf(nat: { w: number; h: number }, frameW: number): number {
  const k = frameW > 0 ? Math.min(1, frameW / nat.w) : 1;
  return Math.max(0.05, Math.floor(k * 1000) / 1000);
}

/** 크게 보기 창의 맞춤 배율 — 가로·세로가 모두 창 안에 들어오도록 줄이되 1 보다 키우지 않는다. 창 크기를 모르면(0) 자연 크기. */
export function fitBoxScaleOf(nat: { w: number; h: number }, boxW: number, boxH: number): number {
  if (boxW <= 0 || boxH <= 0) return 1;
  const k = Math.min(1, boxW / nat.w, boxH / nat.h);
  return Math.max(0.05, Math.floor(k * 1000) / 1000);
}

/** 한 단계 위·아래 배율. 현재 배율이 단계 사이에 있으면 그 방향의 가까운 단계로 간다. */
export function nextZoom(current: number, dir: 1 | -1, steps: readonly number[] = MERMAID_ZOOM_STEPS): number {
  if (dir > 0) return steps.find((z) => z > current + ZOOM_EPS) ?? steps[steps.length - 1];
  return [...steps].reverse().find((z) => z < current - ZOOM_EPS) ?? steps[0];
}

/**
 * 같은 도식을 한 문서에 두 번 넣어도 id 가 겹치지 않게, svg 뿌리 id(mermaid 가 렌더마다 유일하게 붙인다)로 시작하는
 * 모든 이름(요소 id·marker·CSS 선택자·url(#…)·href)을 suffix 를 붙인 이름으로 바꾼다. 뿌리 id 가 없으면 그대로 돌려준다.
 */
export function retargetSvgIds(svg: string, suffix: string): string {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  const rootId = tag && /\sid\s*=\s*["']([^"']+)["']/.exec(tag)?.[1];
  if (!rootId) return svg;
  const esc = rootId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 뒤에 영숫자가 이어지면(예: mmd-1 과 mmd-10) 다른 이름이므로 건드리지 않는다. 이름 뒤에 "_"·"-"·구분자는 허용.
  return svg.replace(new RegExp(`${esc}(?![A-Za-z0-9])`, "g"), `${rootId}${suffix}`);
}
