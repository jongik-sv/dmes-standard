"use client";

/**
 * 문서 탭 도움말 모달 — 마크다운 문서 여러 개를 탭으로 보여 주는 큰 모달(위젯 관리·예약 작업 관리 「도움말」이 함께 쓴다).
 * 문서 렌더·목차는 shared MarkdownDocViewer 가 맡고, 이 부품은 모달 크기·탭 줄·본문 높이만 정한다.
 * 크기 변수·본문 폭은 shared 값(.cm-modal-xl 1024px, .cm-doc-body-inner 820px)보다 선택자를 한 단계 높여 덮어쓴다(shared 무변경).
 * 모달 클래스(className)와 테스트 id 접두(testIdPrefix)는 호출 화면이 정한다 — 위젯 관리는 기존 값을 그대로 넘겨 모습·선택자가 바뀌지 않는다.
 */
import { useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { MarkdownDocViewer } from "@dk-oasis/shared/markdown-editor";

export interface GuideHelpDoc {
  /** 탭을 가리키는 키 — 탭 단추 testId(`{접두}-tab-{key}`)에 쓰인다. */
  key: string;
  /** 탭에 보이는 글자. */
  tab: string;
  /** 모달 제목. */
  title: string;
  ariaLabel: string;
  markdown: string;
  /** 문서 영역 testId. */
  testId: string;
}

export interface GuideHelpModalProps {
  open: boolean;
  onClose: () => void;
  docs: readonly GuideHelpDoc[];
  /** 모달 최상위 클래스 — 크기 덮어쓰기 선택자의 기준. */
  className: string;
  /** testId 접두: `{접두}-tabs`, `{접두}-tab-{key}`, `{접두}-body`. */
  testIdPrefix: string;
}

/**
 * 도움말 모달을 화면 거의 전체로 키운다: 폭 92vw(최대 1600px), 높이 92dvh.
 * 바깥 여백(inner)도 같은 값(4vw·4dvh)으로 줄여 모달이 바깥 칸 밖으로 넘치지 않게 한다. 본문 줄 길이는 960px 로 제한해 넓은 모달에서도 읽기 쉽게 한다.
 */
const modalStyle = (className: string): string => `
.cm-modal.${className} { --modal-size: min(92vw, 1600px); --modal-y-offset: 4dvh; min-height: 0; }
.mantine-Modal-inner:has(.${className}) { --modal-inner-x-offset: 4vw; --modal-inner-y-offset: 4dvh; }
.${className} .cm-doc-body-inner { max-width: 960px; }
`;

export function GuideHelpModal({ open, onClose, docs, className, testIdPrefix }: GuideHelpModalProps) {
  const [docKey, setDocKey] = useState(docs[0]?.key ?? "");
  const doc = docs.find((d) => d.key === docKey) ?? docs[0];
  if (!doc) return null;
  return (
    <Modal open={open} onClose={onClose} title={doc.title} size="xl" className={className}>
      <style>{modalStyle(className)}</style>
      <div role="group" aria-label="도움말 문서" style={{ display: "flex", gap: 6, marginBottom: 8 }} data-testid={`${testIdPrefix}-tabs`}>
        {docs.map((d) => (
          <Button
            key={d.key}
            size="sm"
            variant={d.key === doc.key ? "primary" : "default"}
            aria-pressed={d.key === doc.key}
            data-testid={`${testIdPrefix}-tab-${d.key}`}
            onClick={() => setDocKey(d.key)}
          >
            {d.tab}
          </Button>
        ))}
      </div>
      {/* 모달 최대 높이(92dvh)에서 머리·본문 여백(약 125px)을 뺀 높이 — 뷰포트가 커도 모달 안에서 이중 스크롤이 생기지 않는다. */}
      <div style={{ height: "calc(92dvh - 176px)", minHeight: 320 }} data-testid={`${testIdPrefix}-body`}>
        <MarkdownDocViewer key={doc.key} markdown={doc.markdown} testId={doc.testId} skipTitle ariaLabel={doc.ariaLabel} />
      </div>
    </Modal>
  );
}
