"use client";

/**
 * 컬럼 정보 팝오버 — 표준 물리명(화면에 보이는 "컬럼 ID")을 받아 컬럼 사전의 상세(논리명·표시명·도메인·필수·기본값·참조·구성 용어·
 * 시스템 매핑·설명·사용 메모)를 큰 팝오버로 보여 준다. 처음 열 때 한 번 조회하고 같은 컬럼은 모듈 캐시로 다시 묻지 않는다(api.ts).
 * 껍데기(여닫기·자리·이벤트 전파 차단)는 shared `DetailPopover` 가 맡는다. 이 파일은 MDM 컬럼 사전 데이터에 묶여 m-mdm 에 둔다.
 *
 * 설명은 HTML 로 넣을 수 있다(알려진 태그가 있으면 HTML, 아니면 일반 글 — descriptionFormat). HTML 은 shared `NoticeBodyView` 가
 * DOMPurify 로 소독해 보인다.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DetailPopover } from "@dk-oasis/shared/detail-popover";
import { CopyTextButton } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { NoticeBodyView } from "@dk-oasis/shared/notice-body-view";
import { descriptionFormat, loadColumnInfo, type ColumnInfo, type ColumnInfoDomain, type ColumnInfoTerm } from "./api";

const labelCell: CSSProperties = { ...DETAIL_LABEL_CELL, width: 96, verticalAlign: "top" };
const valueCell: CSSProperties = { ...DETAIL_VALUE_CELL, overflowWrap: "anywhere" };
const muted: CSSProperties = { color: "var(--color-text-muted)" };
const mono: CSSProperties = { fontFamily: "var(--font-family-mono)" };
const physRow: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" };
const message: CSSProperties = { margin: 0, padding: "var(--spacing-sm) 0", color: "var(--color-text-muted)" };

const dash = (v: unknown): ReactNode =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? <span style={muted}>-</span> : String(v);

export function domainTypeLabel(d: Pick<ColumnInfoDomain, "dataType" | "length" | "scale">): string {
  if (!d.dataType) return "타입 없음";
  if (d.length == null) return d.dataType;
  return `${d.dataType}(${d.length}${d.scale ? `,${d.scale}` : ""})`;
}

export function termsLabel(terms: ColumnInfoTerm[]): string {
  return terms
    .map((t) => {
      if (t.missing) return t.termId == null ? (t.termName ?? "?") : `(없는 용어 #${t.termId})`;
      const name = t.termName ?? "";
      return t.engAbbr ? `${name}(${t.engAbbr})` : name;
    })
    .filter(Boolean)
    .join(" · ");
}

function DomainCell({ domain }: { domain: ColumnInfoDomain | null }) {
  if (!domain) return <span style={muted}>없음</span>;
  return (
    <span data-testid="column-info-domain">
      {domain.domainName ?? "-"}
      {domain.stdName ? <span style={{ ...muted, ...mono }}>{` (${domain.stdName})`}</span> : null}
      {` · ${domainTypeLabel(domain)}`}
      {domain.unitCode ? ` · 단위 ${domain.unitCode}` : ""}
    </span>
  );
}

function Body({ value, testId }: { value: string | null | undefined; testId: string }) {
  const text = value ?? "";
  if (!text.trim()) return <span style={muted}>-</span>;
  return <NoticeBodyView value={text} format={descriptionFormat(text)} testId={testId} />;
}

/** 조회한 컬럼 정보 표(라벨-값 짝). 팝오버 밖(예: 다른 상세 패널)에서도 그대로 쓸 수 있다. */
export function ColumnInfoTable({ info }: { info: ColumnInfo }) {
  const c = info.column;
  const ref = [c.refKind, c.refTarget, c.refCateId ? `분류 ${c.refCateId}` : null].filter(Boolean).join(" · ");
  const systems = info.systems.map((s) => `${s.systemCode} ${s.physName}${s.transform ? ` (${s.transform})` : ""}`).join(" · ");
  const terms = termsLabel(info.terms);
  return (
    <table style={DETAIL_TABLE_STYLE} data-testid="column-info-table">
      <tbody>
        <tr>
          <th style={labelCell}>논리명</th>
          <td style={valueCell} data-testid="column-info-name">{c.columnName}</td>
        </tr>
        <tr>
          <th style={labelCell}>물리명</th>
          <td style={valueCell}>
            <div style={physRow}>
              <span style={mono} data-testid="column-info-phys">{c.physName}</span>
              <CopyTextButton text={c.physName} />
            </div>
          </td>
        </tr>
        <tr>
          <th style={labelCell}>표시명</th>
          <td style={valueCell}>
            <span style={muted}>긴</span> {dash(c.labelLong)} <span style={muted}>· 중간</span> {dash(c.labelMid)}{" "}
            <span style={muted}>· 짧은</span> {dash(c.labelShort)}
          </td>
        </tr>
        <tr>
          <th style={labelCell}>도메인</th>
          <td style={valueCell}>
            <DomainCell domain={info.domain} />
          </td>
        </tr>
        <tr>
          <th style={labelCell}>필수</th>
          <td style={valueCell}>{c.required ? "예" : "아니오"}</td>
        </tr>
        <tr>
          <th style={labelCell}>기본값</th>
          <td style={valueCell}>{dash(c.defaultValue)}</td>
        </tr>
        <tr>
          <th style={labelCell}>참조</th>
          <td style={valueCell}>{dash(ref)}</td>
        </tr>
        <tr>
          <th style={labelCell}>구성 용어</th>
          <td style={valueCell} data-testid="column-info-terms">{dash(terms)}</td>
        </tr>
        {systems ? (
          <tr>
            <th style={labelCell}>시스템 매핑</th>
            <td style={{ ...valueCell, ...mono }}>{systems}</td>
          </tr>
        ) : null}
        <tr>
          <th style={labelCell}>설명</th>
          <td style={valueCell}>
            <Body value={c.description} testId="column-info-description" />
          </td>
        </tr>
        <tr>
          <th style={labelCell}>사용 메모</th>
          <td style={valueCell}>
            <Body value={c.usageNote} testId="column-info-usage-note" />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

type LoadState = { status: "loading" } | { status: "ok"; info: ColumnInfo } | { status: "error"; message: string };

/** 열릴 때 마운트되어 한 번 조회한다(캐시가 있으면 바로 보인다). */
export function ColumnInfoCard({ physName }: { physName: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    loadColumnInfo(physName).then(
      (info) => alive && setState({ status: "ok", info }),
      (e: unknown) => alive && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [physName]);

  if (state.status === "loading") {
    return <p style={message} data-testid="column-info-loading">불러오는 중…</p>;
  }
  if (state.status === "error") {
    return (
      <div data-testid="column-info-empty">
        <p style={{ ...message, color: "var(--color-text)" }}>정보 없음</p>
        <p style={{ ...message, paddingTop: 0, fontSize: "var(--font-size-xs)" }}>
          컬럼 사전에서 {physName} 을(를) 찾지 못했습니다. {state.message}
        </p>
      </div>
    );
  }
  return <ColumnInfoTable info={state.info} />;
}

export interface ColumnInfoPopoverProps {
  /** 표준 물리명(화면의 "컬럼 ID"). */
  physName: string;
  /** 트리거 내용. 비우면 정보 아이콘. */
  children?: ReactNode;
  /** data-testid 접두(기본 "column-info"). */
  testId?: string;
}

/** 정보 아이콘(또는 children)을 누르면 컬럼 정보 카드를 연다. 그리드 셀·머리 안에서 써도 행 선택·머리 클릭과 겹치지 않는다. */
export function ColumnInfoPopover({ physName, children, testId = "column-info" }: ColumnInfoPopoverProps) {
  return (
    <DetailPopover
      title={`컬럼 정보 · ${physName}`}
      triggerLabel={`${physName} 컬럼 정보`}
      content={<ColumnInfoCard physName={physName} />}
      testId={testId}
    >
      {children}
    </DetailPopover>
  );
}

const physCell: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2, minWidth: 0, maxWidth: "100%" };
const physText: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

/** 물리명 글자 + 정보 아이콘. 칸이 좁으면 글자만 말줄임되고 아이콘은 남는다. 물리명이 비면 아무것도 그리지 않는다. */
export function ColumnPhysName({ physName, testId }: { physName: string | null | undefined; testId?: string }) {
  const name = (physName ?? "").trim();
  if (!name) return null;
  return (
    <span style={physCell}>
      <span style={physText} title={name}>{name}</span>
      <ColumnInfoPopover physName={name} testId={testId} />
    </span>
  );
}
