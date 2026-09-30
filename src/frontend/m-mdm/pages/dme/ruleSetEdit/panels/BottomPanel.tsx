"use client";

/**
 * 아래 패널(2단계 계획 Task 10, 3단계 계획 Task 0) — 모드마다 page 가 넘기는 탭 목록과 접기.
 * 보기·편집 모드는 "검사 결과 {n}" 하나, 디버그 모드는 "값 표" · "실행 비교" · "검사 결과 {n}" 이다(탭 목록은 page 가 만든다).
 * 탭마다 본문 스크롤 여부(`scroll`)를 정한다.
 * 바깥 틀(펼침 = 분할 패널, 접힘 = 머리 줄만)은 page.tsx 가 고른다 — 분할 골격은 page 의 직접 자식이어야 하기 때문이다(Part B §4-3).
 */
import type { ReactNode } from "react";

import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";

import { Button } from "@dk-oasis/shared/form";
import { Tabs } from "@dk-oasis/shared/tabs";

export interface BottomTab {
  key: string;
  label: ReactNode;
  /** 탭 머리 testid(`flow-tab-*`). */
  testId: string;
  content: ReactNode;
  /** 본문이 스크롤하는가. false 면 내용이 스스로 높이를 나눈다. */
  scroll: boolean;
}

export interface BottomPanelProps {
  tabs: BottomTab[];
  tab: string;
  onTab: (key: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function BottomPanel({ tabs, tab, onTab, collapsed, onToggle }: BottomPanelProps) {
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  return (
    <div data-testid="flow-bottom" className="rsf-bottom" data-collapsed={collapsed ? "true" : "false"}>
      <div className="rsf-bottom-head">
        <Tabs
          items={tabs.map((t) => ({ key: t.key, label: <span data-testid={t.testId}>{t.label}</span> }))}
          activeKey={active?.key ?? tab}
          onChange={(k) => {
            onTab(k);
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
      {!collapsed && active && (
        <div className="rsf-bottom-body" data-testid="flow-bottom-body" data-tab={active.key} data-scroll={active.scroll ? "true" : "false"}>
          {active.content}
        </div>
      )}
    </div>
  );
}
