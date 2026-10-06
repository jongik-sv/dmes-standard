"use client";

/**
 * 세트 테스트 케이스 팝업(3단계 계획 E6, `case-modal`) — 이름·설명·입력 JSON·판정 시각·기대 JSON 을 고쳐 `save part=CASE` 로 저장한다.
 * 모양은 룰 편집 `cards/TestCaseEditModal` 의 JSON 탭을 따른다(세트 케이스는 입력 계약·결과 열이 흐름마다 달라 폼 탭을 두지 않는다).
 * 저장 전에 입력·기대 JSON 을 `parseObject` 로 확인하고 판정 시각 형식을 본다(칸 아래 오류). 기대를 비우면 "실행만" 케이스다(P-D4).
 * 저장이 실패하면(MDM001 등) 팝업을 닫지 않고 훅의 오류 문구를 아래에 보인다.
 */
import { useContext, useEffect, useState } from "react";

import { Button, Input, Textarea } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { parseObject } from "../../ruleEdit/value-test/case-form";
import { EditorActiveContext } from "../tabs-context";
import type { CaseDraft } from "../types";
import { EVAL_TS_MESSAGE, EVAL_TS_PATTERN } from "./useSimulation";

export interface CaseEditModalProps {
  /** 고칠 값 — null 이면 닫혀 있다. caseId 가 null 이면 새 케이스. */
  draft: CaseDraft | null;
  busy: boolean;
  /** 저장 실패 문구(훅의 error). */
  error: string | null;
  onSave(d: CaseDraft): Promise<boolean>;
  onClose(): void;
  /** 본문 위에 보일 안내 한 줄(예: 내 DRAFT 로 돌린 결과를 기대값으로 채웠다). 없으면 그리지 않는다. */
  note?: string | null;
}

type FieldErrors = Partial<Record<"caseName" | "inputJson" | "evalTs" | "expectedJson", string>>;

const NAME_REQUIRED = "케이스 이름을 넣는다";

function objectError(text: string, what: string, required: boolean): string | undefined {
  if (text.trim() === "") return required ? `${what} JSON 을 넣는다` : undefined;
  try {
    parseObject(text.trim(), what);
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 저장 전 확인 — 칸마다 오류 문구. */
export function caseDraftErrors(d: CaseDraft): FieldErrors {
  const out: FieldErrors = {};
  if (d.caseName.trim() === "") out.caseName = NAME_REQUIRED;
  const input = objectError(d.inputJson, "입력", true);
  if (input) out.inputJson = input;
  const expected = objectError(d.expectedJson, "기대", false);
  if (expected) out.expectedJson = expected;
  if (d.evalTs.trim() !== "" && !EVAL_TS_PATTERN.test(d.evalTs.trim())) out.evalTs = EVAL_TS_MESSAGE;
  return out;
}

const label = { display: "block", margin: "var(--spacing-sm) 0 2px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" } as const;
const mono = { fontFamily: "var(--font-family-mono)" } as const;

export function CaseEditModal({ draft, busy, error, onSave, onClose, note }: CaseEditModalProps) {
  // 팝업은 body 로 포털되어 숨은 세트 탭(패널 display:none)을 따라 숨지 않는다 — 고른 탭일 때만 그린다. 작성 중인 칸(f)은 이 부품에 남아 탭을 다시 고르면 이어진다.
  const active = useContext(EditorActiveContext);
  const [f, setF] = useState<CaseDraft | null>(draft);
  const [errors, setErrors] = useState<FieldErrors>({});
  /** 서버에 저장을 보냈는가 — 보낸 뒤에만 훅의 오류 문구를 보인다(앞선 다른 실패 문구를 이 팝업의 것으로 보이지 않게). */
  const [sent, setSent] = useState(false);

  // 팝업을 열 때(draft 가 바뀔 때)만 칸을 채운다.
  useEffect(() => {
    setF(draft);
    setErrors({});
    setSent(false);
  }, [draft]);

  const set = (k: keyof Pick<CaseDraft, "caseName" | "inputJson" | "evalTs" | "expectedJson" | "description">) => (v: string) =>
    setF((prev) => (prev ? { ...prev, [k]: v } : prev));

  const save = async () => {
    if (!f) return;
    const errs = caseDraftErrors(f);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSent(true);
    if (await onSave({ ...f, inputJson: f.inputJson.trim(), expectedJson: f.expectedJson.trim() })) onClose();
  };

  const title = draft?.caseId != null ? `테스트 케이스 고치기 · #${draft.caseId}` : "테스트 케이스 저장";

  return (
    <Modal
      open={draft != null && active}
      title={title}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button data-testid="case-modal-cancel" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" data-testid="case-modal-save" disabled={busy || !f} onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      {f && (
        <div data-testid="case-modal">
          {note && (
            <p className="rsf-panel-note" data-testid="case-edit-draft-note">
              {note}
            </p>
          )}
          <label style={label}>이름</label>
          <Input data-testid="case-modal-name" data-autofocus value={f.caseName} error={errors.caseName} onChange={set("caseName")} />
          <label style={label}>설명</label>
          <Input data-testid="case-modal-desc" value={f.description} placeholder="(없음)" onChange={set("description")} />
          <label style={label}>입력 JSON</label>
          <Textarea data-testid="case-modal-input" rows={4} style={mono} value={f.inputJson} error={errors.inputJson} onChange={set("inputJson")} />
          <label style={label}>판정 시각</label>
          <Input
            data-testid="case-modal-evalts"
            value={f.evalTs}
            placeholder="yyyy-MM-dd HH:mm:ss (비우면 실행 시각)"
            error={errors.evalTs}
            onChange={set("evalTs")}
          />
          <label style={label}>기대 JSON (결과 변수만 적는다. 비우면 기대값 없이 실행만 한다)</label>
          <Textarea data-testid="case-modal-expected" rows={5} style={mono} value={f.expectedJson} error={errors.expectedJson} onChange={set("expectedJson")} />
          {sent && error && (
            <p data-testid="case-modal-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
