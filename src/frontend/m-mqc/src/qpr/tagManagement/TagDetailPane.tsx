"use client";

/** Tag 상세(오른쪽 패널) — Tag 정보, Tag 미리보기(100 × 70 mm), 처리 이력. 읽기 전용이다. */
import { memo } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid } from "@dk-oasis/shared/grid";
import { CardFrame } from "@dk-oasis/shared/card";
import { Badge } from "@dk-oasis/shared/form";

import { SheetFrame } from "@/common/print/sheet";
import { OUTPUT_HISTORY_SHORT_COLUMNS, toneOf } from "@/qpr/shared/status";

import { TagLabel } from "./TagLabel";
import type { TagDetail } from "./types";

function TagDetailPaneImpl({ detail }: { detail: TagDetail | null }) {
  const t = detail?.tag;
  const a = detail?.actions;
  return (
    <>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>Tag번호 · 종류</th>
            <td style={DETAIL_VALUE_CELL}>{t ? `${t.tagNo} · ${t.tagKndNm}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>코일 · 주문</th>
            <td style={DETAIL_VALUE_CELL}>{t ? `${t.coilNo} · ${t.ordNo ?? "—"}` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>코일 판정</th>
            <td style={DETAIL_VALUE_CELL}>{t ? <Badge tone={toneOf(t.judgStatus)} variant="outline" label={t.judgStatusNm ?? "—"} /> : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>프린터 · 매수</th>
            <td style={DETAIL_VALUE_CELL}>{t ? `${t.prtId ?? "—"} · ${t.copyCnt}매` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>상태</th>
            <td style={DETAIL_VALUE_CELL}>
              {t ? <Badge tone={toneOf(t.status)} label={t.statusNm} testId="tag-status" /> : "—"}
              {t && t.rissuCnt > 0 ? ` 재발행 ${t.rissuCnt}회 (${t.rissuRsnNm ?? "—"})` : ""}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>발행 · 담당</th>
            <td style={DETAIL_VALUE_CELL}>{t?.issueAt ? `${t.issueAt} · ${t.issueBy ?? "—"}` : "—"}</td>
          </tr>
          {a?.blockReason ? (
            <tr>
              <th style={DETAIL_LABEL_CELL}>출력 조건</th>
              <td style={DETAIL_VALUE_CELL}>
                <Badge tone="warning" label="출력 불가" /> {a.blockReason}
              </td>
            </tr>
          ) : null}
          {t?.note ? (
            <tr>
              <th style={DETAIL_LABEL_CELL}>비고</th>
              <td style={DETAIL_VALUE_CELL}>{t.note}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {t ? (
        <CardFrame title="Tag 미리보기 (100 × 70 mm)">
          <SheetFrame width={378}>
            <TagLabel tag={t} />
          </SheetFrame>
        </CardFrame>
      ) : null}
      <AgDataGrid gridId="doc-history" title="처리 이력" rowKey="histNo" columns={OUTPUT_HISTORY_SHORT_COLUMNS} data={detail?.history ?? []} columnSizing="fit" height="auto" />
    </>
  );
}

export const TagDetailPane = memo(TagDetailPaneImpl);
