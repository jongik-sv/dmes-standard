"use client";

/**
 * 입력 계약 변경 알림(TSK-08-03 design §2.1) — DRAFT 를 RELEASED(base) 버전의 입력 계약과 견줘, 달라진 것이 있을 때만 표 카드 아래에 한 줄씩 알린다.
 * 필수 입력이 늘거나 선택이 필수가 되면 호출하는 쪽을 깨므로 경고, 그 반대는 알림이다. 같으면 아무것도 그리지 않는다.
 *
 * 2026-09-29 — 조건 변수·행별 필수·선택 표를 뺐다. 같은 계약을 ④ 값 테스트 입력 표가 변수마다 배지("조건·키 필수"/"N행 필수"/"N행 선택")로
 * 이미 보여서, 이 자리에는 편집 중에만 알 수 있는 RELEASED 대비 변경만 남긴다. 확정 화면(08-05)의 경고는 서버 응답으로 따로 받는다.
 * 식 AST 는 서버 `parseExpr` 로 받는다(화면 파서 없음). validate 권한이 없어 파싱하지 못한 식이 있으면 비교가 빠질 수 있다고 알린다.
 */
import { useMemo } from "react";

import type { RuleEditCardProps } from "../../cards";
import { canParseOnServer } from "../../expr/parse-expr";
import { useServerAsts } from "../../expr/useServerAsts";
import { contractOfView, contractSourceOfView, exprSlotsOf, type AstByText } from "./contract-view";

export function ContractChangeNotice({ view, editable, canDo }: RuleEditCardProps) {
  const parseEnabled = canParseOnServer({ editable, canValidate: canDo("validate") });

  const wanted = useMemo(() => {
    const cur = exprSlotsOf(contractSourceOfView(view, "current"));
    const base = exprSlotsOf(contractSourceOfView(view, "base"));
    return [...cur, ...base.filter((b) => !cur.some((c) => c.text === b.text))];
  }, [view]);

  const asts: AstByText = useServerAsts(wanted, parseEnabled);

  const { current, base, diffs, pending } = useMemo(() => contractOfView(view, asts), [view, asts]);
  if (!current || !base) return null;
  const warnings = diffs.filter((d) => d.severity === "WARNING");
  const infos = diffs.filter((d) => d.severity === "INFO");
  if (diffs.length === 0 && pending.length === 0) return null;

  const line = { margin: 0, padding: "var(--spacing-xs) 0 0" } as const;
  return (
    <div data-testid="contract-notice" style={{ paddingTop: "var(--spacing-sm)" }}>
      {warnings.map((d) => (
        <p key={`${d.kind}-${d.name}`} data-testid="contract-diff-warning" style={{ ...line, color: "var(--color-warning)" }}>
          입력 계약 경고(RELEASED 대비) · {d.message}
        </p>
      ))}
      {infos.map((d) => (
        <p key={`${d.kind}-${d.name}`} data-testid="contract-diff-info" style={{ ...line, color: "var(--color-text-secondary)" }}>
          입력 계약 알림(RELEASED 대비) · {d.message}
        </p>
      ))}
      {pending.length > 0 && (
        <p data-testid="contract-pending" style={{ ...line, color: "var(--color-text-secondary)" }}>
          아직 파싱하지 못한 식 {pending.length}개가 있어 RELEASED 대비 입력 계약 비교가 빠질 수 있습니다: {pending.join(" / ")}
        </p>
      )}
    </div>
  );
}
