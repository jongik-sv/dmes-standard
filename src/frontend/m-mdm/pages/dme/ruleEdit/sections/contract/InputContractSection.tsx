"use client";

/**
 * 입력 계약 섹션(TSK-08-03 design §2.1) — 룰을 부르는 쪽이 레코드에 넣어야 하는 값의 약속을 계산해 보여준다. 저장하지 않는 계산값이다(불변 6):
 * view 응답의 변수·행·`varMeta` 로 evalex `computeInputContract` 를 돌린다. 첫 표는 조건 변수(always), 둘째 표는 필수·선택 집합이 같은 행을 묶은 줄이다.
 * DRAFT 는 RELEASED(base) 버전의 계약과 견줘 호출하는 쪽을 깨는 변경을 경고로 알린다. 그 경고 문장(`contractWarnings`)이 확정 화면 확인란(08-05)의 데이터다.
 * 식 변수·열 조건의 AST 는 서버 `parseExpr` 로 받는다(화면 파서 없음). validate 권한이 없으면 부르지 않고 파싱 대기로 알린다.
 */
import { useMemo, useState } from "react";

import { badgeStyle } from "@/shell";

import type { RuleEditCardProps } from "../../cards";
import { canParseOnServer } from "../../expr/parse-expr";
import { useServerAsts } from "../../expr/useServerAsts";
import { SectionFrame } from "../SectionFrame";
import { dtTable, dtTd, dtTh, dtWrap, zebra } from "../table-style";
import { contractOfView, contractSourceOfView, exprSlotsOf, groupContractRows, type AstByText } from "./contract-view";

const th = dtTh;
const td = dtTd;

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
          <div style={dtWrap}>
            <table data-testid="contract-always" style={{ ...dtTable, minWidth: undefined }}>
              <thead>
                <tr>
                  <th style={th}>조건 변수(늘 키가 있어야 함)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={td}>{current.contract.always.length === 0 ? "-" : current.contract.always.map((v) => chip(v.name))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ overflowX: "auto", paddingTop: "var(--spacing-sm)" }}>
            <table data-testid="contract-groups" style={dtTable}>
              <thead>
                <tr>
                  <th style={th}>행</th>
                  <th style={th}>필수 변수</th>
                  <th style={th}>선택 변수</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={g.key + i} data-testid={`contract-group-${i}`} style={{ background: zebra(i) }}>
                    <td style={td}>
                      {g.rowIds.length === 1 ? (
                        <span>
                          행 {g.rowIds[0]} · {g.conds[0]}
                        </span>
                      ) : (
                        <span title={g.rowIds.map((id, k) => `행 ${id}: ${g.conds[k]}`).join("\n")}>{g.rowIds.length}개 행이 같다</span>
                      )}
                    </td>
                    <td style={td}>{g.required.length === 0 ? "-" : g.required.map((n) => chip(n, `r-${n}`))}</td>
                    <td style={td}>{g.optional.length === 0 ? "-" : g.optional.map((n) => chip(n, `o-${n}`))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
