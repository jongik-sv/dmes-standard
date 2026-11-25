"use client";

/** 검사증명서 상세(오른쪽 패널) — 증명서 정보, 기계적 성질, 화학 성분, 처리 이력. 읽기 전용이다. */
import { memo, useMemo } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge } from "@dk-oasis/shared/form";

import { gridStatusBadge, OUTPUT_HISTORY_SHORT_COLUMNS, toneOf } from "@/qpr/shared/status";

import type { MtcDetail } from "./types";

const MECH_COLUMNS: GridColumn[] = [
  { key: "itemNm", header: "항목", width: 140, align: "left" },
  { key: "critTxt", header: "기준", width: 80, align: "center" },
  { key: "value", header: "값", width: 70, align: "right", render: (v) => (v == null ? "—" : String(v)) },
  { key: "resultNm", header: "판정", width: 56, align: "center", render: (v, r) => (v == null ? "—" : gridStatusBadge(r.result, v)) },
];

function MtcDetailPaneImpl({ detail }: { detail: MtcDetail | null }) {
  const c = detail?.cert;
  const a = detail?.actions;
  const chem = useMemo(() => {
    const row: Record<string, unknown> = { id: "chem" };
    for (const ch of detail?.chemistry ?? []) row[ch.elemCd] = ch.value;
    return { row, columns: (detail?.chemistry ?? []).map((ch): GridColumn => ({ key: ch.elemCd, header: ch.elemCd, width: 60, align: "center" })) };
  }, [detail]);
  return (
    <>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>증명서번호</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.mtcNo}${c.docRev > 1 ? ` (rev.${c.docRev})` : ""}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>적용 규격</th>
            <td style={DETAIL_VALUE_CELL}>{c?.stdCd ?? "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>코일 · Heat</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.coilNo} · ${c.heatNo ?? "—"}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>품명 · 규격</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.prdLabel ?? "—"} · ${c.specCd ?? "—"} · ${c.sizeText ?? "—"}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>상태 · 코일 판정</th>
            <td style={DETAIL_VALUE_CELL}>
              {c ? (
                <>
                  <Badge tone={toneOf(c.status)} label={c.statusNm} testId="mtc-status" /> <Badge tone={toneOf(c.judgStatus)} variant="outline" label={`코일 ${c.judgStatusNm ?? "—"}`} />
                </>
              ) : (
                "—"
              )}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>검사일 · 담당</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.inspDate ?? "—"} · ${c.inspBy ?? "—"}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>발행</th>
            <td style={DETAIL_VALUE_CELL}>{c?.issueAt ? `${c.issueAt} · ${c.issueBy ?? "—"}` : "—"}</td>
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
      <AgDataGrid gridId="mech" title={c?.fixed ? "기계적 성질 (발행 고정값)" : "기계적 성질 (현재 검사값)"} rowKey="itemCd" columns={MECH_COLUMNS} data={detail?.mech ?? []} columnSizing="fit" height="auto" />
      <AgDataGrid gridId="chem" title="화학 성분 (wt%)" rowKey="id" columns={chem.columns} data={chem.columns.length ? [chem.row] : []} columnSizing="fit" height="auto" personalize={false} />
      <AgDataGrid gridId="doc-history" title="처리 이력" rowKey="histNo" columns={OUTPUT_HISTORY_SHORT_COLUMNS} data={detail?.history ?? []} columnSizing="fit" height="auto" />
    </>
  );
}

export const MtcDetailPane = memo(MtcDetailPaneImpl);
