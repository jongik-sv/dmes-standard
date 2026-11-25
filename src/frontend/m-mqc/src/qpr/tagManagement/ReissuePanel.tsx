"use client";

/**
 * 재발행 요청 탭 — Tag번호 또는 코일번호(코일이면 그 코일의 최근 발행 Tag), 사유, 프린터, 매수, 비고.
 * 목록에서 [재발행] 으로 오면 고른 Tag 번호가 채워진다(initialTarget). 입력 state 는 여기에만 둔다.
 */
import { memo, useImperativeHandle, useState, type Ref } from "react";

import { ContentBody, ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Input, Select, Textarea } from "@dk-oasis/shared/form";

import { COPY_OPTIONS, PRINTER_OPTIONS, REASON_OPTIONS, type ReissueForm } from "./types";

export type ReissueHandle = { getForm(): ReissueForm };

function ReissuePanelImpl({ ref, initialTarget, busy }: { ref: Ref<ReissueHandle>; initialTarget: string; busy: boolean }) {
  const [form, setForm] = useState<ReissueForm>({ target: initialTarget, reasonCd: "DAMAGE", prtId: "", copies: "1", note: "" });
  useImperativeHandle(ref, () => ({ getForm: () => form }), [form]);
  const set = (k: keyof ReissueForm, v: string) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <ContentBody root>
      <ContentPanel scrollY>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>Tag번호 또는 코일번호 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input value={form.target} maxLength={20} disabled={busy} placeholder="예: T-2609-00110 또는 C260901003" onChange={(v) => set("target", v)} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>재발행 사유 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={REASON_OPTIONS} value={form.reasonCd} disabled={busy} onChange={(v) => set("reasonCd", v)} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>프린터</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={PRINTER_OPTIONS} value={form.prtId} disabled={busy} onChange={(v) => set("prtId", v)} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>매수</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={COPY_OPTIONS} value={form.copies} disabled={busy} onChange={(v) => set("copies", v)} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>비고</th>
              <td style={DETAIL_VALUE_CELL}>
                <Textarea rows={3} maxLength={500} value={form.note} disabled={busy} onChange={(v) => set("note", v)} />
              </td>
            </tr>
          </tbody>
        </table>
      </ContentPanel>
    </ContentBody>
  );
}

export const ReissuePanel = memo(ReissuePanelImpl);
