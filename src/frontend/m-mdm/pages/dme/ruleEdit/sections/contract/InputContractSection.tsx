"use client";

/**
 * 입력 계약 섹션(TSK-08-03 design §2.1) — 룰을 부르는 쪽이 레코드에 넣어야 하는 값의 약속을 계산해 보여준다. 저장하지 않는 계산값이다(불변 6):
 * view 응답의 변수·행·`varMeta` 로 evalex `computeInputContract` 를 돌린다. 첫 표는 조건 변수(always), 둘째 표는 필수·선택 집합이 같은 행을 묶은 줄이다.
 * DRAFT 는 RELEASED(base) 버전의 계약과 견줘 호출하는 쪽을 깨는 변경을 경고로 알린다. 그 경고 문장(`contractWarnings`)이 확정 화면 확인란(08-05)의 데이터다.
 * 식 변수·열 조건의 AST 는 서버 `parseExpr` 로 받는다(화면 파서 없음). validate 권한이 없으면 부르지 않고 파싱 대기로 알린다.
 */
import { useMemo, useState } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";

import type { RuleEditCardProps } from "../../cards";
import { canParseOnServer } from "../../expr/parse-expr";
import { useServerAsts } from "../../expr/useServerAsts";
import { SectionFrame } from "../SectionFrame";
import { contractOfView, contractSourceOfView, exprSlotsOf, groupContractRows, type AstByText, type ContractGroup } from "./contract-view";

export function InputContractSection({ view, editable, canDo }: RuleEditCardProps) {
  const [open, setOpen] = useState(true);
  const parseEnabled = canParseOnServer({ editable, canValidate: canDo("validate") });

  const wanted = useMemo(() => {
    const cur = exprSlotsOf(contractSourceOfView(view, "current"));
    const base = exprSlotsOf(contractSourceOfView(view, "base"));
    return [...cur, ...base.filter((b) => !cur.some((c) => c.text === b.text))];
  }, [view]);

  const asts: AstByText = useServerAsts(wanted, parseEnabled);

  const result = useMemo(() => contractOfView(view, asts), [view, asts]);
  const { current, base, diffs } = result;
  const groups = useMemo(() => (current ? groupContractRows(current.contract) : []), [current]);
  const knownTypes = useMemo(() => new Map(view.vars.filter((v) => v.varName && !v.exprVar).map((v) => [v.varName!.toUpperCase(), v.dataType])), [view.vars]);
  const chip = (name: string, key?: string) => (
    <code key={key ?? name} title={knownTypes.get(name.toUpperCase())} style={{ marginRight: 6 }}>
      {name}
    </code>
  );
  const alwaysColumns = useMemo<GridColumn[]>(
    () => [
      {
        key: "always",
        header: "조건 변수(늘 키가 있어야 함)",
        tooltip: false,
        render: (_v, row) => {
          const names = row.names as string[];
          return names.length === 0 ? "-" : names.map((n) => chip(n));
        },
      },
    ],
    [knownTypes],
  );
  // 칸 값은 이름 서명으로 싣는다 — ag-grid 는 값이 바뀐 칸만 다시 그리므로 render 가 읽는 내용이 값에 반영되어야 한다.
  const alwaysRows = useMemo(
    () => {
      const names = current ? current.contract.always.map((v) => v.name) : [];
      return [{ id: "always", always: names.join(","), names }];
    },
    [current],
  );
  const groupColumns = useMemo<GridColumn[]>(
    () => [
      {
        key: "label",
        header: "행",
        width: 260,
        tooltip: false,
        render: (_v, row) => {
          const g = row.group as ContractGroup;
          return (
            <span data-testid={`contract-group-${String(row.index)}`}>
              {g.rowIds.length === 1 ? (
                <span>
                  행 {g.rowIds[0]} · {g.conds[0]}
                </span>
              ) : (
                <span title={g.rowIds.map((id, k) => `행 ${id}: ${g.conds[k]}`).join("\n")}>{g.rowIds.length}개 행이 같다</span>
              )}
            </span>
          );
        },
      },
      { key: "required", header: "필수 변수", width: 220, tooltip: false, render: (_v, row) => (row.group as ContractGroup).required.length === 0 ? "-" : (row.group as ContractGroup).required.map((n) => chip(n, `r-${n}`)) },
      { key: "optional", header: "선택 변수", width: 220, tooltip: false, render: (_v, row) => (row.group as ContractGroup).optional.length === 0 ? "-" : (row.group as ContractGroup).optional.map((n) => chip(n, `o-${n}`)) },
    ],
    [knownTypes],
  );
  const groupRows = useMemo(() => groups.map((g, i) => ({ id: `${g.key}#${i}`, index: i, label: `${g.rowIds.join(",")}|${g.conds.join("|")}`, required: g.required.join(","), optional: g.optional.join(","), group: g })), [groups]);
  const warnings = diffs.filter((d) => d.severity === "WARNING");
  const infos = diffs.filter((d) => d.severity === "INFO");

  return (
    <SectionFrame
      testId="contract-section"
      title="입력 계약"
      open={open}
      onOpenChange={setOpen}
      headerExtra={
        <>
          <span style={{ color: "var(--color-text-secondary)" }}>조건 열과 셀의 식에서 계산한 값이며 저장하지 않습니다.</span>
          {base && (
            <span data-testid="contract-warning-count" style={badgeStyle(warnings.length > 0 ? "warning" : "success")}>
              RELEASED 대비 경고 {warnings.length}건
            </span>
          )}
        </>
      }
    >
      {result.pending.length > 0 && (
        <p data-testid="contract-pending" style={{ margin: "var(--spacing-xs) 0", color: "var(--color-text-secondary)" }}>
          아직 파싱하지 못한 식 {result.pending.length}개가 있어 그 식이 읽는 변수는 계약에 빠져 있을 수 있습니다: {result.pending.join(" / ")}
        </p>
      )}
      {!current ? (
        <p data-testid="contract-error" style={{ color: "var(--color-danger)" }}>
          입력 계약을 계산할 수 없습니다.
        </p>
      ) : (
        <>
          <div data-testid="contract-always">
            <AgDataGrid
              columns={alwaysColumns}
              data={alwaysRows}
              rowKey="id"
              height="auto"
              columnSizing="fit"
              sortable={false}
              ariaLabel="조건 변수 계약"
            />
          </div>
          <div data-testid="contract-groups" style={{ paddingTop: "var(--spacing-sm)" }}>
            <AgDataGrid
              columns={groupColumns}
              data={groupRows}
              rowKey="id"
              height="auto"
              columnSizing="fit"
              sortable={false}
              ariaLabel="행 묶음별 필수·선택 변수"
            />
          </div>
        </>
      )}
      {base && (
        <div style={{ paddingTop: "var(--spacing-sm)" }}>
          {diffs.length === 0 && <span data-testid="contract-diff-none" style={{ color: "var(--color-text-secondary)" }}>RELEASED 버전과 계약이 같습니다.</span>}
          {warnings.length > 0 && (
            <ul data-testid="contract-diff-warning" style={{ margin: "var(--spacing-xs) 0", paddingLeft: "var(--spacing-lg)", color: "var(--color-warning)" }}>
              {warnings.map((d) => (
                <li key={`${d.kind}-${d.name}`}>경고 · {d.message}</li>
              ))}
            </ul>
          )}
          {infos.length > 0 && (
            <ul data-testid="contract-diff-info" style={{ margin: "var(--spacing-xs) 0", paddingLeft: "var(--spacing-lg)", color: "var(--color-text-secondary)" }}>
              {infos.map((d) => (
                <li key={`${d.kind}-${d.name}`}>알림 · {d.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionFrame>
  );
}
