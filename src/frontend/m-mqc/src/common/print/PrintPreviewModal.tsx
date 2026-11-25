"use client";

/**
 * 출력물 미리보기 창 — 용지 모양(A4 또는 Tag 100×70mm) 한 장을 모달에 그리고 [인쇄] 로 브라우저 인쇄를 연다.
 * 인쇄는 shared `printElementAsPage` 가 용지 요소만 한 장으로 찍는다(인쇄 창에서 「PDF로 저장」 을 고르면 PDF).
 * 업무에 묶이지 않는 부품이다 — shared 등록 후보(보고에 적는다). 내용은 `sheet.tsx` 의 Sheet* 조각으로 채운다.
 */
import { useRef, type CSSProperties, type ReactNode } from "react";

import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { printElementAsPage, today } from "@dk-oasis/shared/utils";

export type PaperSize = "A4" | "TAG";

/** 96dpi 기준 픽셀: A4 210×297mm, Tag 100×70mm. */
const PAPER: Record<PaperSize, CSSProperties> = {
  A4: { width: 794, minHeight: 1123, padding: "44px 52px" },
  TAG: { width: 378, minHeight: 265, padding: "12px 14px" },
};

const FRAME_STYLE: CSSProperties = {
  overflow: "auto",
  background: "var(--color-bg-app)",
  padding: "var(--spacing-lg)",
  display: "flex",
  justifyContent: "center",
};

const SHEET_BASE: CSSProperties = {
  boxSizing: "border-box",
  background: "var(--color-bg)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  fontSize: "var(--font-size-sm)",
  lineHeight: 1.5,
  flexShrink: 0,
};

/** 파일 이름에 못 쓰는 글자를 _ 로. */
export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_");

export interface PrintPreviewModalProps {
  open: boolean;
  /** 창 제목(예: "품질보증서 미리보기"). */
  title: string;
  /** 인쇄 창의 문서 제목 = PDF 기본 파일 이름 앞부분. 뒤에 _yyyyMMdd 를 붙인다. */
  fileName: string;
  paper?: PaperSize;
  onClose: () => void;
  /** 용지 안 내용. */
  children: ReactNode;
  /** [인쇄] 앞에 둘 단추(예: 발행). */
  extraFooter?: ReactNode;
  testId?: string;
}

export function PrintPreviewModal({ open, title, fileName, paper = "A4", onClose, children, extraFooter, testId }: PrintPreviewModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const print = () => {
    if (sheetRef.current) printElementAsPage(sheetRef.current, { title: safeFileName(`${fileName}_${today()}`) });
  };
  return (
    <Modal
      open={open}
      title={title}
      size={paper === "A4" ? "xl" : "md"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>닫기</Button>
          {extraFooter}
          <Button variant="primary" onClick={print}>
            인쇄
          </Button>
        </>
      }
    >
      <div style={FRAME_STYLE}>
        <div ref={sheetRef} style={{ ...SHEET_BASE, ...PAPER[paper] }} data-testid={testId}>
          {children}
        </div>
      </div>
    </Modal>
  );
}
