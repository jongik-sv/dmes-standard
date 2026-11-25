"use client";

/**
 * 버전 이력 탭 — 룰을 고르고 확정(RELEASED) 버전을 골라 바로 앞 버전과의 행 차이를 본다(qcdRule/history).
 * 서버는 버전을 ver 오름차순으로 준다. 처음에는 가장 새 버전을 고른다. 첫 버전은 모두 추가다.
 */
import { memo, useCallback, useMemo, useState } from "react";

import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  GridBadge,
  GridPanel,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import { Select } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";

import {
  diffSummary,
  diffVersions,
  ROW_DIFF_LABEL,
  type RowDiffKind,
} from "./diff";
import type { RuleDisplay } from "./display";
import { useRuleHistory } from "./hooks";
import { CATALOG, ruleOptions, ruleTitle, type RuleGroup } from "./meta";
import { RulePicker } from "./RulePicker";
import { NA_TEXT } from "./text";

/** 변화 배지 색 — 추가 완료색, 삭제 오류색, 변경 경고색, 이동 정보색, 같음 흐림. */
const CHANGE_STYLE: Record<
  RowDiffKind,
  { bg?: string; color?: string; muted?: boolean }
> = {
  added: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  removed: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
  changed: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  moved: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  same: { muted: true },
};

const COLUMNS: GridColumn[] = [
  {
    key: "kind",
    header: "변화",
    width: 80,
    align: "center",
    meta: false,
    render: (v) => {
      const kind = v as RowDiffKind;
      const s = CHANGE_STYLE[kind];
      return (
        <GridBadge
          label={ROW_DIFF_LABEL[kind]}
          bg={s.bg}
          color={s.color}
          muted={s.muted}
        />
      );
    },
  },
  {
    key: "seq",
    header: "순번",
    width: 64,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "rowId",
    header: "행 ID",
    width: 70,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "before",
    header: "이전",
    width: 100,
    minWidth: 260,
    align: "left",
    meta: false,
  },
  {
    key: "after",
    header: "이후",
    width: 100,
    minWidth: 260,
    align: "left",
    meta: false,
  },
];

/** 룰 ID 열을 넣은 열 — 표시 설정에 keyVar 가 있을 때. */
const COLUMNS_WITH_KEY: GridColumn[] = [
  ...COLUMNS.slice(0, 3),
  { key: "ruleKey", header: "룰 ID", width: 110, align: "left", meta: false },
  ...COLUMNS.slice(3),
];

export interface RuleHistoryPanelProps {
  groups: RuleGroup[];
  initialRuleId: string;
  onFocusRule?: (ruleId: string) => void;
  screenId: string;
  /** 결과 표시 설정 — 행 글에 쓰고, keyVar 가 있으면 룰 ID 열을 더한다. */
  display?: RuleDisplay;
}

export const RuleHistoryPanel = memo(function RuleHistoryPanel({
  groups,
  initialRuleId,
  onFocusRule,
  screenId,
  display,
}: RuleHistoryPanelProps) {
  const { showMessage } = useMessage();
  const [ruleId, setRuleId] = useState(initialRuleId);
  // 사용자가 고른 버전. 비면(처음·룰을 바꾼 뒤) 가장 새 버전.
  const [pickedVer, setPickedVer] = useState("");
  const onError = useCallback(
    (message: string) =>
      showMessage({ title: "오류", message, alertType: "error" }),
    [showMessage],
  );
  const { versions, loading, loaded } = useRuleHistory(ruleId || null, {
    onError,
  });
  const options = useMemo(() => ruleOptions(groups), [groups]);

  const ver = versions.some((v) => v.ver === pickedVer)
    ? pickedVer
    : (versions.at(-1)?.ver ?? "");
  const versionOptions = useMemo(
    () =>
      versions.map((v) => ({
        value: v.ver,
        label: `v${v.ver} · ${v.applyFrom ?? NA_TEXT} ~ ${v.applyTo ?? ""}`,
      })),
    [versions],
  );
  const diffs = useMemo(() => {
    const idx = versions.findIndex((v) => v.ver === ver);
    return idx < 0
      ? []
      : diffVersions(
          ruleId,
          versions[idx - 1],
          versions[idx],
          CATALOG,
          display,
        );
  }, [versions, ver, ruleId, display]);

  const changeRule = (next: string) => {
    setRuleId(next);
    setPickedVer("");
    onFocusRule?.(next);
  };

  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel
          title={`버전 이력 — ${ruleTitle(ruleId)} (${ruleId})${diffs.length > 0 ? ` · ${diffSummary(diffs)}` : ""}`}
          count={diffs.length}
          titleExtra={
            <>
              <RulePicker
                value={ruleId}
                onChange={changeRule}
                options={options}
                disabled={loading}
                testId={`${screenId}-history-rule`}
              />{" "}
              <Select
                aria-label="버전"
                data-testid={`${screenId}-history-ver`}
                value={ver}
                onChange={setPickedVer}
                options={versionOptions}
              />
            </>
          }
        >
          <AgDataGrid
            gridId="history"
            rowKey="rowId"
            columns={display?.keyVar ? COLUMNS_WITH_KEY : COLUMNS}
            data={diffs as unknown as Record<string, unknown>[]}
            columnSizing="fit"
            loading={loading}
            personalize={false}
            emptyMessage={
              loaded && versions.length === 0
                ? "확정된 버전이 없습니다"
                : undefined
            }
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
});
