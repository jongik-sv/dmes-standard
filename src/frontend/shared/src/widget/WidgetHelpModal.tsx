"use client";

/**
 * 위젯 도움말 모달 — 위젯 meta.help 의 문서를 목차가 있는 문서 보기로 연다.
 * WidgetHelpButton 이 누른 뒤에야 지연 로딩하므로 도움말이 없는 위젯과 누르기 전에는 이 코드를 읽지 않는다.
 */
import { lazy, Suspense, useEffect, useState } from "react";

import { Modal } from "../components/modal";
import type { WidgetHelp } from "./types";

/**
 * 문서 보기(tiptap·marked)는 번들 밖 진입점(`@dk-oasis/shared/markdown-editor`, tsup external)에서 지연 import 한다.
 * 상대 경로로 import 하면 tsup(splitting:false)이 widget.js 에 통째로 넣어 포털 모든 화면이 도움말을 열기 전에 받는다.
 */
const MarkdownDocViewer = lazy(() => import("@dk-oasis/shared/markdown-editor").then((m) => ({ default: m.MarkdownDocViewer })));

/** 모달을 화면 거의 전체로 키우고 본문 줄 길이를 제한한다(선택자를 한 단계 높여 shared 기본값을 덮어쓴다). */
const HELP_MODAL_STYLE = `
.cm-modal.cm-widget-help-modal { --modal-size: min(92vw, 1600px); --modal-y-offset: 4dvh; min-height: 0; }
.mantine-Modal-inner:has(.cm-widget-help-modal) { --modal-inner-x-offset: 4vw; --modal-inner-y-offset: 4dvh; }
.cm-widget-help-modal .cm-doc-body-inner { max-width: 960px; }
`;

export const WIDGET_HELP_LOAD_ERROR = "도움말을 불러오지 못했습니다.";

type HelpState = { status: "loading" } | { status: "error" } | { status: "ready"; markdown: string };

export interface WidgetHelpModalProps {
  help: WidgetHelp;
  onClose: () => void;
}

export default function WidgetHelpModal({ help, onClose }: WidgetHelpModalProps) {
  const [state, setState] = useState<HelpState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    help.loadMarkdown().then(
      (markdown) => {
        if (!cancelled) setState({ status: "ready", markdown });
      },
      () => {
        if (!cancelled) setState({ status: "error" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [help]);

  return (
    <Modal open onClose={onClose} title={help.title} size="xl" className="cm-widget-help-modal">
      <style>{HELP_MODAL_STYLE}</style>
      <div style={{ height: "calc(92dvh - 140px)", minHeight: 320 }} data-testid="widget-help-body">
        {state.status === "ready" ? (
          <Suspense
            fallback={
              <div role="status" data-testid="widget-help-loading">
                불러오는 중…
              </div>
            }
          >
            <MarkdownDocViewer markdown={state.markdown} testId="widget-help-doc" skipTitle ariaLabel={help.title} />
          </Suspense>
        ) : state.status === "error" ? (
          <div role="alert" data-testid="widget-help-error">
            {WIDGET_HELP_LOAD_ERROR}
          </div>
        ) : (
          <div role="status" data-testid="widget-help-loading">
            불러오는 중…
          </div>
        )}
      </div>
    </Modal>
  );
}
