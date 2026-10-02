"use client";

/**
 * JSON 값 읽기 전용 트리 — 객체·배열은 접고 펼 수 있는 가지로, 글자·수·참거짓·null 은 종류별 색으로 보인다.
 * 서버가 준 설정·캐시 값·응답 본문처럼 모양이 정해지지 않은 값을 그대로 살펴볼 때 쓴다. 업무 의미는 모른다.
 * - 도구 막대: 모두 펼치기·모두 접기·복사(들여쓴 JSON 글자, CopyTextButton 재사용).
 * - 처음에는 `defaultExpandDepth` 깊이까지 펼친다. 모두 펼치기·접기는 트리를 다시 그려 모든 가지에 적용한다.
 * - 글자 값은 JSON 표기(`JSON.stringify`)로 보인다 — 따옴표·역슬래시·줄바꿈이 이스케이프되어 값의 끝과 안쪽 따옴표가 헷갈리지 않는다.
 * - 가지 단추의 aria-label 은 키 경로를 담는다(예: "bizExpr 펼치기", "domain.ref 접기", 뿌리는 "전체 펼치기").
 * - `fill` 이면 부모 flex 열(ContentPanel 등)의 남은 높이를 채우고 트리 안에서만 스크롤한다.
 * 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3). 색·간격은 공통 토큰만 쓴다.
 */
import { useMemo, useState } from "react";
import { IconChevronRight } from "@tabler/icons-react";

import { CopyTextButton } from "../copy-text-button";
import { Button } from "../form/Button";

export interface JsonViewProps {
  /** 보일 값(JSON 으로 나타낼 수 있는 값 — 객체·배열·글자·수·참거짓·null). */
  value: unknown;
  /** 처음 펼칠 깊이(기본 2). 0 이면 뿌리도 접는다. */
  defaultExpandDepth?: number;
  /** 도구 막대(모두 펼치기·모두 접기·복사)를 보일지(기본 true). */
  toolbar?: boolean;
  /** 부모 flex 열의 남은 높이를 채우고 안에서 스크롤한다(기본 false — 내용 높이만큼). */
  fill?: boolean;
  /** 값이 undefined 일 때 보일 글(기본 "값 없음"). null 은 null 로 보인다. */
  emptyText?: string;
  /** 뿌리에 더할 클래스. */
  className?: string;
  /** 뿌리 data-testid(기본 "json-view"). */
  testId?: string;
}

const STYLE_HREF = "cm-json-view";

const JSON_VIEW_CSS = `
.jv { box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; max-width: 100%; color: var(--color-text); font-size: var(--font-size-sm); }
.jv-fill { flex: 1 1 auto; min-height: 0; }
.jv-toolbar { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); justify-content: flex-end; padding: var(--spacing-xs) 0; }
.jv-tree { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--spacing-xs) var(--spacing-sm); font-family: var(--font-family-mono); line-height: 1.6; background: var(--color-bg-light); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); }
.jv-empty { color: var(--color-text-secondary); padding: var(--spacing-xs) 0; }
.jv-row { display: flex; align-items: flex-start; gap: 2px; min-width: 0; }
.jv-children { margin-left: 7px; padding-left: var(--spacing-sm); border-left: 1px dotted var(--color-border); }
.jv-toggle { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 18px; padding: 0; margin: 0; border: 0; background: transparent; color: var(--color-text-secondary); cursor: pointer; border-radius: var(--radius-sm); }
.jv-toggle:hover { background: var(--color-bg-hover); }
.jv-toggle:focus-visible { outline: 1px solid var(--color-primary); }
.jv-toggle svg { transition: transform 0.1s; }
.jv-toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
.jv-spacer { flex: 0 0 auto; width: 16px; }
.jv-line { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.jv-key { color: var(--color-text); font-weight: 600; }
.jv-index { color: var(--color-text-secondary); }
.jv-colon { color: var(--color-text-secondary); }
.jv-string { color: var(--color-success); }
.jv-number { color: var(--color-primary); }
.jv-boolean { color: var(--color-warning); }
.jv-null { color: var(--color-text-secondary); font-style: italic; }
.jv-summary { color: var(--color-text-secondary); }
`;

/** 값의 종류 — 트리에서 색과 가지 여부를 정한다. */
export type JsonKind = "object" | "array" | "string" | "number" | "boolean" | "null";

/** 값의 종류. JSON 이 아닌 값(undefined·함수·bigint 등)은 글자로 본다. */
export function jsonKindOf(value: unknown): JsonKind {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "object":
      return "object";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

/** 접힌 가지의 요약 — 객체는 `{…} N개 키`, 배열은 `[…] N개 항목`. */
export function jsonSummary(value: unknown): string {
  const kind = jsonKindOf(value);
  if (kind === "array") return `[…] ${(value as unknown[]).length}개 항목`;
  if (kind === "object") return `{…} ${Object.keys(value as object).length}개 키`;
  return "";
}

/** 복사용 글자 — 2칸 들여쓴 JSON. 나타낼 수 없는 값은 String() 으로. */
export function jsonText(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
}

/** 키 경로 — 객체 키는 `.` 로, 배열 순번은 `[n]` 으로 잇는다. 뿌리는 빈 글자. */
export function jsonChildPath(parent: string, name: string | number): string {
  if (typeof name === "number") return `${parent}[${name}]`;
  return parent ? `${parent}.${name}` : name;
}

function Scalar({ value }: { value: unknown }) {
  const kind = jsonKindOf(value);
  if (kind === "null") return <span className="jv-null">null</span>;
  if (kind === "string") {
    // JSON 표기 — 안쪽 따옴표·역슬래시·줄바꿈이 이스케이프되어 값의 경계가 분명하다. 글자가 아닌 값(함수 등)은 String().
    return <span className="jv-string">{typeof value === "string" ? JSON.stringify(value) : String(value)}</span>;
  }
  return <span className={`jv-${kind}`}>{String(value)}</span>;
}

interface NodeProps {
  name: string | number | null;
  /** 이 노드의 키 경로(뿌리는 ""). */
  path: string;
  value: unknown;
  depth: number;
  expandDepth: number;
}

function JsonNode({ name, path, value, depth, expandDepth }: NodeProps) {
  const kind = jsonKindOf(value);
  const branch = kind === "object" || kind === "array";
  const [open, setOpen] = useState(depth < expandDepth);
  const label =
    name === null ? null : typeof name === "number" ? (
      <span className="jv-index">{name}</span>
    ) : (
      <span className="jv-key">{name}</span>
    );
  const head = label ? (
    <>
      {label}
      <span className="jv-colon">: </span>
    </>
  ) : null;

  if (!branch) {
    return (
      <div className="jv-row" data-kind={kind}>
        <span className="jv-spacer" />
        <span className="jv-line">
          {head}
          <Scalar value={value} />
        </span>
      </div>
    );
  }

  const entries: Array<[string | number, unknown]> =
    kind === "array" ? (value as unknown[]).map((v, i) => [i, v]) : Object.entries(value as Record<string, unknown>);
  const empty = entries.length === 0;
  return (
    <div data-kind={kind}>
      <div className="jv-row">
        {empty ? (
          <span className="jv-spacer" />
        ) : (
          <button
            type="button"
            className="jv-toggle"
            aria-expanded={open}
            aria-label={`${path || "전체"} ${open ? "접기" : "펼치기"}`}
            onClick={() => setOpen((o) => !o)}
          >
            <IconChevronRight size={12} stroke={2} />
          </button>
        )}
        <span className="jv-line">
          {head}
          {empty ? (
            <span className="jv-summary">{kind === "array" ? "[]" : "{}"}</span>
          ) : open ? (
            <span className="jv-summary">{kind === "array" ? `[ ${entries.length}개 항목` : `{ ${entries.length}개 키`}</span>
          ) : (
            <span className="jv-summary">{jsonSummary(value)}</span>
          )}
        </span>
      </div>
      {open && !empty ? (
        <div className="jv-children">
          {entries.map(([k, v]) => (
            <JsonNode key={String(k)} name={k} path={jsonChildPath(path, k)} value={v} depth={depth + 1} expandDepth={expandDepth} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function JsonView({
  value,
  defaultExpandDepth = 2,
  toolbar = true,
  fill = false,
  emptyText = "값 없음",
  className,
  testId = "json-view",
}: JsonViewProps) {
  // 모두 펼치기·접기: 펼칠 깊이를 바꾸고 트리를 다시 그린다(가지마다 가진 열림 상태를 새로 정한다).
  const [expand, setExpand] = useState<{ depth: number; gen: number }>({ depth: defaultExpandDepth, gen: 0 });
  const copy = useMemo(() => () => jsonText(value), [value]);
  const rootClass = ["jv", fill ? "jv-fill" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={rootClass} data-testid={testId}>
      <style href={STYLE_HREF} precedence="default">
        {JSON_VIEW_CSS}
      </style>
      {value === undefined ? (
        <div className="jv-empty">{emptyText}</div>
      ) : (
        <>
          {toolbar ? (
            <div className="jv-toolbar">
              <Button onClick={() => setExpand((e) => ({ depth: Number.POSITIVE_INFINITY, gen: e.gen + 1 }))}>모두 펼치기</Button>
              <Button onClick={() => setExpand((e) => ({ depth: 1, gen: e.gen + 1 }))}>모두 접기</Button>
              <CopyTextButton text={copy} className="form-button" />
            </div>
          ) : null}
          <div className="jv-tree" data-testid={`${testId}-tree`}>
            <JsonNode key={expand.gen} name={null} path="" value={value} depth={0} expandDepth={expand.depth} />
          </div>
        </>
      )}
    </div>
  );
}
