"use client";

/**
 * 버전 이력·변경 분류·스냅샷 출력(TSK-05-03 design.md §2·§6.8). 이력은 저장할 때 서버가 만든다(스냅샷이 바뀔 때만, D4). 행을 고르면 그
 * 버전의 스냅샷을 서버 export 로 받아 미리 보고 JSON·엑셀로 내려받는다.
 */
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { CHANGE_CLASS_TABLE, switchModeLabel } from "@/layout/change-class";
import { snapshotJsonText } from "@/layout/snapshot-export";
import { badge, empty, hint, row, sectionTitle } from "@/layout/styles";
import type { ExportResult, VersionRow } from "../types";

function modeBadge(mode: unknown) {
  const label = switchModeLabel(mode as string | null);
  if (label === "-") return label;
  const color = mode === "SEQUENTIAL" ? "var(--color-success)" : "var(--color-warning)";
  return <span style={{ ...badge, color }}>{label}</span>;
}

const COLUMNS: GridColumn[] = [
  { key: "LAYOUT_VERSION", header: "버전", width: 50, align: "right" },
  { key: "SAVED_AT", header: "저장 일시", width: 120 },
  { key: "SAVED_BY", header: "저장자", width: 90 },
  { key: "CHANGE_SUMMARY", header: "변경", width: 320 },
  { key: "TOTAL_LENGTH", header: "총 길이", width: 60, align: "right" },
  { key: "SWITCH_MODE", header: "전환 방식", width: 90, render: (v) => modeBadge(v) },
];

const CHANGE_CLASS_COLUMNS: GridColumn[] = [
  { key: "change", header: "변경", width: 220 },
  { key: "lengthOffset", header: "총 길이·기존 오프셋", width: 110 },
  { key: "mode", header: "전환", width: 280, tooltip: false, render: (v, r) => <>{modeBadge(v)} {String(r.note ?? "")}</> },
];

export interface VersionPanelProps {
  versions: VersionRow[];
  selectedVersion: number | null;
  onSelectVersion: (version: number) => void;
  snapshot: ExportResult | null;
  onDownloadJson: () => void;
  onDownloadExcel: () => void;
  busy: boolean;
}

export function VersionPanel({ versions, selectedVersion, onSelectVersion, snapshot, onDownloadJson, onDownloadExcel, busy }: VersionPanelProps) {
  return (
    <div>
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>{`버전 이력 ${versions.length}건`}</p>
      {versions.length === 0 ? (
        <p data-testid="version-list-empty" style={empty}>저장된 버전이 없습니다</p>
      ) : (
        <div data-testid="version-list">
          <AgDataGrid
            columnSizing="fit"
            columns={COLUMNS}
            data={versions as unknown as Record<string, unknown>[]}
            rowKey="LAYOUT_VERSION"
            height={160}
            highlightedRowKey={selectedVersion}
            emptyMessage="저장된 버전이 없습니다"
            onRowClick={(r) => onSelectVersion(Number(r.LAYOUT_VERSION))}
          />
        </div>
      )}
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>변경 분류</p>
      <div data-testid="change-class-table">
        <AgDataGrid
          columnSizing="fit"
          columns={CHANGE_CLASS_COLUMNS}
          data={CHANGE_CLASS_TABLE as unknown as Record<string, unknown>[]}
          rowKey="change"
          height="auto"
        />
      </div>
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>
        {`레이아웃 스냅샷${snapshot?.layoutVersion != null ? ` — 버전 ${snapshot.layoutVersion}` : ""}`}
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
