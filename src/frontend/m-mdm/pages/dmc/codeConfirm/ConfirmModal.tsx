"use client";

/**
 * 확정 확인 대화상자(TSK-06-05 design.md §6.7-6, D6·D7) — 스크린이 아니다(page.tsx·메뉴·OBJECT 없음).
 *
 * 경고(2-1·2-2)가 있으면 목록과 "경고를 확인했습니다" 체크를 보이고, 체크 전에는 확인을 막는다(I31). 경고가 없으면
 * 체크 없이 `false` 로 확정한다. 미래 적용 경고는 서버가 준 `futureApplyFrom`(서버 시계)으로만 판정한다(I32).
 * shared Checkbox 는 data-testid 를 받지 않아 감싼 span 에 둔다.
 */
import { useEffect, useState } from "react";

import { Button, Checkbox } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { WarningLine } from "./checks";

export interface ConfirmModalProps {
  open: boolean;
  target: string;
  applyFrom: string;
  warnings: WarningLine[];
  futureApplyFrom: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (warningsAcknowledged: boolean) => void;
}

export const FUTURE_APPLY_WARNING =
  "적용 시작 일시가 미래입니다. 그 시각이 올 때까지 이 버전을 고치거나 새 버전을 만들 수 없습니다(철회 없음).";

const hintStyle = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const warnStyle = { color: "var(--color-warning, #b45309)", padding: "var(--spacing-xs) 0" } as const;

export function ConfirmModal({
  open, target, applyFrom, warnings, futureApplyFrom, busy, onClose, onSubmit,
}: ConfirmModalProps) {
  const [acked, setAcked] = useState(false);

  useEffect(() => {
    if (open) setAcked(false);
  }, [open]);

  const hasWarnings = warnings.length > 0;

  return (
    <Modal
      open={open}
      title="버전 확정"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            data-testid="cf-modal-ok"
            variant="primary"
            disabled={busy || (hasWarnings && !acked)}
            onClick={() => onSubmit(hasWarnings && acked)}
          >
            확인
          </Button>
        </>
      }
    >
      <p>{`${target} 을(를) ${applyFrom} 부터 적용하도록 확정합니다.`}</p>
      {futureApplyFrom && (
        <p data-testid="cf-future-warning" style={warnStyle}>{FUTURE_APPLY_WARNING}</p>
      )}
      {hasWarnings && (
        <div data-testid="cf-modal-warnings">
          <strong>경고</strong>
          <ul>
            {warnings.map((w, i) => (
              <li key={`${w.no}-${i}`}>{`${w.no}항 · ${w.issue.message}${w.issue.itemKey ? ` (${w.issue.itemKey})` : ""}`}</li>
            ))}
          </ul>
          <span data-testid="cf-ack">
            <Checkbox checked={acked} label="경고를 확인했습니다" onChange={setAcked} />
          </span>
        </div>
      )}
      <p style={hintStyle}>확정한 버전은 철회할 수 없습니다. 서버가 확정 직전에 검사를 다시 합니다.</p>
    </Modal>
  );
}
