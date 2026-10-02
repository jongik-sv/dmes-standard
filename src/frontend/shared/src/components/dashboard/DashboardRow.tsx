"use client";

/**
 * 대시보드 행 — 카드 여러 개를 한 줄로 묶는다. 행 안 어느 카드의 접기 버튼을 눌러도 행 전체가 접히고 펼쳐진다.
 * - 행은 격자 한 줄 전체를 차지하는 12열 하위 격자다. 카드 칸 수(span)는 행 폭 기준이고, 폭 조절로 행 안에서
 *   줄바꿈이 생겨도 같은 행 묶음은 함께 접힌다. 다른 행과 한 줄에 섞이지 않는다.
 * - 접히면 행 안 카드가 모두 머리만 남으므로 행 높이가 머리 높이가 되고 아래 행이 바로 올라온다.
 * - 접힘은 DashboardGrid 배치 상태의 `row:{rowId}` 에 저장된다(layoutKey 가 있으면 사용자별로 브라우저에 남는다).
 * - collapsible=false(예: 카드 머리가 없는 KPI 행)면 접기 대상에서 뺀다.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

import { rowLayoutKey, useDashboardLayout } from "./layout";
import { DashboardStyle } from "./styles";

export interface DashboardRowState {
  rowId: string;
  /** 행이 접혔는지. */
  collapsed: boolean;
  /** 행 접기를 쓸 수 있는지. */
  collapsible: boolean;
  /** 행 전체를 접거나 펼친다. */
  toggle: () => void;
}

const DashboardRowContext = createContext<DashboardRowState | null>(null);

/** 카드가 들어 있는 행(없으면 null). */
export function useDashboardRow(): DashboardRowState | null {
  return useContext(DashboardRowContext);
}

export interface DashboardRowProps {
  /** 행 ID(같은 DashboardGrid 안에서 고유). 접힘 저장 키가 된다. */
  rowId: string;
  /** 행 접기 사용(기본 true). */
  collapsible?: boolean;
  /** 행 안 카드·칸. */
  children: ReactNode;
  /** 뿌리 aria-label. */
  ariaLabel?: string;
  /** 뿌리에 더할 클래스. */
  className?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

export function DashboardRow({
  rowId,
  collapsible = true,
  children,
  ariaLabel,
  className,
  testId,
}: DashboardRowProps) {
  const layout = useDashboardLayout();
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const key = rowLayoutKey(rowId);
  const collapsed = collapsible && (layout ? layout.get(key).collapsed === true : localCollapsed);
  const toggle = () => {
    if (!collapsible) return;
    if (layout) layout.update(key, { collapsed: !collapsed });
    else setLocalCollapsed(!collapsed);
  };
  const value: DashboardRowState = { rowId, collapsed, collapsible, toggle };
  return (
    <DashboardRowContext.Provider value={value}>
      <div
        className={className ? `cm-dash-row ${className}` : "cm-dash-row"}
        role="group"
        aria-label={ariaLabel}
        data-row-id={rowId}
        data-collapsed={collapsed ? "true" : undefined}
        data-testid={testId}
      >
        <DashboardStyle />
        {children}
      </div>
    </DashboardRowContext.Provider>
  );
}
