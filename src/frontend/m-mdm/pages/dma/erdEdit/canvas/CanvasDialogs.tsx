"use client";

/** 캔버스 대화상자 — 모델에서 표 삭제 확인(Alt+Delete), 새 표(도구 2). shared Modal·form 을 쓴다. */
import { useEffect, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { ErdModelJson } from "../types";
import { tablePhysError } from "./erd-commands";

/** 확인 창에 이름을 적는 표 수. 나머지는 "외 n개". */
const SHOWN = 10;

export interface DeleteTablesModalProps {
  open: boolean;
  /** 지울 표 물리명. */
  names: readonly string[];
  undoKey: string;
  onConfirm(): void;
  onClose(): void;
}

export function DeleteTablesModal({ open, names, undoKey, onConfirm, onClose }: DeleteTablesModalProps) {
  return (
    <Modal
      open={open}
      title="모델에서 표 삭제"
      size="sm"
      onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-delete-cancel" onClick={onClose}>취소</Button>
          <Button variant="danger" data-testid="erd-delete-ok" onClick={onConfirm}>삭제</Button>
        </div>
      }
    >
      <div data-testid="erd-delete-confirm">
        <p>{names.length > 1 ? `표 ${names.length}개를` : "이 표를"} 모델에서 지웁니다. 컬럼·키와 이 표에 걸린 관계도 함께 지워지고, 어느 다이어그램에도 보이지 않습니다.</p>
        <ul className="erd-dialog__list">
          {names.slice(0, SHOWN).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {names.length > SHOWN && <p>외 {names.length - SHOWN}개</p>}
        <p className="erd-dialog__note">{undoKey} 또는 변경 기록의 [되돌리기]로 한 번에 되살릴 수 있습니다.</p>
      </div>
    </Modal>
  );
}

export interface NewTableModalProps {
  open: boolean;
  model: ErdModelJson;
  /** 만들기. 거절이면 창에 보일 문구, 받아들이면 null. */
  onSubmit(phys: string, logical: string): Promise<string | null>;
  onClose(): void;
}

export function NewTableModal({ open, model, onSubmit, onClose }: NewTableModalProps) {
  const [phys, setPhys] = useState("");
  const [logical, setLogical] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhys("");
    setLogical("");
    setServerError(null);
    setBusy(false);
  }, [open]);

  const localError = phys ? tablePhysError(model, phys) : null;
  const blocked = !phys || localError !== null || busy;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      setServerError(await onSubmit(phys, logical.trim()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="새 표"
      size="sm"
      onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-newtable-cancel" onClick={onClose}>취소</Button>
          <Button variant="primary" data-testid="erd-newtable-ok" disabled={blocked} onClick={() => void submit()}>만들기</Button>
        </div>
      }
    >
      <div className="erd-dialog__row">
        <label htmlFor="erd-newtable-phys">물리명</label>
        <Input id="erd-newtable-phys" data-testid="erd-newtable-phys" value={phys} autoFocus
          onChange={(v) => {
            setPhys(v.toUpperCase());
            setServerError(null);
          }}
          error={localError ?? undefined} />
      </div>
      <div className="erd-dialog__row">
        <label htmlFor="erd-newtable-logical">논리명</label>
        <Input id="erd-newtable-logical" data-testid="erd-newtable-logical" value={logical} onChange={setLogical}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }} />
      </div>
      {serverError && (
        <div className="erd-dialog__error" role="alert" data-testid="erd-newtable-error">
          {serverError}
        </div>
      )}
    </Modal>
  );
}
