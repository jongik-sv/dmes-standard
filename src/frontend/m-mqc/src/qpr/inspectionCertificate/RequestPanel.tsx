"use client";

/** 발행 요청 탭 — 코일·적용 규격·시험 성적 출처·언어·비고로 검토중 증명서를 만든다. Heat 는 코일에서 읽는다. 입력 state 는 여기에만 둔다. */
import { memo, useImperativeHandle, useMemo, useState, type Ref } from "react";

import { ContentBody, ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Badge, Select, Textarea } from "@dk-oasis/shared/form";

import { toneOf } from "@/qpr/shared/status";

import { LANG_OPTIONS, SOURCE_OPTIONS, STANDARDS, type CoilOption, type MtcRequestForm } from "./types";

export type MtcRequestHandle = { getForm(): MtcRequestForm };

const STD_FORM_OPTIONS = STANDARDS.map((s) => ({ value: s, label: s }));

function RequestPanelImpl({ ref, coils, busy }: { ref: Ref<MtcRequestHandle>; coils: CoilOption[]; busy: boolean }) {
  const [form, setForm] = useState<MtcRequestForm>({ coilNo: "", stdCd: "KS D 3506", srcCd: "SELF", langCd: "KO", note: "" });
  useImperativeHandle(ref, () => ({ getForm: () => form }), [form]);
  const set = (k: keyof MtcRequestForm, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const coilOptions = useMemo(() => coils.map((c) => ({ value: c.coilNo, label: `${c.coilNo} · ${c.prdLabel} · ${c.statusNm}` })), [coils]);
  const coil = coils.find((c) => c.coilNo === form.coilNo);
  return (
    <ContentBody root>
      <ContentPanel scrollY>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>코일번호 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={coilOptions} placeholder="코일 선택" value={form.coilNo} disabled={busy} onChange={(v) => set("coilNo", v)} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>주문 · Heat No.</th>
              <td style={DETAIL_VALUE_CELL}>{coil ? `${coil.ordNo} · ${coil.heatNo ?? "—"}` : "—"}</td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>코일 판정</th>
              <td style={DETAIL_VALUE_CELL}>{coil ? <Badge tone={toneOf(coil.status)} label={coil.statusNm} /> : "—"}</td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>적용 규격 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={STD_FORM_OPTIONS} value={form.stdCd} disabled={busy} onChange={(v) => set("stdCd", v)} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>시험 성적 출처</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={SOURCE_OPTIONS} value={form.srcCd} disabled={busy} onChange={(v) => set("srcCd", v)} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>언어</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={LANG_OPTIONS} value={form.langCd} disabled={busy} onChange={(v) => set("langCd", v)} />
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

export const RequestPanel = memo(RequestPanelImpl);
