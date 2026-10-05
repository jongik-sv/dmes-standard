"use client";

/**
 * 위젯 관리 「도움말」 — 「위젯 만드는 여러 가지 방법」 문서를 모달로 보여 준다.
 * 원문은 docs/guide/FrontEnd/Widget-Authoring-Guide.md 이고 widget-guide-content.ts 는 scripts/gen-widget-guide.mjs 가 만든 사본이다.
 * 문서 렌더·목차는 shared MarkdownDocViewer 가 맡는다.
 */
import { Modal } from "@dk-oasis/shared/modal";
import { MarkdownDocViewer } from "@dk-oasis/shared/markdown-editor";

import { WIDGET_GUIDE_MARKDOWN } from "./widget-guide-content";

/**
 * 도움말 모달을 화면 거의 전체로 키운다: 폭 92vw(최대 1600px), 높이 92dvh.
 * 크기 변수·본문 폭은 shared 값(.cm-modal-xl 1024px, .cm-doc-body-inner 820px)보다 선택자를 한 단계 높여 덮어쓴다(shared 무변경).
 * 바깥 여백(inner)도 같은 값(4vw·4dvh)으로 줄여 모달이 바깥 칸 밖으로 넘치지 않게 한다. 본문 줄 길이는 960px 로 제한해 넓은 모달에서도 읽기 쉽게 한다.
 */
const HELP_MODAL_STYLE = `
.cm-modal.cm-widget-help-modal { --modal-size: min(92vw, 1600px); --modal-y-offset: 4dvh; min-height: 0; }
.mantine-Modal-inner:has(.cm-widget-help-modal) { --modal-inner-x-offset: 4vw; --modal-inner-y-offset: 4dvh; }
.cm-widget-help-modal .cm-doc-body-inner { max-width: 960px; }
`;

export interface WidgetHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function WidgetHelpModal({ open, onClose }: WidgetHelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="위젯 만드는 여러 가지 방법" size="xl" className="cm-widget-help-modal">
      <style>{HELP_MODAL_STYLE}</style>
      {/* 모달 최대 높이(92dvh)에서 머리·본문 여백(약 125px)을 뺀 높이 — 뷰포트가 커도 모달 안에서 이중 스크롤이 생기지 않는다. */}
      <div style={{ height: "calc(92dvh - 140px)", minHeight: 320 }} data-testid="widget-help-body">
        <MarkdownDocViewer markdown={WIDGET_GUIDE_MARKDOWN} testId="widget-help-doc" skipTitle ariaLabel="위젯 만드는 방법" />
      </div>
    </Modal>
  );
}
