"use client";

/**
 * 식 입력 칸(TSK-08-03 design §2.1) — 열 설정의 열 조건(grp_cond)·산출 결과 식과 그리드 Expression 셀이 함께 쓴다.
 * 자동완성(datalist, view `varCandidates`), 500ms 디바운스 서버 파싱(파싱 오류·참조 변수), 화이트리스트 밖 함수는
 * "서버 평가로 넘긴다" 표시, 미리보기 입력이 있으면 서버가 준 AST 를 화면 evalex 로 즉시 평가한다. 화면은 식을 파싱하지 않는다.
 */
import { useId } from "react";

import { Input } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";
import type { EvalValue } from "@/evalex";

import type { ExprSlot } from "../api";
import type { VarCandidate } from "../types";
import { datalistOptions, previewValue, type ParseOutcome } from "./parse-expr";
import { useParseExpr } from "./useParseExpr";

export interface ExprFieldProps {
  value: string;
  onChange: (text: string) => void;
  slot: ExprSlot;
  candidates: readonly VarCandidate[];
  /** 서버 파싱을 켠다 — 편집 가능하고 validate 권한이 있을 때(READ 사용자는 403). */
  parseEnabled: boolean;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
  /** 같은 목록을 여러 칸이 쓸 때 부모가 그린 datalist 의 id. 없으면 이 칸이 자기 것을 그린다. */
  listId?: string;
  /** 파싱 결과를 부모가 모을 때(초안 검사가 참조 변수를 읽는다). */
  onParsed?: (outcome: ParseOutcome) => void;
  /** 미리보기 입력(변수 → 값). 있으면 서버 AST 를 이 값으로 평가해 보인다. */
  previewRecord?: Readonly<Record<string, EvalValue | number>> | null;
}

export function ExprField({
  value,
  onChange,
  slot,
  candidates,
  parseEnabled,
  disabled,
  placeholder,
  testId,
  listId,
  onParsed,
  previewRecord,
}: ExprFieldProps) {
  const ownId = useId();
  const dataListId = listId ?? `expr-candidates-${ownId}`;
  const { status, outcome } = useParseExpr(value, slot, parseEnabled && !disabled, candidates, onParsed);
  const preview = previewRecord && outcome?.result && status.kind !== "error" ? previewValue(outcome.result, previewRecord) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <Input
        data-testid={testId}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        list={dataListId}
        onChange={onChange}
      />
      {!listId && (
        <datalist id={dataListId}>
          {datalistOptions(candidates).map((o) => (
            <option key={o.value} value={o.value} label={o.label} />
          ))}
        </datalist>
      )}
      <div data-testid={testId ? `${testId}-status` : undefined} style={{ fontSize: "var(--font-size-xs)", display: "flex", flexWrap: "wrap", gap: 4 }}>
        {status.kind === "error" && <span style={{ color: "var(--color-danger)" }}>{status.message}</span>}
        {status.kind === "unsupported" && <span style={badgeStyle("warning")}>{status.message}</span>}
        {status.kind !== "error" && status.refVars.length > 0 && (
          <span style={{ color: "var(--color-text-secondary)" }}>참조: {status.refVars.join(", ")}</span>
        )}
        {status.programVars.length > 0 && <span style={badgeStyle("info")}>프로그램 변수: {status.programVars.join(", ")}</span>}
        {preview && (
          <span data-testid={testId ? `${testId}-preview` : undefined} style={preview.kind === "value" ? badgeStyle("success") : badgeStyle("warning")}>
            {preview.kind === "value" ? `= ${preview.text}` : preview.text}
          </span>
        )}
      </div>
    </div>
  );
}
