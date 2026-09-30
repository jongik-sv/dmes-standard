"use client";

/**
 * 아래 패널(2단계 계획 Task 10, P10) — 탭 "검사 결과 {n}" · "시뮬레이션" 과 접기. 시뮬레이션 탭 내용은 `simulation` 슬롯으로 받는다(Task 11 이 채운다).
 * 검사 결과 탭은 본문이 스크롤하고, 시뮬레이션 탭은 본문이 스크롤하지 않는다 — 버튼 줄을 고정하고 입력·값 표만 SimulationPanel 이 스크롤한다.
 * 바깥 틀(펼침 = 분할 패널, 접힘 = 머리 줄만)은 page.tsx 가 고른다 — 분할 골격은 page 의 직접 자식이어야 하기 때문이다(Part B §4-3).
 */
import type { ReactNode } from "react";

import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";

import { Button } from "@dk-oasis/shared/form";
import { Tabs } from "@dk-oasis/shared/tabs";

export type BottomTab = "checks" | "sim";

export interface BottomPanelProps {
  tab: BottomTab;
  onTab: (tab: BottomTab) => void;
  collapsed: boolean;
  onToggle: () => void;
  checkCount: number;
  checks: ReactNode;
  /** 시뮬레이션 탭 내용(page 가 SimulationPanel 을 넘긴다). 없으면 안내만 보인다. */
  simulation?: ReactNode;
}

export function BottomPanel({ tab, onTab, collapsed, onToggle, checkCount, checks, simulation }: BottomPanelProps) {
  return (
    <div data-testid="flow-bottom" className="rsf-bottom" data-collapsed={collapsed ? "true" : "false"}>
      <div className="rsf-bottom-head">
        <Tabs
          items={[
            { key: "checks", label: <span data-testid="flow-tab-checks">{`검사 결과 ${checkCount}`}</span> },
            { key: "sim", label: <span data-testid="flow-tab-sim">시뮬레이션</span> },
          ]}
          activeKey={tab}
          onChange={(k) => {
            onTab(k as BottomTab);
            if (collapsed) onToggle();
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          size="sm"
          data-testid="flow-bottom-toggle"
          aria-expanded={!collapsed}
          ariaLabel={collapsed ? "아래 패널 펼치기" : "아래 패널 접기"}
          title={collapsed ? "펼치기" : "접기"}
          onClick={onToggle}
        >
          {collapsed ? <IconChevronUp size={14} aria-hidden="true" /> : <IconChevronDown size={14} aria-hidden="true" />}
        </Button>
      </div>
      {!collapsed && (
        <div className="rsf-bottom-body" data-testid="flow-bottom-body" data-tab={tab}>
          {tab === "checks" ? (
            checks
          ) : (
            <div data-testid="flow-sim-slot" className="rsf-sim-slot">
              {simulation ?? <p className="rsf-panel-note">저장하지 않은 흐름을 레코드 하나로 돌려 노드마다 따라가 본다.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
