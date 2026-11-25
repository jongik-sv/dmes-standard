"use client";

/**
 * 발행 요청 탭 — 주문을 고르면 그 주문의 코일이 나온다. 코일을 체크하고 양식·언어·비고를 정해 [발행 요청] 하면 초안이 생긴다.
 * 다른 보증서(초안·발행·재발행)에 실린 코일은 고를 수 없다. 입력 state 는 이 컴포넌트에만 두고 루트는 ref 로 읽는다.
 */
import { memo, useImperativeHandle, useMemo, useState, type Ref } from "react";

import { ContentBody, ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Select, Textarea } from "@dk-oasis/shared/form";

import { gridStatusBadge, num } from "@/qpr/shared/status";

import { LANG_OPTIONS, TEMPLATE_OPTIONS, type OrderOption, type RequestForm } from "./types";

export type RequestPanelHandle = { getForm(): RequestForm };

const COLUMNS: GridColumn[] = [
  { key: "coilNo", header: "코일번호", width: 110, align: "left" },
  { key: "sizeText", header: "두께 × 폭", width: 100, align: "right" },
  { key: "wgt", header: "중량 (kg)", width: 90, align: "right", type: "number", render: (v) => num(v) },
  { key: "statusNm", header: "판정", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.status, v) },
  { key: "takenBy", header: "실린 보증서", width: 120, align: "left", render: (v) => (v ? String(v) : "—") },
];

function RequestPanelImpl({ ref, orders, busy }: { ref: Ref<RequestPanelHandle>; orders: OrderOption[]; busy: boolean }) {
  const [ordNo, setOrdNo] = useState("");
  const [coilNos, setCoilNos] = useState<string[]>([]);
  const [tmplCd, setTmplCd] = useState("KS");
  const [langCd, setLangCd] = useState("KO");
  const [note, setNote] = useState("");
  useImperativeHandle(ref, () => ({ getForm: () => ({ ordNo, coilNos, tmplCd, langCd, note }) }), [ordNo, coilNos, tmplCd, langCd, note]);

  const orderOptions = useMemo(() => orders.map((o) => ({ value: o.ordNo, label: `${o.ordNo} · ${o.cusNm ?? ""} · ${o.prdLabel}` })), [orders]);
  const order = orders.find((o) => o.ordNo === ordNo);
  const coils = useMemo(() => (order?.coils ?? []) as Record<string, unknown>[], [order]);

  return (
    <ContentBody root resizable storageKey="mqc.qpr.qualityCertificate.request">
      <ContentPanel width={460} scrollY>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>주문번호 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select
                  options={orderOptions}
                  placeholder="주문 선택"
                  value={ordNo}
                  disabled={busy}
                  onChange={(v) => {
                    setOrdNo(v);
                    setCoilNos([]);
                  }}
                  data-testid="qc-request-order"
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>수요가 · PO</th>
              <td style={DETAIL_VALUE_CELL}>{order ? `${order.cusNm ?? "—"} · ${order.poNo ?? "—"}` : "—"}</td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>품명 · 규격</th>
              <td style={DETAIL_VALUE_CELL}>{order ? `${order.prdLabel} · ${order.specCd ?? "—"}` : "—"}</td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>선택 코일</th>
              <td style={DETAIL_VALUE_CELL}>{coilNos.length > 0 ? coilNos.join(", ") : "오른쪽 목록에서 고르세요"}</td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>양식</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={TEMPLATE_OPTIONS} value={tmplCd} disabled={busy} onChange={setTmplCd} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>언어</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select options={LANG_OPTIONS} value={langCd} disabled={busy} onChange={setLangCd} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>비고</th>
              <td style={DETAIL_VALUE_CELL}>
                <Textarea rows={3} maxLength={500} value={note} disabled={busy} onChange={setNote} />
              </td>
            </tr>
          </tbody>
        </table>
      </ContentPanel>
      <ContentPanel>
        <GridPanel title={order ? `${order.ordNo} 코일` : "주문 코일"} count={coils.length}>
          <AgDataGrid
            gridId="request-coils"
            rowKey="coilNo"
            columns={COLUMNS}
            data={coils}
            columnSizing="fit"
            selectable
            multiSelect
            isRowSelectable={(r) => !r.takenBy}
            selectedRows={coilNos}
            onRowSelect={(ids) => setCoilNos(ids.map(String))}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}

export const RequestPanel = memo(RequestPanelImpl);
