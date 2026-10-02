"use client";

/**
 * 글(md) 렌더러 — shared MarkdownView 로 그린다(스펙 §6).
 * MarkdownView 는 마크다운을 React 요소로 그리고 HTML 문자열을 넣지 않는다(글 속 태그는 글자 그대로, 링크는 http(s) 만).
 * 그래서 따로 정화하지 않아도 스크립트가 돌지 않는다.
 */
import { MarkdownView } from "@dk-oasis/shared/markdown-editor";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { readMarkdownConfig } from "../_content/config";
import { ContentStyle } from "../_content/styles";

export default function MarkdownRenderer({ definition }: WidgetProps) {
  const { markdown } = readMarkdownConfig(definition);
  if (!markdown.trim()) {
    return (
      <>
        <ContentStyle />
        <div className="mcm-wt-state">내용이 없습니다</div>
      </>
    );
  }
  return <MarkdownView value={markdown} testId="widget-markdown" />;
}
