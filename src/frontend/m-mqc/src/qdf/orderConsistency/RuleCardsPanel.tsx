"use client";

/**
 * 「룰 목록」 탭 — 거르기 줄 + 대상 항목별 접이식 묶음(룰 수 많은 순) 안의 룰 카드. 카드 본문은 조건을 쉬운 문장으로 보인다
 * (문맥 조건 먼저, 대상 조건 마지막). [상세] 를 누르면 조건 목록·결과·기본 정보·연결 이슈와 [시뮬레이션에서 확인] 이 펼쳐진다.
 * 이미 받은 룰을 화면 안에서만 거른다(서버 조회 조건이 아니다).
 */
import { memo, useMemo, useState, type CSSProperties } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { CardFrame, CardGroup, MutedText } from "@dk-oasis/shared/card";

import { CondLine, RuleHead } from "./parts";
import {
  filterActive,
  filterRules,
  groupByTarget,
  type OcField,
  type OcRule,
  type RuleFilter,
  type ValueLabel,
} from "./model";
import { rulePhrases } from "./sentence";

const CARD: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "8px 10px",
  marginBottom: 6,
  background: "var(--color-bg)",
};

const FILTER_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const ALL = { value: "", label: "전체" };

export interface RuleCardsPanelProps {
  screenId: string;
  rules: OcRule[];
  fields: OcField[];
  labels: ReadonlyMap<string, ValueLabel>;
  /** 룰 키 → 연결된 검토 이슈 ID. */
  issuesByRule: ReadonlyMap<string, string[]>;
  filter: RuleFilter;
  onFilterChange: (next: RuleFilter) => void;
  /** 펼쳐 둘 룰 키(검토 이슈에서 넘어올 때). */
  focusKey: string;
  loaded: boolean;
  onSimulate: (rule: OcRule) => void;
  onEdit: () => void;
}

const RuleCard = memo(function RuleCard({
  rule,
  labelOf,
  labels,
  issueIds,
  defaultOpen,
  onSimulate,
  onEdit,
  screenId,
}: {
  rule: OcRule;
  labelOf: (field: string) => string;
  labels: ReadonlyMap<string, ValueLabel>;
  issueIds: string[];
  defaultOpen: boolean;
  onSimulate: (rule: OcRule) => void;
  onEdit: () => void;
  screenId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const phrases = useMemo(
    () => rulePhrases(rule.conds, labelOf, labels),
    [rule.conds, labelOf, labels],
  );
  const detailPhrases = useMemo(
    () => rulePhrases(rule.conds, labelOf, labels, "list"),
    [rule.conds, labelOf, labels],
  );
  return (
    <article style={CARD} data-testid={`${screenId}-rule-${rule.key}`}>
      <RuleHead
        rule={rule}
        issueIds={issueIds}
        extra={
          <Button
            size="mini"
            variant="default"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "접기" : "상세"}
          </Button>
        }
      />
      <div style={{ marginTop: 4 }}>
        {phrases.length === 0 ? (
          <MutedText>조건 없음(늘 발화)</MutedText>
        ) : (
          phrases.map((p, i) => (
            <span key={`${p.field}-${i}`}>
              {i > 0 ? <MutedText> · </MutedText> : null}
              <CondLine p={p} />
            </span>
          ))
        )}
      </div>
      {open ? (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          <div>
            대상: <b>{labelOf(rule.target)}</b>{" "}
            <MutedText>{rule.target}</MutedText>
          </div>
          <div>이 조건이 모두 충족되면</div>
          <div style={{ display: "grid", gap: 2, paddingLeft: 12 }}>
            {detailPhrases.map((p, i) => (
              <div key={`${p.field}-${i}`}>
                · <CondLine p={p} />
              </div>
            ))}
          </div>
          <div>
            → 에러 <b>{rule.errCode}</b> 발생 · 조치: {rule.actor}
            {rule.warnCandidate ? " (경고 후보)" : ""}
          </div>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>룰 키 · 출처</th>
                <td style={DETAIL_VALUE_CELL}>
                  {rule.key} · {rule.source || "—"}
                </td>
                <th style={DETAIL_LABEL_CELL}>분류 · 심각도</th>
                <td style={DETAIL_VALUE_CELL}>
                  {rule.category || "—"} · {rule.severity}
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>담당 부서 · 조치 주체</th>
                <td style={DETAIL_VALUE_CELL}>
                  {rule.ownerDept} · {rule.actor}
                </td>
                <th style={DETAIL_LABEL_CELL}>Maru 행</th>
                <td style={DETAIL_VALUE_CELL}>
                  순번 {rule.seq} · 행 ID {rule.rowId}
                </td>
              </tr>
              {issueIds.length > 0 ? (
                <tr>
                  <th style={DETAIL_LABEL_CELL}>연결된 검토 이슈</th>
                  <td style={DETAIL_VALUE_CELL} colSpan={3}>
                    {issueIds.join(", ")} — 「검토 이슈」 탭에서 봅니다
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div>
            <Button
              size="sm"
              variant="primary"
              data-testid={`${screenId}-rule-${rule.key}-simulate`}
              onClick={() => onSimulate(rule)}
            >
              시뮬레이션에서 확인
            </Button>{" "}
            <Button size="sm" variant="default" onClick={onEdit}>
              Maru에서 편집
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
});

export const RuleCardsPanel = memo(function RuleCardsPanel({
  screenId,
  rules,
  fields,
  labels,
  issuesByRule,
  filter,
  onFilterChange,
  focusKey,
  loaded,
  onSimulate,
  onEdit,
}: RuleCardsPanelProps) {
  const labelMap = useMemo(
    () => new Map(fields.map((f) => [f.key, f.label])),
    [fields],
  );
  const labelOf = useMemo(
    () => (field: string) => labelMap.get(field) ?? field,
    [labelMap],
  );
  const shown = useMemo(
    () => filterRules(rules, filter, labelOf),
    [rules, filter, labelOf],
  );
  const groups = useMemo(() => groupByTarget(shown, labelOf), [shown, labelOf]);
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rules) m.set(r.target, (m.get(r.target) ?? 0) + 1);
    return m;
  }, [rules]);
  const active = filterActive(filter);
  const signature = JSON.stringify(filter);

  const targetOptions = useMemo(() => {
    const targets = [...new Set(rules.map((r) => r.target).filter(Boolean))];
    return [
      ALL,
      ...targets
        .map((t) => ({ value: t, label: `${labelOf(t)} (${t})` }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    ];
  }, [rules, labelOf]);
  const condFieldOptions = useMemo(() => {
    const used = new Set(rules.flatMap((r) => r.conds.map((c) => c.field)));
    return [
      ALL,
      ...fields
        .filter((f) => used.has(f.key))
        .map((f) => ({ value: f.key, label: `${f.label} (${f.key})` }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    ];
  }, [rules, fields]);
  const actorOptions = useMemo(
    () => [
      ALL,
      ...[...new Set(rules.map((r) => r.actor))].map((a) => ({
        value: a,
        label: a,
      })),
    ],
    [rules],
  );
  const sourceOptions = useMemo(
    () => [
      ALL,
      ...[...new Set(rules.map((r) => r.source).filter(Boolean))].map((s) => ({
        value: s,
        label: s,
      })),
    ],
    [rules],
  );
  const set = (k: keyof RuleFilter) => (v: string) =>
    onFilterChange({ ...filter, [k]: v });

  return (
    <ContentBody root>
      <ContentPanel scrollY>
        <CardFrame
          title="거르기"
          testId={`${screenId}-filter`}
          right={
            <MutedText>
              총 {rules.length}건 중 {shown.length}건 표시
            </MutedText>
          }
        >
          <div style={FILTER_ROW}>
            <Select
              aria-label="대상 항목"
              data-testid={`${screenId}-filter-target`}
              value={filter.target}
              onChange={set("target")}
              options={targetOptions}
            />
            <Select
              aria-label="조건 포함 항목"
              data-testid={`${screenId}-filter-cond`}
              value={filter.condField}
              onChange={set("condField")}
              options={condFieldOptions}
            />
            <Input
              aria-label="에러코드"
              data-testid={`${screenId}-filter-code`}
              value={filter.errCode}
              onChange={set("errCode")}
              placeholder="에러코드 (예: A72)"
            />
            <Select
              aria-label="조치 주체"
              value={filter.actor}
              onChange={set("actor")}
              options={actorOptions}
            />
            <Select
              aria-label="출처"
              value={filter.source}
              onChange={set("source")}
              options={sourceOptions}
            />
            <Input
              aria-label="키워드"
              data-testid={`${screenId}-filter-keyword`}
              value={filter.keyword}
              onChange={set("keyword")}
              placeholder="키워드 (항목·값·메시지·룰 키)"
            />
            <Button
              variant="default"
              size="sm"
              disabled={!active}
              onClick={() =>
                onFilterChange({
                  target: "",
                  condField: "",
                  errCode: "",
                  actor: "",
                  source: "",
                  keyword: "",
                })
              }
            >
              거르기 지우기
            </Button>
          </div>
          <MutedText>
            아래 조건이 모두 충족되면 에러가 발생합니다. 모든 룰을 평가하고
            발화한 룰을 모두 모읍니다(첫 적중에서 멈추지 않음). 값 뒤 (라벨*) 은
            에러 메시지에서 추론한 추정 라벨입니다.
          </MutedText>
        </CardFrame>
        {loaded && rules.length === 0 ? (
          <MutedText>
            기준일에 적용 중인 룰 버전이 없습니다. Maru 에 룰이 등록됐는지
            확인하세요.
          </MutedText>
        ) : null}
        {loaded && rules.length > 0 && shown.length === 0 ? (
          <MutedText>조건에 맞는 룰이 없습니다.</MutedText>
        ) : null}
        {groups.map((g, i) => (
          <CardGroup
            key={`${g.target}|${signature}`}
            id={g.target || "none"}
            testIdPrefix={`${screenId}-group`}
            title={`${g.label} (${g.target}) ${g.rules.length}건${
              active
                ? ` / 전체 ${totals.get(g.target) ?? g.rules.length}건`
                : ""
            }`}
            defaultOpen={i === 0 || active}
          >
            <div style={{ padding: "4px 0" }}>
              {g.rules.map((r) => (
                <RuleCard
                  key={r.key + r.rowId}
                  rule={r}
                  labelOf={labelOf}
                  labels={labels}
                  issueIds={issuesByRule.get(r.key) ?? []}
                  defaultOpen={r.key === focusKey}
                  onSimulate={onSimulate}
                  onEdit={onEdit}
                  screenId={screenId}
                />
              ))}
            </div>
          </CardGroup>
        ))}
      </ContentPanel>
    </ContentBody>
  );
});
