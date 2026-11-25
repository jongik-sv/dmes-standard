"use client";

/**
 * 룰 기준 화면 틀 — 「룰 목록 / 간편판정 / 변경 이력 / 코드 범례」 공통 패턴(inventory-A Pattern A)을 설정으로 그린다.
 * Maru 룰(qcdRule)을 읽기만 하고, 편집은 [Maru에서 편집] 으로 MDM 룰 편집 화면에 넘긴다.
 *
 * 화면은 objectId·묶음(없으면 catalog SCREEN_RULES)·추가 탭만 준다:
 *   <RuleStandardScreen screenId="lineWidthMargin" />
 *   <RuleStandardScreen screenId="lineWidthShrinkage" groups={GROUPS}
 *     extraTabs={[{ key: "flow", label: "공정 흐름", render: (ctx) => <FlowPanel {...ctx} /> }]} />
 *
 * 조회: 조회 조건은 「기준일」(비우면 지금) 하나다. 진입 때 SearchArea autoSearch 가 한 번 조회한다. 거르기는 화면 안에서만 한다.
 * 권한: 상단 [조회] 는 화면 objectId 의 search, 판정은 공용 서비스 qcdRule 의 judge 로 본다(실제 호출 대상).
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";

import {
  PageLayout,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { screenMeta } from "../screens";
import { QCD_RULE_SERVICE, unreachableRowIds } from "./api";
import type { RuleDisplay } from "./display";
import { useRules } from "./hooks";
import { screenCodeIds, screenGroups, type RuleGroup } from "./meta";
import { openRuleEdit } from "./open-rule-edit";
import { RuleHistoryPanel } from "./RuleHistoryPanel";
import { RuleJudgePanel } from "./RuleJudgePanel";
import { RuleLegendPanel } from "./RuleLegendPanel";
import { RuleListPanel } from "./RuleListPanel";
import type { RuleView } from "./types";

export type RuleTabKey = "list" | "judge" | "history" | "legend";

/** 추가 탭에 넘기는 화면 상태. */
export interface RuleScreenContext {
  screenId: string;
  rules: RuleView[];
  groups: RuleGroup[];
  /** 조회 중인가. */
  loading: boolean;
  /** 조회를 한 번이라도 마쳤는가. */
  loaded: boolean;
  /** 평가 시각(기준일). 없으면 지금. 판정에 그대로 넘긴다. */
  evalTs: string | undefined;
  /** 판정 권한(qcdRule/judge)이 있는가. */
  canJudge: boolean;
  /** Maru 편집 대상 룰을 바꾼다. */
  focusRule: (ruleId: string) => void;
  /** 결과 표시 설정(화면이 넘긴 것). */
  display: RuleDisplay | undefined;
}

export interface RuleExtraTab {
  key: string;
  label: string;
  /** 이 탭 뒤에 둔다. 기본 "list"(룰 목록 바로 뒤). */
  after?: RuleTabKey;
  render: (ctx: RuleScreenContext) => ReactNode;
}

export interface RuleStandardScreenProps {
  /** 화면 objectId — 권한 대상, 저장 키·testId 접두어, catalog 조회 키. */
  screenId: string;
  /** 제목. 기본은 screens.ts 의 메뉴 이름. */
  title?: string;
  breadcrumb?: string;
  /** 룰 묶음. 기본은 catalog SCREEN_RULES[screenId] 를 RULES 의 group 으로 묶은 것. 모듈 상수로 넘긴다(렌더마다 새 배열 금지). */
  groups?: RuleGroup[];
  /** 범례에 보일 Maru 코드 ID. 기본은 catalog SCREEN_CODES[screenId]. 모듈 상수로 넘긴다. */
  codeIds?: string[];
  extraTabs?: RuleExtraTab[];
  /** 범례 탭 아래에 더할 내용(화면 고유 용어 설명 등). */
  legendExtra?: ReactNode;
  /**
   * 결과 열 표시 설정(display.ts) — 룰 ID 열, 앞 열(우선순위·순번), 업무 결과 강조, 숨김 변수, 행 배지, 판정 추가 타일.
   * 모듈 상수나 useMemo 로 넘긴다(렌더마다 새 객체 금지). 없으면 모든 결과를 같은 모양으로 보인다.
   */
  display?: RuleDisplay;
}

const BASE_TABS: { key: RuleTabKey; label: string }[] = [
  { key: "list", label: "룰 목록" },
  { key: "judge", label: "간편판정" },
  { key: "history", label: "변경 이력" },
  { key: "legend", label: "코드 범례" },
];

const NO_EXTRA: RuleExtraTab[] = [];

/** 기준일(YYYY-MM-DD) → 평가 시각. 그날 마지막 시각에 적용 중인 버전을 본다. 비면 지금. */
export function evalTsOf(date: string): string | undefined {
  const d = date.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} 23:59:59` : undefined;
}

/** 탭 순서 — 기본 4개 사이에 추가 탭을 after 뒤에 끼운다(같은 자리는 넘긴 순서). */
export function tabItems(extra: readonly RuleExtraTab[]): TabItem[] {
  const out: TabItem[] = [];
  for (const t of BASE_TABS) {
    out.push({ key: t.key, label: t.label });
    for (const e of extra)
      if ((e.after ?? "list") === t.key)
        out.push({ key: e.key, label: e.label });
  }
  return out;
}

export function RuleStandardScreen({
  screenId,
  title,
  breadcrumb,
  groups: groupsProp,
  codeIds: codeIdsProp,
  extraTabs = NO_EXTRA,
  legendExtra,
  display,
}: RuleStandardScreenProps) {
  const meta = screenMeta(screenId);
  const { showMessage } = useMessage();
  // 판정 권한은 PageLayout 단추가 아니라 여기서 본다. 화면 루트 한 곳에서만 받는다(성능 가이드 R9).
  const rbac = useUserButtonRbac();
  const groups = useMemo(
    () => groupsProp ?? screenGroups(screenId),
    [groupsProp, screenId],
  );
  const codeIds = useMemo(
    () => codeIdsProp ?? screenCodeIds(screenId),
    [codeIdsProp, screenId],
  );
  const ruleIds = useMemo(
    () => [...new Set(groups.flatMap((g) => g.ruleIds))],
    [groups],
  );

  const onError = useCallback(
    (message: string) =>
      showMessage({ title: "오류", message, alertType: "error" }),
    [showMessage],
  );
  const { rules, loading, loaded, reload, evalTs } = useRules(ruleIds, {
    auto: false,
    onError,
  });

  const [tab, setTab] = useState<string>("list");
  const [evalDate, setEvalDate] = useState("");
  const [focusRuleId, setFocusRuleId] = useState<string>(ruleIds[0] ?? "");
  const focusRule = useCallback((ruleId: string) => setFocusRuleId(ruleId), []);

  const handleSearch = useCallback(
    () => void reload(evalTsOf(evalDate)),
    [reload, evalDate],
  );

  // 가려짐은 룰마다 한 번 계산한다(analyzeRule). 거르기·탭 전환은 다시 계산하지 않는다.
  const unreachable = useMemo(
    () => new Map(rules.map((r) => [r.ruleId, unreachableRowIds(r)])),
    [rules],
  );
  const items = useMemo(() => tabItems(extraTabs), [extraTabs]);
  const canJudge = canDoButton(rbac, QCD_RULE_SERVICE, "judge");
  const focusId = ruleIds.includes(focusRuleId)
    ? focusRuleId
    : (ruleIds[0] ?? "");
  const focusVer = rules.find((r) => r.ruleId === focusId)?.ver ?? null;

  const ctx = useMemo<RuleScreenContext>(
    () => ({
      screenId,
      rules,
      groups,
      loading,
      loaded,
      evalTs,
      canJudge,
      focusRule,
      display,
    }),
    [
      screenId,
      rules,
      groups,
      loading,
      loaded,
      evalTs,
      canJudge,
      focusRule,
      display,
    ],
  );
  const extra = extraTabs.find((t) => t.key === tab);

  return (
    <PageLayout
      title={title ?? meta.title}
      breadcrumb={breadcrumb ?? meta.breadcrumb}
      screenId={screenId}
      objId={screenId}
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary",
          disabled: loading,
          action: "search",
        },
        // 이동만 하므로 조회 권한으로 건다. 조회가 아니라 최근 조회값을 적지 않는다.
        {
          id: "btn_open_maru",
          label: "Maru에서 편집",
          onClick: () => openRuleEdit(focusId, focusVer),
          disabled: !focusId,
          action: "search",
          emitSearch: false,
        },
      ]}
    >
      <SearchArea onSearch={handleSearch} autoSearch>
        <SearchField
          label="기준일"
          type="date"
          defaultKey="evalDate"
          value={evalDate}
          onChange={setEvalDate}
          placeholder="비우면 현재"
        />
      </SearchArea>

      <Tabs items={items} activeKey={tab} onChange={setTab} />

      {tab === "list" && (
        <RuleListPanel
          rules={rules}
          groups={groups}
          unreachable={unreachable}
          loaded={loaded}
          loading={loading}
          onFocusRule={focusRule}
          screenId={screenId}
          display={display}
        />
      )}
      {tab === "judge" && (
        <RuleJudgePanel
          rules={rules}
          groups={groups}
          initialRuleId={focusId}
          disabled={loading || !canJudge}
          denied={!rbac.isLoading && !canJudge}
          evalTs={evalTs}
          onFocusRule={focusRule}
          screenId={screenId}
          display={display}
        />
      )}
      {tab === "history" && (
        <RuleHistoryPanel
          groups={groups}
          initialRuleId={focusId}
          onFocusRule={focusRule}
          screenId={screenId}
          display={display}
        />
      )}
      {tab === "legend" && (
        <RuleLegendPanel
          rules={rules}
          groups={groups}
          codeIds={codeIds}
          extra={legendExtra}
          screenId={screenId}
          display={display}
        />
      )}
      {extra ? extra.render(ctx) : null}
    </PageLayout>
  );
}
