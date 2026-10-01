"use client";

/**
 * 연결선 패널(Task 9) — 선을 고르면 머리글 「연결선」 아래 접는 섹션 「연결선」: 출발→도착 노드 이름(읽기 전용)과 「라벨」 칸.
 * 라벨은 선 위에 그려지고(분기에서 나가는 선이면 곧 갈래 이름 — 분기 「갈래」 섹션의 칸과 같은 값), 저장은 흐름 JSON 선의 `label` 이다.
 * 편집 모드만 고칠 수 있다(보기·불러오는 중은 읽기 전용). 빈 값 = 지움(null).
 */
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Input } from "@dk-oasis/shared/form";

import { updateEdge, type EditFlow, type EditResult } from "../flow-edit";
import type { RuleIoMap } from "../types";
import { panelTargetOf } from "./PanelHeader";
import { Section, type SectionMemory } from "./Section";

export interface EdgePanelProps {
  flow: EditFlow;
  rules: RuleIoMap;
  edgeId: string;
  editable: boolean;
  onEdit: (fn: (f: EditFlow) => EditResult | EditFlow, opts?: { mergeKey?: string }) => unknown;
  sections: SectionMemory;
}

export function EdgePanel({ flow, rules, edgeId, editable, onEdit, sections }: EdgePanelProps) {
  const e = flow.edges.find((x) => x.id === edgeId);
  if (!e) return null;
  const nameOf = (nodeId: string) => panelTargetOf(flow, rules, nodeId, null, "").name;
  const split = flow.nodes.find((n) => n.id === e.from);
  const fromSplit = split?.kind === "IF" || split?.kind === "PARALLEL";
  return (
    <div className="rsf-panel" data-testid="flow-prop-edge">
      <Section kind="EDGE" id="edge-basic" title="연결선" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>출발</th>
              <td style={DETAIL_VALUE_CELL} data-testid="flow-prop-edge-from">
                {nameOf(e.from)}
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>도착</th>
              <td style={DETAIL_VALUE_CELL} data-testid="flow-prop-edge-to">
                {nameOf(e.to)}
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>라벨</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="flow-prop-edge-label"
                  value={e.label ?? ""}
                  readOnly={!editable}
                  placeholder={fromSplit && e.otherwise ? "그 외" : "선 위에 적을 글"}
                  aria-label="선 라벨"
                  onChange={(v) => onEdit((f) => updateEdge(f, e.id, { label: v === "" ? null : v }), { mergeKey: `elabel:${e.id}` })}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
    </div>
  );
}
