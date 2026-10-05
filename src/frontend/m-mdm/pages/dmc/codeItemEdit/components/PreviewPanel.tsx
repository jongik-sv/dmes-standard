"use client";

/**
 * 카테고리 미리보기 패널(TSK-06-03 design.md §6.8, D11). 저장된 정의 기준으로 서버가 해석한 결과(compare)를 콤보 모드
 * (계층 단계 Select, 시뮬레이터 combo() 규칙) 또는 목록·근거 모드(읽기 전용 그리드)로 보인다. 카테고리 편집은 하지 않는다
 * (TSK-06-04 몫).
 */
import { useEffect, useMemo, useState } from "react";
import { Radio, Select } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { comboSteps } from "../combo";
import { LVL_KEYS } from "@/hier-tree";
import { fmtVer } from "../grid-state";
import type { CategoryInfo, PreviewResult, PreviewRow } from "../types";
import { hint, issueText, toolbar } from "./styles";

export type PreviewMode = "combo" | "list";

export interface PreviewPanelProps {
  maruCodeId: string;
  lvlCnt: number;
  categories: CategoryInfo[];
  cateId: string;
  onCateChange: (cateId: string) => void;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  result: PreviewResult | null;
}

const REASON: Record<PreviewRow["reason"], (r: PreviewRow) => string> = {
  MATCH: (r) => `대상 값 ${r.targetValue} 이 식과 전체 일치`,
  NO_MATCH: (r) => `대상 값 ${r.targetValue} 이 식과 일치하지 않음`,
  TARGET_NULL: () => "대상 칸이 비어 해당 없음",
  MEMBER: () => "소속 목록에 있음",
  NOT_MEMBER: () => "소속 목록에 없음",
};

export function PreviewPanel(props: PreviewPanelProps) {
  const { maruCodeId, lvlCnt, categories, cateId, onCateChange, mode, onModeChange, result } = props;
  const [path, setPath] = useState<string[]>([]);

  useEffect(() => setPath([]), [result]);

  const hitRows = useMemo(() => (result?.rows ?? []).filter((r) => r.hit).map((r) => {
    const row: Record<string, unknown> & { code: string } = { code: r.code, name: r.name, seq: r.seq };
    LVL_KEYS.forEach((k, i) => (row[k] = r.lvls?.[i] ?? null));
    return row;
  }), [result]);
  const steps = useMemo(() => comboSteps(hitRows, path).filter((s) => s.length > 0), [hitRows, path]);

  const listColumns = useMemo<GridColumn[]>(() => [
    { key: "code", header: "코드", meta: false, width: 140 },
    { key: "name", header: "이름", meta: false, width: 160 },
    ...(lvlCnt > 0 ? [{ key: "path", header: "경로", meta: false as const, width: 200 }] : []),
    { key: "hitMark", header: "해당", meta: false, width: 60, align: "center" as const },
    { key: "reasonText", header: "근거", meta: false, width: 260 },
  ], [lvlCnt]);
  const listRows = useMemo(() => (result?.rows ?? []).map((r) => ({
    ...r,
    path: r.lvls?.filter((v) => v).join(" > ") ?? "",
    hitMark: r.hit ? "●" : "○",
    reasonText: REASON[r.reason]?.(r) ?? r.reason,
  })), [result]);

  return (
    <div data-testid="code-preview" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={toolbar}>
        <Select data-testid="code-preview-cate" value={cateId} onChange={onCateChange}
          options={categories.map((c) => ({ value: c.cateId, label: `${c.cateId} ${c.cateName ?? ""}`.trim() }))} />
        <div data-testid="code-preview-mode">
          <Radio name="previewMode" value={mode} onChange={(v) => onModeChange(v as PreviewMode)}
            options={[{ value: "combo", label: "콤보" }, { value: "list", label: "목록·근거" }]} />
        </div>
      </div>
      {result && (
        <p style={{ ...hint, padding: "0 var(--spacing-sm)" }} data-testid="code-preview-title">
          {`CODE_LIST("${maruCodeId}", "${result.cateId}") · ${fmtVer(result.ver ?? "")} · ${result.hitCount ?? 0} / ${
            result.total ?? 0}건 해당 · 저장된 정의 기준`}
        </p>
      )}
      <div style={{ flex: 1, minHeight: 0, padding: "0 var(--spacing-sm)" }}>
        {result && mode === "combo" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-sm)" }}>
            {steps.map((items, i) => (
              <Select key={`step-${i}`} data-testid={`code-preview-step-${i}`} value={path[i] ?? ""}
                placeholder={i === 0 ? "고르세요" : "다음 단계"}
                options={items.map((it) => ({ value: it.value, label: `${it.value} (${it.kind}${it.name ? `, ${it.name}` : ""})` }))}
                onChange={(v) => setPath([...path.slice(0, i), ...(v ? [v] : [])])} />
            ))}
          </div>
        )}
        {result && mode === "list" && (
          // 목록·근거 모드는 남은 아래 공간 전체를 쓴다(고정 220px 였음). AgDataGrid 는 부모를 채우므로 이 칸만 채운다.
          <div style={{ height: "100%" }}>
            <AgDataGrid columns={listColumns} data={listRows} rowKey="code" columnSizing="fit"
              emptyMessage="이 버전에 코드가 없습니다." />
          </div>
        )}
      </div>
      {result && (
        <div style={{ padding: "var(--spacing-xs) var(--spacing-sm)" }}>
          {result.invalidExpression && <p style={issueText}>정규식 문법 오류로 해석하지 못했습니다: {result.defExpr}</p>}
          {(result.warnings ?? []).map((w) => (
            <p key={`${w.code}-${w.itemKey}`} style={issueText}>{`${w.code} — ${w.message}`}</p>
          ))}
        </div>
      )}
    </div>
  );
}
