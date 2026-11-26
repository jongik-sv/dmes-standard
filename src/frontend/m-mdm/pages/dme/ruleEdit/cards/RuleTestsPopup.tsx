"use client";

/**
 * 테스트 팝업(2026-11-04) — 값 테스트·테스트 결과를 한 탭에, 테스트 케이스를 다른 탭에 둔다.
 *
 * <p>두 탭은 함께 마운트하고 안 보이는 쪽만 숨긴다: 케이스 탭이 값 테스트 탭이 고른 대상·입력(`valueTestInput`)으로 실행하고, [불러오기]가 값 테스트 칸을 채운다.
 * 창을 닫으면 shared `Modal` 이 내용을 내리므로 다시 열 때 이어 쓸 입력은 `useKeptState` 에 둔다. 값 테스트 결과는 공유 상태(`testRun`)에 남아 표에 칠한 채로 있다.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";
import { fmtVer } from "@/shell";

import type { RuleEditCardProps } from "../cards";
import { useRuleWorkbench } from "../state/workbench-context";
import { useDebugPrefill } from "../value-test/debug-prefill";
import { useModalFillMinHeight } from "./modal-fill";
import { TestCaseCard } from "./TestCaseCard";
import { TestResultCard } from "./TestResultCard";
import { ValueTestCard } from "./ValueTestCard";

type TestTab = "value" | "cases";

export interface RuleTestsPopupProps extends RuleEditCardProps {
  open: boolean;
  onClose: () => void;
}

export function RuleTestsPopup({ open, onClose, ...card }: RuleTestsPopupProps) {
  const [tab, setTab] = useState<TestTab>("value");
  const caseCount = card.view.testCases?.length ?? 0;
  const items = useMemo<TabItem[]>(
    () => [
      { key: "value", label: "값 테스트" },
      { key: "cases", label: `테스트 케이스 ${caseCount}` },
    ],
    [caseCount],
  );

  // 입력을 채우는 요청은 채운 칸이 보이도록 값 테스트 탭으로 옮긴다 — 케이스 [불러오기], 룰 세트 디버깅에서 넘어온 값.
  const { caseLoad } = useRuleWorkbench();
  const caseLoadSeq = caseLoad?.seq ?? 0;
  const prefillSeq = useDebugPrefill()?.seq ?? 0;
  useEffect(() => {
    if (caseLoadSeq > 0 || prefillSeq > 0) setTab("value");
  }, [caseLoadSeq, prefillSeq]);

  return (
    <Modal
      open={open}
      title={`테스트 · ${card.view.rule.maruRuleId} · ${fmtVer(card.view.selectedVer)}`}
      size="xl"
      resizable
      draggable
      resizeStorageKey="mdm-ruleEdit-testsPopup"
      onClose={onClose}
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <div data-testid="rule-tests-popup" style={{ flex: "none" }}>
        <Tabs items={items} activeKey={tab} onChange={(k) => setTab(k as TestTab)} />
        <div
          data-testid="rule-tests-value"
          hidden={tab !== "value"}
          style={{ display: tab === "value" ? "grid" : "none", gap: "var(--spacing-sm)", paddingTop: "var(--spacing-sm)" }}
        >
          <ValueTestCard {...card} />
          <FillRest>
            <TestResultCard {...card} />
          </FillRest>
        </div>
        <div data-testid="rule-tests-cases" hidden={tab !== "cases"} style={{ display: tab === "cases" ? "block" : "none", paddingTop: "var(--spacing-sm)" }}>
          <TestCaseCard {...card} />
        </div>
      </div>
    </Modal>
  );
}

/**
 * 값 테스트 탭의 결과 카드가 창의 남는 높이를 채우게 한다(케이스 탭은 TestCaseCard 가 목록·상세 영역을 채운다).
 * 창 안(`.cm-modal-body`)에 마운트되어야 잴 수 있으므로 팝업 본문 안의 컴포넌트로 둔다 — 팝업 컴포넌트는 창이 닫혀도 마운트돼 있다.
 */
function FillRest({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFillMinHeight(ref);
  return (
    <div ref={ref} data-testid="rule-tests-result-fill" style={{ display: "grid" }}>
      {children}
    </div>
  );
}
