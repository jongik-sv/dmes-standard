"use client";

/**
 * 카드 ⑧ 활용처(TSK-08-02 design §6.7.3). 활용처 메모, 이 룰을 담은 룰 세트와 세트 안의 의존 룰(이 룰이 읽는 이름을 만드는 룰)·
 * 역의존 룰(이 룰이 만드는 이름을 읽는 룰). 룰 ID 는 룰 화면 링크(`openRuleEdit`), 세트 편집 화면(08-06)이 없어 세트는 글자로만 둔다.
 */
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { openRuleEdit } from "@/dme/rule-handoff";

import type { RuleEditCardProps } from "../cards";

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
          style={{ minHeight: "var(--form-height)", display: "inline-flex", alignItems: "center", border: "none", background: "none", padding: 0, cursor: "pointer", color: "var(--color-primary)", textDecoration: "underline", font: "inherit" }}
        >
          {id}
        </button>
      ))}
    </span>
  );
}

const usageColumns: GridColumn[] = [
  { key: "setId", meta: "MARU_RULE_SETS_ID", header: "룰 세트", width: 140 },
  { key: "setName", meta: "MARU_RULE_SETS_NM", header: "이름", width: 160 },
  { key: "status", meta: false, header: "상태", width: 100 },
  { key: "dependsOn", meta: false, header: "의존 룰", width: 200, tooltip: false, render: (_v, row) => <RuleLinks ids={(row.dependsOn as string[] | undefined) ?? []} /> },
  { key: "dependedBy", meta: false, header: "역의존 룰", width: 200, tooltip: false, render: (_v, row) => <RuleLinks ids={(row.dependedBy as string[] | undefined) ?? []} /> },
];

export function RuleUsageCard({ view }: RuleEditCardProps) {
  const usage = view.usage ?? { sets: [] };
  return (
    <CardFrame title="⑧ 활용처" testId="rule-card-usage">
      <p style={{ margin: "0 0 var(--spacing-xs)" }}>
        <strong>활용처 메모</strong> {usage.usageNote ? usage.usageNote : <MutedText>없음</MutedText>}
      </p>
      <div data-testid="rule-usage-sets">
        <AgDataGrid gridId="ruleUsage"
          columns={usageColumns}
          data={usage.sets as unknown as Record<string, unknown>[]}
          rowKey="setId"
          height="auto"
          columnSizing="fit"
          sortable={false}
          emptyMessage="이 룰을 담은 룰 세트가 없습니다."
          ariaLabel="룰 세트 활용처"
        />
      </div>
    </CardFrame>
  );
}
