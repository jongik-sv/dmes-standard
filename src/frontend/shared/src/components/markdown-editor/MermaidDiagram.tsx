"use client";

/**
 * mermaid 도식 그리기 — 코드(```mermaid 안의 글)를 SVG 도식으로 그린다. MarkdownDocViewer 가 도식이 있는 절에서만 쓴다.
 * mermaid 는 동적 import 라 도식이 있는 문서를 열 때에만 내려받는다(첫 화면 번들에 넣지 않는다).
 * securityLevel "strict" 로 그리므로 결과 SVG 는 mermaid 가 정화한 것이다. 그리는 중·실패 때는 원래 코드를 <pre><code> 로 보인다.
 * 크기: 기본은 자연 크기이고, 본문 폭이나 최대 높이(480px·60vh 중 작은 값)를 넘으면 비율을 지켜 줄여 맞춘다(작은 도식은 키우지 않는다).
 * 도식마다 [−] [배율] [+] [맞춤] 도구 막대로 50~200% 로 조절하고, 틀보다 커지면 틀 안에서 가로·세로로 스크롤한다.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { IconMinus, IconPlus, IconZoomReset } from "@tabler/icons-react";

export interface MermaidDiagramProps {
  /** mermaid 코드(펜스 안쪽 글). */
  code: string;
  /** 뿌리 data-testid(기본 "md-mermaid"). */
  testId?: string;
}

type Scheme = "light" | "dark";
type DrawState = { status: "loading" } | { status: "error" } | { status: "done"; svg: string };

/** 앱의 밝은·어두운 모드 — Mantine 이 <html> 에 남기는 data-mantine-color-scheme 을 따른다. */
function readScheme(): Scheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-mantine-color-scheme") === "dark" ? "dark" : "light";
}

function useColorScheme(): Scheme {
  const [scheme, setScheme] = useState<Scheme>(readScheme);
  useEffect(() => {
    setScheme(readScheme());
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(() => setScheme(readScheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mantine-color-scheme"] });
    return () => mo.disconnect();
  }, []);
  return scheme;
}

const COLOR_LIKE = /^(#[0-9a-f]{3,8}|rgba?\(.+\)|hsla?\(.+\))$/i;

/** shared 의 CSS 변수 값을 읽는다(mermaid 는 var() 를 못 풀므로 실제 색 값이어야 한다). 색이 아니면 기본값. */
function cssColor(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return COLOR_LIKE.test(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function mermaidConfig(scheme: Scheme) {
  const base = { startOnLoad: false, securityLevel: "strict" as const, suppressErrorRendering: true };
  if (scheme === "dark") return { ...base, theme: "dark" as const };
  const primary = cssColor("--color-primary", "#0b62d6");
  const border = cssColor("--color-border", "#cbd5e1");
  const bg = cssColor("--color-bg-light", "#f8fafc");
  return {
    ...base,
    theme: "base" as const,
    themeVariables: {
      primaryColor: bg,
      primaryBorderColor: primary,
      primaryTextColor: cssColor("--color-text", "#0f172a"),
      lineColor: primary,
      secondaryColor: bg,
      tertiaryColor: "#ffffff",
      clusterBkg: bg,
      clusterBorder: border,
    },
  };
}

let seq = 0;

/** 도식 틀의 최대 높이(CSS). 자바스크립트 계산(maxFrameHeight)과 같은 값이어야 한다. */
const FRAME_MAX_HEIGHT_CSS = "min(480px, 60vh)";
const FRAME_MAX_HEIGHT_PX = 480;
const FRAME_MAX_HEIGHT_VH = 0.6;
/** 단추로 고르는 배율 단계. */
export const MERMAID_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const EPS = 0.001;

/** 도구 막대 표시·인쇄 규칙. 단추는 마우스를 올리거나 초점이 있을 때 또렷해진다(터치 기기에서도 흐리게나마 늘 보인다). */
const MERMAID_CSS = `
.md-mermaid{margin:16px 0}
.md-mermaid-toolbar{display:flex;justify-content:flex-end;align-items:center;gap:4px;margin-bottom:4px;opacity:.65;transition:opacity .15s}
.md-mermaid:hover .md-mermaid-toolbar,.md-mermaid:focus-within .md-mermaid-toolbar{opacity:1}
.md-mermaid-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:1px solid var(--color-border);border-radius:4px;background:var(--color-bg-light);color:var(--color-text);cursor:pointer}
.md-mermaid-btn:hover:not([aria-disabled="true"]){border-color:var(--color-primary)}
.md-mermaid-btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
.md-mermaid-btn[aria-disabled="true"]{opacity:.4;cursor:default}
.md-mermaid-scale{min-width:44px;text-align:center;font-size:var(--font-size-sm);color:var(--color-text);font-variant-numeric:tabular-nums}
.md-mermaid-frame{box-sizing:border-box;overflow:auto;border:1px solid var(--color-border)}
.md-mermaid-frame:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
@media print{
.md-mermaid-toolbar{display:none}
.md-mermaid-frame{max-height:none!important;overflow:visible!important;border:0}
.md-mermaid-frame svg{max-width:100%!important;height:auto!important}
}
`;

/** mermaid SVG 문자열에서 자연 크기(viewBox 의 너비·높이)를 읽는다. 없으면 null. */
export function naturalSizeOf(svg: string): { w: number; h: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  const vb = tag && /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*["']/.exec(tag);
  if (!vb) return null;
  const w = Number(vb[3]);
  const h = Number(vb[4]);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** 본문 폭(frameW, 0 이면 모름)과 최대 높이 안에 비율을 지켜 들어가는 배율. 1(자연 크기) 보다 커지지 않는다. */
export function fitScaleOf(nat: { w: number; h: number }, frameW: number, maxH: number): number {
  let k = 1;
  if (frameW > 0) k = Math.min(k, frameW / nat.w);
  if (maxH > 0) k = Math.min(k, maxH / nat.h);
  return Math.max(0.05, Math.floor(k * 1000) / 1000);
}

export function nextZoom(current: number, dir: 1 | -1): number {
  if (dir > 0) return MERMAID_ZOOM_STEPS.find((z) => z > current + EPS) ?? MERMAID_ZOOM_STEPS[MERMAID_ZOOM_STEPS.length - 1];
  return [...MERMAID_ZOOM_STEPS].reverse().find((z) => z < current - EPS) ?? MERMAID_ZOOM_STEPS[0];
}

function maxFrameHeight(): number {
  const vh = typeof window === "undefined" ? 0 : window.innerHeight * FRAME_MAX_HEIGHT_VH;
  return vh > 0 ? Math.min(FRAME_MAX_HEIGHT_PX, vh) : FRAME_MAX_HEIGHT_PX;
}

/** 그려진 도식 — 자연 크기를 기준으로 맞춤 배율과 사용자가 고른 배율을 적용한다. */
function DiagramView({ svg, code, testId }: { svg: string; code: string; testId: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const nat = naturalSizeOf(svg);
  const natW = nat?.w;
  const natH = nat?.h;
  const [zoom, setZoom] = useState<number | null>(null); // null = 맞춤
  const [limit, setLimit] = useState({ w: 0, h: maxFrameHeight() });

  // 다른 도식(코드)이 오면 맞춤으로 돌아간다.
  useEffect(() => setZoom(null), [code]);

  const measure = useCallback(() => {
    // clientWidth 는 정수로 반올림되어 틀을 넘칠 수 있으므로 실제 폭에서 테두리를 빼고 내린다.
    const rect = frameRef.current?.getBoundingClientRect().width ?? 0;
    const w = rect > 2 ? Math.floor(rect - 2) : 0;
    const h = maxFrameHeight();
    setLimit((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = frameRef.current;
    let ro: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // 최대 높이에서 틀 테두리(위·아래 2px)를 뺀 안쪽에 맞춘다.
  const fit = natW && natH ? fitScaleOf({ w: natW, h: natH }, limit.w, limit.h - 2) : 1;
  const scale = zoom ?? fit;

  // mermaid 가 넣은 width="100%"·max-width 를 걷고 자연 크기에 배율을 곱한 픽셀 크기로 둔다.
  useLayoutEffect(() => {
    const el = frameRef.current?.querySelector("svg");
    if (!el || !natW || !natH) return;
    el.style.maxWidth = "none";
    el.style.display = "block";
    el.style.margin = "0 auto";
    el.style.width = `${natW * scale}px`;
    el.style.height = `${natH * scale}px`;
    el.setAttribute("width", String(natW * scale));
    el.setAttribute("height", String(natH * scale));
  }, [svg, natW, natH, scale]);

  const pct = Math.round(scale * 100);
  const canOut = scale > MERMAID_ZOOM_STEPS[0] + EPS;
  const canIn = scale < MERMAID_ZOOM_STEPS[MERMAID_ZOOM_STEPS.length - 1] - EPS;

  return (
    <div className="md-mermaid" data-testid={testId} data-state="done" data-scale={pct}>
      <style>{MERMAID_CSS}</style>
      {nat && (
        <div className="md-mermaid-toolbar" role="toolbar" aria-label="도식 크기">
          <button
            type="button"
            className="md-mermaid-btn"
            aria-label="도식 축소"
            title="도식 축소"
            aria-disabled={!canOut}
            onClick={() => canOut && setZoom(nextZoom(scale, -1))}
          >
            <IconMinus size={14} aria-hidden="true" focusable="false" />
          </button>
          <span className="md-mermaid-scale" aria-live="polite" data-testid={`${testId}-scale`}>
            {pct}%
          </span>
          <button
            type="button"
            className="md-mermaid-btn"
            aria-label="도식 확대"
            title="도식 확대"
            aria-disabled={!canIn}
            onClick={() => canIn && setZoom(nextZoom(scale, 1))}
          >
            <IconPlus size={14} aria-hidden="true" focusable="false" />
          </button>
          <button
            type="button"
            className="md-mermaid-btn"
            aria-label="도식 크기 맞춤"
            title="도식 크기 맞춤"
            onClick={() => setZoom(null)}
          >
            <IconZoomReset size={14} aria-hidden="true" focusable="false" />
          </button>
        </div>
      )}
      <div
        ref={frameRef}
        className="md-mermaid-frame"
        role="img"
        aria-label="mermaid 도식"
        tabIndex={0}
        style={{ maxHeight: FRAME_MAX_HEIGHT_CSS }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

export function MermaidDiagram({ code, testId = "md-mermaid" }: MermaidDiagramProps) {
  const reactId = useId();
  const scheme = useColorScheme();
  const [draw, setDraw] = useState<DrawState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setDraw({ status: "loading" });
    // mermaid 가 임시 요소 id 로 쓰므로 영문자로 시작하고 렌더마다 달라야 한다.
    const id = `mmd-${reactId.replace(/[^a-zA-Z0-9]/g, "")}-${++seq}`;
    (async () => {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize(mermaidConfig(scheme));
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) setDraw({ status: "done", svg });
      } catch {
        // 구문 오류·불러오기 실패 — mermaid 가 body 에 남긴 임시 요소를 치우고 원래 코드를 보인다.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setDraw({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, scheme, reactId]);

  if (draw.status === "done") {
    return <DiagramView svg={draw.svg} code={code} testId={testId} />;
  }
  return (
    <pre
      data-testid={testId}
      data-state={draw.status}
      aria-busy={draw.status === "loading" ? true : undefined}
      style={{
        overflowX: "auto",
        margin: "16px 0",
        padding: "8px 12px",
        fontSize: "var(--font-size-sm)",
        border: "1px solid var(--color-border)",
        background: "var(--color-bg-light)",
      }}
    >
      <code>{code}</code>
    </pre>
  );
}
