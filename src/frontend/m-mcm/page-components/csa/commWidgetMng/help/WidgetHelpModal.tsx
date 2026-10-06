"use client";

/**
 * 위젯 관리 「도움말」 — 「위젯 만드는 여러 가지 방법」 문서를 모달로 보여 준다.
 * 원문은 docs/guide/FrontEnd/Widget-Authoring-Guide.md 이고 widget-guide-content.ts 는 scripts/gen-widget-guide.mjs 가 만든 사본이다.
 * 문서 렌더·목차는 shared MarkdownDocViewer 가 맡는다.
 */
import { useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { MarkdownDocViewer } from "@dk-oasis/shared/markdown-editor";

import { WIDGET_SCREEN_LINK_GUIDE_MARKDOWN } from "../../../../widget-types/rule-calc/help-content";
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

/** 모달이 보이는 문서 — 만드는 방법(Widget-Authoring-Guide) 또는 업무 화면 값 연결 안내(Widget-Screen-Link-Guide). */
const DOCS = [
  { key: "make", tab: "만드는 방법", title: "위젯 만드는 여러 가지 방법", ariaLabel: "위젯 만드는 방법", markdown: WIDGET_GUIDE_MARKDOWN, testId: "widget-help-doc" },
  { key: "link", tab: "업무 화면 값 연결", title: "업무 화면과 위젯 값 연결 안내", ariaLabel: "업무 화면과 위젯 값 연결 안내", markdown: WIDGET_SCREEN_LINK_GUIDE_MARKDOWN, testId: "widget-help-link-doc" },
] as const;

export interface WidgetHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function WidgetHelpModal({ open, onClose }: WidgetHelpModalProps) {
  const [docKey, setDocKey] = useState<(typeof DOCS)[number]["key"]>("make");
  const doc = DOCS.find((d) => d.key === docKey) ?? DOCS[0];
  return (
    <Modal open={open} onClose={onClose} title={doc.title} size="xl" className="cm-widget-help-modal">
      <style>{HELP_MODAL_STYLE}</style>
      <div role="group" aria-label="도움말 문서" style={{ display: "flex", gap: 6, marginBottom: 8 }} data-testid="widget-help-tabs">
        {DOCS.map((d) => (
          <Button
            key={d.key}
            size="sm"
            variant={d.key === docKey ? "primary" : "default"}
            aria-pressed={d.key === docKey}
            data-testid={`widget-help-tab-${d.key}`}
            onClick={() => setDocKey(d.key)}
          >
            {d.tab}
          </Button>
        ))}
      </div>
      {/* 모달 최대 높이(92dvh)에서 머리·본문 여백(약 125px)을 뺀 높이 — 뷰포트가 커도 모달 안에서 이중 스크롤이 생기지 않는다. */}
      <div style={{ height: "calc(92dvh - 176px)", minHeight: 320 }} data-testid="widget-help-body">
        <MarkdownDocViewer key={doc.key} markdown={doc.markdown} testId={doc.testId} skipTitle ariaLabel={doc.ariaLabel} />
      </div>
    </Modal>
  );
}
