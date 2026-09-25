"use client";

/**
 * 룰 세트 등록 폼(TSK-08-06 design §6.11). 빈 세트(INUSE, 룰 없음) 한 행만 만들고 룰은 편집 화면에서 담는다.
 * 세트 ID 는 컬럼 물리명 규칙을 즉시 안내하고 어기면 저장을 막는다(서버가 다시 판정한다, I1).
 * 저장에 성공하면 룰 세트 편집 탭을 그 세트로 연다(I22).
 */
import { useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Input, Textarea } from "@dk-oasis/shared/form";
import { openMdmPage } from "@/shell";

import { registerSet } from "../api";
import { SET_NAME_MAX, emptyRegForm, setIdError, type RuleSetRegForm } from "../types";

export interface RuleSetRegisterFormProps {
  /** 등록(action reg) 권한. 없으면 버튼을 숨기지 않고 비활성으로 둔다. */
  canRegister: boolean;
  onRegistered: (setId: string) => void;
  onError: (message: string) => void;
}

export function RuleSetRegisterForm({ canRegister, onRegistered, onError }: RuleSetRegisterFormProps) {
  const [form, setForm] = useState<RuleSetRegForm>(emptyRegForm);
  const [busy, setBusy] = useState(false);

  const idError = form.setId === "" ? null : setIdError(form.setId);
  const nameError = form.setName.length > SET_NAME_MAX ? `세트명은 ${SET_NAME_MAX}자 이하입니다` : null;
  const ready = !!form.setId && !idError && !!form.setName.trim() && !nameError;

  const set = (key: keyof RuleSetRegForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleRegister = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const result = await registerSet(form);
      const setId = result.setId ?? form.setId.trim();
      setForm(emptyRegForm());
      onRegistered(setId);
      openMdmPage("dme/ruleSetEdit", { setId });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="set-register-form">
      <p style={{ padding: "var(--spacing-sm) var(--spacing-md)", fontWeight: 600 }}>룰 세트 등록</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>세트 ID *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="set-reg-id"
                value={form.setId}
                placeholder="LS_A3"
                disabled={busy}
                aria-invalid={!!idError}
                onChange={(v) => set("setId", v)}
              />
              {idError ? (
                <span data-testid="set-reg-id-error" className="form-error-message" role="alert">
                  {idError}
                </span>
              ) : (
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                  컬럼 물리명 규칙을 따르는 전역 이름
                </span>
              )}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>세트명 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="set-reg-name"
                value={form.setName}
                disabled={busy}
                error={nameError ?? undefined}
                onChange={(v) => set("setName", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea
                data-testid="set-reg-desc"
                value={form.description}
                rows={2}
                disabled={busy}
                onChange={(v) => set("description", v)}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ margin: 0, padding: "var(--spacing-sm) var(--spacing-md)", color: "var(--color-text-muted)" }}>
        TB_MDM_RULE_SET 한 행(INUSE, 룰 없음)을 만들고 세트 편집으로 간다. 룰은 편집 화면에서 담는다.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "var(--spacing-sm) var(--spacing-md)" }}>
        <Button
          data-testid="set-reg-save"
          variant="primary"
          disabled={!ready || busy || !canRegister}
          onClick={() => void handleRegister()}
        >
          저장
        </Button>
      </div>
    </div>
  );
}
