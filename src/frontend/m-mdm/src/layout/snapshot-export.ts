/**
 * 레이아웃 스냅샷 내려받기(TSK-05-03 design.md §2·§6.8). JSON 은 서버 export 의 스냅샷 그대로, 엑셀은 그 스냅샷을 헤더·본문 항목의
 * 절대 위치 순 행으로 편다(AS-IS Export 대체, 03:106). 스냅샷 모양은 계약 MdmLayoutSnapshot(layout-snapshot.schema.json)이다.
 */
import { position } from "./sample-line";

export interface SnapshotNumFormat {
  sign: boolean;
  zeroPad: boolean;
  impliedScale: number;
}

export interface SnapshotItem {
  seq: number;
  fillKind: string;
  dataType: string | null;
  columnPhys: string | null;
  transUnit: string | null;
  unitItem: string | null;
  numFormat: SnapshotNumFormat | null;
  defaultValue: string | null;
  overrideValue: string | null;
  fillerLength: number | null;
  offset: number;
  length: number;
  unitCode: string | null;
  scale: number | null;
}

export interface SnapshotHeader {
  seq: number;
  headerLayoutId: number;
  headerLayoutName: string;
  offset: number;
  totalLength: number;
  items: SnapshotItem[];
}

export interface LayoutSnapshot {
  layoutId: number;
  layoutName: string;
  eaiCode: string | null;
  sndSystem: string | null;
  rcvSystem: string | null;
  encoding: string | null;
  padRule: string | null;
  layoutVersion: number;
  totalLength: number;
  headers: SnapshotHeader[];
  items: SnapshotItem[];
}

export const SNAPSHOT_EXCEL_COLUMNS: Array<{ key: string; header: string; width?: number }> = [
  { key: "ZONE", header: "구역", width: 20 },
  { key: "SEQ", header: "순서", width: 6 },
  { key: "NAME", header: "항목명", width: 20 },
  { key: "COLUMN_PHYS", header: "표준 물리명", width: 18 },
  { key: "FILL_KIND", header: "fill_kind", width: 10 },
  { key: "DATA_TYPE", header: "타입", width: 8 },
  { key: "OFFSET", header: "오프셋", width: 8 },
  { key: "LENGTH", header: "길이", width: 6 },
  { key: "POSITION", header: "위치", width: 10 },
  { key: "UNIT_CODE", header: "기준 단위", width: 10 },
  { key: "TRANS_UNIT", header: "전송 단위", width: 10 },
  { key: "UNIT_ITEM", header: "단위 항목", width: 14 },
  { key: "NUM_FORMAT", header: "숫자 형식", width: 26 },
  { key: "VALUE", header: "값(상수·재정의·AUTO 종류)", width: 20 },
];

export function snapshotFileBase(layoutId: number, version: number): string {
  return `layout-${layoutId}-v${version}`;
}

export function snapshotJsonText(snapshot: unknown): string {
  return JSON.stringify(snapshot, null, 2);
}

function numFormatText(f: SnapshotNumFormat | null): string {
  if (!f) return "";
  return `${f.sign ? "부호 있음" : "부호 없음"}·${f.zeroPad ? "0 채움" : "공백 채움"}·암묵 소수 ${f.impliedScale}`;
}

function row(zone: string, item: SnapshotItem, offset: number, names: Record<string, string>): Record<string, unknown> {
  const filler = item.fillKind === "FILLER";
  const value = item.fillKind === "CONST" ? (item.overrideValue && item.overrideValue.trim() !== "" ? item.overrideValue : item.defaultValue)
    : item.fillKind === "AUTO" ? item.defaultValue : null;
  return {
    ZONE: zone,
    SEQ: item.seq,
    NAME: filler ? "여분" : (item.columnPhys && names[item.columnPhys]) || item.columnPhys,
    COLUMN_PHYS: item.columnPhys,
    FILL_KIND: item.fillKind,
    DATA_TYPE: item.dataType,
    OFFSET: offset,
    LENGTH: item.length,
    POSITION: position(offset, item.length),
    UNIT_CODE: item.unitCode,
    TRANS_UNIT: item.transUnit,
    UNIT_ITEM: item.unitItem,
    NUM_FORMAT: numFormatText(item.numFormat),
    VALUE: value ?? "",
  };
}

/** 헤더 항목은 헤더 시작 + 헤더 안 상대 오프셋, 본문은 절대 오프셋 — 절대 위치 순으로 편다. */
export function snapshotExcelRows(snapshot: LayoutSnapshot, names: Record<string, string>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const h of [...snapshot.headers].sort((a, b) => a.seq - b.seq)) {
    for (const i of h.items) out.push(row(h.headerLayoutName, i, h.offset + i.offset, names));
  }
  for (const i of snapshot.items) out.push(row("본문", i, i.offset, names));
  return out.sort((a, b) => Number(a.OFFSET) - Number(b.OFFSET));
}
