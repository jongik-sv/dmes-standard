"use client";

import React from "react";

export interface TabItem {
  /** 탭 식별자 */
  key: string;
  /** 탭에 표시할 라벨 */
  label: React.ReactNode;
  /** 비활성 탭 (클릭 불가, 회색 표시) */
  disabled?: boolean;
}

export interface TabsProps {
  /** 탭 목록 */
  items: TabItem[];
  /** 현재 활성 탭 key */
  activeKey: string;
  /** 탭 클릭 시 호출 */
  onChange: (key: string) => void;
  /** wrapper className */
  className?: string;
  /** wrapper 스타일 추가 (마진 등) */
  style?: React.CSSProperties;
}

/**
 * 밑줄형 탭 — 작업지시 대시보드 / 자원별부하 / 상세 패널 등에서 쓰던
 * 동일한 underline 탭 스타일을 공통 컴포넌트로 추출한 것.
 *
 * shared 의 CSS 파일은 빌드 시 JS import 가 제거되어 소비자 측에서 자동 로드되지 않으므로,
 * (LookupIconButton 과 동일하게) 외부 CSS 없이 인라인 스타일로 자급한다.
 */
const wrapStyle: React.CSSProperties = {
  display: "flex",
  borderBottom: "1px solid #e0e0e0",
  background: "#fff",
};

const tabStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  color: disabled ? "#9ca3af" : active ? "var(--color-primary, #337ab7)" : "#555",
  background: "transparent",
  border: "none",
  borderBottom: active
    ? "2px solid var(--color-primary, #337ab7)"
    : "2px solid transparent",
  cursor: disabled ? "not-allowed" : "pointer",
  marginBottom: -1,
  whiteSpace: "nowrap",
});

export function Tabs({ items, activeKey, onChange, className = "", style }: TabsProps) {
  return (
    <div className={`cm-tabs ${className}`.trim()} style={{ ...wrapStyle, ...style }} role="tablist">
      {items.map((t) => {
        const active = t.key === activeKey;
        const disabled = !!t.disabled;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            className={active ? "cm-tab cm-tab--active" : "cm-tab"}
            style={tabStyle(active, disabled)}
            onClick={() => !disabled && onChange(t.key)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
