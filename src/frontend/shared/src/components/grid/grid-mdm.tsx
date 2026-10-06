"use client";

import { useMemo, useRef, type CSSProperties } from "react";
import type { ColDef, ColGroupDef, ITooltipParams } from "ag-grid-community";
import {
  MdmMetaCard,
  resolveCaption,
  useMdmCaptionPriority,
  useMdmColumns,
  useMdmMetaScope,
  type MdmColumnInfo,
  type MdmDomainMeta,
  type MdmScreenColumn,
} from "../../mdm-meta";
import { MdmHeaderLabel } from "./MdmHeaderLabel";
import type { GridColumn } from "./grid-types";
import type { BuildColumnDefsOptions } from "./column-defs";

/** 화면 검사 결과 한 칸 — 검사한 값과 문구. */
export interface MdmCellCheck {
  value: unknown;
  message: string;
}

function sameCellValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return a == null && b == null;
  return String(a) === String(b);
}

/**
 * 칸 하나에 보일 오류 문구. 서버 오류가 있고 그 뒤 사용자가 고치지 않았으면(dismissed 아님) 서버 문구,
 * 아니면 화면 검사 문구(검사한 값이 지금 값과 같을 때만 — 값이 바뀌었으면 낡은 판정이다). 없으면 null.
 */
export function pickCellIssue(
  server: string | undefined,
  serverDismissed: boolean,
  client: MdmCellCheck | undefined,
  value: unknown
): string | null {
  if (server != null && !serverDismissed) return server;
  if (client && sameCellValue(client.value, value)) return client.message;
  return null;
}

/** 칸 검증 오류 칸에 다는 클래스. */
export const MDM_INVALID_CELL_CLASS = "cell-mdm-invalid";

/** 머리글 툴팁 컴포넌트에 넘기는 값(ColDef.tooltipComponentParams). */
export interface MdmGridTooltipParams {
  mdmColumn: MdmScreenColumn;
  mdmDomain: MdmDomainMeta | null;
}

/**
 * 사용자 툴팁 상자의 폭. ag-grid React 는 사용자 툴팁을 폭 0 인 absolute 감싸개(.ag-tooltip-custom) 안에 넣는다. 그래서 absolute 인
 * .ag-tooltip 이 내용에 맞춰 줄어들 폭을 얻지 못해 글자마다 줄이 바뀐다(2026-10-03 포털 확인). 내용 폭을 쓰고 넓은 내용은 최대 폭에서 줄을 바꾼다.
 */
const MDM_TOOLTIP_BOX_STYLE: CSSProperties = { width: "max-content", maxWidth: 380 };

/**
 * MDM 메타가 있는 열의 ag-grid 사용자 툴팁(tooltipComponent). ag-grid 는 열의 tooltipComponent 를 머리글과 셀 툴팁에 함께 쓰므로,
 * 머리글(`location: "header"`)이면 MdmMetaCard 를, 셀이면 기본 툴팁과 같은 값 글자를 그린다.
 * ag-grid 툴팁은 마우스가 들어갈 수 없으므로 카드는 늘 글자 카드다(textOnly). HTML 설명 카드는 머리글 라벨(MdmHeaderLabel)이 포털로 띄운다 —
 * 이 경로로 오는 HTML 열은 화면이 innerHeaderComponent 를 직접 준 열뿐이다.
 */
export function MdmGridTooltip(props: ITooltipParams & Partial<MdmGridTooltipParams>) {
  if (props.location === "header" && props.mdmColumn) {
    return (
      <div className="ag-tooltip mdm-meta-tooltip" style={MDM_TOOLTIP_BOX_STYLE}>
        <MdmMetaCard column={props.mdmColumn} domain={props.mdmDomain ?? null} textOnly />
      </div>
    );
  }
  // ag-grid 기본 TooltipComponent 와 같게 value(tooltipValueGetter 결과)만 그린다 — valueFormatted 는 쓰지 않는다.
  const value = props.value;
  return (
    <div className="ag-tooltip" style={MDM_TOOLTIP_BOX_STYLE}>
      {value == null ? "" : String(value)}
    </div>
  );
}

/**
 * HTML 설명 머리글 라벨(MdmHeaderLabel)을 단 잎 열 id 목록(그룹 안까지, 순서대로 이어 붙인 서명). 바뀌면 머리글을 다시 만든다 —
 * ag-grid 는 만든 뒤 colDef 에 innerHeaderComponent 가 생기거나 빠져도 머리글을 스스로 다시 만들지 않는다.
 */
export function mdmHeaderLabelSignature(defs: ReadonlyArray<ColDef | ColGroupDef>): string {
  const ids: string[] = [];
  const walk = (list: ReadonlyArray<ColDef | ColGroupDef>) => {
    for (const d of list) {
      if ("children" in d && Array.isArray(d.children)) walk(d.children);
      else if ((d as ColDef).headerComponentParams?.innerHeaderComponent === MdmHeaderLabel) {
        const c = d as ColDef;
        ids.push(c.colId ?? c.field ?? "");
      }
    }
  };
  walk(defs);
  return ids.join("\u0000");
}

/** 열 하나의 머리글 글자. MDM 이 없으면 적은 header, 그것도 없으면 key(ag-grid 가 field 로 'Code Nm' 같은 이름을 지어내지 않게). */
export function columnCaption(col: GridColumn, mdm: BuildColumnDefsOptions["mdm"]): string {
  if (!mdm) return col.header ?? col.key;
  return resolveCaption(mdm.infoByKey.get(col.key)?.column ?? null, "grid", col.header, mdm.priority, col.key);
}

/** MDM 메타를 찾을 잎 열(열 그룹 안까지). 이름 = 열 key. */
function mdmLeafEntries(columns: GridColumn[], out: Array<{ name: string; meta?: string | false }> = []) {
  for (const c of columns) {
    if (c.children && c.children.length > 0) mdmLeafEntries(c.children, out);
    else out.push({ name: c.key, meta: c.meta });
  }
  return out;
}

/**
 * 두 칸 메타 Map 이 그리드가 읽는 값까지 같은가 — 키 목록과 칸마다 column·domain(참조). `loading` 은 보지 않는다(그리드는 쓰지 않는다).
 */
export function sameGridMdmValues(a: Map<string, MdmColumnInfo>, b: Map<string, MdmColumnInfo>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, next] of b) {
    const prev = a.get(key);
    if (!prev || prev.column !== next.column || prev.domain !== next.domain) return false;
  }
  return true;
}

/**
 * 그리드 안에서 쓰는 MDM 옵션. 공급자 밖이면 undefined — 열 정의가 예전과 같다.
 * 값은 그리드가 읽는 메타(칸마다 column·domain)가 바뀔 때만 새로 낸다. 메타가 없는 칸(404·꺼진 모듈·사전에 없음)도 새 열 목록마다
 * 처음엔 `loading` 이었다가 응답 뒤 없음으로 바뀐다 — 그것만으로 값을 새로 내면 내용이 같은 열 정의가 ag-grid 에 다시 들어가고,
 * 머리 그룹 칸이 처음 붙는 커밋과 겹치면 React 개발 모드 효과 재실행이 파기된 머리 그룹 ctrl 을 다시 붙이다 죽는다
 * (getProvidedColumnGroup of null — mdm ruleEdit 첫 열 적용, 2026-10-03).
 */
export function useGridMdm(columns: GridColumn[]): BuildColumnDefsOptions["mdm"] {
  const scope = useMdmMetaScope();
  const entries = useMemo(() => (scope ? mdmLeafEntries(columns) : []), [scope, columns]);
  const infoByKey = useMdmColumns(entries);
  const priority = useMdmCaptionPriority();
  const prevRef = useRef<BuildColumnDefsOptions["mdm"]>(undefined);
  return useMemo(() => {
    if (!scope) return (prevRef.current = undefined);
    const prev = prevRef.current;
    if (prev && prev.priority === priority && sameGridMdmValues(prev.infoByKey, infoByKey)) return prev;
    return (prevRef.current = { infoByKey, priority });
  }, [scope, infoByKey, priority]);
}

export function resolveColumnHeaders(columns: GridColumn[], mdm: BuildColumnDefsOptions["mdm"]): GridColumn[] {
  return columns.map((c) =>
    c.children && c.children.length > 0
      ? { ...c, header: c.header ?? c.key, children: resolveColumnHeaders(c.children, mdm) }
      : { ...c, header: columnCaption(c, mdm) }
  );
}

/**
 * 그리드에 보이는 머리글로 header 를 채운 열 목록 — 화면이 엑셀 내보내기·열 선택처럼 `header` 를 직접 읽을 때 쓴다(열 그룹 안까지).
 * 공급자 안이면 AgDataGrid 와 같은 MDM 캡션, 밖이면 적은 header(없으면 key).
 */
export function useResolvedGridColumns(columns: GridColumn[]): GridColumn[] {
  const mdm = useGridMdm(columns);
  return useMemo(() => resolveColumnHeaders(columns, mdm), [columns, mdm]);
}
