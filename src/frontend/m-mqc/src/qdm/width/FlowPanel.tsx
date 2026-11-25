"use client";

/**
 * 폭 룰 공정 합산 탭 — 폭수축량 「공정 흐름」(chain)과 폭마진량 「공정별 마진」(parallel)이 함께 쓴다(flow.ts).
 * 시작 폭과 공정 공통 입력을 넣고 공정을 판정해 공정별 양·합·최종 폭을 보인다.
 * 단계 카드(공정별 양·폭 변화)와 합산 카드, 단계별 산출 근거 표. 표의 행을 누르면 그 공정 룰이 Maru 편집 대상이 된다.
 */
import { memo, useCallback, useId, useMemo, useRef, useState } from "react";

import {
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
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
  checkJudgeInput,
  DECIMAL,
  JUDGE_STATUS_LABEL,
  judgeRule,
  NA_TEXT,
  ruleTitle,
  signedNumber,
  type JudgeStatus,
  type RuleScreenContext,
} from "@/common/rule";

import {
  flowFields,
  flowSteps,
  runFlow,
  type FlowMode,
  type FlowResult,
} from "./flow";

/** 화면 문구 — 모드마다. */
interface FlowText {
  ariaLabel: string;
  start: string;
  amount: string;
  total: string;
  inWidth: string;
  outWidth: string;
  final: string;
  run: string;
  note: string;
  empty: string;
}

const TEXT: Record<FlowMode, FlowText> = {
  chain: {
    ariaLabel: "공정 흐름",
    start: "원자재 폭",
    amount: "수축량",
    total: "합산 폭수축량",
    inWidth: "진입 폭",
    outWidth: "출측 폭",
    final: "최종 폭",
    run: "합산 계산",
    note: "각 공정은 앞 공정을 나간 폭으로 판정합니다. 맞는 행이 없는 공정의 수축량은 0 입니다.",
    empty: "원자재 폭과 입력을 넣고 [합산 계산] 을 누르세요.",
  },
  parallel: {
    ariaLabel: "공정별 마진",
    start: "주문 폭",
    amount: "마진폭",
    total: "합산 마진폭",
    inWidth: "주문 폭",
    outWidth: "제품 폭",
    final: "제품 폭",
    run: "합산 계산",
    note: "공정마다 같은 주문 폭으로 따로 판정합니다. 폭 조건이 없는 공정(정전)은 폭 없이 판정합니다. 맞는 행이 없는 공정의 마진폭은 0 입니다.",
    empty: "주문 폭과 입력을 넣고 [합산 계산] 을 누르세요.",
  },
};

const DEFAULT_START_WIDTH = "1000";
const START_KEY = "__startWidth";

const STATUS_STYLE: Record<
  JudgeStatus,
  { bg?: string; color?: string; muted?: boolean }
> = {
  MATCHED: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  NO_MATCH: { muted: true },
  INPUT_ERROR: {
    bg: "var(--color-warning-soft)",
    color: "var(--color-warning)",
  },
  RULE_NOT_FOUND: {
    bg: "var(--color-warning-soft)",
    color: "var(--color-warning)",
  },
  UNAVAILABLE: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

function buildColumns(t: FlowText): GridColumn[] {
  return [
    {
      key: "no",
      header: "단계",
      width: 60,
      align: "right",
      type: "number",
      meta: false,
    },
    { key: "label", header: "공정", width: 80, align: "center", meta: false },
    {
      key: "ruleId",
      header: "업무기준",
      width: 100,
      align: "left",
      meta: false,
    },
    {
      key: "ruleKey",
      header: "적용 룰",
      width: 120,
      align: "left",
      meta: false,
    },
    { key: "seq", header: "순번", width: 64, align: "right", meta: false },
    {
      key: "inWidth",
      header: `${t.inWidth}(mm)`,
      width: 110,
      align: "right",
      type: "number",
      meta: false,
    },
    {
      key: "outWidth",
      header: `${t.outWidth}(mm)`,
      width: 110,
      align: "right",
      type: "number",
      meta: false,
    },
    {
      key: "amount",
      header: `${t.amount}(mm)`,
      width: 100,
      align: "right",
      meta: false,
    },
    {
      key: "status",
      header: "산출 근거",
      width: 120,
      align: "center",
      meta: false,
      render: (v) => {
        const status = v as JudgeStatus;
        const s = STATUS_STYLE[status];
        return (
          <GridBadge
            label={
              status === "NO_MATCH"
                ? "해당 없음(0)"
                : status === "MATCHED"
                  ? "적용"
                  : JUDGE_STATUS_LABEL[status]
            }
            bg={s.bg}
            color={s.color}
            muted={s.muted}
          />
        );
      },
    },
  ];
}

const COLUMNS: Record<FlowMode, GridColumn[]> = {
  chain: buildColumns(TEXT.chain),
  parallel: buildColumns(TEXT.parallel),
};

export interface FlowPanelProps extends RuleScreenContext {
  /** chain(공정 흐름) 또는 parallel(공정별 마진). 기본 chain. */
  mode?: FlowMode;
}

export const FlowPanel = memo(function FlowPanel({
  screenId,
  rules,
  groups,
  loading,
  evalTs,
  canJudge,
  focusRule,
  display,
  mode = "chain",
}: FlowPanelProps) {
  const { showMessage } = useMessage();
  const idBase = useId();
  const t = TEXT[mode];
  const steps = useMemo(() => flowSteps(groups), [groups]);
  const fields = useMemo(() => flowFields(steps, rules), [steps, rules]);
  const [values, setValues] = useState<Record<string, string>>({
    [START_KEY]: DEFAULT_START_WIDTH,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<FlowResult | null>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0);
  const inputId = (name: string) => `${idBase}-${name}`;

  const changeValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
  };
  const clear = () => {
    runRef.current += 1;
    setValues({ [START_KEY]: DEFAULT_START_WIDTH });
    setErrors({});
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    const found = checkJudgeInput(fields, values);
    const start = (values[START_KEY] ?? "").trim();
    if (!DECIMAL.test(start))
      found[START_KEY] =
        start === ""
          ? `${t.start} 값이 없습니다`
          : `${t.start} 값이 숫자가 아닙니다: ${start}`;
    setErrors(found);
    const first = [START_KEY, ...fields.map((f) => f.name)].find(
      (k) => found[k],
    );
    if (first) {
      document.getElementById(inputId(first))?.focus();
      return;
    }
    const id = ++runRef.current;
    setBusy(true);
    try {
      const flow = await runFlow(
        steps,
        rules,
        values,
        Number(start),
        judgeRule,
        evalTs,
        undefined,
        mode,
        display,
      );
      if (id === runRef.current) setResult(flow);
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

  const gridRows = useMemo(
    () =>
      (result?.steps ?? []).map((s, i) => ({
        key: s.step.key,
        no: i + 1,
        label: s.step.label,
        ruleId: s.step.ruleId,
        ruleKey: s.ruleKey ?? NA_TEXT,
        seq: s.hits[0] ? String(s.hits[0].seq) : NA_TEXT,
        inWidth: s.widthVar || mode === "chain" ? s.inWidth : NA_TEXT,
        outWidth: s.outWidth,
        amount: signedNumber(String(s.amount)),
        status: s.status,
      })),
    [result, mode],
  );
  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => focusRule(String(row.ruleId)),
    [focusRule],
  );
  const tileSpan = steps.length + 1 <= 4 ? 4 : steps.length + 1 <= 6 ? 2 : 3;

  return (
    <DashboardGrid fill ariaLabel={t.ariaLabel} testId={`${screenId}-flow`}>
      <DashboardCell span={4}>
        <CardFrame title="입력" testId={`${screenId}-flow-input`}>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>
                  <label htmlFor={inputId(START_KEY)}>{t.start} (mm) *</label>
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    id={inputId(START_KEY)}
                    data-testid={`${screenId}-flow-start`}
                    value={values[START_KEY] ?? ""}
                    onChange={(v) => changeValue(START_KEY, v)}
                    error={errors[START_KEY] || undefined}
                    inputMode="decimal"
                  />
                </td>
              </tr>
              {fields.map((f) => (
                <tr key={f.name}>
                  <th style={DETAIL_LABEL_CELL}>
                    <label
                      htmlFor={inputId(f.name)}
                      title={`Maru 변수 ${f.name}`}
                    >
                      {f.label}
                      {f.unit ? ` (${f.unit})` : ""}
                    </label>
                  </th>
                  <td style={DETAIL_VALUE_CELL}>
                    <Input
                      id={inputId(f.name)}
                      data-testid={`${screenId}-flow-${f.name}`}
                      value={values[f.name] ?? ""}
                      onChange={(v) => changeValue(f.name, v)}
                      error={errors[f.name] || undefined}
                      inputMode={f.numeric ? "decimal" : undefined}
                      placeholder={f.numeric ? "숫자" : "비우면 빈 값"}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={DETAIL_VALUE_CELL}>
                  <Button
                    variant="primary"
                    data-testid={`${screenId}-flow-run`}
                    onClick={() => void run()}
                    disabled={
                      busy || loading || !canJudge || steps.length === 0
                    }
                    title={!canJudge ? "판정 권한이 없습니다" : undefined}
                  >
                    {t.run}
                  </Button>{" "}
                  <Button
                    variant="default"
                    data-testid={`${screenId}-flow-clear`}
                    onClick={clear}
                  >
                    입력 지우기
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
          <MutedText>{t.note}</MutedText>
        </CardFrame>
      </DashboardCell>
      <DashboardCell span={8}>
        <CardFrame
          title="결과"
          testId={`${screenId}-flow-result`}
          right={
            result ? (
              <Badge
                label={`적중 ${result.matched} / ${result.steps.length} 공정`}
                tone={
                  result.matched === result.steps.length ? "success" : "warning"
                }
              />
            ) : null
          }
        >
          {!result ? (
            <MutedText>{t.empty}</MutedText>
          ) : (
            <DashboardGrid ariaLabel={`공정별 ${t.amount}`}>
              {result.steps.map((s, i) => (
                <DashboardCell key={s.step.key} span={tileSpan}>
                  <KpiTile
                    label={`${mode === "chain" ? `${i + 1}단계 ` : ""}${s.step.label} · ${ruleTitle(s.step.ruleId)}`}
                    value={
                      s.status === "MATCHED"
                        ? signedNumber(String(s.amount))
                        : NA_TEXT
                    }
                    unit={s.status === "MATCHED" ? "mm" : undefined}
                    target={
                      s.status === "MATCHED"
                        ? `${s.ruleKey ?? `행 ${s.hits[0]?.rowId ?? NA_TEXT}`} · ${s.widthVar ? `${s.inWidth} → ${s.outWidth} mm` : "폭 조건 없음"}`
                        : `${t.amount} 0 으로 봅니다`
                    }
                    warn={s.status !== "MATCHED"}
                    warnLabel={
                      s.status === "NO_MATCH"
                        ? "해당 룰 없음"
                        : JUDGE_STATUS_LABEL[s.status]
                    }
                    testId={`${screenId}-flow-step-${s.step.key}`}
                  />
                </DashboardCell>
              ))}
              <DashboardCell span={tileSpan}>
                <KpiTile
                  label={t.total}
                  value={signedNumber(String(result.total))}
                  unit="mm"
                  target={
                    mode === "chain"
                      ? `${t.final} ${result.finalWidth} mm`
                      : `${t.start} ${result.startWidth} → ${t.final} ${result.finalWidth} mm`
                  }
                  testId={`${screenId}-flow-total`}
                />
              </DashboardCell>
              <DashboardCell span={12}>
                <AgDataGrid
                  gridId="flowSteps"
                  title="단계별 산출 근거"
                  rowKey="key"
                  columns={COLUMNS[mode]}
                  data={gridRows}
                  columnSizing="fit"
                  height="auto"
                  settingsMenu={false}
                  personalize={false}
                  onRowClick={handleRowClick}
                />
              </DashboardCell>
            </DashboardGrid>
          )}
        </CardFrame>
      </DashboardCell>
    </DashboardGrid>
  );
});
