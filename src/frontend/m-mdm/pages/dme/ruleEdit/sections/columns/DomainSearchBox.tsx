"use client";

/**
 * 도메인 검색 위젯(TSK-08-03 design §2.1) — 열 설정 표의 값 타입 칸에서 연다. 표준명(ID)·이름 입력 → 서버 `search target=DOMAIN` 이 8건까지
 * (ID 앞부분 일치 우선) 돌려주고 각 줄에 타입·자리수·검증식을 보인다. 서버가 8건에서 자르므로 꽉 차면 좁혀 검색하라고 안내한다.
 */
import { useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";

import { searchDomains } from "../../api";
import type { DomainRow } from "../../types";

export const DOMAIN_LIMIT = 8;

export interface DomainSearchBoxProps {
  onPick: (row: DomainRow) => void;
  onClose: () => void;
  testId: string;
}

export function DomainSearchBox({ onPick, onClose, testId }: DomainSearchBoxProps) {
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<DomainRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await searchDomains(keyword));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={testId} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--spacing-xs)", background: "var(--color-bg)" }}>
      <div style={{ display: "flex", gap: "var(--spacing-xs)" }}>
        <Input data-testid={`${testId}-keyword`} value={keyword} placeholder="ID·이름·타입" onChange={setKeyword} />
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
