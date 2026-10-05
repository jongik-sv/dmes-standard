"use client";

/**
 * mermaid 도식 그리기 — 코드(```mermaid 안의 글)를 SVG 도식으로 그린다. MarkdownDocViewer 가 도식이 있는 절에서만 쓴다.
 * mermaid 는 동적 import 라 도식이 있는 문서를 열 때에만 내려받는다(첫 화면 번들에 넣지 않는다).
 * securityLevel "strict" 로 그리므로 결과 SVG 는 mermaid 가 정화한 것이다. 그리는 중·실패 때는 원래 코드를 <pre><code> 로 보인다.
 */
import { useEffect, useId, useState } from "react";

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
    return (
      <div
        role="img"
        aria-label="mermaid 도식"
        data-testid={testId}
        data-state="done"
        style={{ overflowX: "auto", margin: "8px 0" }}
        dangerouslySetInnerHTML={{ __html: draw.svg }}
      />
    );
  }
  return (
    <pre
      data-testid={testId}
      data-state={draw.status}
      aria-busy={draw.status === "loading" ? true : undefined}
      style={{
        overflowX: "auto",
        margin: "8px 0",
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
