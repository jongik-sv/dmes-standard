"use client";

/**
 * 「검토 이슈」 탭 — 두 원본(C10B2220 order · C10B2221 cross)을 하나로 병합하며 남긴 검토 이슈 15건(읽기 전용 검토 자료).
 * 종류 거르기(상충·확인필요·데이터 결함), 이슈 카드(본문·해소 내용·양쪽 조건 비교·관련 룰). 관련 룰을 누르면 룰 목록에서 그 룰을 펼친다.
 * 검토 결과는 이 화면에서 바꾸지 않는다 — 결정은 Maru 룰 수정(새 버전)으로 반영한다.
 */
import { memo, useMemo, useState, type CSSProperties } from "react";

import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { Badge, Button, SegmentedControl } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";

import type { Cond, CondOp } from "../shared/cond";
import {
  ISSUE_TYPE_LABEL,
  REVIEW_ISSUES,
  type IssueCond,
  type IssueSide,
  type IssueType,
  type ReviewIssue,
} from "./issues";
import type { OcField, OcRule, ValueLabel } from "./model";
import { CondLine } from "./parts";
import { condPhrase } from "./sentence";

const TYPE_TONE: Record<IssueType, "danger" | "warning" | "neutral"> = {
  conflict: "danger",
  needsReview: "warning",
  dataDefect: "neutral",
};

const SIDE_BOX: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "6px 8px",
  minWidth: 0,
};

/** 이슈 조건(시제품 모양) → 셀 조건. */
export function issueCond(c: IssueCond): Cond {
  return {
    op: c.op as CondOp,
    values: c.values ?? [],
    low: c.low,
    high: c.high,
    lowInclusive: c.lowInclusive,
    highInclusive: c.highInclusive,
    summary: c.op,
  };
}

const signature = (c: IssueCond) => JSON.stringify(c);

function SideView({
  title,
  side,
  other,
  labelOf,
  labels,
}: {
  title: string;
  side: IssueSide | null | undefined;
  other: IssueSide | null | undefined;
  labelOf: (field: string) => string;
  labels: ReadonlyMap<string, ValueLabel>;
}) {
  const otherSigs = new Set((other?.conds ?? []).map(signature));
  return (
    <div style={SIDE_BOX}>
      <div style={{ marginBottom: 4 }}>
        <b>{title}</b>{" "}
        {side?.source ? (
          <MutedText>
            {side.source}
            {side.row ? ` #${side.row}` : ""}
          </MutedText>
        ) : null}
      </div>
      {!side ? (
        <MutedText>대안 없음</MutedText>
      ) : (
        <div style={{ display: "grid", gap: 2 }}>
          {side.errCode || side.message ? (
            <div>
              {side.errCode ? (
                <Badge label={side.errCode} tone="danger" mono />
              ) : null}{" "}
              {side.message}
            </div>
          ) : null}
          {side.enabled === false ? (
            <Badge label="비활성" tone="neutral" variant="outline" />
          ) : null}
          {side.conds.map((c, i) => {
            const differs = other ? !otherSigs.has(signature(c)) : false;
            return (
              <div
                key={`${c.field}-${i}`}
                style={
                  differs
                    ? {
                        background: "var(--color-warning-soft)",
                        borderRadius: 4,
                      }
                    : undefined
                }
                title={differs ? "반대쪽과 다른 조건" : undefined}
              >
                ·{" "}
                <CondLine
                  p={condPhrase(
                    c.field,
                    labelOf(c.field),
                    issueCond(c),
                    false,
                    false,
                    labels,
                  )}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const IssueCard = memo(function IssueCard({
  issue,
  labelOf,
  labels,
  knownKeys,
  onOpenRule,
  screenId,
}: {
  issue: ReviewIssue;
  labelOf: (field: string) => string;
  labels: ReadonlyMap<string, ValueLabel>;
  knownKeys: ReadonlySet<string>;
  onOpenRule: (key: string) => void;
  screenId: string;
}) {
  return (
    <CardFrame
      title={`${issue.id} · ${issue.title}`}
      testId={`${screenId}-issue-${issue.id}`}
      right={
        <>
          <Badge
            label={ISSUE_TYPE_LABEL[issue.type]}
            tone={TYPE_TONE[issue.type]}
          />{" "}
          <Badge label="검토 대기" tone="neutral" variant="outline" />
        </>
      }
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div>{issue.body}</div>
        {issue.resolution ? (
          <div style={{ color: "var(--color-success)" }}>
            ✓ {issue.resolution}
          </div>
        ) : null}
        {issue.type === "conflict" && (issue.left || issue.right) ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 8,
            }}
          >
            <SideView
              title="order — 정본 채택"
              side={issue.left}
              other={issue.right}
              labelOf={labelOf}
              labels={labels}
            />
            <SideView
              title="cross — 계보 보존"
              side={issue.right}
              other={issue.left}
              labelOf={labelOf}
              labels={labels}
            />
          </div>
        ) : null}
        {issue.type === "needsReview" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 8,
            }}
          >
            <SideView
              title="order 현재값(지금 룰)"
              side={issue.orderValue}
              other={issue.crossAlternative}
              labelOf={labelOf}
              labels={labels}
            />
            <SideView
              title="cross 대안값"
              side={issue.crossAlternative}
              other={issue.orderValue}
              labelOf={labelOf}
              labels={labels}
            />
          </div>
        ) : null}
        {issue.ruleKeys.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              alignItems: "center",
            }}
          >
            <MutedText>관련 룰</MutedText>
            {issue.ruleKeys.map((k) => (
              <Button
                key={k}
                size="mini"
                variant="default"
                disabled={!knownKeys.has(k)}
                title={
                  knownKeys.has(k)
                    ? "룰 목록에서 펼쳐 봅니다"
                    : "지금 버전에 없는 룰입니다(비활성으로 싣지 않음)"
                }
                onClick={() => onOpenRule(k)}
              >
                {k}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </CardFrame>
  );
});

export interface IssuesPanelProps {
  screenId: string;
  fields: OcField[];
  labels: ReadonlyMap<string, ValueLabel>;
  rules: OcRule[];
  onOpenRule: (key: string) => void;
}

export const IssuesPanel = memo(function IssuesPanel({
  screenId,
  fields,
  labels,
  rules,
  onOpenRule,
}: IssuesPanelProps) {
  const [type, setType] = useState<"all" | IssueType>("all");
  const labelMap = useMemo(
    () => new Map(fields.map((f) => [f.key, f.label])),
    [fields],
  );
  const labelOf = useMemo(
    () => (field: string) => labelMap.get(field) ?? field,
    [labelMap],
  );
  const knownKeys = useMemo(() => new Set(rules.map((r) => r.key)), [rules]);
  const count = (t: IssueType) =>
    REVIEW_ISSUES.filter((i) => i.type === t).length;
  const options = [
    { value: "all", label: `전체 ${REVIEW_ISSUES.length}` },
    { value: "conflict", label: `상충 ${count("conflict")}` },
    { value: "needsReview", label: `확인필요 ${count("needsReview")}` },
    { value: "dataDefect", label: `데이터 결함 ${count("dataDefect")}` },
  ];
  const shown =
    type === "all"
      ? REVIEW_ISSUES
      : REVIEW_ISSUES.filter((i) => i.type === type);
  return (
    <ContentBody root>
      <ContentPanel scrollY>
        <CardFrame
          title="검토 이슈 — 두 원본 병합에서 남은 확인 사항"
          testId={`${screenId}-issues`}
          right={
            <SegmentedControl
              ariaLabel="이슈 종류"
              testId={`${screenId}-issue-type`}
              value={type}
              onChange={(v) => setType(v as "all" | IssueType)}
              options={options}
            />
          }
        >
          <MutedText>
            두 원본에서 조건이 완전히 같은 78쌍은 한 룰로 병합했고(출처
            「공통」), 그중 코드·메시지가 어긋난 쌍만 상충 이슈로 올렸습니다.
            이슈는 읽기 전용 검토 자료입니다. 결정한 내용은 [Maru에서 편집] 으로
            룰을 고쳐 새 버전으로 반영합니다.
          </MutedText>
        </CardFrame>
        {shown.map((i) => (
          <IssueCard
            key={i.id}
            issue={i}
            labelOf={labelOf}
            labels={labels}
            knownKeys={knownKeys}
            onOpenRule={onOpenRule}
            screenId={screenId}
          />
        ))}
      </ContentPanel>
    </ContentBody>
  );
});
