"use client";

/**
 * 간편판정 탭 — 룰을 고르고 그 룰의 조건 변수로 입력 칸을 만들어 판정한다(qcdRule/judge).
 * 숫자 변수는 값이 있으면 숫자인지 먼저 본다. 입력은 가공하지 않고 보낸다. 결과 카드는 상태·결과 값·근거(룰·버전·적용 행·평가 시각)와
 * 적중 행(COLLECT 면 모두), 앞선 행의 탈락 조건(처음 거짓이 된 변수)을 보인다.
 */
import { memo, useId, useMemo, useRef, useState } from "react";

import {
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Input, type BadgeTone } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import {
  DashboardCell,
  DashboardGrid,
  KpiTile,
} from "@dk-oasis/shared/dashboard";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "../oasis";
import { judgeRule } from "./api";
import {
  leadText,
  rowKeyOf,
  type JudgeTile,
  type RuleDisplay,
} from "./display";
import {
  buildJudgeInput,
  checkJudgeInput,
  failedRows,
  hitRows,
  judgeFields,
  resultEntries,
} from "./judge";
import {
  CATALOG,
  HIT_POLICY_LABEL,
  hitPolicyOf,
  ruleOptions,
  ruleTitle,
  type RuleGroup,
} from "./meta";
import { RulePicker } from "./RulePicker";
import { NA_TEXT } from "./text";
import {
  JUDGE_STATUS_LABEL,
  type JudgeResult,
  type JudgeStatus,
  type RuleView,
} from "./types";

/** 상태 배지 색 — 적중 success, 적중 없음 danger, 그 밖 warning. */
const TONE: Record<JudgeStatus, BadgeTone> = {
  MATCHED: "success",
  NO_MATCH: "danger",
  INPUT_ERROR: "warning",
  UNAVAILABLE: "warning",
  RULE_NOT_FOUND: "warning",
};

const HIT_COLUMNS: GridColumn[] = [
  {
    key: "seq",
    header: "순번",
    width: 64,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "rowId",
    header: "행 ID",
    width: 70,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "condition",
    header: "조건",
    width: 260,
    minWidth: 200,
    align: "left",
    meta: false,
  },
  {
    key: "result",
    header: "결과",
    width: 160,
    minWidth: 120,
    align: "left",
    meta: false,
  },
];

/** 적중 행 열 — 룰 ID 열은 표시 설정에 keyVar 가 있을 때만. */
const HIT_COLUMNS_WITH_KEY: GridColumn[] = [
  ...HIT_COLUMNS.slice(0, 2),
  {
    key: "ruleKey",
    header: "룰 ID",
    width: 110,
    align: "left",
    meta: false,
  },
  ...HIT_COLUMNS.slice(2),
];

const TRACE_COLUMNS: GridColumn[] = [
  {
    key: "seq",
    header: "순번",
    width: 64,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "rowId",
    header: "행 ID",
    width: 70,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "varLabel",
    header: "처음 거짓인 조건",
    width: 140,
    minWidth: 120,
    align: "left",
    meta: false,
  },
  {
    key: "condition",
    header: "그 행의 조건",
    width: 220,
    minWidth: 160,
    align: "left",
    meta: false,
  },
  {
    key: "input",
    header: "넣은 값",
    width: 100,
    minWidth: 80,
    align: "left",
    meta: false,
  },
];

export interface RuleJudgePanelProps {
  rules: RuleView[];
  groups: RuleGroup[];
  /** 처음 고를 룰. */
  initialRuleId: string;
  /** 판정 단추를 막는다(조회 중·권한 없음). */
  disabled: boolean;
  /** 권한이 없어 막았는지(단추 툴팁). */
  denied: boolean;
  /** 평가 시각(조회 조건 기준일). 없으면 지금. */
  evalTs?: string;
  /** 고른 룰을 알린다(Maru 편집 대상). */
  onFocusRule?: (ruleId: string) => void;
  screenId: string;
  /** 결과 표시 설정 — 타일은 업무 결과만, 「적용 룰」 타일과 추가 타일(judgeTiles). */
  display?: RuleDisplay;
}

/** 「적용 룰」 타일 — keyVar 가 있을 때. 적중이 없으면 「해당 없음」. */
function appliedRuleTile(
  result: JudgeResult,
  display: RuleDisplay | undefined,
  hitCount: number,
): JudgeTile | null {
  if (!display?.keyVar) return null;
  const key = rowKeyOf(display, result.results);
  const lead = leadText(result.ruleId, display, result.results, CATALOG);
  const more = hitCount > 1 ? `외 ${hitCount - 1}행` : "";
  return {
    key: "__appliedRule",
    label: "적용 룰",
    value: key ?? "해당 없음",
    target: [lead, more].filter(Boolean).join(" · ") || undefined,
    warn: !key,
    warnLabel: key ? undefined : "적중 없음",
  };
}

export const RuleJudgePanel = memo(function RuleJudgePanel({
  rules,
  groups,
  initialRuleId,
  disabled,
  denied,
  evalTs,
  onFocusRule,
  screenId,
  display,
}: RuleJudgePanelProps) {
  const { showMessage } = useMessage();
  const idBase = useId();
  const [ruleId, setRuleId] = useState(initialRuleId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<JudgeResult | null>(null);
  /** 판정에 보낸 입력 — 탈락 근거의 「넣은 값」. */
  const [sent, setSent] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** 요청 번호 — 응답이 왔을 때 마지막 요청이 아니면(그사이 룰을 바꿨으면) 버린다. */
  const requestRef = useRef(0);

  const rule = rules.find((r) => r.ruleId === ruleId);
  const fields = useMemo(() => judgeFields(rule, ruleId), [rule, ruleId]);
  const options = useMemo(() => ruleOptions(groups), [groups]);
  const inputId = (name: string) => `${idBase}-${name}`;
  const hits = useMemo(
    () => hitRows(result, rule, CATALOG, display),
    [result, rule, display],
  );
  const failed = useMemo(
    () => failedRows(result, rule, sent),
    [result, rule, sent],
  );
  const entries = useMemo(
    () => resultEntries(result, rule, CATALOG, display),
    [result, rule, display],
  );
  /** 결과 타일 앞뒤에 붙는 타일 — 적용 룰(앞), 화면 계산 타일(뒤). */
  const extraTiles = useMemo(() => {
    if (!result) return { before: [], after: [] };
    const applied = appliedRuleTile(result, display, hits.length);
    return {
      before: applied ? [applied] : [],
      after:
        display?.judgeTiles?.({
          ruleId: result.ruleId,
          rule,
          result,
          input: sent,
        }) ?? [],
    };
  }, [result, display, hits.length, rule, sent]);
  const tileCount =
    extraTiles.before.length + entries.length + extraTiles.after.length;
  const tileSpan =
    tileCount <= 1 ? 12 : tileCount === 2 ? 6 : tileCount === 3 ? 4 : 3;
  const hitColumns = display?.keyVar ? HIT_COLUMNS_WITH_KEY : HIT_COLUMNS;
  const policy = hitPolicyOf(rule, ruleId);

  const changeRule = (next: string) => {
    requestRef.current += 1; // 진행 중인 판정의 응답은 이 룰의 결과가 아니다
    setRuleId(next);
    setErrors({});
    setResult(null);
    onFocusRule?.(next);
  };
  const changeValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
  };
  const clear = () => {
    requestRef.current += 1;
    setValues({});
    setErrors({});
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    const found = checkJudgeInput(fields, values);
    setErrors(found);
    const first = fields.find((f) => found[f.name]);
    if (first) {
      document.getElementById(inputId(first.name))?.focus();
      return;
    }
    const input = buildJudgeInput(fields, values);
    const requestId = ++requestRef.current;
    setBusy(true);
    try {
      const judged = await judgeRule(ruleId, input, evalTs);
      if (requestId === requestRef.current) {
        setSent(input);
        setResult(judged);
      }
    } catch (e) {
      if (requestId === requestRef.current)
        showMessage({
          title: "오류",
          message: errorMessage(e),
          alertType: "error",
        });
    } finally {
      if (requestId === requestRef.current) setBusy(false);
    }
  };

  return (
    <DashboardGrid fill ariaLabel="간편판정" testId={`${screenId}-judge`}>
      <DashboardCell span={4}>
        <CardFrame title="입력" testId={`${screenId}-judge-input`}>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              {options.length > 1 ? (
                <tr>
                  <th style={DETAIL_LABEL_CELL}>룰</th>
                  <td style={DETAIL_VALUE_CELL}>
                    {/* 판정 중에는 룰을 바꾸지 못하게 한다 — 응답이 다른 룰 밑에 놓이지 않게(요청 번호로도 한 번 더 막는다). */}
                    <RulePicker
                      value={ruleId}
                      onChange={changeRule}
                      options={options}
                      disabled={busy}
                      testId={`${screenId}-judge-rule`}
                    />
                  </td>
                </tr>
              ) : null}
              <tr>
                <th style={DETAIL_LABEL_CELL}>기준</th>
                <td style={DETAIL_VALUE_CELL}>
                  {ruleTitle(ruleId)} ({ruleId}) ·{" "}
                  {HIT_POLICY_LABEL[policy] ?? policy}
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
                      data-testid={`${screenId}-judge-${f.name}`}
                      value={values[f.name] ?? ""}
                      onChange={(v) => changeValue(f.name, v)}
                      error={errors[f.name] || undefined}
                      inputMode={f.numeric ? "decimal" : undefined}
                      placeholder={f.numeric ? "숫자" : "비우면 빈 값"}
                    />
                  </td>
                </tr>
              ))}
              {fields.length === 0 ? (
                <tr>
                  <td colSpan={2} style={DETAIL_VALUE_CELL}>
                    <MutedText>
                      이 룰의 조건 정의가 없습니다. 조회했는지, Maru 에 적용
                      버전이 있는지 확인하세요.
                    </MutedText>
                  </td>
                </tr>
              ) : null}
              <tr>
                <td colSpan={2} style={DETAIL_VALUE_CELL}>
                  <Button
                    variant="primary"
                    data-testid={`${screenId}-judge-run`}
                    onClick={() => void run()}
                    disabled={busy || disabled}
                    title={denied ? "판정 권한이 없습니다" : undefined}
                  >
                    판정
                  </Button>{" "}
                  <Button
                    variant="default"
                    data-testid={`${screenId}-judge-clear`}
                    onClick={clear}
                  >
                    입력 지우기
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </CardFrame>
      </DashboardCell>
      <DashboardCell span={8}>
        <CardFrame
          title="결과"
          testId={`${screenId}-judge-result`}
          right={
            result ? (
              <Badge
                label={JUDGE_STATUS_LABEL[result.status]}
                tone={TONE[result.status]}
                testId={`${screenId}-judge-status`}
              />
            ) : null
          }
        >
          {!result ? (
            <MutedText>
              입력을 넣고 [판정] 을 누르세요. 비운 칸은 그 조건을 보지 않는
              행에만 맞습니다.
            </MutedText>
          ) : (
            <DashboardGrid ariaLabel="판정 결과">
              {extraTiles.before.map((t) => (
                <DashboardCell key={t.key} span={tileSpan}>
                  <KpiTile
                    label={t.label}
                    value={t.value}
                    unit={t.unit}
                    target={t.target}
                    warn={t.warn}
                    warnLabel={t.warnLabel}
                    testId={`${screenId}-judge-tile-${t.key}`}
                  />
                </DashboardCell>
              ))}
              {entries.map((e) => (
                <DashboardCell
                  key={e.name}
                  span={display ? tileSpan : entries.length > 1 ? 6 : 12}
                >
                  <KpiTile
                    label={e.label}
                    value={e.value}
                    unit={e.value !== NA_TEXT ? e.unit : undefined}
                    target={
                      hits[0]
                        ? `행 ${hits[0].rowId} (순번 ${hits[0].seq})${hits.length > 1 ? ` 외 ${hits.length - 1}행` : ""}`
                        : undefined
                    }
                    testId={`${screenId}-judge-value-${e.name}`}
                  />
                </DashboardCell>
              ))}
              {extraTiles.after.map((t) => (
                <DashboardCell key={t.key} span={tileSpan}>
                  <KpiTile
                    label={t.label}
                    value={t.value}
                    unit={t.unit}
                    target={t.target}
                    warn={t.warn}
                    warnLabel={t.warnLabel}
                    testId={`${screenId}-judge-tile-${t.key}`}
                  />
                </DashboardCell>
              ))}
              <DashboardCell span={12}>
                <table style={DETAIL_TABLE_STYLE}>
                  <tbody>
                    <tr>
                      <th style={DETAIL_LABEL_CELL}>룰 · 버전</th>
                      <td style={DETAIL_VALUE_CELL}>
                        {result.ruleId} v{result.ver ?? NA_TEXT}
                      </td>
                    </tr>
                    <tr>
                      <th style={DETAIL_LABEL_CELL}>적용 행</th>
                      <td
                        style={DETAIL_VALUE_CELL}
                        data-testid={`${screenId}-judge-hits`}
                      >
                        {hits.length > 0
                          ? hits
                              .map((h) => `행 ${h.rowId} (순번 ${h.seq})`)
                              .join(", ")
                          : NA_TEXT}
                        {result.defaultApplied ? " — 기본 행" : ""}
                      </td>
                    </tr>
                    <tr>
                      <th style={DETAIL_LABEL_CELL}>평가 시각</th>
                      <td style={DETAIL_VALUE_CELL}>
                        {result.evalTs || NA_TEXT}
                      </td>
                    </tr>
                    {result.message ? (
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>안내</th>
                        <td
                          style={DETAIL_VALUE_CELL}
                          data-testid={`${screenId}-judge-message`}
                        >
                          {result.message}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </DashboardCell>
              {/* 0건이어도 그리드를 내리지 않는다(성능 가이드 R6) — 적중 ↔ 적중 없음 전환에 그리드를 다시 만들지 않게. */}
              <DashboardCell span={12}>
                <AgDataGrid
                  gridId="judgeHits"
                  title={
                    hits.length > 1 ? `적중 행 ${hits.length}건` : "적중 행"
                  }
                  rowKey="rowId"
                  columns={hitColumns}
                  data={hits as unknown as Record<string, unknown>[]}
                  columnSizing="fit"
                  height="auto"
                  settingsMenu={false}
                  personalize={false}
                  emptyMessage="적중한 행이 없습니다"
                />
              </DashboardCell>
              <DashboardCell span={12}>
                <AgDataGrid
                  gridId="judgeTrace"
                  title="앞선 행의 탈락 조건"
                  rowKey="rowId"
                  columns={TRACE_COLUMNS}
                  data={failed as unknown as Record<string, unknown>[]}
                  columnSizing="fit"
                  height={220}
                  settingsMenu={false}
                  personalize={false}
                  emptyMessage="탈락한 앞 행이 없습니다"
                />
              </DashboardCell>
            </DashboardGrid>
          )}
        </CardFrame>
      </DashboardCell>
    </DashboardGrid>
  );
});
