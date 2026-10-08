"use client";

/**
 * DB 뷰어 (anl/dbViewer) — 스키마·테이블 트리 패널.
 * 머리줄(제목·전체 테이블 수) + 테이블명 검색 + 스키마별로 접는 테이블 목록.
 * 처음에는 스키마가 모두 접혀 있다. 검색어가 있으면 일치하는 테이블이 없는 스키마는 숨기고,
 * 일치하는 스키마는 펼쳐 일치 부분을 강조한다.
 */

import { memo, useMemo, useState } from "react";
import { Input } from "@dk-oasis/shared/form";

export interface DbMenuTreeProps {
  /** 스키마 → 테이블 목록. */
  tablesBySchema: Record<string, string[]>;
  schemaOrder: readonly string[];
  selectedKey: string | null;
  onSelectTable: (schema: string, table: string) => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`anl-db-chevron${open ? " anl-db-chevron--open" : ""}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function SchemaIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="10" y1="10" x2="10" y2="20" />
    </svg>
  );
}

/** 검색어 일치 부분을 <mark> 로 감싼다(대소문자 무시). */
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const at = text.toLowerCase().indexOf(term);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}

const SchemaNode = memo(function SchemaNode({
  schema,
  tables,
  total,
  term,
  selectedKey,
  onSelectTable,
}: {
  schema: string;
  tables: string[];
  total: number;
  term: string;
  selectedKey: string | null;
  onSelectTable: (schema: string, table: string) => void;
}) {
  // 처음에는 모두 접는다. 왼쪽 패널을 접었다 펼쳐 다시 그려질 때만, 선택한 표가 있는 스키마는 펼쳐 둔다.
  const [open, setOpen] = useState(
    () => selectedKey?.startsWith(`${schema}.`) ?? false,
  );
  // 검색 중에는 접어 둔 스키마도 펼쳐 일치 항목을 보여 준다.
  const expanded = open || term !== "";
  return (
    <li>
      <button
        type="button"
        className="anl-db-tree-row anl-db-tree-row--schema"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronIcon open={expanded} />
        <span className="anl-db-tree-icon">
          <SchemaIcon />
        </span>
        <span className="anl-db-tree-name">{schema}</span>
        <span className="anl-db-tree-count">
          {term ? `${tables.length}/${total}` : total}
        </span>
      </button>
      {expanded && (
        <ul>
          {tables.map((table) => {
            const key = `${schema}.${table}`;
            const active = key === selectedKey;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`anl-db-tree-row anl-db-tree-row--table${active ? " is-active" : ""}`}
                  onClick={() => onSelectTable(schema, table)}
                  title={key}
                  aria-current={active ? "true" : undefined}
                >
                  <span className="anl-db-tree-icon">
                    <TableIcon />
                  </span>
                  <span className="anl-db-tree-name">
                    <Highlight text={table} term={term} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
});

export function DbMenuTree({
  tablesBySchema,
  schemaOrder,
  selectedKey,
  onSelectTable,
}: DbMenuTreeProps) {
  const [term, setTerm] = useState("");
  const trimmed = term.trim().toLowerCase();
  const visible = useMemo(
    () =>
      schemaOrder
        .map((schema) => {
          const all = tablesBySchema[schema] ?? [];
          return {
            schema,
            total: all.length,
            tables: trimmed
              ? all.filter((t) => t.toLowerCase().includes(trimmed))
              : all,
          };
        })
        .filter((s) => !trimmed || s.tables.length > 0),
    [schemaOrder, tablesBySchema, trimmed],
  );
  return (
    <div className="anl-db-tree">
      <div className="anl-db-tree-search">
        <Input
          value={term}
          onChange={setTerm}
          placeholder="테이블명 검색"
          aria-label="테이블명 검색"
        />
      </div>
      <ul className="anl-db-tree-list">
        {visible.map(({ schema, tables, total }) => (
          <SchemaNode
            key={schema}
            schema={schema}
            tables={tables}
            total={total}
            term={trimmed}
            selectedKey={selectedKey}
            onSelectTable={onSelectTable}
          />
        ))}
        {visible.length === 0 && (
          <li className="anl-db-tree-empty">일치하는 테이블이 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
