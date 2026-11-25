"use client";

/**
 * 기대값 대조 — 핀(설계 경로의 기대값) 결과, 단계 기대 결과, 골든 스냅샷 차이. 핀은 지우거나(✕) 근거 추적 창에서 더한다.
 */
import { memo } from "react";

import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
import { Button } from "@dk-oasis/shared/form";

import { verdictExpectText } from "./logic";
import type { CaseEval, Pin, PinResult, VerdictExpect } from "./types";

const OK = { bg: "var(--color-success-soft)", color: "var(--color-success)" };
const NG = { bg: "var(--color-danger-soft)", color: "var(--color-danger)" };

const okBadge = (v: unknown) => (v == null ? <GridBadge label="미실행" muted /> : v ? <GridBadge label="✓ 일치" {...OK} /> : <GridBadge label="✕ 불일치" {...NG} />);

const DIFF_COLUMNS: GridColumn[] = [
  { key: "path", header: "설계 경로", width: 3, minWidth: 160, align: "left", meta: false },
  { key: "before", header: "골든", width: 2, minWidth: 100, align: "left", meta: false },
  { key: "after", header: "현재", width: 2, minWidth: 100, align: "left", meta: false },
];

const VERDICT_COLUMNS: GridColumn[] = [
  { key: "text", header: "단계 기대", width: 3, minWidth: 150, align: "left", meta: false },
  { key: "actual", header: "실제", width: 2, minWidth: 100, align: "left", meta: false },
  { key: "ok", header: "결과", width: 1, minWidth: 80, align: "center", meta: false, render: okBadge },
];

export interface ExpectPanelProps {
  pins: Pin[];
  verdicts: VerdictExpect[];
  ev: CaseEval | null;
  busy: boolean;
  onRemovePin: (path: string) => void;
}

export const ExpectPanel = memo(function ExpectPanel({ pins, verdicts, ev, busy, onRemovePin }: ExpectPanelProps) {
  const pinRows = pins.map((p) => {
    const r: PinResult | undefined = ev?.pins?.find((x) => x.path === p.path);
    return { ...p, actual: r ? (r.actual ?? "") : "", ok: r ? r.ok : null };
  });
  const verdictRows = verdicts.map((v, i) => {
    const r = ev?.verdicts?.[i];
    return { _k: String(i), text: verdictExpectText(v), actual: r ? (r.actual ?? "") : "", ok: r ? r.ok : null };
  });
  const pinColumns: GridColumn[] = [
    { key: "label", header: "항목", width: 2, minWidth: 100, align: "left", meta: false },
    { key: "path", header: "설계 경로", width: 3, minWidth: 150, align: "left", meta: false },
    { key: "op", header: "조건", width: 1, minWidth: 52, align: "center", meta: false },
    { key: "val", header: "기대값", width: 2, minWidth: 80, align: "left", meta: false },
    { key: "actual", header: "현재값", width: 2, minWidth: 80, align: "left", meta: false },
    { key: "ok", header: "결과", width: 1, minWidth: 80, align: "center", meta: false, render: okBadge },
    {
      key: "_del",
      header: "",
      width: 1,
      minWidth: 52,
      align: "center",
      meta: false,
      sortable: false,
      filter: false,
      render: (_v, row) => (
        <Button aria-label={`${String(row.label)} 핀 지우기`} title="핀 지우기" onClick={() => onRemovePin(String(row.path))} disabled={busy}>
          ✕
        </Button>
      ),
    },
  ];
  return (
    <div className="mqc-qd-blocks">
      <div className="mqc-qd-sub">기대값 대조</div>
      <AgDataGrid
        gridId="expect-pins"
        title="핀(설계값 기대)"
        count={pins.length}
        rowKey="path"
        columns={pinColumns}
        data={pinRows as unknown as Record<string, unknown>[]}
        height="auto"
        columnSizing="fit"
        personalize={false}
      />
      <AgDataGrid
        gridId="expect-verdicts"
        title="단계 기대"
        count={verdicts.length}
        rowKey="_k"
        columns={VERDICT_COLUMNS}
        data={verdictRows}
        height="auto"
        columnSizing="fit"
        personalize={false}
      />
      <AgDataGrid
        gridId="expect-golden"
        title={ev?.goldenAt ? `골든 차이 (골든 ${ev.goldenAt})` : "골든 차이 (골든 없음)"}
        count={ev?.goldenDiff?.length ?? 0}
        rowKey="path"
        columns={DIFF_COLUMNS}
        data={(ev?.goldenDiff ?? []) as unknown as Record<string, unknown>[]}
        height="auto"
        columnSizing="fit"
        personalize={false}
      />
    </div>
  );
});
