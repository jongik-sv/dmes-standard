"use client";

/**
 * 2 기준값 — 보증 항목이 열이 아니라 행이다. 값을 고치면 그 항목을 쓰는 모든 블록에 바로 반영된다(브랜드마다 따로).
 */
import { useMemo } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import { cellBadge, Hint, Lead, Stack } from "@/common/ui";

import { ITEMS, VARMAP } from "./engine/data";
import { usedText, valOf } from "./engine/doc";
import type { WtyStore } from "./store";

export function ValuePanel({ store }: { store: WtyStore; version: number }) {
  const d = store.doc!;
  const lock = store.locked;
  const ko = d.lang === "ko";
  const txt = usedText(d);
  const cols: GridColumn[] = useMemo(
    () => [
      { key: "cd", header: "항목 코드", width: 120, align: "left" },
      { key: "name", header: "항목명", width: 150, minWidth: 110, align: "left" },
      { key: "val", header: "값", width: 80, align: "right", editable: () => !store.locked, cellEditor: "number" },
      { key: "u", header: "단위", width: 60, align: "center" },
      { key: "used", header: "쓰임", width: 70, align: "center", render: (v) => (v ? cellBadge("사용 중", "primary") : cellBadge("안 씀")) },
    ],
    [store, lock],
  );
  const rows = ITEMS.map((i) => ({
    cd: i.cd,
    name: ko ? i.ko : i.en,
    val: valOf(d, i.cd),
    u: ko ? i.u : i.ue,
    used: Object.entries(VARMAP).some(([k, cd]) => cd === i.cd && txt.includes(`{{${k}}}`)),
  }));
  return (
    <Stack>
      <Lead>항목이 열이 아니라 행입니다. 값을 고치면 그 항목을 쓰는 모든 블록에 바로 반영됩니다. 값 칸을 두 번 눌러 고칩니다.</Lead>
      <AgDataGrid
        gridId="wty-values"
        title={`보증 기준값 — 브랜드 ${d.brand}`}
        count={rows.length}
        rowKey="cd"
        columns={cols}
        data={rows}
        columnSizing="fit"
        height="auto"
        onCellValueChanged={({ rowKey, newValue }) =>
          store.edit("기준값 수정", (x) => {
            const raw = String(newValue ?? "").trim();
            const n = Number(raw);
            x.vals[String(rowKey)][x.brand] = raw === "" || Number.isNaN(n) ? "" : n;
          })
        }
      />
      <Hint>항목을 더 보증하려면 이 표에 행 하나를 추가하고 블록에 변수를 쓰면 됩니다(시연 화면에서는 항목 추가를 하지 않습니다).</Hint>
    </Stack>
  );
}
