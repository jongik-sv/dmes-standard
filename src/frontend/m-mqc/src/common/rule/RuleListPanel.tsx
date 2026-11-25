"use client";

/**
 * 룰 목록 탭 — 왼쪽 목록(묶음 막대 + 행 그리드), 오른쪽 상세(조건 문장·결과·행 ID·버전).
 * 열은 보이는 룰(묶음)의 조건·결과 변수 합집합이고, 라벨은 catalog(없으면 Maru 변수명)다. 조건을 보지 않는 칸은 「—」.
 * 묶음마다 열이 바뀌므로 열 개인화는 끈다(personalize=false — 같은 순번 열이 다른 묶음에 붙지 않게).
 */
import { memo, useCallback, useMemo, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  GridBadge,
  GridPanel,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import { SegmentedControl } from "@dk-oasis/shared/form";

import {
  formatResult,
  formatResultWithUnit,
  isBlankValue,
  isPrimaryVar,
  leadText,
  rowBadges,
  rowKeyOf,
  visibleResultNames,
  type RuleBadge,
  type RuleDisplay,
} from "./display";
import {
  columnSpecs,
  filterRows,
  flattenRules,
  groupCounts,
  type ColumnSpec,
  type ListRow,
} from "./list";
import {
  CATALOG,
  orderedVarNames,
  ruleTitle,
  varLabel,
  varUnit,
  type RuleGroup,
} from "./meta";
import { RuleBadges } from "./RuleBadges";
import { cellText, conditionSentence, NA_TEXT, valueWithUnit } from "./text";
import type { RuleView } from "./types";

const UNREACHABLE_TIP = "앞 행에 모두 덮여 적중하지 않는 행";
const NO_RULE_ROWS =
  "적용 중인 룰 버전이 없습니다. Maru 에 룰이 등록됐는지 확인하세요.";

const condKey = (name: string) => `c_${name}`;
const resultKey = (name: string) => `r_${name}`;
const leadKey = (name: string) => `l_${name}`;

/** 목록 열 묶음 — 조건·결과(보일 것만)·앞 열. */
interface ListSpecs {
  conds: ColumnSpec[];
  results: ColumnSpec[];
  leads: ColumnSpec[];
}

/** columnSpecs 결과를 표시 설정으로 나눈다 — 앞 열(leadVars 순서), 결과(업무 결과 먼저, 숨김·룰 ID·앞 열 제외). */
export function listSpecs(
  specs: { conds: ColumnSpec[]; results: ColumnSpec[] },
  display: RuleDisplay | undefined,
): ListSpecs {
  const byName = new Map(specs.results.map((r) => [r.name, r]));
  const names = specs.results.map((r) => r.name);
  return {
    conds: specs.conds,
    results: visibleResultNames(names, display).map((n) => byName.get(n)!),
    leads: (display?.leadVars ?? [])
      .filter((n) => byName.has(n))
      .map((n) => byName.get(n)!),
  };
}

function toGridRow(
  row: ListRow,
  specs: ListSpecs,
  display: RuleDisplay | undefined,
  rule: RuleView | undefined,
): Record<string, unknown> {
  const badges: RuleBadge[] = [
    ...(row.unreachable
      ? [{ label: "가려짐", tone: "muted" as const, title: UNREACHABLE_TIP }]
      : []),
    ...(row.rowKind === "DEFAULT"
      ? [{ label: "기본 행", tone: "warning" as const }]
      : []),
    ...rowBadges(display, row.results, rule),
  ];
  const out: Record<string, unknown> = {
    key: row.key,
    groupLabel: row.groupLabel,
    ruleId: row.ruleId,
    seq: row.seq,
    rowId: row.rowId,
    mark: row.unreachable
      ? "가려짐"
      : row.rowKind === "DEFAULT"
        ? "기본 행"
        : "",
    badges,
    ruleKey: rowKeyOf(display, row.results) ?? NA_TEXT,
  };
  for (const c of specs.conds)
    out[condKey(c.name)] =
      c.name in row.cells ? cellText(row.cells[c.name].summary) : NA_TEXT;
  for (const r of [...specs.results, ...specs.leads]) {
    const k = specs.leads.includes(r) ? leadKey(r.name) : resultKey(r.name);
    out[k] = display
      ? r.name in row.results
        ? formatResult(display, r.name, row.results[r.name], row.results)
        : NA_TEXT
      : (row.results[r.name] ?? NA_TEXT);
  }
  return out;
}

/** 업무 결과 칸 — 굵은 배지. 0·빈 값은 흐리게. */
function primaryCell(v: unknown) {
  const text = String(v ?? NA_TEXT);
  if (text === NA_TEXT) return NA_TEXT;
  const zero = text === "0";
  return (
    <GridBadge
      label={text}
      strong
      muted={zero}
      bg={zero ? undefined : "var(--color-primary-soft)"}
      color={zero ? undefined : "var(--color-primary)"}
    />
  );
}

function buildColumns(
  specs: ListSpecs,
  showGroup: boolean,
  testIdPrefix: string,
  display?: RuleDisplay,
): GridColumn[] {
  return [
    ...(showGroup
      ? [
          {
            key: "groupLabel",
            header: "구분",
            width: 90,
            align: "center",
            meta: false,
            render: (v: unknown) => (
              <GridBadge
                label={String(v ?? "")}
                bg="var(--color-primary-soft)"
                color="var(--color-primary)"
              />
            ),
          } satisfies GridColumn,
        ]
      : []),
    {
      key: "seq",
      header: display?.seqLabel ?? "순번",
      width: 64,
      align: "right",
      type: "number",
      meta: false,
    },
    ...(display?.keyVar
      ? [
          {
            key: "ruleKey",
            header: "룰 ID",
            headerTooltip: `Maru 결과 변수 ${display.keyVar}`,
            width: 120,
            align: "left",
            meta: false,
          } satisfies GridColumn,
        ]
      : []),
    ...specs.leads.map<GridColumn>((r) => ({
      key: leadKey(r.name),
      header: r.label,
      headerTooltip: r.tooltip,
      width: display?.columnWidths?.[r.name] ?? 80,
      align: display?.columnWidths?.[r.name] ? "left" : "right",
      meta: false,
    })),
    ...specs.conds.map<GridColumn>((c) => ({
      key: condKey(c.name),
      header: c.label,
      headerTooltip: c.tooltip,
      width: 150,
      minWidth: 110,
      align: "left",
      meta: false,
    })),
    ...specs.results.map<GridColumn>((r) => ({
      key: resultKey(r.name),
      header: r.unit ? `${r.label}(${r.unit})` : r.label,
      headerTooltip: r.tooltip,
      width:
        display?.columnWidths?.[r.name] ??
        (display && !isPrimaryVar(display, r.name) ? 130 : 110),
      align: display && !isPrimaryVar(display, r.name) ? "left" : "right",
      meta: false,
      ...(isPrimaryVar(display, r.name) ? { render: primaryCell } : {}),
    })),
    {
      key: "rowId",
      header: "행 ID",
      width: 70,
      align: "right",
      type: "number",
      meta: false,
    },
    {
      key: "mark",
      header: "표시",
      width: display?.badges ? 130 : 80,
      align: "center",
      meta: false,
      render: (v, row) =>
        display?.badges ? (
          (row.badges as RuleBadge[]).length > 0 ? (
            <RuleBadges
              badges={row.badges as RuleBadge[]}
              testId={`${testIdPrefix}-badges-${String(row.key)}`}
            />
          ) : (
            NA_TEXT
          )
        ) : v === "가려짐" ? (
          <span
            data-testid={`${testIdPrefix}-badge-unreachable-${String(row.key)}`}
          >
            <GridBadge label="가려짐" title={UNREACHABLE_TIP} muted />
          </span>
        ) : v ? (
          <GridBadge
            label={String(v)}
            bg="var(--color-warning-soft)"
            color="var(--color-warning)"
          />
        ) : (
          NA_TEXT
        ),
    },
  ];
}

export interface RuleListPanelProps {
  rules: RuleView[];
  /** 결과 열 표시 설정. 없으면 모든 결과를 같은 모양으로 보인다. */
  display?: RuleDisplay;
  groups: RuleGroup[];
  /** 룰 ID → 가려진 행 ID. */
  unreachable: ReadonlyMap<string, Set<number>>;
  /** 조회를 한 번이라도 마쳤는지 — 받기 전의 빈 목록에 안내 문구를 보이지 않는다. */
  loaded: boolean;
  loading: boolean;
  /** 처음 고를 묶음 키("" 전체). */
  initialGroup?: string;
  /** 묶음·행을 고르면 그 룰을 알린다(Maru 편집 대상). */
  onFocusRule?: (ruleId: string) => void;
  /** 열 너비 저장 키·testId 접두어(화면 objectId). */
  screenId: string;
}

export const RuleListPanel = memo(function RuleListPanel({
  rules,
  groups,
  unreachable,
  loaded,
  loading,
  initialGroup = "",
  onFocusRule,
  screenId,
  display,
}: RuleListPanelProps) {
  const [group, setGroup] = useState(initialGroup);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const allRows = useMemo(
    () => flattenRules(rules, groups, unreachable),
    [rules, groups, unreachable],
  );
  const rows = useMemo(() => filterRows(allRows, { group }), [allRows, group]);
  const counts = useMemo(() => groupCounts(allRows), [allRows]);
  const visibleRuleIds = useMemo(
    () =>
      group === ""
        ? groups.flatMap((g) => g.ruleIds)
        : (groups.find((g) => g.key === group)?.ruleIds ?? []),
    [groups, group],
  );
  const specs = useMemo(
    () => listSpecs(columnSpecs(rules, visibleRuleIds), display),
    [rules, visibleRuleIds, display],
  );
  const showGroup = group === "" && groups.length > 1;
  const columns = useMemo(
    () => buildColumns(specs, showGroup, screenId, display),
    [specs, showGroup, screenId, display],
  );
  const gridRows = useMemo(() => {
    const byId = new Map(rules.map((r) => [r.ruleId, r]));
    return rows.map((r) => toGridRow(r, specs, display, byId.get(r.ruleId)));
  }, [rows, specs, display, rules]);

  const groupOptions = useMemo(
    () => [
      { value: "", label: `전체 ${counts[""] ?? 0}` },
      ...groups.map((g) => ({
        value: g.key,
        label: `${g.label} ${counts[g.key] ?? 0}`,
      })),
    ],
    [groups, counts],
  );

  const changeGroup = useCallback(
    (key: string) => {
      setGroup(key);
      const first = groups.find((g) => g.key === key)?.ruleIds[0];
      if (first) onFocusRule?.(first);
    },
    [groups, onFocusRule],
  );
  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      setSelectedKey(String(row.key));
      onFocusRule?.(String(row.ruleId));
    },
    [onFocusRule],
  );

  // 거르기로 사라진 행은 상세에서도 내린다.
  const selected = rows.find((r) => r.key === selectedKey) ?? null;
  const selectedRule = selected
    ? rules.find((r) => r.ruleId === selected.ruleId)
    : undefined;

  return (
    <ContentBody root resizable storageKey={`mqc.${screenId}.ruleList`}>
      <ContentPanel>
        <GridPanel
          title="룰 목록"
          count={rows.length}
          titleExtra={
            groups.length > 1 ? (
              <SegmentedControl
                ariaLabel="구분"
                testId={`${screenId}-group`}
                value={group}
                onChange={changeGroup}
                options={groupOptions}
              />
            ) : undefined
          }
        >
          <AgDataGrid
            gridId="rules"
            rowKey="key"
            columns={columns}
            data={gridRows}
            columnSizing="fixed"
            personalize={false}
            highlightedRowKey={selected?.key ?? null}
            onRowClick={handleRowClick}
            loading={loading}
            emptyMessage={
              loaded && allRows.length === 0 ? NO_RULE_ROWS : undefined
            }
          />
        </GridPanel>
      </ContentPanel>
      <ContentPanel width={420} scrollY>
        <RuleRowDetail
          row={selected}
          rule={selectedRule}
          testIdPrefix={screenId}
          display={display}
        />
      </ContentPanel>
    </ContentBody>
  );
});

/** 상세 — 조건(변수 라벨별 한 줄), 결과, 행 ID·순번, 룰·버전, 표시. 고른 행이 없으면 값 칸은 「—」. */
function RuleRowDetail({
  row,
  rule,
  testIdPrefix,
  display,
}: {
  row: ListRow | null;
  rule: RuleView | undefined;
  testIdPrefix: string;
  display?: RuleDisplay;
}) {
  const ruleId = row?.ruleId ?? "";
  const condNames = row ? orderedVarNames(rule, ruleId, "COND", CATALOG) : [];
  const allResults = row
    ? orderedVarNames(rule, ruleId, "RESULT", CATALOG)
    : [];
  // 상세는 숨김 변수도 보인다 — 업무 결과 먼저, 룰 ID·앞 열은 위 줄로 올린 만큼 뺀다. 빈 값인 숨김 변수는 줄을 만들지 않는다.
  const resultNames = display
    ? [
        ...visibleResultNames(allResults, display),
        ...(display.hiddenVars ?? []).filter(
          (n) =>
            allResults.includes(n) &&
            row &&
            !isBlankValue(row.results[n], display),
        ),
      ]
    : allResults;
  const ruleKey = row ? rowKeyOf(display, row.results) : null;
  const lead = row ? leadText(ruleId, display, row.results) : "";
  const badges = row ? rowBadges(display, row.results, rule) : [];
  return (
    <table style={DETAIL_TABLE_STYLE} data-testid={`${testIdPrefix}-detail`}>
      <tbody>
        <tr>
          <th style={DETAIL_LABEL_CELL}>룰</th>
          <td style={DETAIL_VALUE_CELL}>
            {row
              ? `${row.groupLabel} · ${ruleTitle(ruleId)} (${ruleId})`
              : NA_TEXT}
          </td>
        </tr>
        {display?.keyVar ? (
          <tr>
            <th style={DETAIL_LABEL_CELL}>룰 ID</th>
            <td
              style={DETAIL_VALUE_CELL}
              data-testid={`${testIdPrefix}-detail-key`}
            >
              {ruleKey ?? NA_TEXT}
              {lead ? ` · ${lead}` : ""}
            </td>
          </tr>
        ) : null}
        {badges.length > 0 ? (
          <tr>
            <th style={DETAIL_LABEL_CELL}>표시</th>
            <td style={DETAIL_VALUE_CELL}>
              {badges.map((b) => (
                <div key={`${b.label}-${b.title ?? ""}`}>
                  {b.title ? `${b.label} — ${b.title}` : b.label}
                </div>
              ))}
            </td>
          </tr>
        ) : null}
        {row && condNames.length > 0 ? (
          condNames.map((name) => {
            const label = varLabel(ruleId, name);
            return (
              <tr key={`c-${name}`}>
                <th style={DETAIL_LABEL_CELL} title={`Maru 변수 ${name}`}>
                  {label}
                </th>
                <td style={DETAIL_VALUE_CELL}>
                  {conditionSentence(row.cells[name]?.summary, label) ??
                    "보지 않음"}
                </td>
              </tr>
            );
          })
        ) : (
          <tr>
            <th style={DETAIL_LABEL_CELL}>조건</th>
            <td style={DETAIL_VALUE_CELL}>{NA_TEXT}</td>
          </tr>
        )}
        {row && resultNames.length > 0 ? (
          resultNames.map((name) => (
            <tr key={`r-${name}`}>
              <th style={DETAIL_LABEL_CELL} title={`Maru 변수 ${name}`}>
                {varLabel(ruleId, name)}
              </th>
              <td
                style={DETAIL_VALUE_CELL}
                data-testid={`${testIdPrefix}-detail-result-${name}`}
              >
                {display
                  ? formatResultWithUnit(
                      display,
                      name,
                      row.results[name],
                      varUnit(ruleId, name),
                      row.results,
                    )
                  : valueWithUnit(row.results[name], varUnit(ruleId, name))}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <th style={DETAIL_LABEL_CELL}>결과</th>
            <td style={DETAIL_VALUE_CELL}>{NA_TEXT}</td>
          </tr>
        )}
        <tr>
          <th style={DETAIL_LABEL_CELL}>행 ID · 순번</th>
          <td
            style={DETAIL_VALUE_CELL}
            data-testid={`${testIdPrefix}-detail-row`}
          >
            {row
              ? `${row.rowId} · ${row.seq}${row.rowKind === "DEFAULT" ? " (기본 행)" : ""}`
              : NA_TEXT}
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}>버전</th>
          <td
            style={DETAIL_VALUE_CELL}
            data-testid={`${testIdPrefix}-detail-version`}
          >
            {row
              ? `v${row.ver ?? NA_TEXT} · ${row.applyFrom ?? NA_TEXT} 부터`
              : NA_TEXT}
          </td>
        </tr>
        {row?.unreachable ? (
          <tr>
            <th style={DETAIL_LABEL_CELL}>표시</th>
            <td style={DETAIL_VALUE_CELL}>
              가려짐 — {UNREACHABLE_TIP}입니다. Maru 에서 순번이나 조건을
              확인하세요.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
