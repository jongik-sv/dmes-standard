"use client";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

export default function DashboardOverviewPage({ snapshot, onSnapshotChange }: PageProps) {
  return (
    <div>
      <p>PortalShell 초기 구성이 완료되었습니다.</p>
      <p>현재 스냅샷: {JSON.stringify(snapshot ?? {}, null, 2)}</p>
      <button
        type="button"
        className="rounded px-4 py-2 text-white"
        style={{ background: "var(--color-primary, #337ab7)" }}
        onClick={() => {
          onSnapshotChange({
            lastOpenedAt: new Date().toISOString(),
            source: "dashboard-overview",
          });
        }}
      >
        스냅샷 갱신
      </button>
    </div>
  );
}
