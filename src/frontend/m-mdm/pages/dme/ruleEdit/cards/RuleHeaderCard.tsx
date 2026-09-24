"use client";

/**
 * 카드 ① 헤더(TSK-08-02 design §6.7.1). 룰명·설명·활용처 메모를 바로 저장한다(버전과 무관, 06:913).
 * 편집은 서버가 판정한 `headerEditable`(D6)만으로 켠다. 폐기는 INUSE 일 때만 보이고 두 번 눌러야 한다(06:766).
 */
import { useEffect, useMemo, useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Input, Textarea } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { deprecateRule, saveHeader, type HeaderForm } from "../api";
import type { RuleEditCardProps } from "../cards";
import { CardFrame } from "./CardFrame";

const KIND_LABEL: Record<string, string> = { DECISION: "판정(DECISION)", DERIVE: "산출(DERIVE)" };
const STATUS_LABEL: Record<string, string> = { CREATED: "작성", INUSE: "사용 중", DEPRECATED: "폐기" };

function formOf(view: RuleEditCardProps["view"]): HeaderForm {
  return {
    maruRuleName: view.rule.maruRuleName ?? "",
    description: view.rule.description ?? "",
    usageNote: view.rule.usageNote ?? "",
  };
}

export function RuleHeaderCard({ view, runWrite, setDirty, canDo, busy }: RuleEditCardProps) {
  const rule = view.rule;
  const initial = useMemo(() => formOf(view), [view]);
  const [form, setForm] = useState<HeaderForm>(initial);
  const [confirmDeprecate, setConfirmDeprecate] = useState(false);

  useEffect(() => {
    setForm(initial);
    setConfirmDeprecate(false);
  }, [initial]);

  const changed =
    form.maruRuleName !== initial.maruRuleName || form.description !== initial.description || form.usageNote !== initial.usageNote;
  useEffect(() => {
    setDirty("header", changed);
  }, [changed, setDirty]);

  const external = rule.sourceKind !== "MDM";
  const editable = view.headerEditable && !external;
  const canSave = editable && !!form.maruRuleName.trim() && canDo("save") && !busy;
  const canDeprecate = editable && !view.unappliedVersionExists && canDo("delete") && !busy;
  const set = (key: keyof HeaderForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <CardFrame
      title="① 헤더"
      testId="rule-card-header"
      right={
        <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
          <span style={badgeStyle(rule.status === "INUSE" ? "success" : rule.status === "DEPRECATED" ? "muted" : "neutral")}>
            {STATUS_LABEL[rule.status] ?? rule.status}
          </span>
          <span style={badgeStyle("neutral")}>{KIND_LABEL[rule.ruleKind] ?? rule.ruleKind}</span>
        </span>
      }
    >
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>룰 ID</th>
            <td style={DETAIL_VALUE_CELL} data-testid="rule-header-id">
              {rule.maruRuleId}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>룰명 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="rule-header-name"
                value={form.maruRuleName}
                disabled={!editable || busy}
                onChange={(v) => set("maruRuleName", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea
                data-testid="rule-header-description"
                value={form.description}
                rows={2}
                disabled={!editable || busy}
                onChange={(v) => set("description", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>활용처 메모</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea
                data-testid="rule-header-usage"
                value={form.usageNote}
                rows={2}
                disabled={!editable || busy}
                onChange={(v) => set("usageNote", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>원천</th>
            <td style={DETAIL_VALUE_CELL} data-testid="rule-header-source">
              {external ? `EXTERNAL · ${rule.sourceSystem ?? ""}` : "MDM"}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--spacing-xs)", paddingTop: "var(--spacing-sm)" }}>
        {rule.status === "INUSE" &&
          (confirmDeprecate ? (
            <>
              <Button variant="danger" disabled={!canDeprecate} onClick={() => void runWrite(() => deprecateRule(rule.maruRuleId), () => null)}>
                폐기 확인
              </Button>
              <Button onClick={() => setConfirmDeprecate(false)}>취소</Button>
            </>
          ) : (
            <Button disabled={!canDeprecate} onClick={() => setConfirmDeprecate(true)}>
              폐기
            </Button>
          ))}
        <Button variant="primary" disabled={!canSave} onClick={() => void runWrite(() => saveHeader(rule.maruRuleId, form))}>
          헤더 저장
        </Button>
      </div>
    </CardFrame>
  );
}
