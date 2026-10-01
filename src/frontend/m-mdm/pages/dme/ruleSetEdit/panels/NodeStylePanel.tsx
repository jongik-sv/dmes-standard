"use client";

/**
 * 오른쪽 패널 「외관」 섹션 본문(S1 §3) — 룰·빈 단계 노드 하나의 아이콘·모양·표시 항목·크기. 조작 하나가 편집 한 번이다(되돌리기 한 칸).
 * 아이콘·모양은 누름 단추(aria-pressed), 표시 항목은 체크, 크기는 숫자 칸(Enter·칸 밖 누르기에 저장, 계획 Ruling 6).
 * shared 에 SegmentedControl·NumberInput·Tooltip 래퍼가 없고 화면은 `@mantine/*` 를 import 하지 않는다 — 툴팁은 title.
 * 색은 여기 없다 — 노드 우클릭 메뉴 「색상」에서 고른다(Task 6, C1). [외관 초기화]는 색도 지운다.
 */
import { useRef, useState } from "react";

import type { FlowNode } from "@/contract/engine-contract.generated";
import { Button, Checkbox, Input } from "@dk-oasis/shared/form";

import { NODE_ICON_COMPONENT } from "../canvas/node-icons";
import {
  NODE_H_MAX, NODE_H_MIN, NODE_ICONS, NODE_ICON_LABEL, NODE_PARTS, NODE_PART_LABEL, NODE_SHAPE_CHOICES,
  NODE_SHAPE_LABEL, NODE_W_MAX, NODE_W_MIN, TASK_SUB_LABEL, type NodePart, type NodeStyle, type NodeStylePatch,
} from "../node-style";

export interface NodeStylePanelProps {
  /** RULE·TASK 노드. */
  node: FlowNode;
  style: NodeStyle | undefined;
  /** 불러오는 중 — 보이되 누를 수 없다(계획 Ruling 13). */
  disabled: boolean;
  onChange(patch: NodeStylePatch | null): void;
}

/** 숫자 칸 — 치는 동안은 초안만, Enter·칸 밖 누르기에 범위로 잘라 한 번 올린다. 같은 값·빈 값·숫자 아님은 올리지 않고 되돌린다. */
function SizeField({ label, testId, value, min, max, disabled, onCommit }: {
  label: string; testId: string; value: number; min: number; max: number; disabled: boolean; onCommit(v: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  /** Enter 로 올린 뒤 칸이 빠지며 오는 blur 가 한 번 더 올리지 않게(TaskBody 와 같은 방식). 다시 치면 풀린다. */
  const sentRef = useRef(false);
  const commit = () => {
    if (sentRef.current) return;
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const v = Math.max(min, Math.min(max, Math.round(n)));
    setDraft(String(v));
    if (v === value) return;
    sentRef.current = true;
    onCommit(v);
  };
  return (
    <label className="rsf-style-size-field">
      <span>{label}</span>
      <Input
        type="number"
        data-testid={testId}
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(v) => {
          sentRef.current = false;
          setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(String(value));
          }
        }}
        onBlur={commit}
      />
    </label>
  );
}

export function NodeStylePanel({ node, style, disabled, onChange }: NodeStylePanelProps) {
  const shape = style?.shape ?? "round";
  const hide = style?.hide ?? [];
  const w = style?.w ?? NODE_W_MIN;
  const h = style?.h ?? NODE_H_MIN;
  const parts: readonly NodePart[] = node.kind === "RULE" ? NODE_PARTS : ["sub"];
  const partLabel = (p: NodePart) => (node.kind === "TASK" && p === "sub" ? TASK_SUB_LABEL : NODE_PART_LABEL[p]);
  return (
    <div className="rsf-style" data-testid="flow-style">
      <div className="rsf-style-row">
        <span className="rsf-style-label">아이콘</span>
        <div className="rsf-style-icons" role="group" aria-label="아이콘">
          <button
            type="button"
            className="rsf-style-icon"
            data-testid="flow-style-icon-none"
            aria-pressed={!style?.icon}
            title="아이콘 없음"
            disabled={disabled}
            onClick={() => onChange({ icon: null })}
          >
            없음
          </button>
          {NODE_ICONS.map((k) => {
            const I = NODE_ICON_COMPONENT[k];
            return (
              <button
                key={k}
                type="button"
                className="rsf-style-icon"
                data-testid={`flow-style-icon-${k}`}
                aria-pressed={style?.icon === k}
                aria-label={NODE_ICON_LABEL[k]}
                title={NODE_ICON_LABEL[k]}
                disabled={disabled}
                onClick={() => onChange({ icon: k })}
              >
                <I size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="rsf-style-row">
        <span className="rsf-style-label">모양</span>
        <div className="rsf-style-shapes" role="group" aria-label="모양">
          {NODE_SHAPE_CHOICES.map((s) => (
            <button
              key={s}
              type="button"
              className="rsf-style-shape"
              data-shape={s}
              data-testid={`flow-style-shape-${s}`}
              aria-pressed={shape === s}
              disabled={disabled}
              onClick={() => onChange({ shape: s === "round" ? null : s })}
            >
              {NODE_SHAPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="rsf-style-row">
        <span className="rsf-style-label">표시 항목</span>
        <div className="rsf-style-parts">
          {parts.map((p) => (
            <Checkbox
              key={p}
              label={partLabel(p)}
              aria-label={`${partLabel(p)} 보이기`}
              checked={!hide.includes(p)}
              disabled={disabled}
              onChange={(on) => onChange({ hide: on ? hide.filter((x) => x !== p) : [...hide, p] })}
            />
          ))}
          <p className="rsf-panel-note rsf-muted">제목·검사 표시·중단점은 늘 보인다</p>
        </div>
      </div>

      <div className="rsf-style-row">
        <span className="rsf-style-label">크기</span>
        <div className="rsf-style-size">
          <SizeField key={`w:${node.id}:${w}`} label="너비" testId="flow-style-w" value={w} min={NODE_W_MIN} max={NODE_W_MAX} disabled={disabled} onCommit={(v) => onChange({ w: v })} />
          <SizeField key={`h:${node.id}:${h}`} label="높이" testId="flow-style-h" value={h} min={NODE_H_MIN} max={NODE_H_MAX} disabled={disabled} onCommit={(v) => onChange({ h: v })} />
          <Button size="sm" data-testid="flow-style-size-reset" disabled={disabled || (style?.w == null && style?.h == null)} onClick={() => onChange({ w: null, h: null })}>
            기본 크기
          </Button>
        </div>
        <p className="rsf-panel-note rsf-muted">{`너비 ${NODE_W_MIN}~${NODE_W_MAX}, 높이 ${NODE_H_MIN}~${NODE_H_MAX}. 캔버스에서 노드를 고르고 오른쪽·아래 손잡이를 끌어도 된다`}</p>
      </div>

      <div className="rsf-panel-actions">
        <Button size="sm" data-testid="flow-style-reset" disabled={disabled || !style} onClick={() => onChange(null)}>
          외관 초기화
        </Button>
      </div>
    </div>
  );
}
