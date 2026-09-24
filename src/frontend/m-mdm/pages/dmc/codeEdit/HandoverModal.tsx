"use client";

/**
 * DRAFT 넘기기 대화상자(TSK-06-02 design.md §6.12) — 스크린이 아니다.
 * 받는 사람은 담당자여야 한다. 운영에는 대상 조회 어댑터가 없어 서버가 늘 거부한다(design D3, MDM005).
 */
import { useEffect, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

export interface HandoverModalProps {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (newOwnerId: string) => void;
}

export function HandoverModal({ open, busy, onClose, onSubmit }: HandoverModalProps) {
  const [userId, setUserId] = useState("");

  useEffect(() => {
    if (open) setUserId("");
  }, [open]);

  return (
    <Modal
      open={open}
      title="DRAFT 넘기기"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            data-testid="handover-ok"
            variant="primary"
            disabled={busy || userId.trim() === ""}
            onClick={() => onSubmit(userId.trim())}
          >
            넘기기
          </Button>
        </>
      }
    >
      <label style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
        받는 사람 사용자 ID
        <Input data-testid="handover-user" value={userId} onChange={setUserId} />
      </label>
    </Modal>
  );
}
