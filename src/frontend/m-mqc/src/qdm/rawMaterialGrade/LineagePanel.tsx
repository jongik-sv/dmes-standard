"use client";

/**
 * 원판연계 탭 — 도금기준(원판) → 칼라파생 나무, 칼라전용(원판 없음) 목록, 건수 타일, 고른 행의 연계 상세(lineage.ts).
 * 파생 행은 원판과 재질·적정원료·두께범위를 견주고, 원판이 앞 버전과 달라졌으면 「재검토 필요」 로 보인다.
 * 행을 누르면 상세를 보이고 그 룰이 Maru 편집 대상이 된다. 서버를 다시 부르지 않는다(룰은 화면 조회 결과, 이력은 화면이 넘긴다).
 */
import { memo, useCallback, useMemo, useState } from "react";

import {
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import {
  DashboardCell,
  DashboardGrid,
  KpiTile,
} from "@dk-oasis/shared/dashboard";

import {
  NA_TEXT,
  type RuleScreenContext,
  type RuleVersion,
} from "@/common/rule";

import {
  buildLineage,
  KIND_LABEL,
  previousVersion,
  RULE_ID,
  type LineageNode,
  type RuleKind,
} from "./lineage";

const KIND_STYLE: Record<RuleKind, { bg: string; color: string }> = {
  BASE: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  DERIVED: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  STANDALONE: {
    bg: "var(--color-warning-soft)",
    color: "var(--color-warning)",
  },
};

function kindBadge(kind: RuleKind, child: boolean) {
  const s = KIND_STYLE[kind];
  return (
    <GridBadge
      label={`${child ? "↳ " : ""}${KIND_LABEL[kind]}`}
      bg={s.bg}
      color={s.color}
    />
  );
}

const CHECK_COLUMN: GridColumn = {
  key: "check",
  header: "확인",
  width: 110,
  align: "center",
  meta: false,
  render: (v, row) =>
    v === "review" ? (
      <GridBadge
        label="재검토 필요"
        title={String(row.reasons ?? "")}
        bg="var(--color-warning-soft)"
        color="var(--color-warning)"
      />
    ) : v === "ok" ? (
      <GridBadge label="원판 일치" muted />
    ) : (
      NA_TEXT
    ),
};

const TREE_COLUMNS: GridColumn[] = [
  {
    key: "kind",
    header: "기준유형",
    width: 110,
    align: "left",
    meta: false,
    render: (v, row) => kindBadge(v as RuleKind, row.child === true),
  },
  { key: "key", header: "룰 ID", width: 90, align: "left", meta: false },
  { key: "spec", header: "규격약호", width: 130, align: "left", meta: false },
  {
    key: "thkText",
    header: "두께범위",
    width: 130,
    align: "left",
    meta: false,
  },
  { key: "mat", header: "재질코드", width: 80, align: "center", meta: false },
  { key: "pri", header: "적정원료", width: 80, align: "center", meta: false },
  { key: "alt", header: "차선원료", width: 120, align: "left", meta: false },
  { key: "note", header: "연계", width: 160, align: "left", meta: false },
  CHECK_COLUMN,
];

const STANDALONE_COLUMNS: GridColumn[] = [
  { key: "legacyNo", header: "순번", width: 70, align: "right", meta: false },
  { key: "key", header: "룰 ID", width: 90, align: "left", meta: false },
  { key: "spec", header: "규격약호", width: 130, align: "left", meta: false },
  {
    key: "thkText",
    header: "두께범위",
    width: 130,
    align: "left",
    meta: false,
  },
  { key: "mat", header: "재질코드", width: 80, align: "center", meta: false },
  { key: "pri", header: "적정원료", width: 80, align: "center", meta: false },
  { key: "alt", header: "차선원료", width: 120, align: "left", meta: false },
  { key: "msg", header: "메시지", width: 260, align: "left", meta: false },
];

function nodeRow(n: LineageNode, child: boolean, note: string) {
  return {
    key: n.key,
    kind: n.kind,
    child,
    spec: n.spec || NA_TEXT,
    thkText: n.thkText,
    mat: n.mat || NA_TEXT,
    pri: n.pri || NA_TEXT,
    alt: n.alt || NA_TEXT,
    msg: n.msg || NA_TEXT,
    legacyNo: n.legacyNo === "0" ? "0 예외" : n.legacyNo || NA_TEXT,
    note,
    check: n.kind === "DERIVED" ? (n.reviews.length > 0 ? "review" : "ok") : "",
    reasons: n.reviews.join(" / "),
  };
}

export interface LineagePanelProps extends RuleScreenContext {
  /** 룰 버전 이력(원판 변경 비교용). 비면 원판 변경은 보지 않는다. */
  versions: readonly RuleVersion[];
}

export const LineagePanel = memo(function LineagePanel({
  screenId,
  rules,
  loaded,
  focusRule,
  versions,
}: LineagePanelProps) {
  const rule = rules.find((r) => r.ruleId === RULE_ID);
  const lineage = useMemo(
    () => buildLineage(rule, previousVersion(versions, rule?.ver)),
    [rule, versions],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const treeRows = useMemo(
    () => [
      ...lineage.bases.flatMap(({ node, children }) => [
        nodeRow(
          node,
          false,
          children.length > 0
            ? `파생 ${children.length}건`
            : "파생 칼라 룰 없음",
        ),
        ...children.map((c) =>
          nodeRow(c, true, c.inherit || `원판 ${c.baseKey ?? NA_TEXT}`),
        ),
      ]),
      ...lineage.orphans.map((c) =>
        nodeRow(c, true, `원판 ${c.baseKey ?? NA_TEXT} 없음`),
      ),
    ],
    [lineage],
  );
  const standaloneRows = useMemo(
    () => lineage.standalone.map((n) => nodeRow(n, false, "")),
    [lineage],
  );
  const all = useMemo(
    () => [
      ...lineage.bases.flatMap((b) => [b.node, ...b.children]),
      ...lineage.orphans,
      ...lineage.standalone,
    ],
    [lineage],
  );
  const selected = all.find((n) => n.key === selectedKey) ?? null;
  const selectedBase =
    selected?.kind === "DERIVED"
      ? lineage.bases.find((b) => b.node.key === selected.baseKey)?.node
      : undefined;
  const selectedChildren =
    selected?.kind === "BASE"
      ? (lineage.bases.find((b) => b.node === selected)?.children ?? [])
      : [];

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      setSelectedKey(String(row.key));
      focusRule(RULE_ID);
    },
    [focusRule],
  );

  const c = lineage.counts;
  return (
    <DashboardGrid fill ariaLabel="원판연계" testId={`${screenId}-lineage`}>
      <DashboardCell span={3}>
        <KpiTile
          label="도금기준"
          value={String(c.base)}
          unit="건"
          testId={`${screenId}-lineage-base`}
        />
      </DashboardCell>
      <DashboardCell span={3}>
        <KpiTile
          label="칼라파생"
          value={String(c.derived)}
          unit="건"
          testId={`${screenId}-lineage-derived`}
        />
      </DashboardCell>
      <DashboardCell span={3}>
        <KpiTile
          label="칼라전용"
          value={String(c.standalone)}
          unit="건"
          testId={`${screenId}-lineage-standalone`}
        />
      </DashboardCell>
      <DashboardCell span={3}>
        <KpiTile
          label="재검토 필요"
          value={String(c.review)}
          unit="건"
          warn={c.review > 0}
          warnLabel={c.review > 0 ? "원판 확인" : undefined}
          testId={`${screenId}-lineage-review`}
        />
      </DashboardCell>
      <DashboardCell span={8}>
        <AgDataGrid
          gridId="lineageTree"
          title="도금기준(원판) → 칼라파생"
          rowKey="key"
          columns={TREE_COLUMNS}
          data={treeRows}
          columnSizing="fit"
          height="auto"
          settingsMenu={false}
          personalize={false}
          highlightedRowKey={selectedKey}
          onRowClick={handleRowClick}
          emptyMessage={loaded ? "도금기준 룰이 없습니다" : undefined}
        />
      </DashboardCell>
      <DashboardCell span={4}>
        <CardFrame title="연계 상세" testId={`${screenId}-lineage-detail`}>
          {!selected ? (
            <MutedText>
              행을 누르면 원판과 견준 결과를 봅니다. 파생 룰의 재질·적정원료는
              원판에서 물려받고, 두께범위는 원판 범위 안이어야 합니다.
            </MutedText>
          ) : (
            <table style={DETAIL_TABLE_STYLE}>
              <tbody>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>룰 ID</th>
                  <td style={DETAIL_VALUE_CELL}>
                    {selected.key} · {KIND_LABEL[selected.kind]}
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>조건</th>
                  <td style={DETAIL_VALUE_CELL}>
                    품명 {selected.prod || NA_TEXT} · 규격{" "}
                    {selected.spec || NA_TEXT} · {selected.thkText}
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>결과</th>
                  <td style={DETAIL_VALUE_CELL}>
                    재질 {selected.mat || NA_TEXT} · 적정{" "}
                    {selected.pri || NA_TEXT} · 차선 {selected.alt || NA_TEXT}
                  </td>
                </tr>
                {selected.kind === "DERIVED" ? (
                  <>
                    <tr>
                      <th style={DETAIL_LABEL_CELL}>원판</th>
                      <td style={DETAIL_VALUE_CELL}>
                        {selectedBase
                          ? `${selectedBase.key} · ${selectedBase.spec} · ${selectedBase.thkText} · 재질 ${selectedBase.mat} · 적정 ${selectedBase.pri}`
                          : `원판 룰 ${selected.baseKey ?? NA_TEXT} 을 찾을 수 없습니다`}
                      </td>
                    </tr>
                    <tr>
                      <th style={DETAIL_LABEL_CELL}>확인</th>
                      <td
                        style={DETAIL_VALUE_CELL}
                        data-testid={`${screenId}-lineage-reasons`}
                      >
                        {selected.reviews.length > 0
                          ? selected.reviews.map((r) => <div key={r}>{r}</div>)
                          : "원판과 맞습니다"}
                      </td>
                    </tr>
                  </>
                ) : null}
                {selected.kind === "BASE" ? (
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>파생 칼라 룰</th>
                    <td style={DETAIL_VALUE_CELL}>
                      {selectedChildren.length > 0
                        ? selectedChildren.map((ch) => ch.key).join(", ")
                        : "없음"}
                      <MutedText>
                        이 룰의 결과(재질·원료·두께범위)를 바꾸면 파생 룰에
                        재검토 필요가 표시됩니다.
                      </MutedText>
                    </td>
                  </tr>
                ) : null}
                {selected.msg ? (
                  <tr>
                    <th style={DETAIL_LABEL_CELL}>메시지</th>
                    <td style={DETAIL_VALUE_CELL}>{selected.msg}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </CardFrame>
      </DashboardCell>
      <DashboardCell span={8}>
        <AgDataGrid
          gridId="lineageStandalone"
          title="칼라전용 (원판 없음)"
          rowKey="key"
          columns={STANDALONE_COLUMNS}
          data={standaloneRows}
          columnSizing="fit"
          height="auto"
          settingsMenu={false}
          personalize={false}
          highlightedRowKey={selectedKey}
          onRowClick={handleRowClick}
          emptyMessage={loaded ? "칼라전용 룰이 없습니다" : undefined}
        />
      </DashboardCell>
    </DashboardGrid>
  );
});
