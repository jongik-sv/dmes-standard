"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import "@dk-oasis/shared/layout.css";

import SampleInventoryPage from "@dk-oasis/m-mls/pages/sample";
import SamplePlanningPage from "@dk-oasis/m-mpn/pages/sample";
import SampleProductionPage from "@dk-oasis/m-mpp/pages/sample";
import SampleInspectionPage from "@dk-oasis/m-mqc/pages/sample";

/**
 * 포털 셸 자리표시자.
 *
 * 실제 배포에서는 @dk-oasis/shared/portal-shell 의 PortalShell + usePortalMenu 로
 * 메뉴 트리를 받아 탭 단위로 화면을 동적 로딩한다. 이 템플릿은 배선 구조만 보여주기 위해
 * 각 화면 라이브러리의 sample 엔트리를 정적으로 import 해 나란히 렌더링한다.
 */
const MODULES: { moduleId: string; label: string; Page: (props: PageProps) => ReactNode }[] = [
  { moduleId: "mpn", label: "계획·스케줄링", Page: SamplePlanningPage },
  { moduleId: "mls", label: "물류·재고", Page: SampleInventoryPage },
  { moduleId: "mqc", label: "품질·검사", Page: SampleInspectionPage },
  { moduleId: "mpp", label: "생산", Page: SampleProductionPage },
];

export default function PortalPage() {
  const [activeModuleId, setActiveModuleId] = useState(MODULES[0].moduleId);
  const active = MODULES.find((m) => m.moduleId === activeModuleId) ?? MODULES[0];

  // 화면 상태 스냅샷 — 실제 셸에서는 탭별로 보관해 탭 전환 시 복원한다.
  const handleSnapshotChange = useCallback(() => {}, []);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <nav
        style={{
          width: 200,
          flexShrink: 0,
          borderRight: "1px solid #d6dbe3",
          padding: 12,
        }}
      >
        <h2 style={{ fontSize: 13, color: "#5b6472", margin: "4px 0 12px" }}>모듈</h2>
        {MODULES.map((m) => (
          <button
            key={m.moduleId}
            type="button"
            onClick={() => setActiveModuleId(m.moduleId)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 8px",
              marginBottom: 4,
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              background: m.moduleId === activeModuleId ? "#e6edf7" : "transparent",
            }}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <active.Page
          tabId={`${active.moduleId}:sample`}
          snapshot={null}
          onSnapshotChange={handleSnapshotChange}
        />
      </main>
    </div>
  );
}
