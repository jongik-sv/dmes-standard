"use client";

/**
 * 로그 분석 (anl/logViewer) — 본문 하단 문서 탭 바 (LOG / JSON / Binder).
 * 원본: analog-express-ui-plate LogViewer.js 의 DocTypeTab(reversed tabs) 이식.
 * 탭 전환 시 각 pane 은 언마운트하지 않고 display 토글한다 (Monaco 마운트 유지 —
 * 재배치는 automaticLayout 이 담당).
 */

import type { DocTabKey } from "./types";

const DOC_TABS: { key: DocTabKey; label: string }[] = [
  { key: "text", label: "LOG" },
  { key: "json", label: "JSON" },
  { key: "binder", label: "Binder" },
];

interface DocTabBarProps {
  active: DocTabKey;
  onSelect: (tab: DocTabKey) => void;
}

export function DocTabBar({ active, onSelect }: DocTabBarProps) {
  return (
    <div className="anl-doc-tab-bar" role="tablist" aria-label="문서 탭">
      {DOC_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`anl-doc-tab ${active === tab.key ? "anl-doc-tab-active" : ""}`.trim()}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
