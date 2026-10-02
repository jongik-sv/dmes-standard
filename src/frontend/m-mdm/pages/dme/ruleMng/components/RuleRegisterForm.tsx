"use client";

/**
 * 룰 등록 팝업 본문(TSK-08-02 design §2.1-FM). 목록 헤더의 [룰 등록]이 여는 팝업 안에 들어간다 — 팝업을 열 때마다
 * 새로 마운트되어 칸이 빈 채로 시작한다. 원천은 MDM 고정이라 고르는 칸이 없다(수용 2, D11).
 * 룰 ID 는 컬럼 물리명 규칙을 즉시 안내하고 어기면 저장을 막는다(수용 1 — 서버가 다시 판정한다).
 * 저장에 성공하면 룰 화면 탭을 열어 버전 1 DRAFT(자동 선점)를 보인다.
 */
import { useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { openRuleEdit } from "@/dme/rule-handoff";

import { registerRule } from "../api";
import { RULE_KIND_LABELS, RULE_NAME_MAX, emptyRegForm, ruleIdError, type RuleKind, type RuleRegForm } from "../types";

export interface RuleRegisterFormProps {
  /** 등록(action reg) 권한. 없으면 버튼을 숨기지 않고 비활성으로 둔다(§6.7.0). */
  canRegister: boolean;
  onRegistered: (ruleId: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

const KIND_OPTIONS = (Object.keys(RULE_KIND_LABELS) as RuleKind[]).map((k) => ({ value: k, label: RULE_KIND_LABELS[k] }));

export function RuleRegisterForm({ canRegister, onRegistered, onCancel, onError }: RuleRegisterFormProps) {
  const [form, setForm] = useState<RuleRegForm>(emptyRegForm);
  const [busy, setBusy] = useState(false);

  const idError = form.maruRuleId === "" ? null : ruleIdError(form.maruRuleId);
  const nameError = form.maruRuleName.length > RULE_NAME_MAX ? `룰명은 ${RULE_NAME_MAX}자 이하입니다` : null;
  const ready = !!form.maruRuleId && !idError && !!form.maruRuleName.trim() && !nameError;

  const set = (key: keyof RuleRegForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleRegister = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const result = await registerRule(form);
      const ruleId = result.maruRuleId ?? form.maruRuleId.trim();
      onRegistered(ruleId);
      openRuleEdit(ruleId, result.ver ?? "1.000");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="rule-register-form">
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>룰 ID *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="rule-reg-id"
                value={form.maruRuleId}
                placeholder="QLTY_GRD_JDG"
                disabled={busy}
                error={idError ?? undefined}
                onChange={(v) => set("maruRuleId", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>룰명 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="rule-reg-name"
                value={form.maruRuleName}
                disabled={busy}
                error={nameError ?? undefined}
                onChange={(v) => set("maruRuleName", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>종류 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                data-testid="rule-reg-kind"
                value={form.ruleKind}
                options={KIND_OPTIONS}
                disabled={busy}
                onChange={(v) => set("ruleKind", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>원천</th>
            <td style={DETAIL_VALUE_CELL}>
              <span data-testid="rule-reg-source">MDM (등록은 MDM 원천만 받는다)</span>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea
                data-testid="rule-reg-description"
                value={form.description}
                rows={2}
                disabled={busy}
                onChange={(v) => set("description", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>활용처 메모</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea
                data-testid="rule-reg-usage"
                value={form.usageNote}
                rows={2}
                disabled={busy}
                onChange={(v) => set("usageNote", v)}
              />
            </td>
          </tr>
        </tbody>
      </table>
      {/* 버튼을 팝업 footer 가 아닌 이 틀 안에 둔다 — e2e 가 `rule-register-form` 안에서 [등록]을 찾는다. */}
      <div
        style={{ display: "flex", justifyContent: "flex-end", gap: "var(--spacing-xs)", padding: "var(--spacing-sm) var(--spacing-md)" }}
      >
        <Button data-testid="rule-reg-cancel" disabled={busy} onClick={onCancel}>
          취소
        </Button>
        <Button
          data-testid="rule-reg-submit"
          variant="primary"
          disabled={!ready || busy || !canRegister}
          onClick={() => void handleRegister()}
        >
          등록
        </Button>
      </div>
    </div>
  );
}
