"use client";

/** [새 작업] 유형 고르기 — 유형 4개를 아이콘·이름·한 줄 설명으로 보이고 하나를 고르면 빈 상세가 열린다. */
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";

import { JOB_KIND_INFO, NEW_JOB_KINDS } from "./job-kinds";
import type { JobKind } from "./types";

export interface KindPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (kind: JobKind) => void;
}

export function KindPickerModal({ open, onClose, onPick }: KindPickerModalProps) {
  return (
    <Modal open={open} title="새 작업 · 유형 고르기" size="md" onClose={onClose} footer={<Button onClick={onClose}>취소</Button>}>
      <table style={DETAIL_TABLE_STYLE} data-testid="job-kind-picker">
        <tbody>
          {NEW_JOB_KINDS.map((kind) => {
            const info = JOB_KIND_INFO[kind];
            return (
              <tr key={kind}>
                <th style={DETAIL_LABEL_CELL}>
                  <Button variant="default" data-testid={`job-kind-${kind}`} onClick={() => onPick(kind)}>
                    {info.label}
                  </Button>
                </th>
                <td style={DETAIL_VALUE_CELL}>{info.description}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
