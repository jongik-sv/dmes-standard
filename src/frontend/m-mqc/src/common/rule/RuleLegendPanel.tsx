"use client";

/**
 * 코드 범례 탭 — 룰 구성(묶음·룰·버전·행 수·조건·결과), 조건 글 읽는 법(연산자), 화면이 쓰는 Maru 코드 항목(qcdRule/codes),
 * 그리고 화면이 주는 추가 내용(legendExtra). 코드는 이 탭이 처음 열릴 때 한 번 읽는다.
 */
import { memo, useCallback, useMemo, type ReactNode } from "react";

import {
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { DashboardCell, DashboardGrid } from "@dk-oasis/shared/dashboard";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { visibleResultNames, type RuleDisplay } from "./display";
import { useCodes } from "./hooks";
import {
  CATALOG,
  codeTitle,
  HIT_POLICY_LABEL,
  hitPolicyOf,
  orderedVarNames,
  ruleTitle,
  varLabel,
  type RuleGroup,
} from "./meta";
import { NA_TEXT } from "./text";
import type { CodeSet, RuleView } from "./types";

const RULE_COLUMNS: GridColumn[] = [
  { key: "group", header: "구분", width: 90, align: "center", meta: false },
  { key: "ruleId", header: "룰 ID", width: 110, align: "left", meta: false },
  { key: "title", header: "이름", width: 160, align: "left", meta: false },
  { key: "ver", header: "버전", width: 70, align: "center", meta: false },
  {
    key: "rowCount",
    header: "행 수",
    width: 60,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "policy",
    header: "적중 방식",
    width: 120,
    align: "left",
    meta: false,
  },
  {
    key: "conds",
    header: "조건 항목",
    width: 260,
    minWidth: 200,
    align: "left",
    meta: false,
  },
  {
    key: "results",
    header: "결과 항목",
    width: 140,
    minWidth: 120,
    align: "left",
    meta: false,
  },
];

/** 조건 글(그리드 칸)과 뜻. x 는 그 열의 값이다. */
export const OPERATOR_LEGEND: { text: string; meaning: string }[] = [
  { text: "a ≤ x ≤ b", meaning: "a 이상 b 이하 — 양쪽 포함" },
  { text: "a ≤ x < b", meaning: "a 이상 b 미만 — 위쪽 미포함" },
  { text: "a < x ≤ b", meaning: "a 초과 b 이하 — 아래쪽 미포함" },
  { text: "a < x < b", meaning: "a 초과 b 미만 — 양쪽 미포함" },
  { text: "IN (A, B)", meaning: "값이 목록에 있으면 맞는다" },
  {
    text: "NOT IN (A, B)",
    meaning: "값이 목록에 없으면 맞는다 — 빈 값도 맞는다",
  },
  {
    text: "= A",
    meaning: "값이 같으면 맞는다. % 는 아무 글자열, _ 는 한 글자",
  },
  { text: "≠ A", meaning: "값이 다르면 맞는다" },
  { text: "—", meaning: "이 조건은 보지 않는다(모든 값이 맞는다)" },
  {
    text: "가려짐",
    meaning: "첫 적중 방식에서 앞 행에 모두 덮여 적중하지 않는 행",
  },
];

const NO_COLUMNS: GridColumn[] = [];
const NO_ROWS: Record<string, unknown>[] = [];

/** 코드 항목 그리드 열 — 코드·이름·별칭 + catalog 의 단계(lvl)·속성(attr) 이름이 있는 칸만. */
function codeColumns(codeId: string): GridColumn[] {
  const meta = CATALOG.CODES[codeId];
  return [
    { key: "code", header: "코드", width: 90, align: "left", meta: false },
    {
      key: "name",
      header: "이름",
      width: 160,
      minWidth: 120,
      align: "left",
      meta: false,
    },
    {
      key: "alterName",
      header: "별칭",
      width: 120,
      align: "left",
      meta: false,
    },
    ...(meta?.lvlNames ?? []).map<GridColumn>((label, i) => ({
      key: `lvl${i}`,
      header: label,
      width: 100,
      align: "left",
      meta: false,
    })),
    ...(meta?.attrNames ?? []).map<GridColumn>((label, i) => ({
      key: `attr${i}`,
      header: label,
      width: 100,
      align: "left",
      meta: false,
    })),
  ];
}

function codeRows(set: CodeSet): Record<string, unknown>[] {
  return set.items.map((item) => {
    const row: Record<string, unknown> = {
      code: item.code,
      name: item.name ?? "",
      alterName: item.alterName ?? "",
    };
    item.lvl.forEach((v, i) => (row[`lvl${i}`] = v ?? ""));
    item.attrs.forEach((v, i) => (row[`attr${i}`] = v ?? ""));
    return row;
  });
}

export interface RuleLegendPanelProps {
  rules: RuleView[];
  groups: RuleGroup[];
  codeIds: string[];
  extra?: ReactNode;
  screenId: string;
  /** 결과 표시 설정 — 결과 항목은 보일 결과만(룰 ID·앞 열은 앞에 따로 적는다). */
  display?: RuleDisplay;
}

export const RuleLegendPanel = memo(function RuleLegendPanel({
  rules,
  groups,
  codeIds,
  extra,
  screenId,
  display,
}: RuleLegendPanelProps) {
  const { showMessage } = useMessage();
  const onError = useCallback(
    (message: string) =>
      showMessage({ title: "오류", message, alertType: "error" }),
    [showMessage],
  );
  const { codes, loading, loaded } = useCodes(codeIds, { onError });
  const columnsByCode = useMemo(
    () => new Map(codeIds.map((id) => [id, codeColumns(id)])),
    [codeIds],
  );
  const rowsByCode = useMemo(
    () => new Map(codes.map((c) => [c.codeId, codeRows(c)])),
    [codes],
  );

  const ruleRows = useMemo(
    () =>
      groups.flatMap((g) =>
        g.ruleIds.map((ruleId) => {
          const rule = rules.find((r) => r.ruleId === ruleId);
          const policy = hitPolicyOf(rule, ruleId);
          return {
            ruleId,
            group: g.label,
            title: ruleTitle(ruleId),
            ver: rule?.ver ?? NA_TEXT,
            rowCount: rule?.rows.length ?? 0,
            policy: HIT_POLICY_LABEL[policy] ?? policy,
            conds:
              orderedVarNames(rule, ruleId, "COND")
                .map((n) => varLabel(ruleId, n))
                .join(" · ") || NA_TEXT,
            results:
              visibleResultNames(
                orderedVarNames(rule, ruleId, "RESULT"),
                display,
              )
                .map((n) => varLabel(ruleId, n))
                .join(" · ") || NA_TEXT,
          };
        }),
      ),
    [rules, groups, display],
  );

  return (
    <DashboardGrid fill ariaLabel="코드 범례" testId={`${screenId}-legend`}>
      <DashboardCell span={12}>
        <CardFrame title="룰 구성" testId={`${screenId}-legend-rules`}>
          <AgDataGrid
            gridId="legendRules"
            header={false}
            rowKey="ruleId"
            columns={RULE_COLUMNS}
            data={ruleRows}
            columnSizing="fit"
            height="auto"
            settingsMenu={false}
            personalize={false}
          />
        </CardFrame>
      </DashboardCell>
      <DashboardCell span={codeIds.length > 0 ? 5 : 12}>
        <CardFrame
          title="조건 글 읽는 법"
          testId={`${screenId}-legend-operators`}
        >
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              {OPERATOR_LEGEND.map((o) => (
                <tr key={o.text}>
                  <th style={DETAIL_LABEL_CELL}>{o.text}</th>
                  <td style={DETAIL_VALUE_CELL}>{o.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardFrame>
      </DashboardCell>
      {codeIds.length > 0 ? (
        <DashboardCell span={7}>
          {codeIds.map((codeId) => {
            const set = codes.find((c) => c.codeId === codeId);
            const desc = CATALOG.CODES[codeId]?.desc;
            return (
              <CardFrame
                key={codeId}
                title={`${codeTitle(codeId)} (${codeId}${set?.ver ? ` v${set.ver}` : ""})`}
                testId={`${screenId}-legend-code-${codeId}`}
              >
                {desc ? <MutedText>{desc}</MutedText> : null}
                <AgDataGrid
                  gridId={`legendCode-${codeId}`}
                  header={false}
                  rowKey="code"
                  columns={columnsByCode.get(codeId) ?? NO_COLUMNS}
                  data={rowsByCode.get(codeId) ?? NO_ROWS}
                  columnSizing="fit"
                  height="auto"
                  settingsMenu={false}
                  personalize={false}
                  loading={loading}
                  emptyMessage={
                    loaded ? "적용 중인 코드 항목이 없습니다" : undefined
                  }
                />
              </CardFrame>
            );
          })}
        </DashboardCell>
      ) : null}
      {extra ? <DashboardCell span={12}>{extra}</DashboardCell> : null}
    </DashboardGrid>
  );
});
