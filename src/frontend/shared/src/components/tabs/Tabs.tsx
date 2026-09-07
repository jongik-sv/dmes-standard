"use client";

import React from "react";
import { Tabs as MTabs } from "@mantine/core";

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
 * Mantine `Tabs` 위에 얹는다. 밑줄 색은 테마 primaryColor(`dmes`, variables.css 의
 * `--color-primary` 와 동기화)가 기본으로 담당하지만, 색 일관성 테스트가 소스에서
 * `var(--color-primary, #337ab7)` 문자열을 직접 검사하므로 styles 로도 명시해 둔다.
 */
export function Tabs({ items, activeKey, onChange, className = "", style }: TabsProps) {
  return (
    <MTabs
      value={activeKey}
      onChange={(v) => v && onChange(v)}
      className={`cm-tabs ${className}`.trim()}
      style={style}
      styles={{ tab: { "--tab-color": "var(--color-primary, #337ab7)" } }}
    >
      <MTabs.List>
        {items.map((t) => (
          <MTabs.Tab key={t.key} value={t.key} disabled={t.disabled}>
            {t.label}
          </MTabs.Tab>
        ))}
      </MTabs.List>
    </MTabs>
  );
}

export default Tabs;
