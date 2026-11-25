"use client";

/**
 * 사유 입력 창 — 재발행·회수·폐기처럼 사유가 꼭 필요한 처리 앞에 띄운다. 비우면 [실행] 이 눌리지 않는다.
 * 업무에 묶이지 않는 부품이다 — shared 등록 후보. 열 때마다 빈 칸으로 시작하도록 부모가 `{open && <ReasonModal …/>}` 로 만든다.
 */
import { useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Textarea } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

export interface ReasonModalProps {
  title: string;
  /** 라벨(예: "회수 사유"). */
  label: string;
  /** 실행 단추 문구(예: "회수"). */
  confirmText: string;
  busy?: boolean;
  /** 되돌리기 어려운 처리면 위험 모양. */
  danger?: boolean;
  initialValue?: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

export function ReasonModal({ title, label, confirmText, busy, danger, initialValue = "", onClose, onSubmit }: ReasonModalProps) {
  const [reason, setReason] = useState(initialValue);
  const trimmed = reason.trim();
  return (
    <Modal
      open
      title={title}
      size="md"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => onSubmit(trimmed)} disabled={busy || trimmed === ""}>
            {confirmText}
          </Button>
        </>
      }
    >
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>{label} *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea rows={3} maxLength={500} value={reason} onChange={setReason} />
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
