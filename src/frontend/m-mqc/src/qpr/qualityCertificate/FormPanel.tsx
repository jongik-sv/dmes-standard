"use client";

/**
 * 3 양식 — 레이아웃은 정해진 조절값(글자 크기·줄 간격·조항 간격·여백)으로만 바꾼다. 회사명·서명 위치 고정, 양식 선택 규칙(먼저 걸리는 규칙).
 */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Checkbox } from "@dk-oasis/shared/form";
import { CardFrame } from "@dk-oasis/shared/card";

import { RangeField } from "@/common/RangeField";
import { Hint, Lead, Stack } from "@/common/ui";

import { RULES, SLIDERS } from "./engine/data";
import { matchRule } from "./engine/doc";
import type { WtyStore } from "./store";

const RULE_COLUMNS: GridColumn[] = [
  { key: "b", header: "브랜드", width: 90, align: "left" },
  { key: "l", header: "언어", width: 60, align: "center" },
  { key: "g", header: "등급", width: 80, align: "center" },
  { key: "tpl", header: "양식", width: 160, minWidth: 120, align: "left" },
  { key: "p", header: "우선", width: 60, align: "right" },
];

export function FormPanel({ store }: { store: WtyStore; version: number }) {
  const d = store.doc!;
  const lock = store.locked;
  const hit = matchRule(d);
  const rows = RULES.map((r, i) => ({ i, b: r.b, l: r.l === "*" ? "*" : r.l === "ko" ? "한글" : "영문", g: r.g, tpl: r.tpl, p: r.p }));
  return (
    <Stack>
      <Lead>레이아웃은 정해진 조절값으로만 바꿉니다. 문구가 바뀌어도 설정이 유지됩니다.</Lead>
      <CardFrame title="레이아웃 조정">
        <Stack>
          {SLIDERS.map((s) => (
            <RangeField
              key={s.k}
              label={s.ko}
              unit={s.u}
              min={s.min}
              max={s.max}
              step={s.step}
              value={d.layout[s.k] ?? s.def}
              disabled={lock}
              onChange={(v) => store.edit("레이아웃 수정", (x) => (x.layout[s.k] = v))}
              onReset={() => store.edit("레이아웃 기본값", (x) => (x.layout[s.k] = s.def))}
            />
          ))}
          <Checkbox
            label="회사명 · 서명을 마지막 쪽 아래에 고정"
            checked={d.pinSign !== false}
            disabled={lock}
            onChange={(v) => store.edit("서명 위치 수정", (x) => (x.pinSign = v))}
          />
          <Hint>끄면 본문이 끝나는 자리에 바로 붙습니다. 쪽수가 늘어나도 서명 위치가 흔들리지 않게 하려면 켜 두세요.</Hint>
        </Stack>
      </CardFrame>
      <AgDataGrid
        gridId="wty-form-rules"
        title="양식 선택 규칙"
        count={rows.length}
        rowKey="i"
        columns={RULE_COLUMNS}
        data={rows}
        columnSizing="fit"
        height="auto"
        highlightedRowKey={RULES.indexOf(hit)}
      />
      <Hint>위에서부터(우선 숫자가 작은 것부터) 먼저 걸리는 규칙이 적용됩니다. 지금 적용 양식: {hit.tpl}</Hint>
    </Stack>
  );
}
