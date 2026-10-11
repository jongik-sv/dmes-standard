"use client";

/**
 * 여러 표 창(UX 1.5) — 다른 다이어그램에 넣기(U61), 같은 컬럼 여러 표에(U63). shared Modal·form 을 쓴다.
 * 입력 상태는 창 안에 둔다(글자를 칠 때 캔버스·화면 루트를 다시 그리지 않는다, NewTableModal 과 같다).
 * 미리보기는 300ms 멈춘 뒤 한 번, 요청 순번으로 늦은 응답을 버린다(Local-Rules §37).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button, Input, Select } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { previewName } from "../api";
import type { ErdModelJson } from "../types";
import { usablePhys } from "./CanvasDialogs";
import { bulkColumnPlan, columnPhysError, type BulkColumnInput } from "./erd-multi";

const PREVIEW_DEBOUNCE_MS = 300;
/** 목록에 이름을 적는 표 수. 나머지는 "외 n개". */
const SHOWN = 10;
const NOTE: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const WARN: CSSProperties = { ...NOTE, color: "var(--color-warning)" };

export const PLACE_ALL_PRESENT_TEXT = "고른 표가 모두 그 다이어그램에 이미 있습니다.";
export const BULKCOL_UNKNOWN_TEXT = "사전에 없는 단어가 있어 물리명을 직접 넣으세요.";
export const BULKCOL_FAILED_TEXT = "물리명 미리보기를 불러오지 못했습니다. 물리명을 직접 넣으세요.";

const names = (list: readonly string[], model: ErdModelJson): string => {
  const shown = list.slice(0, SHOWN).map((id) => model.tables[id]?.phys ?? id).join(", ");
  return list.length > SHOWN ? `${shown} 외 ${list.length - SHOWN}개` : shown;
};

export interface PlaceTarget { id: string; label: string; already: number }
export interface PlaceIntoDialogProps {
  open: boolean;
  count: number;
  targets: readonly PlaceTarget[];
  onSubmit(to: string): Promise<string | null>;
  onClose(): void;
}

export function PlaceIntoDialog({ open, count, targets, onSubmit, onClose }: PlaceIntoDialogProps) {
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef("");
  firstRef.current = targets[0]?.id ?? "";
  useEffect(() => {
    if (!open) return;
    setTo(firstRef.current);
    setError(null);
    setBusy(false);
  }, [open]);
  const target = targets.find((t) => t.id === to) ?? null;
  const adds = target ? count - target.already : 0;
  const blocked = !target || adds <= 0 || busy;
  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      setError(await onSubmit(to));
    } finally {
      setBusy(false);
    }
  };
  const info = !target ? "다이어그램을 고르세요."
    : adds <= 0 ? PLACE_ALL_PRESENT_TEXT
    : `표 ${adds}개를 넣습니다.${target.already > 0 ? ` 이미 있는 ${target.already}개는 그대로 둡니다.` : ""}`;
  return (
    <Modal open={open} title="다른 다이어그램에 넣기" size="sm" onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-place-cancel" onClick={onClose}>취소</Button>
          <Button variant="primary" data-testid="erd-place-ok" disabled={blocked} onClick={() => void submit()}>넣기</Button>
        </div>
      }>
      <div data-testid="erd-place-dialog">
        <div className="erd-dialog__row">
          <label htmlFor="erd-place-target">넣을 다이어그램</label>
          <Select id="erd-place-target" data-testid="erd-place-target" value={to}
            options={targets.map((t) => ({ value: t.id, label: t.label }))}
            onChange={(v) => {
              setTo(v);
              setError(null);
            }} />
        </div>
        <p role="status" data-testid="erd-place-info" style={adds <= 0 && target ? WARN : NOTE}>{info}</p>
        <p className="erd-dialog__note">자리는 그 다이어그램 표들의 오른쪽입니다. 지금 다이어그램에서는 빠지지 않습니다.</p>
        {error && <div className="erd-dialog__error" role="alert" data-testid="erd-place-error">{error}</div>}
      </div>
    </Modal>
  );
}

interface ColumnPreview { forText: string; value: string | null; domainId: number | null; failed: boolean }

export interface BulkColumnModalProps {
  open: boolean;
  model: ErdModelJson;
  tables: readonly string[];
  onSubmit(col: BulkColumnInput): Promise<string | null>;
  onClose(): void;
}

export function BulkColumnModal({ open, model, tables, onSubmit, onClose }: BulkColumnModalProps) {
  const [logical, setLogical] = useState("");
  const [phys, setPhys] = useState("");
  const [preview, setPreview] = useState<ColumnPreview | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 사용자가 물리명 칸을 고쳤는가 — 늦은 응답이 그 사이 입력을 덮지 않게 ref 로 읽는다. */
  const physTouched = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setLogical("");
    setPhys("");
    setPreview(null);
    setServerError(null);
    setBusy(false);
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
          const value = usablePhys(p)?.toUpperCase() ?? null;
          setPreview({ forText: want, value, domainId: p.recommendedDomainId, failed: false });
          if (!physTouched.current) setPhys(value ?? "");
        })
        .catch(() => {
          if (seq.current !== mine) return;
          setPreview({ forText: want, value: null, domainId: null, failed: true });
          if (!physTouched.current) setPhys("");
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [want]);
  useEffect(() => () => {
    seq.current += 1;
  }, []);

  const shown = preview !== null && preview.forText === want ? preview : null;
  // 계획·검사·전송이 같은 값을 쓰도록 물리명을 한 번 다듬는다(앞뒤 공백 제거, 대문자).
  const physN = phys.trim().toUpperCase();
  const plan = useMemo(() => (open && physN ? bulkColumnPlan(model, tables, physN) : null), [open, model, tables, physN]);
  const localError = physN ? columnPhysError(physN) : null;
  // 물리명을 고치지 않은 채 논리명이 바뀌어 새 미리보기를 기다리는 동안은 앞 글의 물리명으로 보내지 않는다.
  const waitingPreview = !physTouched.current && want !== "" && shown === null;
  const blocked = want === "" || !physN || localError !== null || busy || waitingPreview || !plan || plan.targets.length === 0;

  const submit = async () => {
    if (blocked) return;
    // 추천 도메인을 기다리는 사이 창을 닫거나 논리명을 바꾸면 seq 가 바뀐다 → 늦은 응답으로 보내지 않는다(Local-Rules §37).
    const mine = seq.current;
    setBusy(true);
    try {
      let domainId: number | null = null;
      if (shown && shown.value === physN) domainId = shown.domainId;
      else {
        try {
          domainId = (await previewName({ phys: physN })).recommendedDomainId;
        } catch {
          domainId = null; // 추천 도메인을 못 읽으면 도메인 없이 보낸다(나중에 도메인 칸에서 고른다)
        }
      }
      if (seq.current !== mine) return;
      setServerError(await onSubmit({ logical: want, phys: physN, domainId }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={`같은 컬럼 추가 — 표 ${tables.length}개`} size="sm" onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-bulkcol-cancel" onClick={onClose}>취소</Button>
          <Button variant="primary" data-testid="erd-bulkcol-ok" disabled={blocked} onClick={() => void submit()}>추가</Button>
        </div>
      }>
      <div data-testid="erd-bulkcol-dialog">
        <div className="erd-dialog__row">
          <label htmlFor="erd-bulkcol-logical">논리명</label>
          <Input id="erd-bulkcol-logical" data-testid="erd-bulkcol-logical" value={logical} autoFocus data-autofocus
            onChange={(v) => {
              setLogical(v);
              setServerError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
            }} />
        </div>
        <div className="erd-dialog__row">
          <label htmlFor="erd-bulkcol-phys">물리명</label>
          <Input id="erd-bulkcol-phys" data-testid="erd-bulkcol-phys" value={phys}
            onChange={(v) => {
              physTouched.current = true;
              setPhys(v.toUpperCase());
              setServerError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
            }}
            error={localError ?? undefined} />
        </div>
        {shown && (
          <div role="status" data-testid="erd-bulkcol-preview" style={shown.value === null ? WARN : NOTE}>
            {shown.value !== null ? `물리명 미리보기 ${shown.value} — 사전 기준, 고칠 수 있습니다`
              : shown.failed ? BULKCOL_FAILED_TEXT : BULKCOL_UNKNOWN_TEXT}
          </div>
        )}
        {plan && (
          <>
            <p data-testid="erd-bulkcol-targets" style={NOTE}>넣을 표 {plan.targets.length}개{plan.targets.length > 0 ? `: ${names(plan.targets, model)}` : ""}</p>
            {plan.skipped.length > 0 && (
              <p data-testid="erd-bulkcol-skip" style={WARN}>같은 물리명이 있어 건너뜀 {plan.skipped.length}개: {names(plan.skipped, model)}</p>
            )}
          </>
        )}
        <p className="erd-dialog__note">컬럼은 각 표의 끝(감사 컬럼 앞)에 들어갑니다. PK 컬럼은 표를 하나씩 골라 [PK 추가] 로 넣으세요.</p>
        {serverError && <div className="erd-dialog__error" role="alert" data-testid="erd-bulkcol-error">{serverError}</div>}
      </div>
    </Modal>
  );
}
