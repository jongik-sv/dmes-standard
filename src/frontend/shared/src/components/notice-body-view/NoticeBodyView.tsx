"use client";

/**
 * 공지 본문 읽기 전용 뷰어 — TEXT·MD·HTML 세 형식을 같은 문서 서식(제목·목록·인용·코드·표·링크)으로 그린다.
 * - TEXT: React 가 글자를 이스케이프하고 줄바꿈을 보존한다(white-space: pre-wrap).
 * - MD: markdown-editor 의 MarkdownView 를 그대로 쓴다(표는 MarkdownView 가 지원하지 않아 글자로 남는다).
 * - HTML: DOMPurify 로 소독해 넣는다(sanitize.ts). 서버 렌더에서는 비워 두고 마운트 뒤에 채워 하이드레이션 불일치를 피한다.
 * 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3). 색·간격은 공통 토큰만 쓴다.
 * 표·긴 코드는 이 컴포넌트 안에서만 가로로 스크롤하고 부모 폭을 늘리지 않는다.
 */
import { useMemo, useSyncExternalStore } from "react";

import { MarkdownView } from "../markdown-editor/MarkdownView";
import { sanitizeNoticeHtml } from "./sanitize";

export type NoticeBodyFormat = "TEXT" | "MD" | "HTML";

export interface NoticeBodyViewProps {
  /** 본문 원문(형식에 따라 일반 글·마크다운·HTML). */
  value: string;
  /** 본문 형식. */
  format: NoticeBodyFormat;
  /** 뿌리에 더할 클래스. */
  className?: string;
  /** 뿌리 data-testid(기본 "notice-body-view"). */
  testId?: string;
  /** 본문이 비었을 때 보일 글(기본: 아무것도 그리지 않는 빈 뿌리). */
  emptyText?: string;
}

const STYLE_HREF = "cm-notice-body-view";

export const NOTICE_BODY_VIEW_CSS = `
.nbv { box-sizing: border-box; min-width: 0; max-width: 100%; color: var(--color-text); font-size: var(--font-size-sm); line-height: 1.5; overflow-wrap: anywhere; }
.nbv-empty { color: var(--color-text-secondary); }
.nbv-text { white-space: pre-wrap; }
.nbv .cm-md-view { overflow: visible; }
.nbv-doc > :first-child, .nbv .cm-md-view > :first-child { margin-top: 0; }
.nbv-doc > :last-child, .nbv .cm-md-view > :last-child { margin-bottom: 0; }
.nbv-doc p { margin: 0; }
.nbv-doc p + p { margin-top: 0.25em; }
.nbv-doc h1, .nbv-doc h2, .nbv-doc h3, .nbv-doc h4, .nbv-doc h5, .nbv-doc h6 { margin: 2px 0; font-weight: 700; line-height: 1.3; }
.nbv-doc h1 { font-size: var(--font-size-lg); }
.nbv-doc h2 { font-size: var(--font-size-md); }
.nbv-doc h3, .nbv-doc h4, .nbv-doc h5, .nbv-doc h6 { font-size: var(--font-size-sm); }
.nbv-doc ul, .nbv-doc ol { margin: 2px 0; padding-left: 1.4em; }
.nbv-doc ul { list-style: disc outside; }
.nbv-doc ul ul { list-style-type: circle; }
.nbv-doc ul ul ul { list-style-type: square; }
.nbv-doc ol { list-style: decimal outside; }
.nbv-doc li { display: list-item; }
.nbv-doc blockquote { margin: 2px 0; padding: 2px var(--spacing-sm); color: var(--color-text-secondary); background: var(--color-bg-light); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); }
.nbv-doc a { color: var(--color-primary); text-decoration: underline; cursor: pointer; }
.nbv-doc code { font-family: var(--font-family-mono); font-size: 0.92em; padding: 0 2px; background: var(--color-bg-light); border-radius: var(--radius-sm); }
.nbv-doc pre { margin: 2px 0; padding: 4px var(--spacing-xs); max-width: 100%; box-sizing: border-box; overflow: auto; white-space: pre; overflow-wrap: normal; background: var(--color-bg-light); border-radius: var(--radius-sm); }
.nbv-doc pre code { padding: 0; background: transparent; }
.nbv-doc hr { border: 0; border-top: 1px solid var(--color-border); margin: 4px 0; }
.nbv-doc img { max-width: 100%; height: auto; }
.nbv-doc table { display: block; max-width: 100%; overflow-x: auto; margin: 2px 0; border-collapse: collapse; overflow-wrap: normal; }
.nbv-doc th, .nbv-doc td { padding: 2px var(--spacing-xs); border: 1px solid var(--color-border); text-align: left; vertical-align: top; }
.nbv-doc th { background: var(--color-bg-light); font-weight: 600; }
`;

const noopSubscribe = () => () => {};

function NoticeBodyViewStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {NOTICE_BODY_VIEW_CSS}
    </style>
  );
}

export function NoticeBodyView({
  value,
  format,
  className,
  testId = "notice-body-view",
  emptyText,
}: NoticeBodyViewProps) {
  const rootClass = className ? `nbv ${className}` : "nbv";
  // 서버에서는 false, 브라우저(하이드레이션 포함)에서는 true — HTML 소독은 DOM 이 있어야 한다.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const text = value ?? "";
  const html = useMemo(
    () => (format === "HTML" && mounted ? (sanitizeNoticeHtml(text) ?? "") : ""),
    [format, mounted, text]
  );

  if (!text.trim()) {
    return (
      <div className={`${rootClass} nbv-empty`} data-testid={testId} data-format={format}>
        <NoticeBodyViewStyle />
        {emptyText ?? null}
      </div>
    );
  }

  return (
    <div className={rootClass} data-testid={testId} data-format={format}>
      <NoticeBodyViewStyle />
      {format === "HTML" ? (
        <div className="nbv-doc" dangerouslySetInnerHTML={{ __html: html }} />
      ) : format === "MD" ? (
        <div className="nbv-doc">
          <MarkdownView value={text} linkClassName="nbv-link" testId={`${testId}-md`} />
        </div>
      ) : (
        <div className="nbv-text">{text}</div>
      )}
    </div>
  );
}
