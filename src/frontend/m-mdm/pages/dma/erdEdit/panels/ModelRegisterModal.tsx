"use client";

/**
 * 새 모델 등록 창(UX 1차 U15) — 위 막대의 [+ 모델] 과 빈 상태 [새 모델 등록] 이 함께 연다.
 * 칸마다 라벨을 단다. 등록이 끝나면 닫고, 실패하면 입력을 그대로 둔 채 열어 둔다(onRegister 가 false).
 */
import { useId, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { RegInput } from "../api";

export interface ModelRegisterModalProps {
  opened: boolean;
  onClose(): void;
  /** 등록이 끝나면 true, 실패하면 false. */
  onRegister(input: RegInput): Promise<boolean>;
}

const EMPTY_REG: RegInput = { modelId: "", moduleId: "", schemaName: "", modelName: "" };
const REG_FIELDS: readonly { key: keyof RegInput; label: string }[] = [
  { key: "modelId", label: "모델 ID" },
  { key: "moduleId", label: "모듈" },
  { key: "schemaName", label: "스키마" },
  { key: "modelName", label: "모델 이름" },
];

export function ModelRegisterModal({ opened, onClose, onRegister }: ModelRegisterModalProps) {
  const [reg, setReg] = useState<RegInput>(EMPTY_REG);
  const [pending, setPending] = useState(false); // 등록 요청 중에만 켜는 등록 단추 전용 상태(R5)
  const idBase = useId();
  const close = () => {
    if (pending) return;
    setReg(EMPTY_REG);
    onClose();
  };
  const submit = async () => {
    setPending(true);
    let done = false;
    try {
      done = await onRegister(reg);
    } finally {
      setPending(false);
    }
    if (done) {
      setReg(EMPTY_REG);
      onClose();
    }
  };
  return (
    <Modal open={opened} title="새 모델 등록" size="sm" onClose={close}
      footer={(
        <>
          <Button data-testid="erd-reg-cancel" disabled={pending} onClick={close}>취소</Button>
          <Button variant="primary" data-testid="erd-reg-submit" disabled={pending} onClick={() => void submit()}>등록</Button>
        </>
      )}>
      <div className="erd-reg" data-testid="erd-reg-modal">
        {REG_FIELDS.map((f) => {
          const id = `${idBase}-${f.key}`;
          return (
            <div key={f.key} className="erd-reg__row">
              <label className="erd-reg__label" htmlFor={id}>{f.label}</label>
              <Input id={id} data-testid={`erd-reg-${f.key}`} value={reg[f.key]}
                onChange={(v) => setReg((r) => ({ ...r, [f.key]: v }))} />
            </div>
          );
        })}
        <div className="erd-reg__help">모델 ID 와 모듈은 보통 같습니다(예: mcm). 스키마는 DB 사용자(예: MCMAPUSER).</div>
      </div>
    </Modal>
  );
}
