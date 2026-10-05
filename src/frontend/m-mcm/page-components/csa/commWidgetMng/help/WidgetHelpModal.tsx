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
      <div style={{ height: "calc(100vh - 200px)", minHeight: 320 }} data-testid="widget-help-body">
        <MarkdownDocViewer markdown={WIDGET_GUIDE_MARKDOWN} testId="widget-help-doc" />
      </div>
    </Modal>
  );
}
