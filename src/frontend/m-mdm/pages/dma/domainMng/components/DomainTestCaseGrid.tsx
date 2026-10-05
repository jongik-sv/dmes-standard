"use client";

/**
 * A-TEST 테스트 케이스(L-001~L-005, B-006 케이스 추가, GB-001 삭제). 입력·기대·변수·메모 칸은 누르면 편집한다(그리드 인라인 편집).
 * 결과(L-003)는 도메인검증 응답의 자기 케이스 결과다.
 */
import { useMemo, useRef } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { resultLabel } from "../change-view";
import type { TestCaseRow, TestResultRow } from "../types";

export interface DomainTestCaseGridProps {
  cases: TestCaseRow[];
  results: TestResultRow[];
  readOnly: boolean;
  showVars: boolean;
  onChange: (cases: TestCaseRow[]) => void;
}

// 행 키는 1부터 — 0 은 그리드 행 ID 로 쓰기 어렵다.
const ROW_KEY = "ROW_KEY";

export function DomainTestCaseGrid({ cases, results, readOnly, showVars, onChange }: DomainTestCaseGridProps) {
  // 삭제 처리는 눌린 시점의 최신 cases 를 ref 로 읽는다 — 열 정의가 cases 에 기대 케이스 편집마다 다시 만들어지지 않게.
  const casesRef = useRef(cases);
  casesRef.current = cases;
  const update = (i: number, patch: Partial<TestCaseRow>) =>
    onChange(cases.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  // 결과는 RESULT_TEXT 칸으로 둔다 — 행 키로 갱신하는 그리드는 값이 바뀐 칸만 다시 그리기 때문이다.
  const rows = useMemo(() => {
    const own = new Map(results.filter((r) => r.OWN).map((r) => [r.IDX, r]));
    return cases.map((c, i) => {
      const r = own.get(i);
      return { ROW_KEY: i + 1, VALUE: c.VALUE, EXPECT: String(c.EXPECT), VARS: c.VARS, MEMO: c.MEMO,
        RESULT_TEXT: r ? resultLabel(r.RESULT) : "-", RESULT_MESSAGE: r?.MESSAGE ?? "" };
    });
  }, [cases, results]);
  const columns = useMemo<GridColumn[]>(() => [
    { key: "VALUE", header: "입력", meta: false, width: 140, editable: !readOnly },
    { key: "EXPECT", header: "기대", meta: false, width: 70, editable: !readOnly, cellEditor: "select", cellEditorValues: ["true", "false"] },
    { key: "VARS", header: "변수(JSON)", meta: false, width: 140, editable: !readOnly, hide: !showVars },
    { key: "MEMO", header: "메모", meta: false, width: 140, editable: !readOnly },
    {
      key: "RESULT_TEXT", header: "결과", meta: false, width: 70, tooltip: false,
      render: (v, r) => <span title={String(r.RESULT_MESSAGE ?? "") || undefined}>{String(v ?? "")}</span>,
    },
    {
      key: "DELETE", header: "", meta: false, width: 60, tooltip: false, hide: readOnly,
      render: (_v, r) => (
        <Button size="mini" onClick={() => onChange(casesRef.current.filter((_, idx) => idx !== Number(r.ROW_KEY) - 1))}>삭제</Button>
      ),
    },
  ], [readOnly, showVars, onChange]);
  return (
    <div>
      <AgDataGrid
        columnSizing="fit"
        columns={columns}
        data={rows}
        rowKey={ROW_KEY}
        height="auto"
        singleClickEdit
        stopEditingWhenCellsLoseFocus
        emptyMessage="테스트 케이스가 없습니다"
        onCellValueChanged={({ row, field, newValue }) => {
          const i = Number(row.ROW_KEY) - 1;
          if (field === "EXPECT") update(i, { EXPECT: newValue === "true" });
          else update(i, { [field]: String(newValue ?? "") } as Partial<TestCaseRow>);
        }}
      />
      {!readOnly && (
        <Button size="sm" onClick={() => onChange([...cases, { VALUE: "", EXPECT: true, VARS: "", MEMO: "" }])}>
          케이스 추가
        </Button>
      )}
    </div>
  );
}
