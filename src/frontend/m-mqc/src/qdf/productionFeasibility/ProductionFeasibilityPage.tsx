"use client";

/**
 * 생산가부관리(productionFeasibility) — B.D 생산범위 시트 5개(Maru 룰 QD_FEAS_*)를 재질 그룹별 폭 × 두께 칸으로 보인다(mes-to-be production-feasibility.html).
 * 탭: 시트 5개(시트 머리·범례·후처리 표·재질 그룹 칸·가부 간편조회) + 「수정 이력」(확정 버전끼리의 칸 변경).
 * 시트는 보기 전용이고 상태 수정은 [Maru에서 편집] 으로 보고 있는 시트의 룰을 연다. 시트 머리·재질 그룹·축은 코드 QC_FEAS_SHEET·QC_FEAS_MATL_GRP.
 */
import { useCallback, useMemo, useState } from "react";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import {
  canDoButton,
  ContentBody,
  ContentPanel,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import {
  CATALOG,
  QCD_RULE_SERVICE,
  RulePicker,
  useCodes,
  useRuleHistory,
  useRules,
} from "@/common/rule";

import { ChangeHistoryGrid } from "../shared/ChangeHistoryGrid";
import { RuleScreenFrame } from "../shared/RuleScreenFrame";
import {
  feasChanges,
  GROUP_CODE_ID,
  groupsOf,
  SHEET_CODE_ID,
  sheetsOf,
  STATE_CODE_ID,
  statesOf,
} from "./feasibility";
import { SheetPanel } from "./SheetPanel";

export const SCREEN_ID = "productionFeasibility";

/** catalog 가 비었을 때의 시트 룰(탭 순서). */
const FALLBACK_RULE_IDS = [
  "QD_FEAS_2CGL_GI",
  "QD_FEAS_2CGL_GL",
  "QD_FEAS_3CGL",
  "QD_FEAS_4CGL",
  "QD_FEAS_5CGL",
];
const catalogRuleIds = CATALOG.SCREEN_RULES[SCREEN_ID] ?? [];
export const RULE_IDS: string[] =
  catalogRuleIds.length > 0 ? catalogRuleIds : FALLBACK_RULE_IDS;
const CODE_IDS = [SHEET_CODE_ID, GROUP_CODE_ID, STATE_CODE_ID];
const HIST_TAB = "hist";

export function ProductionFeasibilityPage(_props: PageProps) {
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
  const [tab, setTab] = useState(RULE_IDS[0]);
  const [histRuleId, setHistRuleId] = useState(RULE_IDS[0]);
  const [evalDate, setEvalDate] = useState("");
  const history = useRuleHistory(tab === HIST_TAB ? histRuleId : null, {
    onError,
  });

  const sheets = useMemo(() => sheetsOf(codes.codes, RULE_IDS), [codes.codes]);
  const states = useMemo(() => statesOf(codes.codes), [codes.codes]);
  const groupsBySheet = useMemo(
    () =>
      new Map(
        sheets.map((s) => [
          s.ruleId,
          groupsOf(
            codes.codes,
            s,
            rules.find((r) => r.ruleId === s.ruleId),
          ),
        ]),
      ),
    [sheets, codes.codes, rules],
  );
  const histSheet = sheets.find((s) => s.ruleId === histRuleId) ?? sheets[0];
  const changes = useMemo(
    () =>
      histSheet
        ? feasChanges(
            histSheet,
            groupsBySheet.get(histSheet.ruleId) ?? [],
            history.versions,
            states,
          )
        : [],
    [histSheet, groupsBySheet, history.versions, states],
  );
  const canJudge = canDoButton(rbac, QCD_RULE_SERVICE, "judge");

  const tabs = useMemo(
    () => [
      ...sheets.map((s) => ({ key: s.ruleId, label: s.tab })),
      { key: HIST_TAB, label: "수정 이력" },
    ],
    [sheets],
  );
  const sheet = sheets.find((s) => s.ruleId === tab);
  const editRuleId = tab === HIST_TAB ? histRuleId : tab;
  const editVer = rules.find((r) => r.ruleId === editRuleId)?.ver ?? null;
  const histOptions = useMemo(
    () =>
      sheets.map((s) => ({
        value: s.ruleId,
        label: s.tab.replace("B.D 생산범위", "").replace(/[()]/g, "").trim(),
      })),
    [sheets],
  );

  return (
    <RuleScreenFrame
      screenId={SCREEN_ID}
      editRuleId={editRuleId}
      editVer={editVer}
      loading={loading}
      evalDate={evalDate}
      onEvalDateChange={setEvalDate}
      onSearch={(ts) => void reload(ts)}
      tabs={tabs}
      tab={tab}
      onTabChange={setTab}
    >
      {sheet ? (
        <SheetPanel
          key={sheet.ruleId}
          screenId={SCREEN_ID}
          sheet={sheet}
          rule={rules.find((r) => r.ruleId === sheet.ruleId)}
          groups={groupsBySheet.get(sheet.ruleId) ?? []}
          states={states}
          loading={loading}
          loaded={loaded}
          canJudge={canJudge}
          evalTs={evalTs}
        />
      ) : null}
      {tab === HIST_TAB && (
        <ContentBody root>
          <ContentPanel>
            <ChangeHistoryGrid
              title="수정 이력 — 확정 버전끼리의 칸 변경"
              rows={changes}
              loading={history.loading}
              loaded={history.loaded}
              titleExtra={
                <RulePicker
                  value={histRuleId}
                  onChange={setHistRuleId}
                  options={histOptions}
                  disabled={history.loading}
                  testId={`${SCREEN_ID}-history-sheet`}
                />
              }
            />
          </ContentPanel>
        </ContentBody>
      )}
    </RuleScreenFrame>
  );
}
