"use client";

/**
 * 테스트 케이스 수정 팝업(카드 ⑥) — 이름·설명·입력 JSON·기대 JSON 을 고쳐 part CASE 로 저장한다(caseId·rowVersion 조건, MDM001).
 * 기대를 비우면 "기대값 없음"(돌려 보기만) 케이스가 된다. "값 테스트 입력 넣기" 는 카드 ④ 의 지금 입력으로 입력 JSON 을 바꾼다.
 */
import { useEffect, useState } from "react";

import { Button, Input, Textarea } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { TestCaseView } from "../types";
import { caseEditError, type CaseEditFields } from "../value-test/case-model";

export interface TestCaseEditModalProps {
  /** 고칠 케이스 — null 이면 닫혀 있다. */
  target: TestCaseView | null;
  /**
   * 팝업을 열 때 채울 값. 카드 ⑥ 가 지금 계약의 없는 키를 null 로 채운 입력을 넘긴다 —
   * 룰에 컬럼이 새로 들어온 뒤에도 그 컬럼이 빈 칸으로 보인다.
   */
  initial: CaseEditFields | null;
  /** 카드 ④ 의 지금 입력 JSON(같은 룰일 때만). */
  currentInput: string | null;
  busy: boolean;
  onSave: (c: TestCaseView, f: CaseEditFields) => Promise<boolean>;
  onClose: () => void;
}

const label = { display: "block", margin: "var(--spacing-sm) 0 2px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" } as const;
const mono = { fontFamily: "var(--font-family-mono)" } as const;

export function TestCaseEditModal({ target, initial, currentInput, busy, onSave, onClose }: TestCaseEditModalProps) {
  const [f, setF] = useState<CaseEditFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setF(target && initial ? { ...initial } : null);
    setError(null);
  }, [target, initial]);

  const set = (k: keyof CaseEditFields) => (v: string) => setF((prev) => (prev ? { ...prev, [k]: v } : prev));
  const save = async () => {
    if (!target || !f) return;
    const err = caseEditError(f);
    setError(err);
    if (!err && (await onSave(target, f))) onClose();
  };

  return (
    <Modal
      open={target != null}
      title={target ? `테스트 케이스 수정 · #${target.caseId}` : "테스트 케이스 수정"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={busy || !f} data-testid="tc-edit-save" onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      {f && (
        <div data-testid="tc-edit-modal">
          <label style={label}>이름</label>
          <Input data-testid="tc-edit-name" data-autofocus value={f.caseName} onChange={set("caseName")} />
          <label style={label}>설명</label>
          <Input data-testid="tc-edit-desc" value={f.description} placeholder="(없음)" onChange={set("description")} />
          <span style={{ ...label, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            입력 JSON
            <Button size="sm" disabled={!currentInput} data-testid="tc-edit-use-input" onClick={() => currentInput && set("inputJson")(currentInput)}>
              값 테스트 입력 넣기
            </Button>
          </span>
          <Textarea data-testid="tc-edit-input" rows={4} style={mono} value={f.inputJson} onChange={set("inputJson")} />
          <label style={label}>기대 JSON (비우면 기대값 없이 돌려 보기만 한다)</label>
          <Textarea data-testid="tc-edit-expected" rows={3} style={mono} value={f.expectedJson} onChange={set("expectedJson")} />
          {error && (
            <p data-testid="tc-edit-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
