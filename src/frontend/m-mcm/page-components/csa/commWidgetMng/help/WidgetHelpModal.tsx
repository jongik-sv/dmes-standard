"use client";

/**
 * 위젯 관리 「도움말」 — 「위젯 만드는 여러 가지 방법」 문서를 모달로 보여 준다.
 * 원문은 docs/guide/FrontEnd/Widget-Authoring-Guide.md 이고 widget-guide-content.ts 는 scripts/gen-widget-guide.mjs 가 만든 사본이다.
 * 모달 틀(크기·탭 줄·본문 높이)은 lib/help/GuideHelpModal 이, 문서 렌더·목차는 shared MarkdownDocViewer 가 맡는다.
 */
import { GuideHelpModal, type GuideHelpDoc } from "@/lib/help/GuideHelpModal";

import { WIDGET_SCREEN_LINK_GUIDE_MARKDOWN } from "../../../../widget-types/rule-calc/help-content";
import { WIDGET_GUIDE_MARKDOWN } from "./widget-guide-content";

/** 모달이 보이는 문서 — 만드는 방법(Widget-Authoring-Guide) 또는 업무 화면 값 연결 안내(Widget-Screen-Link-Guide). */
const DOCS: readonly GuideHelpDoc[] = [
  { key: "make", tab: "만드는 방법", title: "위젯 만드는 여러 가지 방법", ariaLabel: "위젯 만드는 방법", markdown: WIDGET_GUIDE_MARKDOWN, testId: "widget-help-doc" },
  { key: "link", tab: "업무 화면 값 연결", title: "업무 화면과 위젯 값 연결 안내", ariaLabel: "업무 화면과 위젯 값 연결 안내", markdown: WIDGET_SCREEN_LINK_GUIDE_MARKDOWN, testId: "widget-help-link-doc" },
];

export interface WidgetHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function WidgetHelpModal({ open, onClose }: WidgetHelpModalProps) {
  return <GuideHelpModal open={open} onClose={onClose} docs={DOCS} className="cm-widget-help-modal" testIdPrefix="widget-help" />;
}
