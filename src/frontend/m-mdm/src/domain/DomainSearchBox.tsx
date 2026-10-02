"use client";

/**
 * 도메인 검색 위젯(TSK-08-03 design §2.1) — 열 설정 표의 도메인 칸 찾기 버튼이 팝업(shared `Modal`)으로 연다. 검색어 칸에 바로 포커스가 가고 Enter 로 검색한다. 표준명(ID)·이름 입력 → 서버 `search target=DOMAIN` 이 8건까지
 * (표준명·도메인명이 같은 것, ID 앞부분 일치 순) 돌려주고 각 줄에 타입·자리수·검증식을 보인다. 서버가 8건에서 자르므로 꽉 차면 좁혀 검색하라고 안내한다.
 * 도메인 칸에 직접 넣은 글자로 하나를 정하지 못하면 그 글자를 `initialKeyword` 로 받아 열자마자 검색한다.
 */
import { useEffect, useRef, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";

/** 도메인 검색 한 줄(서버 도메인 검색 action 의 rows). */
export interface DomainRow {
  domainId: number;
  stdName: string;
  domainName?: string | null;
  domainKind?: string | null;
  dataType: "BOOLEAN" | "NUMBER" | "STRING" | "DATE";
  length?: number | null;
  scale?: number | null;
  stdRule?: string | null;
}

/** 서버 검색 함수 — 키워드를 받아 도메인 줄(서버가 DOMAIN_LIMIT 건까지 자른다)을 돌려준다. 화면이 자기 API 를 꽂는다. */
export type DomainSearchFn = (keyword: string) => Promise<DomainRow[]>;

export const DOMAIN_LIMIT = 8;

/**
 * 도메인 칸에 직접 넣은 글자(도메인명 또는 표준명)로 검색한 결과에서 바로 적용할 도메인을 고른다.
 * 표준명·도메인명이 글자와 같은(대소문자 무시) 도메인이 하나면 그것, 같은 것이 없고 결과가 하나뿐이면 그것, 아니면 null(팝업으로 고른다).
 */
export function matchDomain(rows: readonly DomainRow[], text: string): DomainRow | null {
  const t = text.trim().toUpperCase();
  if (t === "") return null;
  const exact = rows.filter((r) => r.stdName.trim().toUpperCase() === t || (r.domainName ?? "").trim().toUpperCase() === t);
  if (exact.length === 1) return exact[0];
  return exact.length === 0 && rows.length === 1 ? rows[0] : null;
}

export interface DomainSearchBoxProps {
  /** 서버 도메인 검색 함수. */
  search: DomainSearchFn;
  onPick: (row: DomainRow) => void;
  onClose: () => void;
  testId: string;
  /** 처음 검색어 — 있으면 열자마자 검색한다. */
  initialKeyword?: string;
}

export function DomainSearchBox({ search: searchFn, onPick, onClose, testId, initialKeyword = "" }: DomainSearchBoxProps) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [rows, setRows] = useState<DomainRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (text: string = keyword) => {
    setBusy(true);
    setError(null);
    try {
      setRows(await searchFn(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const first = useRef(initialKeyword.trim());
  useEffect(() => {
    if (first.current) void search(first.current);
    // 처음 한 번만 — 이후 검색은 사용자가 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid={testId} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--spacing-xs)", background: "var(--color-bg)" }}>
      <div style={{ display: "flex", gap: "var(--spacing-xs)" }}>
        <Input
          data-testid={`${testId}-keyword`}
          data-autofocus
          value={keyword}
          placeholder="ID·이름·타입"
          onChange={setKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && !busy) void search();
          }}
        />
        <Button disabled={busy} onClick={() => void search()} data-testid={`${testId}-search`}>
          검색
        </Button>
        <Button onClick={onClose}>닫기</Button>
      </div>
      {error && <p style={{ margin: "4px 0", color: "var(--color-danger)" }}>{error}</p>}
      {rows && rows.length === 0 && <p style={{ margin: "4px 0", color: "var(--color-text-muted)" }}>검색 결과가 없습니다.</p>}
      {rows && rows.length > 0 && (
        <>
          <ul data-testid={`${testId}-rows`} style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}>
            {rows.map((r) => (
              <li key={r.domainId}>
                <button
                  type="button"
                  data-testid={`${testId}-pick-${r.stdName}`}
                  onClick={() => onPick(r)}
                  style={{ border: "none", background: "none", cursor: "pointer", font: "inherit", textAlign: "left", padding: "2px 0" }}
                >
                  <strong>{r.stdName}</strong> {r.domainName ?? ""}{" "}
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {r.dataType}
                    {r.length != null ? `(${r.length}${r.scale != null ? `,${r.scale}` : ""})` : ""}
                    {r.stdRule ? ` · ${r.stdRule}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length >= DOMAIN_LIMIT && (
            <p data-testid={`${testId}-more`} style={{ margin: "4px 0 0", color: "var(--color-text-muted)" }}>
              {DOMAIN_LIMIT}건까지만 보입니다. 더 좁혀 검색하세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
