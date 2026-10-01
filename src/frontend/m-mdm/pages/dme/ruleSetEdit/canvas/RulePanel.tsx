"use client";

/**
 * 룰 목록(3단계 계획 A4 → 4단계 Task 8 에서 오른쪽 섹션 본문) — 찾기 칸과 확정 버전 룰 줄. 섹션 머리·접기는 `Section`, 찾기 상태는 page 의 `useRuleSearch` 가 맡는다.
 * - insert(편집): 줄을 캔버스 선 위로 끌거나, 두 번 눌러 고른 선(없으면 END 앞 선)에 끼운다.
 * - assign(편집에서 룰을 지정할 노드를 고름): 줄마다 [지정], 두 번 누르기도 지정. 선 위로 끌어 끼우기는 그대로 된다.
 * - view(보기): 찾기·보기만(끌기·두 번 누르기·[지정] 없음).
 */
import type { RefObject } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import type { RuleSearch } from "../state/useRuleSearch";
import type { RuleIo } from "../types";
import { RULE_MIME } from "./FlowCanvas";

export type RuleListMode = "view" | "insert" | "assign";

export interface RulePanelProps {
  mode: RuleListMode;
  search: RuleSearch;
  /** 흐름에 이미 있는 룰 — 줄에 「사용 중」 배지(4단계 Task 9, 지운 룰 찾기 창의 표시를 옮김). 막지는 않는다. */
  usedRuleIds?: ReadonlySet<string>;
  /** 찾기 칸 — 룰 지정 섹션을 열 때 초점을 둔다. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** 두 번 누르기(insert). */
  onInsert(io: RuleIo): void;
  /** [지정]·두 번 누르기(assign). */
  onAssign(io: RuleIo): void;
}

const ROW_TITLE: Record<RuleListMode, string | undefined> = {
  insert: "선 위로 끌거나 두 번 눌러 넣는다",
  assign: "두 번 누르거나 [지정] 을 누르면 고른 노드의 룰이 된다. 선 위로 끌면 끼운다",
  view: undefined,
};

export function RulePanel({ mode, search, usedRuleIds, inputRef, onInsert, onAssign }: RulePanelProps) {
  const active = mode !== "view";
  const { rows } = search;
  return (
    <div className="rsf-rule-panel" data-testid="flow-rule-panel" data-mode={mode}>
      <div className="rsf-rule-list-search">
        <Input
          data-testid="flow-rule-panel-search"
          {...({ ref: inputRef } as object)}
          value={search.keyword}
          placeholder="룰 ID·룰명"
          aria-label="룰 찾기"
          onChange={search.setKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void search.find();
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button data-testid="flow-rule-panel-find" onClick={() => void search.find()}>
          찾기
        </Button>
      </div>
      {rows && rows.length === 0 && <p className="rsf-rule-list-empty">확정된 룰이 없다</p>}
      {rows && rows.length > 0 && (
        <ul className="rsf-rule-rows" data-testid="flow-rule-rows">
          {rows.map((r) => (
            <li
              key={r.ruleId}
              className="rsf-rule-row"
              data-testid={`flow-rule-row-${r.ruleId}`}
              draggable={active}
              title={ROW_TITLE[mode]}
              onDragStart={(e) => {
                if (!active) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData(RULE_MIME, r.ruleId);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDoubleClick={() => {
                if (mode === "insert") onInsert(r);
                else if (mode === "assign") onAssign(r);
              }}
            >
              <span className="rsf-rule-row-id">{r.ruleId}</span>
              <span className="rsf-rule-row-name">{r.ruleName ?? "(이름 없음)"}</span>
              <span className="rsf-rule-row-kind">{r.ruleKind ?? "-"}</span>
              {usedRuleIds?.has(r.ruleId) && (
                <span className="rsf-rule-used" data-testid={`flow-rule-used-${r.ruleId}`} style={badgeStyle("warning")}>
                  사용 중
                </span>
              )}
              {mode === "assign" && (
                <Button
                  size="mini"
                  className="rsf-rule-assign"
                  data-testid={`flow-rule-assign-${r.ruleId}`}
                  ariaLabel={`${r.ruleId} 지정`}
                  onClick={() => onAssign(r)}
                >
                  지정
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
