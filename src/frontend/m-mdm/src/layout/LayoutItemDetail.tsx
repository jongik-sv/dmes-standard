"use client";

/**
 * 항목 상세 패널(TSK-05-02 design.md §2 — 두 화면 공용). 칸 열림·닫힘은 fill-kind.ts 의 cell() 로만 정한다 — 닫힌 칸은
 * disabled 이고 fill_kind 를 바꾸면 값이 비워진다(불변 I6). 컬럼·파생 타입·길이·단위·도메인은 읽기 전용이다(F5).
 * 숫자 표현 형식(부호·0 채움·암묵 소수점·표현 자리수)은 숫자 도메인에만 열리고 NUM_FORMAT 문자열로 담긴다(D3).
 */
import { Input, Select } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { ColumnInfoPopover } from "@/column-info";
import { AUTO_KINDS, FILL_KINDS, cell, clearClosedFields } from "./fill-kind";
import { positionLabel } from "./layout-calc";
import { encodeNumFormat, tryDecodeNumFormat } from "./num-format";
import type { FillKind, LayoutItemRow, UnitRow } from "./types";
import { hint, row as rowStyle } from "./styles";

export interface LayoutItemDetailProps {
  item: LayoutItemRow;
  units: UnitRow[];
  readOnly: boolean;
  onChange: (next: LayoutItemRow) => void;
}

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function derivedLabel(item: LayoutItemRow): string {
  if (item.FILL_KIND === "FILLER") return "-";
  const type = item.DATA_TYPE ?? "-";
  const len = item.DOMAIN_LENGTH ?? "-";
  return `${type} ${len}${item.SCALE ? `,${item.SCALE}` : ""}${item.UNIT_CODE ? ` ${item.UNIT_CODE}` : ""}`;
}

export function LayoutItemDetail({ item, units, readOnly, onChange }: LayoutItemDetailProps) {
  const kind = item.FILL_KIND;
  const closed = (f: Parameters<typeof cell>[1]) => readOnly || cell(kind, f) === "closed";
  const isNumber = item.DATA_TYPE === "NUMBER";
  const fmtClosed = closed("NUM_FORMAT") || !isNumber;
  const fmt = tryDecodeNumFormat(item.NUM_FORMAT);
  const set = (patch: Partial<LayoutItemRow>) => onChange({ ...item, ...patch });
  const setFmt = (patch: Partial<{ sign: boolean; zeroPad: boolean; impliedScale: number; width: number | null }>) => {
    const base = { sign: fmt?.sign ?? false, zeroPad: fmt?.zeroPad ?? false, impliedScale: fmt?.impliedScale ?? 0,
      width: fmt?.width ?? null as number | null, ...patch };
    set({ NUM_FORMAT: base.width && base.width > 0 ? encodeNumFormat({ ...base, width: base.width }) : null });
  };
  const scale = item.SCALE ?? 0;
  const impliedOptions = [{ value: "0", label: "소수점 문자" }, ...(scale > 0 ? [{ value: String(scale), label: `사용(${scale}자리)` }] : [])];

  return (
    <div data-testid="item-detail">
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="FILL_KIND" label="채움 방식" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Select data-testid="item-detail-fill-kind" aria-label="채움 방식" value={kind} disabled={readOnly}
                options={FILL_KINDS.map((k) => ({ value: k, label: k }))}
                onChange={(v) => onChange(clearClosedFields({ ...item, FILL_KIND: v as FillKind }))} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="COLUMN_PHYS" meta={false} label="컬럼" /></th>
            <td style={DETAIL_VALUE_CELL}>
              {item.COLUMN_PHYS ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {`${item.DISPLAY_NAME ?? ""} (${item.COLUMN_PHYS})`}
                  <ColumnInfoPopover physName={item.COLUMN_PHYS} testId="item-detail-column-info" />
                </span>
              ) : (
                <span style={hint}>없음</span>
              )}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="derived" meta={false} label="파생 타입·길이 / 단위 / 도메인" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <span data-testid="item-detail-derived">{derivedLabel(item)}</span>
              {item.DOMAIN_NAME && <span style={hint}>{` · ${item.DOMAIN_NAME}`}</span>}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="TRANS_UNIT" label="전송 단위 / 단위 항목" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <div style={rowStyle}>
                <Select data-testid="item-detail-trans-unit" aria-label="전송 단위" value={item.TRANS_UNIT ?? ""}
                  placeholder="(기준 단위)" disabled={closed("TRANS_UNIT")}
                  options={units.map((u) => ({ value: u.UNIT_CODE, label: `${u.UNIT_CODE} (${u.DIMENSION})` }))}
                  onChange={(v) => set({ TRANS_UNIT: v || null })} />
                <Input data-testid="item-detail-unit-item" aria-label="단위 항목" style={{ width: 160 }}
                  value={item.UNIT_ITEM ?? ""} placeholder="단위를 싣는 항목" disabled={closed("UNIT_ITEM")}
                  onChange={(v) => set({ UNIT_ITEM: v.trim() || null })} />
                <span style={hint}>둘 중 하나만</span>
              </div>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="NUM_FORMAT" label="숫자 표현" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <div style={rowStyle}>
                <Select data-testid="item-detail-sign" aria-label="부호 자리" value={fmt?.sign ? "Y" : "N"} disabled={fmtClosed}
                  options={[{ value: "N", label: "부호 없음" }, { value: "Y", label: "부호 자리" }]}
                  onChange={(v) => setFmt({ sign: v === "Y" })} />
                <Select data-testid="item-detail-zero" aria-label="0 채움" value={fmt?.zeroPad ? "Y" : "N"} disabled={fmtClosed}
                  options={[{ value: "N", label: "0 채움 없음" }, { value: "Y", label: "왼쪽 0" }]}
                  onChange={(v) => setFmt({ zeroPad: v === "Y" })} />
                <Select data-testid="item-detail-implied" aria-label="암묵 소수점" value={String(fmt?.impliedScale ?? 0)}
                  disabled={fmtClosed} options={impliedOptions} onChange={(v) => setFmt({ impliedScale: Number(v) })} />
                <Input data-testid="item-detail-width" aria-label="표현 자리수" style={{ width: 80 }}
                  value={fmt?.width ?? ""} placeholder="자리수" disabled={fmtClosed}
                  onChange={(v) => setFmt({ width: num(v) })} />
                {!isNumber && kind !== "FILLER" && <span style={hint}>숫자 도메인만</span>}
              </div>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="DEFAULT_VALUE" label="기본값" /></th>
            <td style={DETAIL_VALUE_CELL}>
              {kind === "AUTO" ? (
                <Select data-testid="item-detail-default" aria-label="기본값" value={item.DEFAULT_VALUE ?? ""}
                  placeholder="송신 시 채움 종류" disabled={readOnly}
                  options={AUTO_KINDS.map((k) => ({ value: k, label: k }))}
                  onChange={(v) => set({ DEFAULT_VALUE: v || null })} />
              ) : (
                <Input data-testid="item-detail-default" aria-label="기본값" value={item.DEFAULT_VALUE ?? ""}
                  placeholder={kind === "CONST" ? "상수 값(코드값)" : ""} disabled={closed("DEFAULT_VALUE")}
                  onChange={(v) => set({ DEFAULT_VALUE: v.trim() === "" ? null : v })} />
              )}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="FILLER_LENGTH" label="FILLER 길이" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input data-testid="item-detail-filler-length" aria-label="FILLER 길이" style={{ width: 80 }}
                value={item.FILLER_LENGTH ?? ""} disabled={closed("FILLER_LENGTH")}
                onChange={(v) => set({ FILLER_LENGTH: num(v) })} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="offsetLength" meta={false} label="오프셋 / 길이" /></th>
            <td style={DETAIL_VALUE_CELL}>
              {`${item.OFFSET === null ? "-" : item.OFFSET ?? 0} / ${item.LENGTH ?? 0}`}
              <span style={hint}>{` · 위치 ${item.OFFSET === null ? "-" : positionLabel(item.OFFSET ?? 0, item.LENGTH ?? 0)} (계산값)`}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
