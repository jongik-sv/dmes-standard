"use client";

/**
 * 입력 계약 섹션(TSK-08-03 design §2.1) — 룰을 부르는 쪽이 레코드에 넣어야 하는 값의 약속을 계산해 보여준다. 저장하지 않는 계산값이다(불변 6):
 * view 응답의 변수·행·`varMeta` 로 evalex `computeInputContract` 를 돌린다. 첫 표는 조건 변수(always), 둘째 표는 필수·선택 집합이 같은 행을 묶은 줄이다.
 * DRAFT 는 RELEASED(base) 버전의 계약과 견줘 호출하는 쪽을 깨는 변경을 경고로 알린다. 그 경고 문장(`contractWarnings`)이 확정 화면 확인란(08-05)의 데이터다.
 * 식 변수·열 조건의 AST 는 서버 `parseExpr` 로 받는다(화면 파서 없음). validate 권한이 없으면 부르지 않고 파싱 대기로 알린다.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { badgeStyle } from "@/shell";
import type { AstNode } from "@/contract/engine-contract.generated";

import type { ExprSlot } from "../../api";
import type { RuleEditCardProps } from "../../cards";
import { canParseOnServer, serverParse } from "../../expr/parse-expr";
import { contractOfView, contractSourceOfView, groupContractRows, type AstByText, type ContractSource } from "./contract-view";

const th: CSSProperties = { textAlign: "left", padding: "2px 6px", whiteSpace: "nowrap", borderBottom: "1px solid var(--color-border-light)" };
const td: CSSProperties = { padding: "2px 6px", verticalAlign: "top", borderBottom: "1px solid var(--color-border-light)" };

/** 서버 파싱이 필요한 식과 그 식이 들어가는 자리(허용 함수 집합이 자리마다 다르다). */
function slotsOf(src: ContractSource | null): Array<{ text: string; slot: ExprSlot }> {
  if (!src) return [];
  const out: Array<{ text: string; slot: ExprSlot }> = [];
  const push = (text: string | null | undefined, slot: ExprSlot) => {
    const t = text?.trim();
    if (t && !out.some((o) => o.text === t)) out.push({ text: t, slot });
  };
  for (const v of src.vars) if (v.varKind === "COND" && v.exprVar) push(v.varName, "RULE_COND_EXPR");
  for (const m of src.meta) push(m.grpCond, "RULE_GRP_COND");
  return out;
}

export function InputContractSection({ view, editable, canDo }: RuleEditCardProps) {
  const [asts, setAsts] = useState<AstByText>({});
  const attempted = useRef(new Set<string>());
  const parseEnabled = canParseOnServer({ editable, canValidate: canDo("validate") });

  const wanted = useMemo(() => {
    const cur = slotsOf(contractSourceOfView(view, "current"));
    const base = slotsOf(contractSourceOfView(view, "base"));
    return [...cur, ...base.filter((b) => !cur.some((c) => c.text === b.text))];
  }, [view]);

  useEffect(() => {
    if (!parseEnabled) return;
    let cancelled = false;
    const missing = wanted.filter((w) => !attempted.current.has(w.text) && asts[w.text] === undefined);
    if (missing.length === 0) return;
    for (const w of missing) attempted.current.add(w.text);
    void (async () => {
      for (const w of missing) {
        try {
          const r = await serverParse(w.text, w.slot);
          if (!cancelled && r.ast) setAsts((prev) => ({ ...prev, [w.text]: r.ast as unknown as AstNode }));
        } catch {
          // 파싱을 못 받은 식은 pending 으로 남는다.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, parseEnabled, asts]);

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
    <div data-testid="contract-section" style={{ paddingTop: "var(--spacing-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
        <strong>입력 계약</strong>
        <span style={{ color: "var(--color-text-secondary)" }}>조건 열과 셀의 식에서 계산한 값이며 저장하지 않습니다.</span>
        {base && (
          <span data-testid="contract-warning-count" style={badgeStyle(warnings.length > 0 ? "warning" : "success")}>
            RELEASED 대비 경고 {warnings.length}건
          </span>
        )}
      </div>
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
          <div style={{ overflowX: "auto", paddingTop: "var(--spacing-xs)" }}>
            <table data-testid="contract-always" style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
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
            <table data-testid="contract-groups" style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: "var(--font-size-sm)" }}>
              <thead>
                <tr>
                  <th style={th}>행</th>
                  <th style={th}>필수 변수</th>
                  <th style={th}>선택 변수</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={g.key + i} data-testid={`contract-group-${i}`}>
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
    </div>
  );
}
