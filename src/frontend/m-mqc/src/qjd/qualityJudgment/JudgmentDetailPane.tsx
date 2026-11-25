"use client";

/**
 * 코일 판정 상세(오른쪽 패널) — 코일 정보, 현재 판정·시스템 제안, 검사값 vs 기준값(검사값 칸 편집), 판정 사유, 처리 이력.
 * 입력 state(고친 검사값·사유)는 이 컴포넌트에만 둔다(화면 성능 가이드 R12). 화면 루트는 ref 핸들로 읽는다.
 * 다른 코일을 고르거나 판정 결과가 오면 루트가 key 를 바꿔 새로 만든다(입력이 비워진다).
 */
import { memo, useImperativeHandle, useState, type Ref } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Textarea } from "@dk-oasis/shared/form";

import { gridStatusBadge, num, toneOf } from "@/qpr/shared/status";

import type { JudgmentDetail } from "./types";

export type JudgmentDetailHandle = {
  /** 고친 검사값(항목 코드 → 값). */
  getEdits(): Record<string, string>;
  /** 판정 사유. */
  getNote(): string;
};

const HISTORY_COLUMNS: GridColumn[] = [
  { key: "actAt", header: "시각", width: 120, align: "center" },
  { key: "actNm", header: "처리", width: 70, align: "center" },
  { key: "statAftNm", header: "판정", width: 64, align: "center", render: (v, r) => gridStatusBadge(r.statAft, v) },
  { key: "suggStatNm", header: "제안", width: 64, align: "center", render: (v, r) => (v == null ? "—" : gridStatusBadge(r.suggStat, v)) },
  { key: "note", header: "내용", width: 160, minWidth: 120, align: "left" },
  { key: "actBy", header: "처리자", width: 70, align: "center" },
];

function itemColumns(editable: boolean): GridColumn[] {
  return [
    { key: "label", header: "항목", width: 110, align: "left" },
    { key: "critTxt", header: "기준", width: 90, align: "center" },
    {
      key: "measVal",
      header: editable ? "검사값 ✎" : "검사값",
      width: 80,
      align: "right",
      editable,
      cellEditor: "text",
      headerTooltip: editable ? "칸을 눌러 검사값을 고친 뒤 [판정 계산] 을 누릅니다. 비우면 미검, 「재검」 은 보류입니다." : undefined,
      render: (v) => (v == null || v === "" ? "—" : String(v)),
    },
    { key: "resultNm", header: "판정", width: 64, align: "center", render: (v, r) => gridStatusBadge(r.result, v) },
  ];
}
const ITEM_COLUMNS_EDIT = itemColumns(true);
const ITEM_COLUMNS_READ = itemColumns(false);

const dash = (...parts: (string | number | null | undefined)[]) => {
  const kept = parts.filter((p) => p != null && p !== "");
  return kept.length === 0 ? "—" : kept.join(" · ");
};

function JudgmentDetailPaneImpl({ ref, detail, busy }: { ref: Ref<JudgmentDetailHandle>; detail: JudgmentDetail | null; busy: boolean }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  useImperativeHandle(ref, () => ({ getEdits: () => edits, getNote: () => note }), [edits, note]);

  const c = detail?.coil;
  const j = detail?.judgment;
  const open = !!j?.open;
  const editCount = Object.keys(edits).length;

  return (
    <>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>코일번호</th>
            <td style={DETAIL_VALUE_CELL}>{c?.coilNo ?? "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>주문번호 · 수요가</th>
            <td style={DETAIL_VALUE_CELL}>{dash(c?.ordNo, c?.cusNm)}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>품명 · 규격</th>
            <td style={DETAIL_VALUE_CELL}>{dash(c?.prdLabel, c?.specCd)}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>두께 × 폭 · 중량</th>
            <td style={DETAIL_VALUE_CELL}>{c ? `${c.sizeText} · ${num(c.wgt)} kg` : "—"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>공정 · Heat</th>
            <td style={DETAIL_VALUE_CELL}>{dash(c?.lineCd, c?.heatNo)}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>검사자 · 시각</th>
            <td style={DETAIL_VALUE_CELL}>{dash(c?.inspBy, c?.inspAt)}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>현재 판정</th>
            <td style={DETAIL_VALUE_CELL}>
              {j ? <Badge tone={toneOf(j.status)} label={j.statusNm} testId="jdg-current-status" /> : "—"}
              {j?.decidedAt ? ` ${dash(j.decidedBy, j.decidedAt)}` : ""}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>시스템 제안</th>
            <td style={DETAIL_VALUE_CELL}>
              {j?.suggStatus ? <Badge tone={toneOf(j.suggStatus)} variant="outline" label={j.suggStatusNm ?? ""} testId="jdg-suggestion" /> : "—"}
              {j?.judgedAt ? ` 계산 ${j.judgedAt}` : ""}
            </td>
          </tr>
          {j?.note ? (
            <tr>
              <th style={DETAIL_LABEL_CELL}>확정 사유</th>
              <td style={DETAIL_VALUE_CELL}>{j.note}</td>
            </tr>
          ) : null}
          <tr>
            <th style={DETAIL_LABEL_CELL}>판정 사유</th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea
                rows={2}
                maxLength={500}
                value={note}
                disabled={!open || busy}
                placeholder={open ? "시스템 제안과 다르게 확정하면 필수" : "확정된 코일입니다"}
                onChange={setNote}
                data-testid="jdg-note"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <AgDataGrid
        gridId="items"
        title={editCount > 0 ? `검사값 vs 기준값 (고친 값 ${editCount}건 — [판정 계산] 으로 반영)` : "검사값 vs 기준값"}
        rowKey="itemCd"
        columns={open && !busy ? ITEM_COLUMNS_EDIT : ITEM_COLUMNS_READ}
        data={detail?.items ?? []}
        columnSizing="fit"
        height="auto"
        onCellValueChanged={(p) => {
          if (p.field === "measVal") setEdits((prev) => ({ ...prev, [String(p.rowKey)]: p.newValue == null ? "" : String(p.newValue) }));
        }}
      />

      <AgDataGrid gridId="coil-history" title="처리 이력" rowKey="histNo" columns={HISTORY_COLUMNS} data={detail?.history ?? []} columnSizing="fit" height="auto" />
    </>
  );
}

export const JudgmentDetailPane = memo(JudgmentDetailPaneImpl);
