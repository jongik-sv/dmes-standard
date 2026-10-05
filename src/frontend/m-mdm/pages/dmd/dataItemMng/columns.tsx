/**
 * 항목 편집 그리드 열과 저장 파라미터 — 순수 함수(TSK-07-03 design.md §2, Q5·Q6·A4·S5·A2·F1).
 */
import type { ReactNode } from "react";

import type { GridColumn } from "@dk-oasis/shared/grid";

import { CLOSED_KEY_REOPEN, ROW_VERSION_CONFLICT_PREFIX } from "./messages";
import { ATTR_FIELDS, LVL_FIELDS, type DataItemHeader } from "./types";
import { uiCols } from "@/ui-meta";

export interface ItemColumnHandlers {
  /** 행 버튼 칸(저장·취소·닫기·다시 열기·이력). */
  renderActions?: (row: Record<string, unknown>) => ReactNode;
}

/** Q6 — 편집 가능 = 머리가 편집 가능(MDM·INUSE)이고 그 행이 열려 있음. */
export function isRowEditable(header: DataItemHeader | null | undefined, row: Record<string, unknown>): boolean {
  return !!header?.editable && row.open === true;
}

/**
 * Q5 — 고정 열(키·이름·약칭·순서) + 계층 열 1차~lvlCnt차 + 라벨 있는 추가 컬럼(머리 = 라벨 원문) + 상태·시작 일시·버튼.
 * 열린 행의 값 칸만 그 자리에서 고친다(Q6).
 */
export function buildItemColumns(header: DataItemHeader | null, handlers: ItemColumnHandlers = {}): GridColumn[] {
  const editable = (row: Record<string, unknown>) => isRowEditable(header, row);
  const cols: GridColumn[] = uiCols([
    { key: "code", header: "키", width: 120, minWidth: 100, align: "left", pinned: "left" },
    { key: "name", header: "이름", width: 150, minWidth: 100, align: "left", editable },
    { key: "alterName", header: "약칭", width: 100, minWidth: 70, align: "left", editable },
    { key: "seq", header: "순서", width: 60, minWidth: 50, align: "right", editable, cellEditor: "number" },
  ], ["alterName"]);
  const lvlCnt = Math.max(0, Math.min(5, header?.lvlCnt ?? 0));
  LVL_FIELDS.slice(0, lvlCnt).forEach((field, i) => {
    cols.push({ key: field, header: `${i + 1}차`, width: 80, minWidth: 60, align: "left", editable });
  });
  for (const label of header?.attrLabels ?? []) {
    if ((ATTR_FIELDS as readonly string[]).includes(label.field)) {
      cols.push({ key: label.field, header: label.label, width: 110, minWidth: 70, align: "left", editable });
    }
  }
  cols.push(
    ...uiCols([
      {
        key: "open",
        header: "상태",
        width: 60,
        minWidth: 56,
        align: "center",
        render: (value) => (value === true ? "열림" : "닫힘"),
      },
      { key: "validFrom", header: "시작 일시", width: 140, minWidth: 130, align: "center" },
    ], ["validFrom"]),
  );
  if (handlers.renderActions) {
    const render = handlers.renderActions;
    // 키·작업 열은 고정한다 — 동적 열이 많아 가로로 밀려도 어느 행의 버튼인지 보인다.
    cols.push(...uiCols([{
      key: "actions",
      header: "작업",
      width: 150,
      minWidth: 150,
      align: "center",
      pinned: "right",
      render: (_v, row) => render(row),
    }]));
  }
  return cols;
}

const VALUE_FIELDS = ["name", "alterName", "description", ...LVL_FIELDS, ...ATTR_FIELDS] as const;

/**
 * 저장 파라미터(A4) — OASIS params 는 null·배열을 받지 못하므로 빈 값은 키를 뺀다(서버에서는 빠진 키 = NULL, S5 정규화와
 * 같다). 문자열은 trim 한다. 순서는 정수로 보낸다.
 */
export function toSaveParams(maruDataId: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { maruDataId };
  const code = typeof row.code === "string" ? row.code.trim() : "";
  if (code) out.code = code;
  for (const field of VALUE_FIELDS) {
    const v = row[field];
    if (typeof v === "string" && v.trim() !== "") out[field] = v.trim();
  }
  const seq = row.seq;
  if (typeof seq === "number" && Number.isFinite(seq)) {
    out.seq = seq;
  } else if (typeof seq === "string" && seq.trim() !== "") {
    const n = Number(seq.trim());
    if (!Number.isInteger(n)) throw new Error("순서는 정수여야 합니다.");
    out.seq = n;
  }
  if (typeof row.rowVersion === "number") out.expectedRowVersion = row.rowVersion;
  return out;
}

/** 다른 사용자 수정 충돌(F1) — 서버 기본 문구로 시작한다. */
export function isRowVersionConflict(message: string): boolean {
  return message.startsWith(ROW_VERSION_CONFLICT_PREFIX);
}

/** 닫힌 키 신규 등록 안내(수용 기준 3). */
export function isClosedKeyGuide(message: string): boolean {
  return message.includes(CLOSED_KEY_REOPEN);
}
