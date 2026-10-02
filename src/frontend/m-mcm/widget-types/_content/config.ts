/**
 * 콘텐츠 유형 4종(markdown·html·web·links)의 정의 설정 읽기·검사(스펙 2026-10-02-widget-admin-generic §6).
 * definition·편집기 value 는 unknown 이므로(DB CONFIG_JSON 파싱값) 렌더러·편집기는 늘 여기서 모양을 맞춰 쓴다.
 * 순수 함수 — 시험은 config.test.ts.
 */
import { validateLinkItems, type LinkItem } from "./links";
import { checkWebUrl } from "./web";

export interface MarkdownConfig {
  markdown: string;
}

export interface HtmlConfig {
  html: string;
  allowScript: boolean;
}

export interface WebConfig {
  url: string;
}

export interface LinksConfig {
  items: LinkItem[];
}

export const MARKDOWN_EMPTY_MESSAGE = "글을 입력하세요";
export const HTML_EMPTY_MESSAGE = "html 을 입력하세요";

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function readMarkdownConfig(definition: unknown): MarkdownConfig {
  return { markdown: str(asRecord(definition).markdown) };
}

/** allowScript 는 정확히 true 일 때만 켠다(문자열 "true" 등은 꺼짐 — 격리 칸을 실수로 켜지 않는다). */
export function readHtmlConfig(definition: unknown): HtmlConfig {
  const r = asRecord(definition);
  return { html: str(r.html), allowScript: r.allowScript === true };
}

export function readWebConfig(definition: unknown): WebConfig {
  return { url: str(asRecord(definition).url) };
}

function readLinkItem(v: unknown): LinkItem | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const label = str(r.label);
  return r.kind === "url" ? { label, kind: "url", url: str(r.url) } : { label, kind: "page", pageId: str(r.pageId) };
}

/** 객체가 아닌 항목은 버린다. 종류가 url 이 아니면 page 로 본다. */
export function readLinksConfig(definition: unknown): LinksConfig {
  const raw = asRecord(definition).items;
  const items = Array.isArray(raw) ? raw.map(readLinkItem).filter((x): x is LinkItem => x !== null) : [];
  return { items };
}

export function validateMarkdownConfig(cfg: MarkdownConfig): string[] {
  return cfg.markdown.trim() ? [] : [MARKDOWN_EMPTY_MESSAGE];
}

export function validateHtmlConfig(cfg: HtmlConfig): string[] {
  return cfg.html.trim() ? [] : [HTML_EMPTY_MESSAGE];
}

export function validateWebConfig(cfg: WebConfig, portalOrigin: string): string[] {
  const r = checkWebUrl(cfg.url, portalOrigin);
  return r.ok ? [] : [r.message];
}

export function validateLinksConfig(cfg: LinksConfig): string[] {
  return validateLinkItems(cfg.items);
}
