"use client";

/**
 * unitMng 상세 폼(A-DETAIL) — 단위 코드·차원·기준 단위·환산 계수.
 *
 * 입력 state 는 이 컴포넌트에만 둔다(Screen-Performance-Guide R12). 화면 루트가 폼을 들고 있으면 한 글자마다 루트 아래
 * 목록 그리드까지 다시 그려진다. 루트는 `ref` 핸들로 폼을 채우고(`load`) 저장 때 읽는다(`getForm`) — 저장 단추가 루트의
 * 머리 버튼 줄에 있기 때문이다. 차원 선택(D-002)·새 차원 생성도 여기서 처리한다.
 */
import { memo, useCallback, useImperativeHandle, useMemo, useState, type Ref } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { ComboBox, Input } from "@dk-oasis/shared/form";

import { dimensionLabel, type DimensionOption, type UnitForm } from "./types";

/** 루트가 상세 폼과 대화하는 핸들. */
export type UnitDetailHandle = {
  /** 폼을 새로 채운다(행 선택·[단위 등록]·조회 뒤 비우기). 새 차원 생성 상태도 되돌린다. */
  load(form: UnitForm | null): void;
  /** 지금 입력된 폼 값(저장용). */
  getForm(): UnitForm | null;
};

type Props = {
  ref: Ref<UnitDetailHandle>;
  /** 저장·조회 중에는 칸을 잠근다. */
  busy: boolean;
  /** 고른 행의 단위 코드 — 수정 모드에서 단위 코드 칸을 잠근다(빈 문자열이면 신규). */
  selectedUnitCode: string;
  /** 차원 콤보 값·기존 차원 선택 때 기준 단위 자동 채움(D2). */
  dimensionOptions: DimensionOption[];
};

export const UnitDetailForm = memo(function UnitDetailForm({ ref, busy, selectedUnitCode, dimensionOptions }: Props) {
  const [form, setForm] = useState<UnitForm | null>(null);
  const [isNewDimension, setIsNewDimension] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      load: (next) => {
        setForm(next);
        setIsNewDimension(false);
      },
      getForm: () => form,
    }),
    [form],
  );

  const change = useCallback((key: keyof UnitForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  /** D-002 기존 차원 선택 — D-003 기준 단위를 그 차원의 확립된 값으로 자동 채운다(D2, 서버 재검증). */
  const handleDimensionSelect = useCallback(
    (value: string) => {
      const match = dimensionOptions.find((o) => o.dimension === value);
      setIsNewDimension(false);
      setForm((prev) =>
        prev ? { ...prev, dimension: value, baseUnit: match ? match.baseUnit : prev.baseUnit } : prev,
      );
    },
    [dimensionOptions],
  );

  /** D-002 새 차원 생성 — D-003 을 자기 자신(unitCode)으로, 계수는 1로 초기 제안한다(I3, D2). */
  const handleDimensionCreateNew = useCallback((text: string) => {
    setIsNewDimension(true);
    setForm((prev) => (prev ? { ...prev, dimension: text, baseUnit: prev.unitCode, factor: "1" } : prev));
  }, []);

  const dimensionComboData = useMemo(
    () => dimensionOptions.map((o) => ({ value: o.dimension, label: `${dimensionLabel(o.dimension)} (${o.dimension})` })),
    [dimensionOptions],
  );

  return (
    <>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>단위 코드 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                value={form?.unitCode ?? ""}
                maxLength={20}
                disabled={!form || busy || !!selectedUnitCode}
                onChange={(v) => change("unitCode", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>차원 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <ComboBox
                data={dimensionComboData}
                value={form?.dimension ?? ""}
                disabled={!form || busy}
                onChange={(v) => handleDimensionSelect(v)}
                onCreateNew={handleDimensionCreateNew}
                placeholder="차원 선택 또는 새 차원 입력"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>기준 단위</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input value={form?.baseUnit ?? ""} disabled readOnly />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>환산 계수 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                value={form?.factor ?? ""}
                disabled={!form || busy || (isNewDimension && form?.unitCode === form?.baseUnit)}
                onChange={(v) => change("factor", v)}
              />
            </td>
          </tr>
        </tbody>
      </table>
      {!form && (
        <p style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
          목록에서 행을 선택하거나 [단위 등록] 을 눌러 작성하세요.
        </p>
      )}
    </>
  );
});
