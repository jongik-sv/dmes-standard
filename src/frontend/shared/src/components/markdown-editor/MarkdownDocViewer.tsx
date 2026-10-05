"use client";

/**
 * 목차가 있는 마크다운 문서 보기 — 왼쪽 목차(##·###)와 오른쪽 본문. 목차를 누르면 그 절로 이동하고, 본문을 내리면 목차의 현재 절이 따라 바뀐다.
 * 본문은 MarkdownView(읽기 전용)로 절마다 그린다. 모달·서랍 안에 넣어 쓰도록 높이를 부모에서 받는다(height:100%).
 * 마크다운 표는 MarkdownView 가 그리지 않으므로 문서에 쓰지 않는다. ```mermaid 코드 블록은 도식(MermaidDiagram)으로 그린다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { splitMarkdownSections, tocOf } from "./doc-sections";
import { splitMermaidBlocks } from "./mermaid-blocks";
import { MarkdownView } from "./MarkdownView";
import { MermaidDiagram } from "./MermaidDiagram";

export interface MarkdownDocViewerProps {
  /** 문서 원문(마크다운). */
  markdown: string;
  /** 뿌리 data-testid(기본 "md-doc-viewer"). */
  testId?: string;
  /** 목차 폭(px, 기본 220). */
  tocWidth?: number;
  /** 문서 제목(#) 절을 그리지 않는다 — 모달 제목처럼 제목을 다른 곳에 이미 보일 때(기본 false). */
  skipTitle?: boolean;
  /** 본문·목차 영역의 접근 이름(기본 "문서"). */
  ariaLabel?: string;
}

/**
 * 문서 읽기용 간격 — 이 부품 범위(.cm-doc-body)에서만 MarkdownView 의 촘촘한 기본 간격을 넓힌다(다른 부품 공용 스타일은 그대로).
 * 절 사이 여백은 절(section) 위 padding 으로 준다: 절마다 MarkdownView 가 따로라 첫 요소 위 여백이 0 으로 접히기 때문이다.
 */
const DOC_STYLE = `
.cm-doc-body { line-height: 1.7; }
.cm-doc-body-inner { max-width: 820px; }
.cm-doc-body .cm-md-view { line-height: 1.7; }
.cm-doc-body section[data-level="2"] { padding-top: 30px; }
.cm-doc-body section[data-level="3"] { padding-top: 18px; }
.cm-doc-body section[data-first="true"] { padding-top: 0; }
.cm-doc-body .cm-md-view h2 { margin: 0 0 12px; padding-bottom: 6px; font-size: 1.25rem; font-weight: 700; line-height: 1.4; border-bottom: 1px solid var(--color-border); }
.cm-doc-body .cm-md-view h3 { margin: 0 0 8px; font-size: 1.05rem; font-weight: 700; line-height: 1.4; }
.cm-doc-body .cm-md-view p + p { margin-top: 10px; }
.cm-doc-body .cm-md-view > p + ul, .cm-doc-body .cm-md-view > p + ol, .cm-doc-body .cm-md-view > ul + p, .cm-doc-body .cm-md-view > ol + p { margin-top: 10px; }
.cm-doc-body .cm-md-view ul, .cm-doc-body .cm-md-view ol { margin: 10px 0; }
.cm-doc-body .cm-md-view li + li { margin-top: 5px; }
.cm-doc-body .cm-md-view pre { margin: 12px 0; }
`;

/** 목차를 눌러 부드럽게 이동하는 동안 스크롤 이벤트가 현재 절을 되돌리지 않게 막는 시간(ms). */
const JUMP_LOCK_MS = 700;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MarkdownDocViewer({
  markdown,
  testId = "md-doc-viewer",
  tocWidth = 220,
  skipTitle = false,
  ariaLabel = "문서",
}: MarkdownDocViewerProps) {
  const sections = useMemo(
    () =>
      splitMarkdownSections(markdown)
        .filter((s) => !(skipTitle && s.level === 1))
        .map((s) => ({ ...s, pieces: splitMermaidBlocks(s.markdown) })),
    [markdown, skipTitle]
  );
  const toc = useMemo(() => tocOf(sections), [sections]);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const tocRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const jumpLockUntil = useRef(0);
  const [activeId, setActiveId] = useState<string | null>(toc[0]?.id ?? null);

  const goTo = useCallback((id: string) => {
    const body = bodyRef.current;
    const el = sectionRefs.current[id];
    if (!body || !el) return;
    jumpLockUntil.current = Date.now() + JUMP_LOCK_MS;
    setActiveId(id);
    // 본문이 position:relative 라 절의 offsetTop 은 본문 기준이다.
    body.scrollTo({ top: el.offsetTop, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    // 키보드 사용자가 이어서 읽을 수 있게 초점을 그 절로 옮긴다(스크롤은 위에서 이미 했다).
    el.focus({ preventScroll: true });
  }, []);

  // 본문을 내릴 때 현재 절을 목차에 표시 — 위 가장자리를 지난 마지막 목차 절. 바닥에 닿으면 마지막 절(짧아서 위로 못 오르는 절).
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onScroll = () => {
      if (Date.now() < jumpLockUntil.current) return;
      const top = body.scrollTop + 12;
      let found: string | null = toc[0]?.id ?? null;
      for (const s of toc) {
        const el = sectionRefs.current[s.id];
        if (el && el.offsetTop <= top) found = s.id;
      }
      if (toc.length > 0 && body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) {
        found = toc[toc.length - 1].id;
      }
      setActiveId(found);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => body.removeEventListener("scroll", onScroll);
  }, [toc]);

  // 현재 절 항목이 목차 영역 밖으로 사라지지 않게 보이는 자리로 올린다.
  useEffect(() => {
    if (!activeId) return;
    const btn = tocRef.current?.querySelector<HTMLElement>(`[data-toc-id="${activeId}"]`);
    if (btn && typeof btn.scrollIntoView === "function") btn.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return (
    <div
      data-testid={testId}
      style={{ display: "flex", height: "100%", minHeight: 0, border: "1px solid var(--color-border)" }}
    >
      <nav
        ref={tocRef}
        aria-label={`${ariaLabel} 목차`}
        data-testid={`${testId}-toc`}
        style={{
          flex: `0 0 ${tocWidth}px`,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "8px 0",
          borderRight: "1px solid var(--color-border)",
          background: "var(--color-bg-light)",
        }}
      >
        {toc.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              data-toc-id={s.id}
              data-testid={`${testId}-toc-${s.id}`}
              aria-current={active ? "location" : undefined}
              onClick={() => goTo(s.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: s.level === 3 ? "4px 12px 4px 28px" : "6px 12px",
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                fontSize: s.level === 3 ? "var(--font-size-sm)" : "var(--font-size-md)",
                fontWeight: s.level === 2 || active ? 600 : 400,
                lineHeight: 1.45,
                border: 0,
                background: active ? "var(--color-primary-soft)" : "transparent",
                color: active ? "var(--color-primary)" : "inherit",
                cursor: "pointer",
              }}
            >
              {s.title}
            </button>
          );
        })}
      </nav>
      <div
        ref={bodyRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        data-testid={`${testId}-body`}
        className="cm-doc-body"
        style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "16px 28px 32px", position: "relative" }}
      >
        <style>{DOC_STYLE}</style>
        <div className="cm-doc-body-inner">
        {sections.map((s, idx) => (
          <section
            key={s.id}
            id={s.id}
            data-level={s.level}
            data-first={idx === 0 ? "true" : undefined}
            tabIndex={-1}
            style={{ outline: "none" }}
            ref={(el) => {
              sectionRefs.current[s.id] = el;
            }}
          >
            {s.pieces.length === 1 && s.pieces[0].kind === "md" ? (
              <MarkdownView value={s.markdown} testId={`${testId}-${s.id}`} />
            ) : (
              s.pieces.map((p, i) =>
                p.kind === "mermaid" ? (
                  <MermaidDiagram key={i} code={p.code} testId={`${testId}-${s.id}-mermaid-${i}`} />
                ) : (
                  <MarkdownView key={i} value={p.text} testId={`${testId}-${s.id}-p${i}`} />
                )
              )
            )}
          </section>
        ))}
        </div>
      </div>
    </div>
  );
}
