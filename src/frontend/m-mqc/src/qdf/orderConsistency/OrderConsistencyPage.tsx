"use client";

/**
 * 주문정합성관리(orderConsistency) — Maru 룰 QD_ORDER_CHECK(C10B2220 주문에러체크 + C10B2221 항목간주문에러체크 병합, COLLECT)를 보인다
 * (mes-to-be order-consistency.html). 조건이 모두 맞으면 에러가 나는 룰이고, 모든 룰을 평가해 발화한 룰을 모두 모은다.
 *
 * 탭: 룰 목록(대상 항목별 룰 카드·쉬운 문장) · 룰 등록 안내(Maru 표 칸 대응) · 주문 시뮬레이션(프리셋 5건 → 서버 판정 → 발화 카드)
 *     · 검토 이슈(병합 검토 자료 15건, 읽기 전용) · 코드 사전(QC_OC_FIELD·QC_OC_VALUE_LABEL) · 변경 이력(확정 버전 행 차이).
 * 등록·수정은 [Maru에서 편집] 으로 Maru 룰 편집 화면에서 한다.
 */
import { useCallback, useMemo, useRef, useState } from "react";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";
import {
  judgeRule,
  openRuleEdit,
  QCD_RULE_SERVICE,
  ruleTitle,
  useCodes,
  useRules,
  type RuleGroup,
} from "@/common/rule";
import { RuleHistoryPanel } from "@/common/rule/RuleHistoryPanel";

import { RuleScreenFrame } from "../shared/RuleScreenFrame";
import { DictionaryPanel } from "./DictionaryPanel";
import { GuidePanel } from "./GuidePanel";
import { IssuesPanel } from "./IssuesPanel";
import { REVIEW_ISSUES } from "./issues";
import {
  ACTOR_CODE_ID,
  CATEGORY_CODE_ID,
  EMPTY_FILTER,
  FIELD_CODE_ID,
  fieldRefCounts,
  fieldsOf,
  RULE_ID,
  toOcRules,
  VALUE_LABEL_CODE_ID,
  valueLabelsOf,
  type OcRule,
  type RuleFilter,
} from "./model";
import { SIM_BASE, SIM_PRESETS } from "./presets";
import { RuleCardsPanel } from "./RuleCardsPanel";
import { SimulationPanel, type SimResult } from "./SimulationPanel";
import {
  buildOrderInput,
  explain,
  formatErrors,
  orderFromRule,
  type OrderValues,
} from "./simulate";

export const SCREEN_ID = "orderConsistency";

const RULE_IDS = [RULE_ID];
const CODE_IDS = [
  FIELD_CODE_ID,
  VALUE_LABEL_CODE_ID,
  CATEGORY_CODE_ID,
  ACTOR_CODE_ID,
];
const HISTORY_GROUPS: RuleGroup[] = [
  { key: RULE_ID, label: ruleTitle(RULE_ID), ruleIds: [RULE_ID] },
];

export function OrderConsistencyPage(_props: PageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac();
  const onError = useCallback(
    (message: string) =>
      showMessage({ title: "오류", message, alertType: "error" }),
    [showMessage],
  );
  const { rules, loading, loaded, reload, evalTs } = useRules(RULE_IDS, {
    auto: false,
    onError,
  });
  const codes = useCodes(CODE_IDS, { onError });
  const [tab, setTab] = useState("list");
  const [evalDate, setEvalDate] = useState("");
  const [filter, setFilter] = useState<RuleFilter>(EMPTY_FILTER);
  const [focusKey, setFocusKey] = useState("");
  const [values, setValues] = useState<OrderValues>({});
  const [presetKey, setPresetKey] = useState("");
  const [inputVersion, setInputVersion] = useState(0);
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0);

  const rule = rules.find((r) => r.ruleId === RULE_ID);
  const ocRules = useMemo(() => toOcRules(rule), [rule]);
  const fields = useMemo(
    () => fieldsOf(rule, codes.codes),
    [rule, codes.codes],
  );
  const labels = useMemo(() => valueLabelsOf(codes.codes), [codes.codes]);
  const refCounts = useMemo(() => fieldRefCounts(ocRules), [ocRules]);
  const issuesByRule = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of REVIEW_ISSUES)
      for (const k of i.ruleKeys) m.set(k, [...(m.get(k) ?? []), i.id]);
    return m;
  }, []);
  /** 입력 후보 — 사전 라벨 값과 룰 조건에 나온 값(지어내지 않는다). */
  const fieldOptions = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    const add = (field: string, value: string, label = "") => {
      const inner = m.get(field) ?? new Map<string, string>();
      if (!inner.has(value) || label)
        inner.set(value, label || inner.get(value) || "");
      m.set(field, inner);
    };
    for (const v of labels.values()) add(v.field, v.code, v.label);
    for (const r of ocRules)
      for (const c of r.conds) for (const v of c.cond.values) add(c.field, v);
    return new Map(
      [...m.entries()].map(([f, inner]) => [
        f,
        [...inner.entries()]
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.value.localeCompare(b.value)),
      ]),
    );
  }, [labels, ocRules]);
  const canJudge = canDoButton(rbac, QCD_RULE_SERVICE, "judge");

  const runWith = useCallback(
    async (order: OrderValues) => {
      const id = ++runRef.current;
      const bad = formatErrors(fields, order);
      if (bad.length > 0) {
        setResult({
          status: null,
          ver: null,
          outcome: null,
          formatErrors: bad,
          message: null,
        });
        return;
      }
      setBusy(true);
      try {
        // 서버는 값 null 을 미입력으로 받는다(IS_NULL 이 맞는다). 키는 조건 변수 전부를 보낸다.
        const input = buildOrderInput(fields, order) as unknown as Record<
          string,
          string | number
        >;
        const out = await judgeRule(RULE_ID, input, evalTs);
        if (id !== runRef.current) return;
        const outcome =
          out.status === "MATCHED" || out.status === "NO_MATCH"
            ? explain(
                ocRules,
                new Set(out.hits.map((h) => h.rowId)),
                order,
                fields,
              )
            : null;
        setResult({
          status: out.status,
          ver: out.ver,
          outcome,
          formatErrors: [],
          message: out.message,
        });
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
    },
    [fields, ocRules, evalTs, showMessage],
  );

  const onRun = useCallback(() => void runWith(values), [runWith, values]);
  const onValueChange = useCallback(
    (field: string, value: string) =>
      setValues((prev) => ({ ...prev, [field]: value })),
    [],
  );
  const onPreset = useCallback((key: string) => {
    setPresetKey(key);
    const p = SIM_PRESETS.find((x) => x.key === key);
    if (p) {
      setValues({ ...p.order });
      setInputVersion((v) => v + 1);
      setResult(null);
    }
  }, []);
  const onClear = useCallback(() => {
    runRef.current += 1;
    setValues({});
    setPresetKey("");
    setInputVersion((v) => v + 1);
    setResult(null);
    setBusy(false);
  }, []);
  const onSimulate = useCallback(
    (r: OcRule) => {
      const order = orderFromRule(r, SIM_BASE, fields);
      setValues(order);
      setPresetKey("");
      setInputVersion((v) => v + 1);
      setResult(null);
      setTab("sim");
      if (canJudge) void runWith(order);
    },
    [fields, canJudge, runWith],
  );
  const onOpenRule = useCallback((key: string) => {
    setFilter({ ...EMPTY_FILTER, keyword: key });
    setFocusKey(key);
    setTab("list");
  }, []);
  const onEdit = useCallback(
    () => openRuleEdit(RULE_ID, rule?.ver ?? null),
    [rule?.ver],
  );

  const tabs = useMemo(
    () => [
      {
        key: "list",
        label: loaded ? `룰 목록 (${ocRules.length})` : "룰 목록",
      },
      { key: "guide", label: "룰 등록 안내" },
      { key: "sim", label: "주문 시뮬레이션" },
      { key: "issues", label: `검토 이슈 (${REVIEW_ISSUES.length})` },
      { key: "dict", label: `코드 사전 (${fields.length})` },
      { key: "history", label: "변경 이력" },
    ],
    [loaded, ocRules.length, fields.length],
  );

  return (
    <RuleScreenFrame
      screenId={SCREEN_ID}
      editRuleId={RULE_ID}
      editVer={rule?.ver ?? null}
      loading={loading}
      evalDate={evalDate}
      onEvalDateChange={setEvalDate}
      onSearch={(ts) => void reload(ts)}
      tabs={tabs}
      tab={tab}
      onTabChange={setTab}
    >
      {tab === "list" && (
        <RuleCardsPanel
          screenId={SCREEN_ID}
          rules={ocRules}
          fields={fields}
          labels={labels}
          issuesByRule={issuesByRule}
          filter={filter}
          onFilterChange={setFilter}
          focusKey={focusKey}
          loaded={loaded}
          onSimulate={onSimulate}
          onEdit={onEdit}
        />
      )}
      {tab === "guide" && (
        <GuidePanel screenId={SCREEN_ID} ruleId={RULE_ID} onEdit={onEdit} />
      )}
      {tab === "sim" && (
        <SimulationPanel
          screenId={SCREEN_ID}
          fields={fields}
          labels={labels}
          fieldOptions={fieldOptions}
          values={values}
          onValueChange={onValueChange}
          presetKey={presetKey}
          onPreset={onPreset}
          inputVersion={inputVersion}
          result={result}
          busy={busy}
          disabled={loading || fields.length === 0}
          canJudge={canJudge}
          onRun={onRun}
          onClear={onClear}
        />
      )}
      {tab === "issues" && (
        <IssuesPanel
          screenId={SCREEN_ID}
          fields={fields}
          labels={labels}
          rules={ocRules}
          onOpenRule={onOpenRule}
        />
      )}
      {tab === "dict" && (
        <DictionaryPanel
          fields={fields}
          labels={labels}
          refCounts={refCounts}
          loading={codes.loading}
          codesLoaded={codes.loaded}
        />
      )}
      {tab === "history" && (
        <RuleHistoryPanel
          groups={HISTORY_GROUPS}
          initialRuleId={RULE_ID}
          screenId={SCREEN_ID}
        />
      )}
    </RuleScreenFrame>
  );
}
