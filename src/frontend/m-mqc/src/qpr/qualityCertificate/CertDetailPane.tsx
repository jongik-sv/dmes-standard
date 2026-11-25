"use client";

/** 품질보증서 상세(오른쪽 패널) — 발행 정보, 실린 코일, 보증 항목, 처리 이력. 읽기 전용이다. */
import { memo } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge } from "@dk-oasis/shared/form";

import { gridStatusBadge, num, OUTPUT_HISTORY_SHORT_COLUMNS, toneOf } from "@/qpr/shared/status";

import type { CertDetail } from "./types";

const COIL_COLUMNS: GridColumn[] = [
  { key: "coilNo", header: "코일번호", width: 100, align: "left" },
  { key: "wgt", header: "중량", width: 70, align: "right", type: "number", render: (v) => num(v) },
  { key: "ts", header: "TS", width: 50, align: "right" },
  { key: "yp", header: "YP", width: 50, align: "right" },
  { key: "statusNm", header: "판정", width: 64, align: "center", render: (v, r) => gridStatusBadge(r.status, v) },
];

const GUARANTEE_COLUMNS: GridColumn[] = [
  { key: "itemNm", header: "항목", width: 130, align: "left" },
  { key: "critTxt", header: "기준", width: 80, align: "center" },
  { key: "value", header: "대표값", width: 70, align: "right" },
  { key: "resultNm", header: "판정", width: 56, align: "center", render: (v, r) => gridStatusBadge(r.result, v) },
];

function CertDetailPaneImpl({ detail }: { detail: CertDetail | null }) {
  const c = detail?.cert;
  const a = detail?.actions;
  return (
    <>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>보증서번호</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.qcNo} (${c.revText})` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>수요가 · PO</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.cusNm ?? "—"} · ${c.poNo ?? "—"}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>주문번호</th>
            <td style={DETAIL_VALUE_CELL}>{c?.ordNo ?? "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>품명 · 규격</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.prdLabel ?? "—"} · ${c.specCd ?? "—"}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>코일 수 · 중량</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.coilCount}개 · ${num(c.totalWgt)} kg` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>양식 · 언어</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.tmplNm} · ${c.langNm}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>상태</th>
            <td style={DETAIL_VALUE_CELL}>{c ? <Badge tone={toneOf(c.status)} label={c.statusNm} testId="qc-status" /> : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>발행일 · 담당</th>
            <td style={DETAIL_VALUE_CELL}>{c?.issueAt ? `${c.issueAt} · ${c.issueBy ?? "—"}` : c ? `요청 ${c.reqAt ?? "—"} · ${c.reqBy ?? "—"}` : "—"}</td>
          </tr>
          {a?.blockReason ? (
            <tr>
              <th style={DETAIL_LABEL_CELL}>발행 조건</th>
              <td style={DETAIL_VALUE_CELL}>
                <Badge tone="warning" label="발행 불가" /> {a.blockReason}
              </td>
            </tr>
          ) : null}
          {c?.note ? (
            <tr>
              <th style={DETAIL_LABEL_CELL}>비고</th>
              <td style={DETAIL_VALUE_CELL}>{c.note}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <AgDataGrid gridId="coils" title="실린 코일" rowKey="coilNo" columns={COIL_COLUMNS} data={detail?.coils ?? []} columnSizing="fit" height="auto" />
      <AgDataGrid gridId="guarantee" title="보증 항목 (KS 표준 양식)" rowKey="itemCd" columns={GUARANTEE_COLUMNS} data={detail?.guarantee ?? []} columnSizing="fit" height="auto" />
      <AgDataGrid gridId="doc-history" title="처리 이력" rowKey="histNo" columns={OUTPUT_HISTORY_SHORT_COLUMNS} data={detail?.history ?? []} columnSizing="fit" height="auto" />
    </>
  );
}

export const CertDetailPane = memo(CertDetailPaneImpl);
