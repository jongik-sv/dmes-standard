"use client";

/**
 * 목차가 있는 마크다운 문서 보기 — 왼쪽 목차(##·###)와 오른쪽 본문. 목차를 누르면 그 절로 이동하고, 본문을 내리면 목차의 현재 절이 따라 바뀐다.
 * 본문은 MarkdownView(읽기 전용)로 절마다 그린다. 모달·서랍 안에 넣어 쓰도록 높이를 부모에서 받는다(height:100%).
 * 마크다운 표는 MarkdownView 가 그리지 않으므로 문서에 쓰지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { splitMarkdownSections, tocOf } from "./doc-sections";
import { MarkdownView } from "./MarkdownView";

export interface MarkdownDocViewerProps {
  /** 문서 원문(마크다운). */
  markdown: string;
  /** 뿌리 data-testid(기본 "md-doc-viewer"). */
  testId?: string;
  /** 목차 폭(px, 기본 220). */
  tocWidth?: number;
}

export function MarkdownDocViewer({ markdown, testId = "md-doc-viewer", tocWidth = 220 }: MarkdownDocViewerProps) {
  const sections = useMemo(() => splitMarkdownSections(markdown), [markdown]);
  const toc = useMemo(() => tocOf(sections), [sections]);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeId, setActiveId] = useState<string | null>(toc[0]?.id ?? null);

  const goTo = useCallback((id: string) => {
    const body = bodyRef.current;
    const el = sectionRefs.current[id];
    if (!body || !el) return;
    // 본문이 position:relative 라 절의 offsetTop 은 본문 기준이다.
    body.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    setActiveId(id);
  }, []);

  // 본문을 내릴 때 현재 절을 목차에 표시 — 위 가장자리를 지난 마지막 목차 절.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onScroll = () => {
      const top = body.scrollTop + 12;
      let found: string | null = toc[0]?.id ?? null;
      for (const s of toc) {
        const el = sectionRefs.current[s.id];
        if (el && el.offsetTop <= top) found = s.id;
      }
      setActiveId(found);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => body.removeEventListener("scroll", onScroll);
  }, [toc]);

  return (
    <div
      data-testid={testId}
      style={{ display: "flex", height: "100%", minHeight: 0, border: "1px solid var(--mantine-color-default-border)" }}
    >
      <nav
        aria-label="문서 목차"
        data-testid={`${testId}-toc`}
        style={{
          flex: `0 0 ${tocWidth}px`,
          overflowY: "auto",
          padding: "8px 0",
          borderRight: "1px solid var(--mantine-color-default-border)",
          background: "var(--mantine-color-gray-0)",
        }}
      >
        {toc.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              data-testid={`${testId}-toc-${s.id}`}
              aria-current={active ? "true" : undefined}
              onClick={() => goTo(s.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: s.level === 3 ? "3px 12px 3px 26px" : "5px 12px",
                fontSize: s.level === 3 ? 12 : 13,
                fontWeight: s.level === 2 ? 600 : 400,
                lineHeight: 1.4,
                border: 0,
                borderLeft: `3px solid ${active ? "var(--mantine-color-blue-6)" : "transparent"}`,
                background: active ? "var(--mantine-color-blue-light)" : "transparent",
                color: "inherit",
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
        data-testid={`${testId}-body`}
        style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "8px 20px 24px", position: "relative" }}
      >
        {sections.map((s) => (
          <section
            key={s.id}
            id={s.id}
            ref={(el) => {
              sectionRefs.current[s.id] = el;
            }}
          >
            <MarkdownView value={s.markdown} testId={`${testId}-${s.id}`} />
          </section>
        ))}
      </div>
    </div>
  );
}
