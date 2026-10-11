"use client";

/** 캔버스 대화상자 — 모델에서 표 삭제 확인(Alt+Delete), 새 표(도구 2). shared Modal·form 을 쓴다. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { previewName } from "../api";
import { isUnknownToken } from "../panels/TokenChoiceModal";
import type { ErdModelJson, ErdNamePreview } from "../types";
import { tablePhysError, tablePrefix } from "./erd-commands";

/** 확인 창에 이름을 적는 표 수. 나머지는 "외 n개". */
const SHOWN = 10;

/** 논리명이 이 시간(ms) 멈추면 물리명을 미리 묻는다(GridInputBar 와 같다). */
const PREVIEW_DEBOUNCE_MS = 300;

const PREVIEW_LINE: CSSProperties = { minHeight: 20, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const PREVIEW_WARN: CSSProperties = { ...PREVIEW_LINE, color: "var(--color-warning)" };

export const NEWTABLE_UNKNOWN_TEXT = "사전에 없는 단어가 있어 물리명을 직접 넣으세요.";
export const NEWTABLE_FAILED_TEXT = "물리명 미리보기를 불러오지 못했습니다. 물리명을 직접 넣으세요.";

/** 미리보기 칸 상태 — forText 는 이 응답을 물은 논리명(지금 글자와 다르면 보이지 않는다). */
interface NewTablePreview {
  forText: string;
  /** 물리명 칸에 넣을 값(접두 포함). 사전에 없는 단어가 있으면 null. */
  value: string | null;
  failed: boolean;
}

/** 미리보기 응답이 쓸 만한가 — 사전에 없는 토막(`***` 표식 포함)이 있으면 쓰지 않는다. */
function usablePhys(p: ErdNamePreview): string | null {
  const phys = (p.physName ?? "").trim();
  if (phys === "" || phys.includes("***") || p.tokens?.some((t) => isUnknownToken(t.status))) return null;
  return phys;
}

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

/**
 * 새 표 창 — 논리명 먼저(U40). 논리명이 300ms 멈추면 previewName({ logical }) 으로 물리명을 묻고,
 * 사용자가 물리명 칸을 고치기 전까지만 `<모델 접두><physName>` 을 칸에 채운다. 입력 state 는 모두 이 창 안에 있어
 * 글자를 칠 때 캔버스·화면 루트는 다시 그려지지 않는다.
 */
export function NewTableModal({ open, model, onSubmit, onClose }: NewTableModalProps) {
  const [phys, setPhys] = useState("");
  const [logical, setLogical] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<NewTablePreview | null>(null);
  /** 사용자가 물리명 칸을 고쳤는가 — 응답이 늦게 와도 ref 로 읽어 그 사이의 입력을 덮지 않는다. */
  const physTouched = useRef(false);
  /** 요청 순번 — 순번이 바뀐 뒤 온 응답(옛 글자·닫힌 창)은 버린다(Local-Rules §37). */
  const seq = useRef(0);
  const prefix = useMemo(() => tablePrefix(model), [model]);
  const prefixRef = useRef(prefix);
  prefixRef.current = prefix;

  useEffect(() => {
    if (!open) return;
    setPhys("");
    setLogical("");
    setServerError(null);
    setBusy(false);
    setPreview(null);
    physTouched.current = false;
  }, [open]);

  const want = open ? logical.trim() : "";
  useEffect(() => {
    const mine = ++seq.current;
    if (want === "") {
      setPreview(null);
      if (!physTouched.current) setPhys("");
      return;
    }
    const timer = setTimeout(() => {
      previewName({ logical: want })
        .then((p) => {
          if (seq.current !== mine) return;
          const base = usablePhys(p);
          const value = base === null ? null : (prefixRef.current + base).toUpperCase();
          setPreview({ forText: want, value, failed: false });
          if (!physTouched.current) setPhys(value ?? "");
        })
        .catch(() => {
          if (seq.current !== mine) return;
          setPreview({ forText: want, value: null, failed: true });
          if (!physTouched.current) setPhys("");
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [want]);
  useEffect(() => () => {
    seq.current += 1;
  }, []);

  const localError = phys ? tablePhysError(model, phys) : null;
  // 물리명을 고치지 않은 채 논리명이 바뀌어 새 미리보기를 기다리는 동안은 칸에 앞 글의 물리명이 남아 있다 — 그 값으로 만들지 않는다.
  const waitingPreview = !physTouched.current && want !== "" && preview?.forText !== want;
  const blocked = !phys || localError !== null || busy || waitingPreview;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      setServerError(await onSubmit(phys, logical.trim()));
    } finally {
      setBusy(false);
    }
  };

  const shown = preview !== null && preview.forText === want ? preview : null;

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
        <label htmlFor="erd-newtable-logical">논리명</label>
        <Input id="erd-newtable-logical" data-testid="erd-newtable-logical" value={logical} autoFocus data-autofocus
          onChange={(v) => {
            setLogical(v);
            setServerError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
          }} />
      </div>
      <div className="erd-dialog__row">
        <label htmlFor="erd-newtable-phys">물리명</label>
        <Input id="erd-newtable-phys" data-testid="erd-newtable-phys" value={phys}
          onChange={(v) => {
            physTouched.current = true;
            setPhys(v.toUpperCase());
            setServerError(null);
          }}
          error={localError ?? undefined} />
      </div>
      {shown && (
        <div role="status" data-testid="erd-newtable-preview" style={shown.value === null ? PREVIEW_WARN : PREVIEW_LINE}>
          {shown.value !== null
            ? `물리명 미리보기 ${shown.value} — 사전 기준, 고칠 수 있습니다`
            : shown.failed ? NEWTABLE_FAILED_TEXT : NEWTABLE_UNKNOWN_TEXT}
        </div>
      )}
      {serverError && (
        <div className="erd-dialog__error" role="alert" data-testid="erd-newtable-error">
          {serverError}
        </div>
      )}
    </Modal>
  );
}
