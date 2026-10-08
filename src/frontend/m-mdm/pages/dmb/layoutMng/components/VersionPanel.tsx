"use client";

/**
 * 버전 이력·변경 분류·스냅샷 출력(TSK-05-03 design.md §2·§6.8, D-144 3단계). 버전은 [새 버전]·확정으로 생긴다(저장은 버전을 만들지
 * 않는다). 행을 고르면 그 버전·시각 T 의 스냅샷을 서버 export 로 받아 미리 보고 JSON·엑셀로 내려받는다.
 */
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { CHANGE_CLASS_TABLE, switchModeLabel } from "@/layout/change-class";
import { snapshotJsonText } from "@/layout/snapshot-export";
import type { LayoutVersionRow } from "@/layout/types";
import { VersionStatusBadge, fmtVer, normVer, type MdmVersionStatus } from "@/shell";
import { badge, hint, row, sectionTitle } from "@/layout/styles";
import type { ExportResult } from "../types";
import { uiCols } from "@/ui-meta";

function modeBadge(mode: unknown) {
  const label = switchModeLabel(mode as string | null);
  if (label === "-") return label;
  const color = mode === "SEQUENTIAL" ? "var(--color-success)" : "var(--color-warning)";
  return <span style={{ ...badge, color }}>{label}</span>;
}

const COLUMNS: GridColumn[] = [
  { key: "VER", meta: false, header: "버전", width: 70, render: (v) => fmtVer(v as string) },
  { key: "VER_KIND", header: "종류", width: 55, render: (v) => (v === "MINOR" ? "minor" : "major") },
  { key: "STATUS", meta: false, header: "상태", width: 90,
    render: (v, r) => <VersionStatusBadge status={v as MdmVersionStatus} applyFrom={(r.APPLY_FROM as string) ?? null} /> },
  { key: "APPLY_FROM", header: "적용 시작", width: 130 },
  { key: "APPLY_TO", header: "적용 끝", width: 130 },
  { key: "OWNER_ID", header: "소유자", width: 80 },
  { key: "CHANGE_SUMMARY", header: "변경", width: 280,
    render: (v, r) => (r.LEGACY === "Y" ? `(이행 전 스냅샷) ${(v as string | null) ?? ""}` : ((v as string | null) ?? "")) },
  { key: "OWN_LENGTH", header: "자기 길이", width: 70, align: "right" },
  { key: "SWITCH_MODE", header: "전환 방식", width: 90, render: (v) => modeBadge(v) },
];

const CHANGE_CLASS_COLUMNS: GridColumn[] = uiCols([
  { key: "change", header: "변경", width: 220 },
  { key: "lengthOffset", header: "총 길이·기존 오프셋", width: 110 },
  { key: "mode", header: "전환", width: 280, tooltip: false, render: (v, r) => <>{modeBadge(v)} {String(r.note ?? "")}</> },
]);

export interface VersionPanelProps {
  versions: LayoutVersionRow[];
  selectedVersion: string | null;
  onSelectVersion: (version: string) => void;
  snapshot: ExportResult | null;
  onDownloadJson: () => void;
  onDownloadExcel: () => void;
  busy: boolean;
}

export function VersionPanel({ versions, selectedVersion, onSelectVersion, snapshot, onDownloadJson, onDownloadExcel, busy }: VersionPanelProps) {
  // 행 키·강조·선택 값은 정규 문자열이다 — 서버가 "1.1"·"1" 처럼 보내도 "1.100"·"1.000" 으로 맞춰 비교한다.
  const rows = versions.map((v) => ({ ...v, VER_KEY: normVer(v.VER) ?? v.VER }));
  return (
    <div>
      <div data-testid="version-list">
        <AgDataGrid gridId="versionHistory"
          title="버전 이력"
          columnSizing="fit"
          columns={COLUMNS}
          data={rows as unknown as Record<string, unknown>[]}
          rowKey="VER_KEY"
          height={160}
          highlightedRowKey={normVer(selectedVersion)}
          emptyMessage="저장된 버전이 없습니다"
          emptyTestId="version-list-empty"
          onRowClick={(r) => onSelectVersion(String(r.VER_KEY))}
        />
      </div>
      <div data-testid="change-class-table">
        <AgDataGrid gridId="changeClass"
          title="변경 분류"
          columnSizing="fit"
          columns={CHANGE_CLASS_COLUMNS}
          data={CHANGE_CLASS_TABLE as unknown as Record<string, unknown>[]}
          rowKey="change"
          height="auto"
        />
      </div>
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>
        {`레이아웃 스냅샷${snapshot?.ver ? ` — ${fmtVer(snapshot.ver)} · 시각 ${snapshot.asOf ?? ""}` : ""}`}
      </p>
      <div style={row}>
        <Button data-testid="snapshot-download-json" size="sm" disabled={busy || !snapshot?.snapshot} onClick={onDownloadJson}>
          JSON 내려받기
        </Button>
        <Button data-testid="snapshot-download-excel" size="sm" disabled={busy || !snapshot?.snapshot} onClick={onDownloadExcel}>
          엑셀 내려받기
        </Button>
        <span style={hint}>배포 대상 스냅샷이며 파생·계산값이 풀려 들어갑니다. 배포는 이번 범위 밖입니다.</span>
      </div>
      {snapshot?.snapshot && (
        <pre data-testid="snapshot-preview" style={{ maxHeight: 240, overflow: "auto", fontSize: "var(--font-size-xs)" }}>
          {snapshotJsonText(snapshot.snapshot)}
        </pre>
      )}
    </div>
  );
}
