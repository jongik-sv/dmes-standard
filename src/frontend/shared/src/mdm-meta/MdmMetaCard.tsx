"use client";

/**
 * MdmMetaCard — MDM 컬럼·도메인 정보를 보여 주는 툴팁 본문(spec B3). 업무와 무관한 표시 부품이다.
 *
 * 순서: ① 제목(labelLong → columnName → 물리명) + 물리명(시스템 별칭으로 맞았으면 화면이 쓰는 별칭) (①-b 별칭으로 맞았으면 "{시스템} 이름 · 표준 {물리명}" 한 줄, `alias`) ② 설명·사용 메모 ③ 형식(`STRING(20)`·`NUMBER(3,1)`)·필수·기본값
 * ④ 도메인 이름(ID·종류)·단위 ⑤ 표준식 원문 ⑥ 허용 코드 앞 10개(`코드 이름`, 나머지는 "외 N개") ⑦ 서버 업무 규칙 안내(원문은 싣지 않는다).
 * 값이 없는 칸은 그리지 않는다. 각 칸은 `data-mdm-section` 으로 집을 수 있다.
 *
 * 글자색·배경은 감싸는 툴팁(폼 라벨 툴팁·ag-grid `.ag-tooltip`)을 따른다 — 카드는 색을 정하지 않고 흐린 글자만 opacity 로 낮춘다.
 */
import type { CSSProperties, ReactNode } from "react";
import type { MdmDomainMeta, MdmScreenColumn } from "./types";

export interface MdmMetaCardProps {
  column: MdmScreenColumn;
  domain?: MdmDomainMeta | null;
}

/** 허용 코드를 보이는 최대 개수. */
export const MDM_META_CARD_MAX_CODES = 10;

/** `STRING(20)`·`NUMBER(3,1)`·`NUMBER(10)`·`DATE`. 타입이 없으면 null. */
export function formatMdmDataType(c: { dataType: string | null; length: number | null; scale: number | null }): string | null {
  if (!c.dataType) return null;
  if (c.length == null) return c.dataType;
  return c.scale != null && c.scale > 0 ? `${c.dataType}(${c.length},${c.scale})` : `${c.dataType}(${c.length})`;
}

const text = (v: string | null | undefined): string | null => (typeof v === "string" && v.trim() ? v : null);

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  maxWidth: 360,
  fontSize: "var(--font-size-xs, 12px)",
  lineHeight: 1.5,
  textAlign: "left",
  whiteSpace: "normal",
  wordBreak: "break-word",
};
const titleStyle: CSSProperties = { fontWeight: 600 };
const physStyle: CSSProperties = { marginLeft: 6, fontFamily: "var(--font-family-mono, monospace)", opacity: 0.75 };
const labelStyle: CSSProperties = { opacity: 0.75, marginRight: 4 };
const monoStyle: CSSProperties = { fontFamily: "var(--font-family-mono, monospace)" };

function Row({ section, label, children }: { section: string; label?: string; children: ReactNode }) {
  return (
    <span data-mdm-section={section} style={{ display: "block" }}>
      {label ? <span style={labelStyle}>{label}</span> : null}
      {children}
    </span>
  );
}

export function MdmMetaCard({ column, domain }: MdmMetaCardProps) {
  const title = text(column.labelLong) ?? text(column.columnName) ?? column.physName;
  const description = text(column.description);
  const usageNote = text(column.usageNote);
  const type = formatMdmDataType(column);
  const defaultValue = text(column.defaultValue);
  const domainRef = column.domain;
  const domainName = text(domain?.domainName) ?? text(domainRef?.domainName);
  const domainId = domainRef?.domainId ?? domain?.domainId ?? null;
  const domainKind = text(domainRef?.domainKind) ?? text(domain?.domainKind);
  const unit = text(domain?.unitCode);
  const stdExpr = text(column.stdExpr?.text) ?? text(domain?.stdExpr?.text);
  const codes = column.allowedCodes ?? [];
  const shownCodes = codes.slice(0, MDM_META_CARD_MAX_CODES);
  const restCodes = codes.length - shownCodes.length;
  const bizRule = column.bizRuleOnServer || !!domain?.bizRuleOnServer;
  const domainMeta = [domainId, domainKind].filter(Boolean).join(" · ");
  const aliasSystem = text(column.matchedSystem);
  const aliasName = text(column.systemPhysName);

  return (
    <span className="mdm-meta-card" style={cardStyle}>
      <Row section="title">
        <span style={titleStyle}>{title}</span>
        <span style={physStyle}>{aliasSystem && aliasName ? aliasName : column.physName}</span>
      </Row>
      {aliasSystem && aliasName ? (
        <Row section="alias">
          {aliasSystem} 이름 · 표준 <span style={monoStyle}>{column.physName}</span>
        </Row>
      ) : null}
      {description || usageNote ? (
        <Row section="description">
          {description ? <span style={{ display: "block" }}>{description}</span> : null}
          {usageNote ? <span style={{ display: "block" }}>{usageNote}</span> : null}
        </Row>
      ) : null}
      <Row section="format" label="형식">
        {[type, column.required ? "필수" : "선택", defaultValue ? `기본값 ${defaultValue}` : null]
          .filter(Boolean)
          .join(" · ")}
      </Row>
      {domainId || domainName ? (
        <Row section="domain" label="도메인">
          {domainName ?? domainId}
          {domainMeta && domainName ? ` (${domainMeta})` : !domainName && domainKind ? ` (${domainKind})` : ""}
          {unit ? ` · 단위 ${unit}` : ""}
        </Row>
      ) : null}
      {stdExpr ? (
        <Row section="stdExpr" label="표준식">
          <span style={monoStyle}>{stdExpr}</span>
        </Row>
      ) : null}
      {shownCodes.length > 0 ? (
        <Row section="codes" label="허용 코드">
          {shownCodes.map((c) => (text(c.name) ? `${c.code} ${c.name}` : c.code)).join(", ")}
          {restCodes > 0 ? ` 외 ${restCodes}개` : ""}
        </Row>
      ) : null}
      {bizRule ? <Row section="bizRule">업무 규칙은 저장할 때 서버에서 확인합니다</Row> : null}
    </span>
  );
}
