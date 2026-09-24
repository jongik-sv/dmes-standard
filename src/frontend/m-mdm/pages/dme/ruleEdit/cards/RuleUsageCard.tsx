"use client";

/**
 * 카드 ⑧ 활용처(TSK-08-02 design §6.7.3). 활용처 메모, 이 룰을 담은 룰 세트와 세트 안의 의존 룰(이 룰이 읽는 이름을 만드는 룰)·
 * 역의존 룰(이 룰이 만드는 이름을 읽는 룰). 룰 ID 는 룰 화면 링크(`openRuleEdit`), 세트 편집 화면(08-06)이 없어 세트는 글자로만 둔다.
 */
import { openRuleEdit } from "@/dme/rule-handoff";

import type { RuleEditCardProps } from "../cards";
import { CardFrame, MutedText } from "./CardFrame";

function RuleLinks({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <MutedText>없음</MutedText>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "var(--spacing-xs)" }}>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          data-testid={`rule-usage-link-${id}`}
          onClick={() => openRuleEdit(id)}
          style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "var(--color-primary)", textDecoration: "underline", font: "inherit" }}
        >
          {id}
        </button>
      ))}
    </span>
  );
}

export function RuleUsageCard({ view }: RuleEditCardProps) {
  const usage = view.usage ?? { sets: [] };
  return (
    <CardFrame title="⑧ 활용처" testId="rule-card-usage">
      <p style={{ margin: "0 0 var(--spacing-xs)" }}>
        <strong>활용처 메모</strong> {usage.usageNote ? usage.usageNote : <MutedText>없음</MutedText>}
      </p>
      {usage.sets.length === 0 ? (
        <MutedText>이 룰을 담은 룰 세트가 없습니다.</MutedText>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="rule-usage-sets">
          <thead>
            <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
              <th>룰 세트</th>
              <th>이름</th>
              <th>상태</th>
              <th>의존 룰</th>
              <th>역의존 룰</th>
            </tr>
          </thead>
          <tbody>
            {usage.sets.map((s) => (
              <tr key={s.setId}>
                <td>{s.setId}</td>
                <td>{s.setName}</td>
                <td>{s.status}</td>
                <td>
                  <RuleLinks ids={s.dependsOn ?? []} />
                </td>
                <td>
                  <RuleLinks ids={s.dependedBy ?? []} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CardFrame>
  );
}
