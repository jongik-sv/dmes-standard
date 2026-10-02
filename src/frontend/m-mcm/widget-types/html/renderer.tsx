"use client";

/**
 * html 렌더러(스펙 §6, W-D25).
 * - allowScript=false: shared NoticeBodyView(HTML) — DOMPurify 로 script·style·iframe·form 계열 태그와 on* 속성,
 *   인라인 style, http(s) 가 아닌 주소를 지우고 포털 안에 그린다. 서버 렌더에서는 비워 두고 마운트 뒤 채운다.
 * - allowScript=true: 격리 iframe(htmlFrameProps — sandbox="allow-scripts" 만, allow-same-origin 없음)이 칸을 채운다.
 */
import { NoticeBodyView } from "@dk-oasis/shared/notice-body-view";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { readHtmlConfig } from "../_content/config";
import { htmlFrameProps } from "../_content/html-frame";
import { ContentStyle } from "../_content/styles";

export default function HtmlRenderer({ definition }: WidgetProps) {
  const { html, allowScript } = readHtmlConfig(definition);
  if (!html.trim()) {
    return (
      <>
        <ContentStyle />
        <div className="mcm-wt-state">내용이 없습니다</div>
      </>
    );
  }
  if (allowScript) {
    return (
      <>
        <ContentStyle />
        <iframe {...htmlFrameProps(html)} title="html 위젯" className="mcm-wt-frame" data-testid="widget-html-frame" />
      </>
    );
  }
  return <NoticeBodyView value={html} format="HTML" testId="widget-html" />;
}
