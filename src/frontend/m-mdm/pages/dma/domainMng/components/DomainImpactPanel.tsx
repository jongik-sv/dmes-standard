"use client";

/** A-IMPACT 영향도 표(L-021·L-022)·변경 분류·diff(L-031). 03·06 참조는 서버가 SPI 로 모은 결과다. */
import { useMemo } from "react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { classificationLabel, diffValue, directionLabel } from "../change-view";
import type { DiffRow, ImpactTable } from "../types";
import { sectionTitle } from "./styles";

const IMPACT_COLUMNS: GridColumn[] = [
  { key: "TARGET", header: "영향도 대상", meta: false, width: 140 },
  { key: "COUNT", header: "건수", meta: false, width: 70, align: "right" },
  { key: "DETAIL", header: "내용", meta: false, width: 320 },
];

const DIFF_COLUMNS: GridColumn[] = [
  { key: "LABEL", header: "필드", meta: false, width: 150 },
  { key: "BEFORE", header: "이전", meta: false, width: 180, render: (v) => diffValue(v) },
  { key: "AFTER", header: "이후", meta: false, width: 180, render: (v) => diffValue(v) },
  { key: "DIRECTION", header: "방향", meta: false, width: 100, render: (v) => directionLabel(String(v ?? "")) },
];

export function impactRows(impact: ImpactTable | null | undefined): Record<string, unknown>[] {
  if (!impact) return [];
  const others = impact.otherRefs ?? [];
  return [
    { ID: "descendants", TARGET: "하위 도메인", COUNT: impact.descendants.length,
      DETAIL: impact.descendants.map((d) => d.DOMAIN_NAME).join(", ") },
    { ID: "columns", TARGET: "참조 컬럼", COUNT: impact.columns.length,
      DETAIL: impact.columns.map((c) => c.PHYS_NAME).join(", ") },
    { ID: "ruleVars", TARGET: "룰 결과 변수", COUNT: impact.ruleVars.length,
      DETAIL: impact.ruleVars.map((r) => r.REF_KEY).join(", ") },
    { ID: "layoutItems", TARGET: "레이아웃", COUNT: impact.layoutItems.length,
      DETAIL: impact.layoutItems.map((r) => r.REF_KEY).join(", ") },
    ...(others.length > 0
      ? [{ ID: "others", TARGET: "기타 참조", COUNT: others.length, DETAIL: others.map((r) => `${r.REF_KIND}:${r.REF_KEY}`).join(", ") }]
      : []),
    { ID: "systems", TARGET: "배포 시스템", COUNT: impact.systems.length,
      DETAIL: impact.deployHeld ? "배포 보류(PRD §2 규칙 7)" : impact.systems.join(", ") },
  ];
}

export interface DomainImpactPanelProps {
  impact: ImpactTable | null | undefined;
  classification: string | undefined;
  diff: DiffRow[];
}

export function DomainImpactPanel({ impact, classification, diff }: DomainImpactPanelProps) {
  const impactData = useMemo(() => impactRows(impact), [impact]);
  return (
    <div className="domain-mng__impact">
      <AgDataGrid columnSizing="fit" columns={IMPACT_COLUMNS} data={impactData} rowKey="ID" height={200}
        emptyMessage="도메인을 선택하면 영향도가 보입니다" />
      <p style={sectionTitle}>
        변경 분류: <span className="domain-mng__classification">{classificationLabel(classification)}</span>
      </p>
      <AgDataGrid columnSizing="fit" columns={DIFF_COLUMNS} data={diff as unknown as Record<string, unknown>[]} rowKey="FIELD" height={160}
        emptyMessage="변경 내역이 없습니다(도메인검증 후 표시)" />
    </div>
  );
}
