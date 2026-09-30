"use client";

/**
 * 마루 데이터 등록 팝업 본문(TSK-07-02 design §2). 목록 헤더의 [데이터 등록]이 여는 팝업 안에 들어간다 — 팝업을 열
 * 때마다 새로 마운트되어 칸이 빈 채로 시작하고, 등록이 실패해도 입력값을 그대로 둔다. 원천은 MDM 고정이라 고르는 칸이 없다.
 */
import { useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Input, Select } from "@dk-oasis/shared/form";

import { mutedText } from "../DataDetail";
import { LVL_CNT_OPTIONS, emptyRegForm, type DataMngRegForm } from "../types";

export interface DataRegisterFormProps {
  /** 다른 쓰기가 진행 중이면 입력과 버튼을 잠근다. */
  busy: boolean;
  /** 등록(action reg) 권한. 없으면 버튼을 숨기지 않고 비활성으로 둔다. */
  canRegister: boolean;
  onSubmit: (form: DataMngRegForm) => void;
  onCancel: () => void;
}

export function DataRegisterForm({ busy, canRegister, onSubmit, onCancel }: DataRegisterFormProps) {
  const [form, setForm] = useState<DataMngRegForm>(emptyRegForm);
  const set = (key: keyof DataMngRegForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div data-testid="data-mng-register-form">
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>마루 데이터 ID *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="data-mng-reg-id"
                value={form.maruDataId}
                maxLength={50}
                disabled={busy}
                onChange={(v) => set("maruDataId", v)}
              />
              <span style={mutedText}>영문 대문자·숫자·_ 만. 점·공백·콤마 불가. 마루 코드 ID 와 한 이름 공간</span>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>이름 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="data-mng-reg-name"
                value={form.maruDataName}
                maxLength={100}
                disabled={busy}
                onChange={(v) => set("maruDataName", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>키 패턴 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="data-mng-reg-pattern"
                value={form.codePattern}
                disabled={busy}
                onChange={(v) => set("codePattern", v)}
              />
              <span style={mutedText}>항목 키 형식 정규식</span>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="data-mng-reg-desc"
                value={form.description}
                disabled={busy}
                onChange={(v) => set("description", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>계층 칸 수</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                data-testid="data-mng-reg-lvl"
                value={form.lvlCnt}
                options={LVL_CNT_OPTIONS}
                disabled={busy}
                onChange={(v) => set("lvlCnt", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>원천</th>
            <td style={DETAIL_VALUE_CELL}>
              <span data-testid="data-mng-reg-source">MDM</span>
            </td>
          </tr>
        </tbody>
      </table>
      {/* 버튼을 팝업 footer 가 아닌 이 틀 안에 둔다 — e2e 가 `data-mng-register-form` 안에서 찾는다. */}
      <div style={{ display: "flex", gap: "var(--spacing-sm)", justifyContent: "flex-end", padding: "var(--spacing-sm) var(--spacing-md)" }}>
        <Button data-testid="data-mng-reg-cancel" disabled={busy} onClick={onCancel}>
          취소
        </Button>
        <Button data-testid="data-mng-reg-save" variant="primary" disabled={busy || !canRegister} onClick={() => onSubmit(form)}>
          등록
        </Button>
      </div>
    </div>
  );
}
