"use client";

/**
 * 환산 계산기(A-PREVIEW) — 값과 입력 단위만 받으면 같은 차원의 모든 단위로 환산값을 목록에 보여준다.
 *
 * 값·단위가 바뀌면 잠시 뒤(DEBOUNCE_MS) 자동으로 계산한다. 단위마다 서버 `compare` 를 병렬로 부르고 그 응답을
 * 그대로 표시한다(클라이언트 계산 없음, 불변 규칙 I2). 목록에서 행을 고르면 그 단위가 입력 단위가 되고,
 * 결과 행을 누르면 그 단위·환산값이 새 입력이 된다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { ComboBox, Input } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";

import { convertPreview } from "./api";
import { formatConvertedValue, fromUnitComboData, parseCalcValue, sameDimensionUnits, type UnitOption } from "./types";

const DEBOUNCE_MS = 300;

const RESULT_COLUMNS: GridColumn[] = [
  { key: "unitCode", header: "단위", width: 120, align: "left" },
  { key: "display", header: "환산값", width: 200, align: "right" },
];

/** 단위별 계산 결과 — display 는 서버 값의 표시 문자열, 실패면 "계산 실패". */
type Computed = { key: string; display: Record<string, string> };

export interface ConvertCalculatorProps {
  unitOptions: UnitOption[];
  /** 목록에서 고른 단위 — 바뀌면 입력 단위로 채운다. */
  selectedUnitCode: string;
  /** 서버 계산이 실패했을 때 한 번 알린다(같은 계산에서 여러 단위가 실패해도 첫 메시지만). */
  onError?: (message: string) => void;
}

export function ConvertCalculator({ unitOptions, selectedUnitCode, onError }: ConvertCalculatorProps) {
  const [valueText, setValueText] = useState("");
  const [fromUnitCode, setFromUnitCode] = useState("");
  const [computed, setComputed] = useState<Computed | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (selectedUnitCode) setFromUnitCode(selectedUnitCode);
  }, [selectedUnitCode]);

  const fromUnitComboItems = useMemo(() => fromUnitComboData(unitOptions), [unitOptions]);
  const targets = useMemo(() => sameDimensionUnits(unitOptions, fromUnitCode), [unitOptions, fromUnitCode]);
  const parsed = parseCalcValue(valueText);
  const parsedValue = parsed.kind === "ok" ? parsed.value : null;
  const calcKey = parsedValue === null ? "" : `${parsedValue}|${fromUnitCode}`;

  useEffect(() => {
    const seq = ++requestSeq.current;
    if (parsedValue === null || targets.length === 0) return;
    const timer = setTimeout(() => {
      void Promise.all(
        targets.map(async (t): Promise<{ unitCode: string; display: string; error?: string }> => {
          try {
            const res = await convertPreview({ value: parsedValue, fromUnitCode, toUnitCode: t.unitCode });
            return { unitCode: t.unitCode, display: res.value != null ? formatConvertedValue(Number(res.value)) : "" };
          } catch (e) {
            return { unitCode: t.unitCode, display: "계산 실패", error: e instanceof Error ? e.message : String(e) };
          }
        }),
      ).then((results) => {
        if (seq !== requestSeq.current) return;
        setComputed({ key: `${parsedValue}|${fromUnitCode}`, display: Object.fromEntries(results.map((r) => [r.unitCode, r.display])) });
        const firstError = results.find((r) => r.error)?.error;
        if (firstError) onError?.(firstError);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [parsedValue, fromUnitCode, targets, onError]);

  // 지금 입력과 다른 계산 결과는 보이지 않는다(값을 지우거나 단위를 바꾸면 환산값 칸이 바로 빈다).
  const resultRows = useMemo(
    () =>
      targets.map((t) => ({
        unitCode: t.unitCode,
        display: computed && computed.key === calcKey ? (computed.display[t.unitCode] ?? "") : "",
      })),
    [targets, computed, calcKey],
  );

  /** 결과 행 클릭 — 그 단위와 서버 환산값을 새 입력으로 삼는다(계산 기준 바꾸기). */
  const handleResultClick = useCallback((row: Record<string, unknown>) => {
    const unitCode = String(row.unitCode ?? "");
    const display = String(row.display ?? "");
    if (!unitCode) return;
    setFromUnitCode(unitCode);
    if (parseCalcValue(display).kind === "ok") setValueText(display);
  }, []);

  return (
    <>
      <p style={{ padding: "0 var(--spacing-md)", fontWeight: 600, color: "var(--color-text-secondary)" }}>환산 계산기</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="valueText" meta={false} label="값" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                value={valueText}
                onChange={setValueText}
                inputMode="decimal"
                placeholder="값을 넣으면 바로 환산합니다 (예: 2,500)"
                aria-label="환산할 값"
                error={parsed.kind === "invalid" ? "숫자만 입력할 수 있습니다." : undefined}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="fromUnitCode" meta={false} label="입력 단위" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <ComboBox
                data={fromUnitComboItems}
                value={fromUnitCode}
                onChange={setFromUnitCode}
                placeholder="단위를 고르면 같은 차원의 단위가 아래에 나옵니다"
                aria-label="입력 단위"
              />
            </td>
          </tr>
        </tbody>
      </table>
      {targets.length > 0 && (
        <AgDataGrid
          height="auto"
          columnSizing="fit"
          columns={RESULT_COLUMNS}
          data={resultRows}
          rowKey="unitCode"
          highlightedRowKey={fromUnitCode}
          onRowClick={(row) => handleResultClick(row as Record<string, unknown>)}
        />
      )}
    </>
  );
}
