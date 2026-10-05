"use client";

/**
 * 마루 코드 등록 팝업 본문. 목록 헤더의 [코드 등록]이 여는 팝업 안에 들어간다 — 팝업을 열 때마다 새로 마운트되어
 * 칸이 빈 채로 시작한다. 등록에 실패해도 팝업은 닫히지 않으므로 입력값이 그대로 남는다(닫기는 부모가 정한다).
 * 버튼은 팝업 footer 가 아니라 이 틀 안에 둔다 — e2e 가 `code-register-form` 안에서 [등록]을 찾는다.
 */
import { useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";

import { emptyRegForm, LVL_CNT_OPTIONS, type CodeRegForm } from "./types";
import { DESCRIPTION_LABEL, SOURCE_LABEL } from "@/ui-meta";

export interface CodeRegisterFormProps {
  /** 등록(action reg) 권한. 없으면 버튼을 숨기지 않고 비활성으로 둔다. */
  canRegister: boolean;
  /** 화면이 다른 요청을 처리하는 중이면 입력과 버튼을 잠근다. */
  busy: boolean;
  onSubmit: (form: CodeRegForm) => void;
  onCancel: () => void;
}

const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;

export function CodeRegisterForm({ canRegister, busy, onSubmit, onCancel }: CodeRegisterFormProps) {
  const [form, setForm] = useState<CodeRegForm>(emptyRegForm);
  const set = (key: keyof CodeRegForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div data-testid="code-register-form">
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="maruCodeId" label="마루 코드 ID" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="code-reg-id"
                value={form.maruCodeId}
                maxLength={50}
                disabled={busy}
                onChange={(v) => set("maruCodeId", v)}
              />
              <span style={mutedText}>영문 대문자·숫자·_ 만. 점·공백·콤마 불가. 마루 데이터 ID 와 한 이름 공간</span>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="maruCodeName" label="이름" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                data-testid="code-reg-name"
                value={form.maruCodeName}
                maxLength={100}
                disabled={busy}
                onChange={(v) => set("maruCodeName", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel {...DESCRIPTION_LABEL} /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea data-testid="code-reg-desc" value={form.description} disabled={busy} onChange={(v) => set("description", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="lvlCnt" label="계층 칸 수" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Select data-testid="code-reg-lvl" value={form.lvlCnt} options={LVL_CNT_OPTIONS} disabled={busy} onChange={(v) => set("lvlCnt", v)} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel {...SOURCE_LABEL} /></th>
            <td style={DETAIL_VALUE_CELL}>
              <span data-testid="code-reg-source">MDM</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", gap: "var(--spacing-sm)", justifyContent: "flex-end", padding: "var(--spacing-sm) var(--spacing-md)" }}>
        <Button data-testid="code-reg-cancel" disabled={busy} onClick={onCancel}>
          취소
        </Button>
        <Button data-testid="code-reg-save" variant="primary" disabled={busy || !canRegister} onClick={() => onSubmit(form)}>
          등록
        </Button>
      </div>
    </div>
  );
}
