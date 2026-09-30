"use client";

/**
 * 왼쪽 룰 패널(3단계 계획 A4·P-D10) — 편집 모드면 위에 팔레트(누르거나 캔버스로 끌어 놓기), 아래에 룰 목록(찾기·끌어 넣기).
 * 보기 모드는 목록만(팔레트·끌기 없음). 디버그 모드의 왼쪽은 입력 패널(`DebugInputs`)이라 page 가 이 패널을 그리지 않는다.
 * 룰 목록은 찾기 결과에서 확정 버전이 있는 룰만 보이고, 줄을 캔버스 선 위로 끌거나 두 번 누르면 끼운다(편집 모드만).
 * 늦은 응답은 요청 순번으로 버린다(Local-Rules §11).
 */
import { useRef, useState } from "react";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import { Button, Input } from "@dk-oasis/shared/form";

import { searchRules } from "../api";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { RuleIo } from "../types";
import type { PaletteItem } from "./FlowCanvas";
import { RULE_MIME } from "./FlowCanvas";
import { FlowPalette } from "./FlowPalette";

export interface RulePanelProps {
  mode: FlowMode;
  loading: boolean;
  /** 룰 줄 [넣기] 의 대상 선. */
  selectedEdgeId: string | null;
  /** 팔레트 항목 누르기. */
  onPick(item: PaletteItem): void;
  /** 찾은 룰의 입출력을 page 의 룰 맵에 더한다. */
  onRules(ios: RuleIo[]): void;
  /** 룰 줄 [넣기] — 고른 선(없으면 END 앞 선)에 끼운다. */
  onInsertRule(ruleId: string): void;
  onError(e: unknown): void;
}

export function RulePanel(props: RulePanelProps) {
  const { mode, loading, onPick, onRules, onInsertRule, onError } = props;
  const editing = mode === "edit";
  const [open, setOpen] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<RuleIo[] | null>(null);
  const seq = useRef(0);

  const find = async () => {
    const mine = ++seq.current;
    try {
      const res = await searchRules(keyword);
      if (mine !== seq.current) return; // 늦게 온 앞 응답은 버린다
      const found = (res.rules ?? []).filter((r) => r.releasedVer != null);
      onRules(found);
      setRows(found);
    } catch (e) {
      if (mine !== seq.current) return;
      onError(e);
    }
  };

  return (
    <div className="rsf-rule-panel" data-testid="flow-rule-panel">
      {editing && <FlowPalette onPick={onPick} disabled={loading} />}
      <div className="rsf-rule-list">
        <button
          type="button"
          className="rsf-rule-list-head"
          data-testid="flow-rule-panel-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <IconChevronDown size={14} aria-hidden="true" /> : <IconChevronRight size={14} aria-hidden="true" />}
          룰 목록
        </button>
        {open && (
          <>
            <div className="rsf-rule-list-search">
              <Input
                data-testid="flow-rule-panel-search"
                value={keyword}
                placeholder="룰 ID·룰명"
                onChange={setKeyword}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void find();
                }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button data-testid="flow-rule-panel-find" onClick={() => void find()}>
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
                    draggable={editing}
                    title={editing ? "선 위로 끌거나 두 번 눌러 넣는다" : undefined}
                    onDragStart={(e) => {
                      if (!editing) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData(RULE_MIME, r.ruleId);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onDoubleClick={() => editing && onInsertRule(r.ruleId)}
                  >
                    <span className="rsf-rule-row-id">{r.ruleId}</span>
                    <span className="rsf-rule-row-name">{r.ruleName ?? "(이름 없음)"}</span>
                    <span className="rsf-rule-row-kind">{r.ruleKind ?? "-"}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
