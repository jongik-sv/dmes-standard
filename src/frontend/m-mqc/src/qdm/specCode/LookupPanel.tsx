"use client";

/**
 * 간편조회 탭 — 규격코드·강종코드를 한 번에 넣고 두께관리기준(BMT/TCT)과 원판강종코드를 함께 본다(lookup.ts).
 * 결과 카드는 값·적용 기준(룰 ID)·조건 문장을 보인다. 적중이 없으면 「해당 없음」. 카드를 누르면 그 룰이 Maru 편집 대상이 된다.
 */
import { memo, useId, useMemo, useRef, useState } from "react";

import {
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { Badge, Button, Input } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import {
  DashboardCell,
  DashboardGrid,
  KpiTile,
} from "@dk-oasis/shared/dashboard";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";
import {
  formatResult,
  JUDGE_STATUS_LABEL,
  judgeRule,
  NA_TEXT,
  useCodes,
  type CodeSet,
  type RuleScreenContext,
} from "@/common/rule";

import {
  BASE_GRADE_RULE,
  LOOKUP_RULES,
  lookupFields,
  runLookup,
  THK_STD_RULE,
  type LookupItem,
} from "./lookup";

/** 처음 넣어 둘 값 — 프로토타입 간편조회 기본값. */
const DEFAULT_VALUES: Record<string, string> = {
  SPEC_ORG_CD: "KS",
  STL_GRD_CD: "CGCC",
};

const THK_STD_CODE = "QC_THK_STD";
const CODE_IDS = [THK_STD_CODE];

/** Maru 코드 항목이 없을 때의 두께관리기준 설명(프로토타입 코드 범례). */
const THK_STD_FALLBACK: Record<string, string> = {
  BMT: "Base Metal Thickness — 소지철(원판) 두께 기준",
  TCT: "Total Coated Thickness — 도금 포함 두께 기준",
};

/** 두께관리기준 설명 — Maru 코드(QC_THK_STD) 이름, 없으면 기본 설명. */
export function thkStdText(code: string, codes: readonly CodeSet[]): string {
  const item = codes
    .find((c) => c.codeId === THK_STD_CODE)
    ?.items.find((i) => i.code === code);
  return item?.name || THK_STD_FALLBACK[code] || "";
}

interface CardSpec {
  ruleId: string;
  title: string;
  resultVar: string;
  resultLabel: string;
}

const CARDS: CardSpec[] = [
  {
    ruleId: THK_STD_RULE,
    title: "규격코드 → 두께관리기준",
    resultVar: "THK_STD_CD",
    resultLabel: "두께관리기준",
  },
  {
    ruleId: BASE_GRADE_RULE,
    title: "규격코드 + 강종코드 → 원판강종코드",
    resultVar: "BASE_STL_GRD_CD",
    resultLabel: "원판강종코드",
  },
];

export const LookupPanel = memo(function LookupPanel({
  screenId,
  rules,
  loading,
  evalTs,
  canJudge,
  focusRule,
  display,
}: RuleScreenContext) {
  const { showMessage } = useMessage();
  const idBase = useId();
  const fields = useMemo(() => lookupFields(LOOKUP_RULES, rules), [rules]);
  const [values, setValues] = useState<Record<string, string>>(DEFAULT_VALUES);
  const [items, setItems] = useState<LookupItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0);
  const { codes } = useCodes(CODE_IDS);
  const inputId = (name: string) => `${idBase}-${name}`;

  const changeValue = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));
  const clear = () => {
    runRef.current += 1;
    setValues({});
    setItems(null);
    setBusy(false);
  };

  const run = async () => {
    const id = ++runRef.current;
    setBusy(true);
    try {
      const out = await runLookup(
        LOOKUP_RULES,
        rules,
        values,
        judgeRule,
        evalTs,
        display,
      );
      if (id === runRef.current) setItems(out);
    } catch (e) {
      if (id === runRef.current)
        showMessage({
          title: "오류",
          message: errorMessage(e),
          alertType: "error",
        });
    } finally {
      if (id === runRef.current) setBusy(false);
    }
  };

  return (
    <DashboardGrid fill ariaLabel="간편조회" testId={`${screenId}-lookup`}>
      <DashboardCell span={4}>
        <CardFrame title="입력" testId={`${screenId}-lookup-input`}>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              {fields.map((f) => (
                <tr key={f.name}>
                  <th style={DETAIL_LABEL_CELL}>
                    <label
                      htmlFor={inputId(f.name)}
                      title={`Maru 변수 ${f.name}`}
                    >
                      {f.label}
                    </label>
                  </th>
                  <td style={DETAIL_VALUE_CELL}>
                    <Input
                      id={inputId(f.name)}
                      data-testid={`${screenId}-lookup-${f.name}`}
                      value={values[f.name] ?? ""}
                      onChange={(v) => changeValue(f.name, v)}
                      placeholder="비우면 빈 값"
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={DETAIL_VALUE_CELL}>
                  <Button
                    variant="primary"
                    data-testid={`${screenId}-lookup-run`}
                    onClick={() => void run()}
                    disabled={busy || loading || !canJudge}
                    title={!canJudge ? "판정 권한이 없습니다" : undefined}
                  >
                    조회
                  </Button>{" "}
                  <Button
                    variant="default"
                    data-testid={`${screenId}-lookup-clear`}
                    onClick={clear}
                  >
                    입력 지우기
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
          <MutedText>
            예: 규격 KS · 강종 CGCC → 두께관리기준 BMT, 원판강종 SGCC. 규격 BIS
            는 두께관리기준이 미정이라 등록하지 않아 조회 결과가 없습니다.
          </MutedText>
        </CardFrame>
      </DashboardCell>
      {CARDS.map((card) => {
        const item = items?.find((i) => i.ruleId === card.ruleId);
        const matched = item?.result.status === "MATCHED";
        const value = item
          ? formatResult(
              display,
              card.resultVar,
              item.result.results[card.resultVar],
              item.result.results,
            )
          : NA_TEXT;
        const desc =
          card.ruleId === THK_STD_RULE && matched
            ? thkStdText(value, codes)
            : "";
        return (
          <DashboardCell key={card.ruleId} span={4}>
            <CardFrame
              title={card.title}
              testId={`${screenId}-lookup-card-${card.ruleId}`}
              right={
                item ? (
                  <Badge
                    label={
                      matched ? "적용" : JUDGE_STATUS_LABEL[item.result.status]
                    }
                    tone={matched ? "success" : "warning"}
                  />
                ) : null
              }
            >
              {!item ? (
                <MutedText>입력을 넣고 [조회] 를 누르세요.</MutedText>
              ) : (
                <>
                  <KpiTile
                    label={card.resultLabel}
                    value={matched ? value : "해당 없음"}
                    target={
                      matched
                        ? `${desc ? `${desc} · ` : ""}적용 기준 ${item.ruleKey ?? NA_TEXT} · 조건 ${item.condition ?? NA_TEXT}`
                        : (item.result.message ?? "조건에 맞는 기준이 없습니다")
                    }
                    warn={!matched}
                    warnLabel={matched ? undefined : "해당 없음"}
                    testId={`${screenId}-lookup-value-${card.ruleId}`}
                  />{" "}
                  <Button
                    variant="default"
                    onClick={() => focusRule(card.ruleId)}
                    data-testid={`${screenId}-lookup-focus-${card.ruleId}`}
                  >
                    Maru 편집 대상으로
                  </Button>
                </>
              )}
            </CardFrame>
          </DashboardCell>
        );
      })}
    </DashboardGrid>
  );
});
