"use client";

/**
 * 경미 수정 패널(TSK-06-03 design.md §6.8, 04:522-549). RELEASED 코드 행의 이름·약칭·순서·설명만 제자리에서 고친다.
 * 코드·계층 칸·추가 컬럼 값은 잠기며 새 버전으로만 바꾼다(수용 기준 5) — 입력은 보이되 disabled 다. 확정 전 버전이 같은
 * 키를 고쳤으면(patchBlocked) 저장을 막고 "DRAFT에서 고치세요" 로 안내한다(수용 기준 6, D8).
 */
import { useEffect, useState } from "react";
import { Button, Input } from "@dk-oasis/shared/form";
import type { ServerRow } from "../grid-state";
import { fieldLabel, fieldRow, hint } from "./styles";

export interface PatchValues {
  name: string;
  alterName: string;
  seq: string;
  description: string;
}

export interface PatchPanelProps {
  row: ServerRow | null;
  lvlCnt: number;
  attrLabels: { no: number; label: string }[];
  canPatch: boolean;
  busy?: boolean;
  onSave: (values: PatchValues) => void;
}

const LVL = ["lvl1", "lvl2", "lvl3", "lvl4", "lvl5"] as const;
const attrKey = (no: number) => `attr${String(no).padStart(2, "0")}` as keyof ServerRow;
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function PatchPanel({ row, lvlCnt, attrLabels, canPatch, busy, onSave }: PatchPanelProps) {
  const [values, setValues] = useState<PatchValues>({ name: "", alterName: "", seq: "", description: "" });

  useEffect(() => {
    setValues({
      name: text(row?.name), alterName: text(row?.alterName), seq: text(row?.seq), description: text(row?.description),
    });
  }, [row]);

  const set = (k: keyof PatchValues) => (v: string) => setValues((s) => ({ ...s, [k]: v }));
  const blocked = !!row?.patchBlocked;

  return (
    <div data-testid="patch-panel" style={{ padding: "var(--spacing-sm)", overflowY: "auto", height: "100%" }}>
      <p style={hint}>이름·약칭·순서·설명만 고친다. 코드·계층 칸·추가 컬럼 값은 잠기며 새 버전으로만 바꾼다</p>
      {!row ? (
        <p style={hint}>그리드에서 고칠 행을 고르세요.</p>
      ) : (
        <>
          <div style={fieldRow}>
            <span style={fieldLabel}>코드</span>
            <Input data-testid="patch-code" value={row.code} disabled onChange={() => {}} />
          </div>
          <div style={fieldRow}>
            <span style={fieldLabel}>이름</span>
            <Input data-testid="patch-name" value={values.name} disabled={busy} onChange={set("name")} />
          </div>
          <div style={fieldRow}>
            <span style={fieldLabel}>약칭</span>
            <Input data-testid="patch-alter-name" value={values.alterName} disabled={busy} onChange={set("alterName")} />
          </div>
          <div style={fieldRow}>
            <span style={fieldLabel}>순서</span>
            <Input data-testid="patch-seq" type="number" value={values.seq} disabled={busy} onChange={set("seq")} />
          </div>
          <div style={fieldRow}>
            <span style={fieldLabel}>설명</span>
            <Input data-testid="patch-description" value={values.description} disabled={busy}
              onChange={set("description")} />
          </div>
          {LVL.slice(0, lvlCnt).map((k, i) => (
            <div key={k} style={fieldRow}>
              <span style={fieldLabel}>{i + 1}차</span>
              <Input data-testid={`patch-${k}`} value={text(row[k])} disabled onChange={() => {}} />
            </div>
          ))}
          {attrLabels.map((a) => (
            <div key={a.no} style={fieldRow}>
              <span style={fieldLabel}>{a.label}</span>
              <Input data-testid={`patch-${String(attrKey(a.no))}`} value={text(row[attrKey(a.no)])} disabled
                onChange={() => {}} />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", marginTop: "var(--spacing-sm)" }}>
            <Button data-testid="patch-save" variant="primary" disabled={!canPatch || blocked || busy}
              onClick={() => onSave(values)}>
              경미 수정 저장
            </Button>
            {blocked && (
              <span data-testid="patch-blocked" className="form-error-message">DRAFT에서 고치세요</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
