"use client";

/**
 * dataItemMng 항목 추가 등록 폼 — 오른쪽 [코드 테스트] 탭의 등록 패널.
 *
 * 입력 state 는 이 컴포넌트에만 둔다(Screen-Performance-Guide R12). 화면 루트가 폼을 들고 있으면 한 글자마다 루트 아래
 * 항목 그리드·카테고리 탭까지 다시 그려진다. 루트는 `ref` 핸들로 폼을 열고 비우고(`load`) 등록 때 읽는다(`getForm`) —
 * 등록 단추가 폼 안에 있지만 마루 데이터·권한은 루트가 갖고 있어 등록 자체는 루트가 한다.
 *
 * 오른쪽 탭을 카테고리 편집으로 옮길 때 마운트를 유지한다(`hidden`) — 폼 입력은 탭을 오가며 그대로 남는다(분리 전 동작).
 */
import { memo, useCallback, useImperativeHandle, useState, type Ref } from "react";

import { ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Input } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";

import type { DataItemForm } from "./types";

/** 루트가 등록 폼과 대화하는 핸들. */
export type ItemRegFormHandle = {
  /** 폼을 새로 채운다([항목 추가] 로 열기·등록 뒤·마루 데이터 전환 뒤 비우기). */
  load(form: DataItemForm | null): void;
  /** 지금 입력된 폼 값(등록용). */
  getForm(): DataItemForm | null;
};

/** 등록 패널 입력 칸 — 루트가 마루 데이터 머리(lvlCnt·attrLabels)에서 만들어 넘긴다. */
export type ItemRegField = { key: keyof DataItemForm; label: string };

type Props = {
  ref: Ref<ItemRegFormHandle>;
  /** 오른쪽 탭이 [코드 테스트]일 때만 그린다. */
  hidden: boolean;
  /** 쓰기 중에는 칸을 잠근다. */
  busy: boolean;
  /** 등록 권한(dataItemMng "reg"). */
  canReg: boolean;
  fields: ItemRegField[];
  /** [등록] — 루트가 ref 로 폼을 읽어 dataItemMng/reg 를 부른다. */
  onRegister: () => void;
};

export const ItemRegForm = memo(function ItemRegForm({ ref, hidden, busy, canReg, fields, onRegister }: Props) {
  const [form, setForm] = useState<DataItemForm | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      load: (next) => setForm(next),
      getForm: () => form,
    }),
    [form],
  );

  const change = useCallback((key: keyof DataItemForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  if (hidden || !form) return null;

  return (
    <ContentPanel>
      <div data-testid="item-form" style={{ height: "100%", overflowY: "auto" }}>
        <p style={{ fontWeight: 600, color: "var(--color-text-secondary)", padding: "0 var(--spacing-md)" }}>항목 추가</p>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key}>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name={f.key} meta={false} label={f.label} /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid={`item-form-${f.key}`}
                    value={form[f.key]}
                    disabled={busy}
                    onChange={(v) => change(f.key, v)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: "var(--spacing-sm)", padding: "var(--spacing-sm) var(--spacing-md)" }}>
          <Button
            variant="primary"
            data-testid="item-form-submit"
            disabled={busy || !canReg}
            onClick={onRegister}
          >
            등록
          </Button>
          <Button data-testid="item-form-cancel" onClick={() => setForm(null)}>
            취소
          </Button>
        </div>
      </div>
    </ContentPanel>
  );
});
