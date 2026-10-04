"use client";

/**
 * 설비 상세 폼. 입력 state 는 이 컴포넌트에만 있다(화면 성능 가이드 R12).
 * 한 글자 입력은 이 컴포넌트만 다시 그리고 화면 루트·목록 그리드는 다시 그리지 않는다.
 * 저장 단추는 화면 루트(PageLayout buttons)에 있으므로 루트는 `ref` 핸들로 폼과 대화한다(React 19: ref 는 prop).
 */
import { useImperativeHandle, useState, type Ref } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { DatePicker, Input, Radio, Select, Textarea } from "@dk-oasis/shared/form";

import { LINE_OPTIONS, USE_YN_OPTIONS, type EquipForm } from "./types";

/** 모듈 상수: 렌더마다 새 배열을 만들지 않는다. */
const LINE_FORM_OPTIONS = LINE_OPTIONS.filter((o) => o.value !== "");

export type EquipDetailHandle = {
  /** 행 선택·신규·조회 때 폼을 채운다. null 이면 비운다(모든 입력 비활성). */
  load(form: EquipForm | null): void;
  /** 저장 때 현재 입력값을 읽는다. */
  getForm(): EquipForm | null;
};

export function EquipDetailPane({ ref, busy, isNew }: { ref: Ref<EquipDetailHandle>; busy: boolean; isNew: boolean }) {
  const [form, setForm] = useState<EquipForm | null>(null);
  useImperativeHandle(ref, () => ({ load: setForm, getForm: () => form }), [form]);

  const setField = (key: keyof EquipForm, value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const disabled = !form || busy;

  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>설비코드 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={form?.equipCd ?? ""}
              maxLength={20}
              readOnly={!isNew}
              disabled={disabled || !isNew}
              onChange={(v) => setField("equipCd", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>설비명 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input value={form?.equipNm ?? ""} disabled={disabled} onChange={(v) => setField("equipNm", v)} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>라인</th>
          <td style={DETAIL_VALUE_CELL}>
            <Select
              options={LINE_FORM_OPTIONS}
              placeholder="선택"
              value={form?.lineCd ?? ""}
              disabled={disabled}
              onChange={(v) => setField("lineCd", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>설치일자</th>
          <td style={DETAIL_VALUE_CELL}>
            <DatePicker value={form?.installDt ?? ""} disabled={disabled} onChange={(v) => setField("installDt", v)} />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>사용</th>
          <td style={DETAIL_VALUE_CELL}>
            <Radio
              name="useYn"
              options={USE_YN_OPTIONS}
              value={form?.useYn ?? "Y"}
              disabled={disabled}
              onChange={(v) => setField("useYn", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>비고</th>
          <td style={DETAIL_VALUE_CELL}>
            <Textarea rows={3} value={form?.remark ?? ""} disabled={disabled} onChange={(v) => setField("remark", v)} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
