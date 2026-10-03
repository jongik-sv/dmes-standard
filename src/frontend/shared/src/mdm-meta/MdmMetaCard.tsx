"use client";

/**
 * MdmMetaCard — MDM 컬럼·도메인 정보를 보여 주는 툴팁 본문(spec B3). 업무와 무관한 표시 부품이다.
 *
 * 순서: ① 제목(labelLong → columnName → 물리명) + 물리명(시스템 별칭으로 맞았으면 화면이 쓰는 별칭) (①-b 별칭으로 맞았으면 "{시스템} 이름 · 표준 {물리명}" 한 줄, `alias`) ② 설명·사용 메모 ③ 형식(`STRING(20)`·`NUMBER(3,1)`)·필수·기본값
 * ④ 도메인 이름(ID·종류)·단위 ⑤ 표준식 원문 ⑥ 허용 코드 앞 10개(`코드 이름`, 나머지는 "외 N개") ⑦ 서버 업무 규칙 안내(원문은 싣지 않는다).
 * 값이 없는 칸은 그리지 않는다. 각 칸은 `data-mdm-section` 으로 집을 수 있다.
 *
 * 글자색·배경은 감싸는 툴팁(폼 라벨 툴팁·ag-grid `.ag-tooltip`)을 따른다 — 카드는 색을 정하지 않고 흐린 글자만 opacity 로 낮춘다.
 *
 * HTML 설명(2026-10-03): 컬럼에 `descriptionHtml`(MDM 이 소독한 HTML)이 있으면 ②에 그 HTML 을 `description` 글자보다 우선해 그린다.
 * 브라우저에서 `sanitizeNoticeHtml` 로 한 번 더 소독한 결과만 넣는다(서버 렌더처럼 소독할 수 없거나 보이는 내용이 없으면 `description` 글자 —
 * 이때 카드는 모양·동작까지 글자 카드다).
 * 그 카드만 최대 폭 640px, 설명 칸(`data-mdm-html="true"`)은 최대 높이 60vh 에 세로 스크롤이다. 일반 글 카드는 예전 그대로다.
 * HTML 카드는 마우스가 들어갈 수 있는 포털 툴팁으로 띄운다(`mdmCardTipOptions` — FormGroup·MdmFieldLabel·그리드 머리글 라벨 MdmHeaderLabel).
 */
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { HoverTipOptions } from "../components/form/useHoverTip";
// 배럴(../components/notice-body-view)을 거치지 않는다 — 배럴은 NoticeBodyView·MarkdownView 를 끌어들인다.
import { sanitizeNoticeHtml } from "../components/notice-body-view/sanitize";
import type { MdmDomainMeta, MdmScreenColumn } from "./types";

export interface MdmMetaCardProps {
  column: MdmScreenColumn;
  domain?: MdmDomainMeta | null;
  /**
   * 설명을 HTML 대신 글자(`description`)로 그린다 — 스크린리더용 숨은 사본(`.form-sr-only`)에 쓴다.
   * HTML 의 링크가 보이지 않는 채 Tab 순서에 들지 않게 한다. 일반 글 카드에는 영향이 없다.
   */
  textOnly?: boolean;
}

/** 허용 코드를 보이는 최대 개수. */
export const MDM_META_CARD_MAX_CODES = 10;

/** HTML 설명 카드의 최대 폭(px) — 감싸는 툴팁 상자도 이 폭을 쓴다. 일반 글 카드는 360. */
export const MDM_META_CARD_HTML_MAX_WIDTH = 640;
/** HTML 설명 칸의 최대 높이 — 넘으면 세로 스크롤. */
export const MDM_META_CARD_HTML_MAX_HEIGHT = "60vh";

/** `STRING(20)`·`NUMBER(3,1)`·`NUMBER(10)`·`DATE`. 타입이 없으면 null. */
export function formatMdmDataType(c: { dataType: string | null; length: number | null; scale: number | null }): string | null {
  if (!c.dataType) return null;
  if (c.length == null) return c.dataType;
  return c.scale != null && c.scale > 0 ? `${c.dataType}(${c.length},${c.scale})` : `${c.dataType}(${c.length})`;
}

const text = (v: string | null | undefined): string | null => (typeof v === "string" && v.trim() ? v : null);

/** 소독 결과 캐시 — 원문 HTML → 보이는 내용이 있는 소독 HTML(없으면 null). 소독할 수 없는 곳(서버)의 결과는 넣지 않는다. */
const safeHtmlCache = new Map<string, string | null>();
const SAFE_HTML_CACHE_MAX = 500;

/** 소독한 HTML 에 보이는 내용(글자 또는 그림)이 있는가 — `<p></p>`·`<p><br></p>` 처럼 빈 HTML 은 글자 설명으로 대신한다. */
function hasVisibleContent(html: string): boolean {
  const t = document.createElement("template");
  t.innerHTML = html;
  return !!t.content.textContent?.trim() || t.content.querySelector("img") != null;
}

/**
 * 카드에 넣을 소독 HTML — `descriptionHtml` 을 `sanitizeNoticeHtml` 로 소독하고 보이는 내용이 있을 때만 돌려준다(문자열별 캐시).
 * HTML 설명이 없거나, 소독 뒤 보이는 게 없거나, 소독할 수 없으면(서버 렌더 — DOM 없음) null.
 */
export function mdmCardSafeHtml(column: Pick<MdmScreenColumn, "descriptionHtml"> | null | undefined): string | null {
  const raw = text(column?.descriptionHtml);
  if (!raw) return null;
  const hit = safeHtmlCache.get(raw);
  if (hit !== undefined) return hit;
  const safe = sanitizeNoticeHtml(raw);
  if (safe == null) return null;
  const result = hasVisibleContent(safe) ? safe : null;
  if (safeHtmlCache.size >= SAFE_HTML_CACHE_MAX) safeHtmlCache.clear();
  safeHtmlCache.set(raw, result);
  return result;
}

/**
 * 이 컬럼의 카드가 HTML 설명 카드인가 — 소독 결과에 보이는 내용(글자·그림)이 있을 때만 참. 넓은 카드(640)·상호작용 툴팁·그리드 머리글
 * 라벨 카드를 켤지 정한다. 서버 렌더(소독 불가)에서는 거짓(글자 카드).
 */
export function mdmCardHasHtml(column: Pick<MdmScreenColumn, "descriptionHtml"> | null | undefined): boolean {
  return mdmCardSafeHtml(column) != null;
}

/** HTML 설명 카드를 띄우는 포털 툴팁 옵션 — 마우스가 들어갈 수 있고(유예·Escape), 넓고, 큰 카드로 위쪽 공간을 판정한다. */
const MDM_HTML_TIP_OPTIONS: HoverTipOptions = {
  interactive: true,
  maxWidth: MDM_META_CARD_HTML_MAX_WIDTH,
  // 설명 칸 최대(60vh) + 제목·형식·도메인 등 다른 칸 어림값.
  estHeight: () => Math.round(window.innerHeight * 0.6) + 120,
};

/**
 * 포털 툴팁(FormGroup·MdmFieldLabel)이 이 컬럼의 카드를 띄울 때 쓸 옵션. HTML 설명 카드면 상호작용 옵션, 아니면 undefined(예전 툴팁).
 * 화면이 준 tip 을 띄울 때는 쓰지 않는다.
 */
export function mdmCardTipOptions(column: MdmScreenColumn | null | undefined): HoverTipOptions | undefined {
  return mdmCardHasHtml(column) ? MDM_HTML_TIP_OPTIONS : undefined;
}

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
// HTML 카드만 폭을 넓힌다 — 키 순서는 cardStyle 과 같다(일반 글 카드의 style 문자열은 그대로).
const htmlCardStyle: CSSProperties = { ...cardStyle, maxWidth: MDM_META_CARD_HTML_MAX_WIDTH };
const htmlDescriptionStyle: CSSProperties = {
  display: "block",
  maxHeight: MDM_META_CARD_HTML_MAX_HEIGHT,
  overflowY: "auto",
};
/** HTML 설명 대신 그리는 글자(`description`) — 서버가 블록 경계에 넣은 줄바꿈을 살린다. */
const fallbackDescriptionStyle: CSSProperties = { display: "block", whiteSpace: "pre-line" };
const titleStyle: CSSProperties = { fontWeight: 600 };
const physStyle: CSSProperties = { marginLeft: 6, fontFamily: "var(--font-family-mono, monospace)", opacity: 0.75 };
const labelStyle: CSSProperties = { opacity: 0.75, marginRight: 4 };
const monoStyle: CSSProperties = { fontFamily: "var(--font-family-mono, monospace)" };

/**
 * HTML 설명 서식 — 툴팁 안이라 여백을 줄이고 그림·표가 카드를 넘지 않게 한다. 색은 감싸는 툴팁 글자색을 따른다(currentColor·inherit).
 * 포털이 원격 모듈의 CSS 파일을 싣지 않으므로(Part B §18-3) 컴포넌트가 `<style href precedence>` 로 문서 머리에 한 번 싣는다.
 */
export const MDM_META_CARD_HTML_CSS = `
.mdm-meta-card-html { overflow-wrap: anywhere; }
.mdm-meta-card-html > :first-child { margin-top: 0; }
.mdm-meta-card-html > :last-child { margin-bottom: 0; }
.mdm-meta-card-html p { margin: 0; }
.mdm-meta-card-html p + p { margin-top: 0.25em; }
.mdm-meta-card-html h1, .mdm-meta-card-html h2, .mdm-meta-card-html h3, .mdm-meta-card-html h4, .mdm-meta-card-html h5, .mdm-meta-card-html h6 { margin: 2px 0; font-size: inherit; font-weight: 700; line-height: 1.3; }
.mdm-meta-card-html ul, .mdm-meta-card-html ol { margin: 2px 0; padding-left: 1.4em; }
.mdm-meta-card-html ul { list-style: disc outside; }
.mdm-meta-card-html ol { list-style: decimal outside; }
.mdm-meta-card-html li { display: list-item; }
.mdm-meta-card-html blockquote { margin: 2px 0; padding-left: 8px; border-left: 2px solid currentColor; }
.mdm-meta-card-html a { color: inherit; text-decoration: underline; cursor: pointer; }
.mdm-meta-card-html code { font-family: var(--font-family-mono, monospace); }
.mdm-meta-card-html pre { margin: 2px 0; max-width: 100%; overflow: auto; white-space: pre; overflow-wrap: normal; }
.mdm-meta-card-html img { max-width: 100%; height: auto; }
.mdm-meta-card-html table { display: block; max-width: 100%; overflow-x: auto; margin: 2px 0; border-collapse: collapse; overflow-wrap: normal; }
.mdm-meta-card-html th, .mdm-meta-card-html td { padding: 1px 4px; border: 1px solid currentColor; text-align: left; vertical-align: top; }
.mdm-meta-card-html hr { border: 0; border-top: 1px solid currentColor; margin: 4px 0; }
`;

function MdmMetaCardHtmlStyle() {
  return (
    <style href="cm-mdm-meta-card-html" precedence="default">
      {MDM_META_CARD_HTML_CSS}
    </style>
  );
}

const noopSubscribe = () => () => {};

function Row({ section, label, children }: { section: string; label?: string; children: ReactNode }) {
  return (
    <span data-mdm-section={section} style={{ display: "block" }}>
      {label ? <span style={labelStyle}>{label}</span> : null}
      {children}
    </span>
  );
}

export function MdmMetaCard({ column, domain, textOnly = false }: MdmMetaCardProps) {
  const title = text(column.labelLong) ?? text(column.columnName) ?? column.physName;
  const description = text(column.description);
  // HTML 설명 — 서버 렌더·하이드레이션 첫 렌더에서는 소독하지 않는다(DOMPurify 는 DOM 이 있어야 한다, NoticeBodyView 와 같은 방식).
  // 소독 뒤 보이는 내용이 없으면 글자 카드다(모양·상호작용 판정 mdmCardHasHtml 과 같은 기준).
  const hasHtmlSource = text(column.descriptionHtml) != null;
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const safeHtml = !textOnly && mounted ? mdmCardSafeHtml(column) : null;
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
    <span className="mdm-meta-card" style={safeHtml ? htmlCardStyle : cardStyle}>
      <Row section="title">
        <span style={titleStyle}>{title}</span>
        <span style={physStyle}>{aliasSystem && aliasName ? aliasName : column.physName}</span>
      </Row>
      {aliasSystem && aliasName ? (
        <Row section="alias">
          {aliasSystem} 이름 · 표준 <span style={monoStyle}>{column.physName}</span>
        </Row>
      ) : null}
      {safeHtml ? (
        <span data-mdm-section="description" data-mdm-html="true" style={htmlDescriptionStyle}>
          <MdmMetaCardHtmlStyle />
          <span className="mdm-meta-card-html" style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: safeHtml }} />
          {usageNote ? <span style={{ display: "block" }}>{usageNote}</span> : null}
        </span>
      ) : description || usageNote ? (
        <Row section="description">
          {description ? (
            // HTML 설명에서 뽑은 글자(서버가 블록 경계에 줄바꿈을 넣는다)는 줄을 살린다. 일반 글 설명은 예전 그대로.
            <span style={hasHtmlSource ? fallbackDescriptionStyle : { display: "block" }}>{description}</span>
          ) : null}
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
