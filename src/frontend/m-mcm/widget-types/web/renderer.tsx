"use client";

/**
 * 웹 주소 렌더러(스펙 §6).
 * - 그리기 전에 checkWebUrl 로 다시 검사한다 — DB 값이 포털과 같은 출처면 allow-same-origin iframe 이 포털 권한을 얻으므로
 *   iframe 대신 안내만 보인다(Review Focus 4).
 * - 제목 줄 [새 탭으로 열기](opener 없이) + 본문 아래 늘 안내(사이트가 X-Frame-Options·CSP 로 막으면 빈 화면이 된다).
 */
import { Button } from "@dk-oasis/shared/form";
import { WidgetHeaderActions, type WidgetProps } from "@dk-oasis/shared/widget";

import { readWebConfig } from "../_content/config";
import { openInNewTab, usePortalOrigin } from "../_content/hooks";
import { ContentStyle } from "../_content/styles";
import { WEB_HINT, checkWebUrl, webFrameProps } from "../_content/web";

export default function WebRenderer({ definition }: WidgetProps) {
  const { url } = readWebConfig(definition);
  const portalOrigin = usePortalOrigin();

  // 서버 렌더(출처를 아직 모름)에서는 아무것도 띄우지 않는다.
  if (portalOrigin === null) return <ContentStyle />;

  const check = checkWebUrl(url, portalOrigin);
  if (!check.ok) {
    return (
      <>
        <ContentStyle />
        <div className="mcm-wt-state mcm-wt-state--error" role="alert">
          {check.message}
        </div>
      </>
    );
  }

  return (
    <div className="mcm-wt-web" data-testid="widget-web">
      <ContentStyle />
      <WidgetHeaderActions>
        <Button size="mini" onClick={() => openInNewTab(check.url)}>
          새 탭으로 열기
        </Button>
      </WidgetHeaderActions>
      <iframe {...webFrameProps(check.url)} title="웹 주소 위젯" className="mcm-wt-frame" />
      <div className="mcm-wt-web__hint">{WEB_HINT}</div>
    </div>
  );
}
