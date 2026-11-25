"use client";

/**
 * 주문단중에러관리(orderWeightError) — Maru 룰 QD_ORDER_WEIGHT_ERROR 를 주문단중 × 분할 수 매트릭스로 보인다(mes-to-be order-weight-error.html).
 * 탭: 「단중에러 기준」(매트릭스·허용범위 강조·수정값·간편 판정), 「수정 이력」(확정 버전끼리의 칸 변경).
 * 매트릭스는 보기 전용이고 값 수정은 [Maru에서 편집] 으로 Maru 룰 편집 화면에서 한다. 허용 범위는 코드 QC_ORD_WGT_LIMIT.
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
  QCD_RULE_SERVICE,
  useCodes,
  useRuleHistory,
  useRules,
} from "@/common/rule";

import { ChangeHistoryGrid } from "../shared/ChangeHistoryGrid";
import { RuleScreenFrame } from "../shared/RuleScreenFrame";
import {
  buildWeightMatrix,
  LIMIT_CODE_ID,
  limitOf,
  rangeMismatches,
  RULE_ID,
  weightChanges,
} from "./weight";
import { WeightMatrixPanel } from "./WeightMatrixPanel";

export const SCREEN_ID = "orderWeightError";

const RULE_IDS = [RULE_ID];
const CODE_IDS = [LIMIT_CODE_ID];

export function OrderWeightErrorPage(_props: PageProps) {
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
  const [tab, setTab] = useState("grid");
  const [evalDate, setEvalDate] = useState("");
  const history = useRuleHistory(tab === "hist" ? RULE_ID : null, { onError });

  const rule = rules.find((r) => r.ruleId === RULE_ID);
  const matrix = useMemo(() => buildWeightMatrix(rule), [rule]);
  const limit = useMemo(() => limitOf(codes.codes), [codes.codes]);
  const mismatches = useMemo(
    () => rangeMismatches(matrix, limit),
    [matrix, limit],
  );
  const changes = useMemo(
    () => weightChanges(history.versions),
    [history.versions],
  );
  const canJudge = canDoButton(rbac, QCD_RULE_SERVICE, "judge");

  const tabs = useMemo(
    () => [
      { key: "grid", label: `단중에러 기준 (범위 내 ${matrix.inRangeCount})` },
      {
        key: "hist",
        label: history.loaded ? `수정 이력 (${changes.length})` : "수정 이력",
      },
    ],
    [matrix.inRangeCount, history.loaded, changes.length],
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
      {tab === "grid" && (
        <WeightMatrixPanel
          screenId={SCREEN_ID}
          matrix={matrix}
          limit={limit}
          mismatches={mismatches}
          ver={rule?.ver ?? null}
          applyFrom={rule?.applyFrom ?? null}
          loading={loading}
          loaded={loaded}
          canJudge={canJudge}
          evalTs={evalTs}
          codesLoaded={codes.loaded}
        />
      )}
      {tab === "hist" && (
        <ContentBody root>
          <ContentPanel>
            <ChangeHistoryGrid
              title="수정 이력 — 확정 버전끼리의 칸 변경"
              rows={changes}
              loading={history.loading}
              loaded={history.loaded}
            />
          </ContentPanel>
        </ContentBody>
      )}
    </RuleScreenFrame>
  );
}
