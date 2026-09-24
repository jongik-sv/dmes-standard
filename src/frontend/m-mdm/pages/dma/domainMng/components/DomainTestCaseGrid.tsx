"use client";

/**
 * A-TEST 테스트 케이스(L-001~L-005, B-006 케이스 추가, GB-001 삭제). 편집 행이 적어 shared form 컨트롤로 그린다.
 * 결과(L-003)는 도메인검증 응답의 자기 케이스 결과다.
 */
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { resultLabel } from "../change-view";
import type { TestCaseRow, TestResultRow } from "../types";
import { hint } from "./styles";

export interface DomainTestCaseGridProps {
  cases: TestCaseRow[];
  results: TestResultRow[];
  readOnly: boolean;
  showVars: boolean;
  onChange: (cases: TestCaseRow[]) => void;
}

const EXPECT_OPTIONS = [{ value: "true", label: "true" }, { value: "false", label: "false" }];
const cell = { padding: "2px var(--spacing-xs)", borderBottom: "1px solid var(--color-border)" } as const;

export function DomainTestCaseGrid({ cases, results, readOnly, showVars, onChange }: DomainTestCaseGridProps) {
  const own = new Map(results.filter((r) => r.OWN).map((r) => [r.IDX, r]));
  const update = (i: number, patch: Partial<TestCaseRow>) =>
    onChange(cases.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  return (
    <div>
      <table className="domain-mng__cases" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cell}>입력</th>
            <th style={cell}>기대</th>
            {showVars && <th style={cell}>변수(JSON)</th>}
            <th style={cell}>메모</th>
            <th style={cell}>결과</th>
            <th style={cell} />
          </tr>
        </thead>
        <tbody>
          {cases.map((c, i) => {
            const r = own.get(i);
            return (
              <tr key={i}>
                <td style={cell}>
                  <Input aria-label={`케이스 입력 ${i + 1}`} value={c.VALUE} disabled={readOnly}
                    onChange={(v) => update(i, { VALUE: v })} />
                </td>
                <td style={cell}>
                  <Select aria-label={`케이스 기대 ${i + 1}`} value={String(c.EXPECT)} options={EXPECT_OPTIONS}
                    disabled={readOnly} onChange={(v) => update(i, { EXPECT: v === "true" })} />
                </td>
                {showVars && (
                  <td style={cell}>
                    <Input aria-label={`케이스 변수 ${i + 1}`} value={c.VARS} disabled={readOnly} placeholder='{"COL": 1}'
                      onChange={(v) => update(i, { VARS: v })} />
                  </td>
                )}
                <td style={cell}>
                  <Input aria-label={`케이스 메모 ${i + 1}`} value={c.MEMO} disabled={readOnly}
                    onChange={(v) => update(i, { MEMO: v })} />
                </td>
                <td style={cell} className="domain-mng__case-result" title={r?.MESSAGE ?? undefined}>
                  {r ? resultLabel(r.RESULT) : "-"}
                </td>
                <td style={cell}>
                  {!readOnly && (
                    <Button size="mini" onClick={() => onChange(cases.filter((_, idx) => idx !== i))}>삭제</Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {cases.length === 0 && <p style={hint}>테스트 케이스가 없습니다</p>}
      {!readOnly && (
        <Button size="sm" onClick={() => onChange([...cases, { VALUE: "", EXPECT: true, VARS: "", MEMO: "" }])}>
          케이스 추가
        </Button>
      )}
    </div>
  );
}
