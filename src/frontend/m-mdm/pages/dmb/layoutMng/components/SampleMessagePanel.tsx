"use client";

/**
 * 샘플 전문 렌더(TSK-05-03 design.md §2·§6.8, D13) — 본문 DATA 항목마다 예시 값을 넣고 서버 execute 가 스냅샷 인코딩 바이트 기준으로
 * 만든 한 줄을 구역 색으로 보인다. 공백은 가운뎃점, 마우스를 올리면 구역·이름·위치. 화면은 바이트를 세지 않는다(EUC-KR, 불변 I2).
 */
import { Button, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { ZONE_LEGEND, ruler, segmentTitle, visibleText, zoneColor, zoneKey } from "@/layout/sample-line";
import { hint, row, sectionTitle } from "@/layout/styles";
import type { LayoutItemRow } from "@/layout/types";
import type { SampleResult } from "../types";

const mono = { fontFamily: "var(--font-family-mono, monospace)", whiteSpace: "pre" as const, overflowX: "auto" as const };

// 구간 목록 — 구간 수는 헤더 항목 수만큼 늘어나므로 고정 높이로 둔다.
const SEGMENT_COLUMNS: GridColumn[] = [
  { key: "POSITION", header: "위치", width: 80 },
  { key: "ZONE", header: "구역", width: 70, tooltip: false, render: (v, r) => (v === "BODY" ? "본문" : String(r.ZONE_LABEL ?? "")) },
  { key: "NAME", header: "항목", width: 140 },
  { key: "FILL_KIND", header: "fill_kind", width: 80 },
  { key: "TEXT", header: "값", width: 200, render: (v) => visibleText(String(v ?? "")) },
];

export interface SampleMessagePanelProps {
  items: LayoutItemRow[];
  values: Record<string, string>;
  onChange: (phys: string, value: string) => void;
  result: SampleResult | null;
  busy: boolean;
  canRun: boolean;
  onRender: () => void;
}

export function SampleMessagePanel({ items, values, onChange, result, busy, canRun, onRender }: SampleMessagePanelProps) {
  const inputs = items.filter((i) => i.FILL_KIND === "DATA" && i.COLUMN_PHYS);
  const segments = result?.segments ?? [];
  const issues = result?.issues ?? [];
  const errors = result?.errors ?? [];
  return (
    <div>
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>예시 값</p>
      <div style={row}>
        {inputs.map((i) => {
          const phys = String(i.COLUMN_PHYS);
          const unit = i.DATA_TYPE === "NUMBER" && i.UNIT_CODE ? ` (${i.UNIT_CODE})` : "";
          return (
            <label key={phys} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)" }}>
              <span>{`${i.DISPLAY_NAME ?? phys}${unit}`}</span>
              <Input data-testid={`sample-input-${phys}`} aria-label={`${phys} 예시 값`} value={values[phys] ?? ""}
                onChange={(v) => onChange(phys, v)} />
            </label>
          );
        })}
        {canRun ? (
          <Button data-testid="sample-render" size="sm" disabled={busy} onClick={onRender}>렌더</Button>
        ) : (
          <span style={hint}>표준 관리자만 실행합니다</span>
        )}
      </div>
      {issues.length > 0 && (
        <ul data-testid="sample-errors" style={{ color: "var(--color-danger)" }}>
          {issues.map((x, k) => <li key={k}>{`${x.CODE}${x.SEQ != null ? `[${x.SEQ}]` : ""} ${x.MESSAGE}`}</li>)}
        </ul>
      )}
      {segments.length > 0 && (
        <>
          <div style={{ marginTop: "var(--spacing-sm)", ...mono }}>
            <div data-testid="sample-ruler" style={{ color: "var(--color-text-muted)" }}>{ruler(result?.totalBytes ?? 0)}</div>
            <div data-testid="sample-line">
              {segments.map((s) => {
                const key = zoneKey(s);
                return (
                  <span key={s.INDEX} data-testid={`sample-seg-${s.INDEX}`} data-zone={key} title={segmentTitle(s)}
                    style={{ background: zoneColor(key) }}>
                    {visibleText(s.TEXT)}
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ ...row, marginTop: "var(--spacing-xs)" }}>
            {ZONE_LEGEND.map((z) => (
              <span key={z.key} style={{ background: zoneColor(z.key), padding: "0 var(--spacing-xs)" }}>{z.label}</span>
            ))}
            <span data-testid="sample-length">{`총 ${result?.totalBytes}바이트 (${result?.encoding})`}</span>
          </div>
          {errors.length > 0 && (
            <ul data-testid="sample-errors" style={{ color: "var(--color-danger)" }}>
              {errors.map((e, k) => <li key={k}>{`${e.SEQ ?? ""} ${e.COLUMN_PHYS ?? ""} ${e.MESSAGE}`}</li>)}
            </ul>
          )}
          <div data-testid="sample-segments" style={{ marginTop: "var(--spacing-sm)" }}>
            <AgDataGrid
              columnSizing="fit"
              columns={SEGMENT_COLUMNS}
              data={segments as unknown as Record<string, unknown>[]}
              rowKey="INDEX"
              height={240}
            />
          </div>
          <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>같은 스냅샷으로 파싱한 결과</p>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              {(result?.parsed ?? []).map((p) => (
                <tr key={p.COLUMN_PHYS}>
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name={p.COLUMN_PHYS} label={p.NAME ?? p.COLUMN_PHYS} meta={false} />
                  </th>
                  <td style={DETAIL_VALUE_CELL} data-testid={`sample-parsed-${p.COLUMN_PHYS}`}>{p.VALUE ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
