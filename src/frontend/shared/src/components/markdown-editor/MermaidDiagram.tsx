"use client";

/**
 * mermaid 도식 그리기 — 코드(```mermaid 안의 글)를 SVG 도식으로 그린다. MarkdownDocViewer 가 도식이 있는 절에서만 쓴다.
 * mermaid 는 동적 import 라 도식이 있는 문서를 열 때에만 내려받는다(첫 화면 번들에 넣지 않는다).
 * securityLevel "strict" 로 그리므로 결과 SVG 는 mermaid 가 정화한 것이다. 그리는 중·실패 때는 원래 코드를 <pre><code> 로 보인다.
 * 크기: 기본(맞춤)은 자연 크기(100%)이고 본문 폭을 넘을 때만 폭에 맞춰 줄인다(작은 도식은 키우지 않고, 높이에 맞춰 줄이지도 않는다).
 * 세로로 긴 도식은 틀(최대 높이 480px·60vh 중 작은 값) 안에서 세로로 스크롤한다. 글자 크기는 모든 도식이 같도록 mermaid 글자를 본문 크기(14px)에 맞춘다.
 * 도식마다 [−] [배율] [+] [맞춤] 도구 막대로 25~200% 로 조절한다. 배율 표시는 실제 적용 배율과 같다.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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

/** 도식 글자 크기 — 본문 글자(약 14px)에 맞춰, 도식마다 글자가 같아 보이게 한다. */
const DIAGRAM_FONT_SIZE = "14px";

/** 폭에 맞춰 늘어나는 동작(svg width="100%"·max-width)을 끈다 — 크기는 이 부품이 자연 크기 기준으로 정한다. */
const NO_MAX_WIDTH = { useMaxWidth: false };

function mermaidConfig(scheme: Scheme) {
  const base = {
    startOnLoad: false,
    securityLevel: "strict" as const,
    suppressErrorRendering: true,
    flowchart: NO_MAX_WIDTH,
    sequence: NO_MAX_WIDTH,
    class: NO_MAX_WIDTH,
    state: NO_MAX_WIDTH,
    er: NO_MAX_WIDTH,
    gantt: NO_MAX_WIDTH,
    journey: NO_MAX_WIDTH,
    pie: NO_MAX_WIDTH,
    mindmap: NO_MAX_WIDTH,
    timeline: NO_MAX_WIDTH,
  };
  if (scheme === "dark") return { ...base, theme: "dark" as const, themeVariables: { fontSize: DIAGRAM_FONT_SIZE } };
  const primary = cssColor("--color-primary", "#0b62d6");
  const border = cssColor("--color-border", "#cbd5e1");
  const bg = cssColor("--color-bg-light", "#f8fafc");
  return {
    ...base,
    theme: "base" as const,
    themeVariables: {
      fontSize: DIAGRAM_FONT_SIZE,
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

/** 도식 틀의 최대 높이(CSS). 이보다 긴 도식은 틀 안에서 세로로 스크롤한다. */
const FRAME_MAX_HEIGHT_CSS = "min(480px, 60vh)";
/** 단추로 고르는 배율 단계. */
export const MERMAID_ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
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
.md-mermaid-frame{box-sizing:border-box;width:100%;min-width:0;overflow:auto;scrollbar-gutter:stable;border:1px solid var(--color-border)}
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

/** 맞춤 배율 — 자연 크기(1)로 두되 본문 폭(frameW, 0 이면 모름)을 넘을 때만 폭에 맞춰 줄인다. 1 보다 커지지 않는다. */
export function fitScaleOf(nat: { w: number; h: number }, frameW: number): number {
  const k = frameW > 0 ? Math.min(1, frameW / nat.w) : 1;
  return Math.max(0.05, Math.floor(k * 1000) / 1000);
}

export function nextZoom(current: number, dir: 1 | -1): number {
  if (dir > 0) return MERMAID_ZOOM_STEPS.find((z) => z > current + EPS) ?? MERMAID_ZOOM_STEPS[MERMAID_ZOOM_STEPS.length - 1];
  return [...MERMAID_ZOOM_STEPS].reverse().find((z) => z < current - EPS) ?? MERMAID_ZOOM_STEPS[0];
}

/** 그려진 도식 — 자연 크기를 기준으로 맞춤 배율과 사용자가 고른 배율을 적용한다. */
function DiagramView({ svg, code, testId }: { svg: string; code: string; testId: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const nat = naturalSizeOf(svg);
  const natW = nat?.w;
  const natH = nat?.h;
  const [zoom, setZoom] = useState<number | null>(null); // null = 맞춤
  const [frameW, setFrameW] = useState(0);

  // 다른 도식(코드)이 오면 맞춤으로 돌아간다.
  useEffect(() => setZoom(null), [code]);

  const measure = useCallback(() => {
    // 안쪽 폭 = 실제 폭 − (테두리·스크롤바 자리). clientWidth 는 정수로 반올림되어 틀을 넘칠 수 있어 실제 폭에서 내린다.
    const el = frameRef.current;
    const rect = el?.getBoundingClientRect().width ?? 0;
    const w = el && rect > 0 ? Math.max(0, Math.floor(rect - (el.offsetWidth - el.clientWidth))) : 0;
    setFrameW((prev) => (prev === w ? prev : w));
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

  const fit = natW && natH ? fitScaleOf({ w: natW, h: natH }, frameW) : 1;
  const scale = zoom ?? fit;

  // mermaid 가 넣은 width="100%"·max-width 를 걷고 자연 크기에 배율을 곱한 픽셀 크기로 둔다.
  // 매 렌더 뒤에 적용한다 — 부모가 다시 그리면서 svg 를 새로 넣어도(innerHTML 재설정) 크기가 풀리지 않게.
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
  });

  const html = useMemo(() => ({ __html: svg }), [svg]); // 같은 svg 면 같은 객체 — React 가 innerHTML 을 다시 쓰지 않게
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
        dangerouslySetInnerHTML={html}
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
