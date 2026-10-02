"use client";

/**
 * 확정 확인 대화상자(TSK-08-05 design.md §6.8-7, D3·D4·D9) — 스크린이 아니다(page.tsx·메뉴·OBJECT 없음).
 *
 * 일반 경고가 있으면 목록과 "경고를 확인했습니다"(`rc-ack`), 입력 계약 변경 경고가 있으면 따로 강조한 목록과 "입력 계약
 * 변경을 확인했습니다"(`rc-contract-ack`)를 보인다. 필요한 확인란을 모두 체크하기 전에는 확인을 막고, 경고가 없으면 체크
 * 없이 `false` 로 확정한다(I35). 미래 적용 경고는 서버가 준 `futureApplyFrom`(서버 시계)으로만 판정한다(I36).
 * shared Checkbox 는 data-testid 를 받지 않아 감싼 span 에 둔다.
 */
import { useEffect, useState } from "react";

import { Button, Checkbox } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { checkTitle, type WarningLine } from "./checks";

export interface ConfirmModalProps {
  open: boolean;
  target: string;
  applyFrom: string;
  warnings: WarningLine[];
  contractWarnings: WarningLine[];
  futureApplyFrom: boolean;
  /** 검사 항목 제목 표. 없으면 룰 확정의 `checkTitle`(세트 화면은 자기 표를 넘긴다). */
  titleOf?: (item: string) => string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (warningsAcknowledged: boolean) => void;
}

/** ADR-0002 D8 — 미래 apply_from 확정은 그 시각까지 새 버전을 막지만, 확정 취소로 되돌릴 수 있다. */
export const FUTURE_APPLY_WARNING =
  "적용 시작 일시가 미래입니다. 그 시각이 올 때까지 이 룰의 새 버전을 만들 수 없습니다. "
  + "적용 시각이 오기 전에는 확정 취소로 작성 중인 상태로 되돌릴 수 있습니다.";

const hintStyle = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const warnStyle = { color: "var(--color-warning, #b45309)", padding: "var(--spacing-xs) 0" } as const;
const dangerStyle = { color: "var(--color-danger, #b91c1c)", fontWeight: 600 } as const;

function lineText(w: WarningLine, titleOf: (item: string) => string): string {
  return `${titleOf(w.item)} · ${w.issue.message}${w.issue.itemKey ? ` (${w.issue.itemKey})` : ""}`;
}

export function ConfirmModal({
  open, target, applyFrom, warnings, contractWarnings, futureApplyFrom, titleOf = checkTitle, busy, onClose, onSubmit,
}: ConfirmModalProps) {
  const [acked, setAcked] = useState(false);
  const [contractAcked, setContractAcked] = useState(false);

  useEffect(() => {
    if (open) {
      setAcked(false);
      setContractAcked(false);
    }
  }, [open]);

  const hasWarnings = warnings.length > 0;
  const hasContract = contractWarnings.length > 0;
  const ready = (!hasWarnings || acked) && (!hasContract || contractAcked);

  return (
    <Modal
      open={open}
      title="버전 확정"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button data-testid="rc-modal-cancel" onClick={onClose}>취소</Button>
          <Button
            data-testid="rc-modal-ok"
            variant="primary"
            disabled={busy || !ready}
            onClick={() => onSubmit(hasWarnings || hasContract)}
          >
            확인
          </Button>
        </>
      }
    >
      <p>{`${target} 을(를) ${applyFrom} 부터 적용하도록 확정합니다.`}</p>
      {futureApplyFrom && (
        <p data-testid="rc-future-warning" style={warnStyle}>{FUTURE_APPLY_WARNING}</p>
      )}
      {hasContract && (
        <div data-testid="rc-modal-contract">
          <strong style={dangerStyle}>입력 계약 변경</strong>
          <ul>
            {contractWarnings.map((w, i) => <li key={`c-${i}`} style={dangerStyle}>{lineText(w, titleOf)}</li>)}
          </ul>
          <span data-testid="rc-contract-ack">
            <Checkbox checked={contractAcked} label="입력 계약 변경을 확인했습니다" onChange={setContractAcked} />
          </span>
        </div>
      )}
      {hasWarnings && (
        <div data-testid="rc-modal-warnings">
          <strong>경고</strong>
          <ul>
            {warnings.map((w, i) => <li key={`w-${i}`}>{lineText(w, titleOf)}</li>)}
          </ul>
          <span data-testid="rc-ack">
            <Checkbox checked={acked} label="경고를 확인했습니다" onChange={setAcked} />
          </span>
        </div>
      )}
      {/* D8-10 — 되돌린 룰이 그 룰의 유일한 확정 버전이었다면 이 룰을 쓰는 룰 세트와 다른 룰의 확정이 막힌다(재확정하면 풀린다). */}
      <p style={hintStyle}>
        확정 취소를 하면 이 룰을 멤버로 가진 룰 세트와 이 룰의 결과를 쓰는 다른 룰의 확정이 잠시 막힙니다. 다시 확정하면 풀립니다.
        적용 시각이 지난 뒤에는 확정 취소를 할 수 없고, 서버가 확정 직전에 검사를 다시 합니다.
      </p>
    </Modal>
  );
}
