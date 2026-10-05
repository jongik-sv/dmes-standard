"use client";

/**
 * 위젯 관리 「도움말」 — 「위젯 만드는 여러 가지 방법」 문서를 모달로 보여 준다.
 * 원문은 docs/guide/FrontEnd/Widget-Authoring-Guide.md 이고 widget-guide-content.ts 는 scripts/gen-widget-guide.mjs 가 만든 사본이다.
 * 문서 렌더·목차는 shared MarkdownDocViewer 가 맡는다.
 */
import { Modal } from "@dk-oasis/shared/modal";
import { MarkdownDocViewer } from "@dk-oasis/shared/markdown-editor";

import { WIDGET_GUIDE_MARKDOWN } from "./widget-guide-content";

export interface WidgetHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function WidgetHelpModal({ open, onClose }: WidgetHelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="위젯 만드는 여러 가지 방법" size="xl">
      {/* 모달 최대 높이(90dvh)에서 머리·본문 여백(약 125px)을 뺀 높이 — 뷰포트가 커도 모달 안에서 이중 스크롤이 생기지 않는다. */}
      <div style={{ height: "calc(90dvh - 140px)", minHeight: 320 }} data-testid="widget-help-body">
        <MarkdownDocViewer markdown={WIDGET_GUIDE_MARKDOWN} testId="widget-help-doc" skipTitle ariaLabel="위젯 만드는 방법" />
      </div>
    </Modal>
  );
}
