"use client";

/**
 * 링크 모음 렌더러(스펙 §6) — 항목마다 버튼 하나. 화면(page)은 openPortalPage 로 포털 탭을, 웹(url)은 새 탭(opener 없이)을 연다.
 * 열 수 없는 항목(빈 화면·http(s) 아닌 주소)은 버튼을 막는다.
 */
import { IconExternalLink } from "@tabler/icons-react";
import { Button } from "@dk-oasis/shared/form";
import { openPortalPage, type WidgetProps } from "@dk-oasis/shared/widget";

import { readLinksConfig } from "../_content/config";
import { openInNewTab } from "../_content/hooks";
import { linkTarget, type LinkTarget } from "../_content/links";
import { ContentStyle } from "../_content/styles";

function open(target: LinkTarget): void {
  if (target.kind === "page") openPortalPage(target.pageId);
  else openInNewTab(target.url);
}

export default function LinksRenderer({ definition }: WidgetProps) {
  const { items } = readLinksConfig(definition);
  if (items.length === 0) {
    return (
      <>
        <ContentStyle />
        <div className="mcm-wt-state">링크가 없습니다</div>
      </>
    );
  }
  return (
    <>
      <ContentStyle />
      <ul className="mcm-wt-links" data-testid="widget-links">
        {items.map((item, i) => {
          const target = linkTarget(item);
          return (
            <li key={i}>
              <Button
                className="mcm-wt-links__btn"
                disabled={!target}
                onClick={() => target && open(target)}
                title={target?.kind === "url" ? `${target.url} (새 탭)` : undefined}
              >
                {item.label || "(이름 없음)"}
                {item.kind === "url" && (
                  <IconExternalLink size={14} className="mcm-wt-links__icon" aria-hidden="true" />
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
