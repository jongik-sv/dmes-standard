"use client";

/**
 * 1 조항·블록 — 문구 찾기·모두 바꾸기, 조항 구성(켜고 끄기·순서), 고른 조항의 블록 편집(문단·그림·2단·표).
 * 오른쪽 종이에서 블록을 누르면 여기서 그 블록이 열리고, 종이에서 끌어 같은 조항 안 순서를 바꿀 수 있다.
 */
import { useMemo, useState, type ReactNode } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Checkbox, Input } from "@dk-oasis/shared/form";
import { CardFrame } from "@dk-oasis/shared/card";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { Hint, Lead, Row, Stack } from "@/common/ui";

import { BlockList } from "./BlockEditor";
import { meta } from "./engine/data";
import { clauseOf, findHits, numbering, replaceAllText } from "./engine/doc";
import type { WtyStore } from "./store";

const MARK_STYLE = { background: "var(--color-warning-soft)", color: "var(--color-text)", padding: "0 1px", borderRadius: 2 } as const;
const DOT = { color: "var(--color-warning)", marginRight: 4 } as const;

/** 찾은 곳 앞뒤 글 — 찾은 문구는 형광펜. */
function snippet(t: string, j: number, len: number): ReactNode {
  const a = Math.max(0, j - 22);
  const b = Math.min(t.length, j + len + 28);
  return (
    <>
      {a > 0 ? "…" : ""}
      {t.slice(a, j)}
      <mark style={MARK_STYLE}>{t.slice(j, j + len)}</mark>
      {t.slice(j + len, b)}
      {b < t.length ? "…" : ""}
    </>
  );
}

export function ClausePanel({ store }: { store: WtyStore; version: number }) {
  const { showMessage } = useMessage();
  const [to, setTo] = useState("");
  const d = store.doc!;
  const { sel, selB } = store.ui;
  const q = store.ui.q.trim();
  const lock = store.locked;
  const n = numbering(d);
  const changed = store.analysis().b;
  const hits = findHits(d, q);

  const clauseCols: GridColumn[] = useMemo(
    () => [
      { key: "drag", header: "", width: 34, rowDrag: true, sortable: false, tooltip: false },
      {
        key: "on",
        header: "사용",
        width: 56,
        align: "center",
        sortable: false,
        render: (v, row) => (
          <Checkbox
            checked={!!v}
            disabled={store.locked}
            aria-label={`${String(row.title)} 사용`}
            onChange={(on) => store.edit(on ? "조항 사용" : "조항 제외", (x) => (clauseOf(x, String(row.id))!.on = on))}
          />
        ),
      },
      { key: "num", header: "번호", width: 56, align: "center", sortable: false },
      {
        key: "title",
        header: "조항",
        width: 200,
        minWidth: 140,
        align: "left",
        sortable: false,
        render: (v, row) => (
          <span style={row.lv === 2 ? { paddingLeft: 12 } : undefined}>
            {row.chg ? (
              <span style={DOT} title="바뀐 블록 있음">
                ●
              </span>
            ) : null}
            {String(v)}
          </span>
        ),
      },
      { key: "nb", header: "블록", width: 56, align: "center", sortable: false },
    ],
    // locked 가 바뀌면 체크 칸을 다시 그린다.
    [store, lock],
  );

  const rows = d.order.map((id) => {
    const m = meta(id);
    const c = clauseOf(d, id);
    return {
      id,
      on: !!c?.on,
      num: n[id] === null ? "—" : n[id] || "·",
      title: m?.t ?? id,
      lv: m?.lv ?? 1,
      nb: c?.b.length ?? 0,
      chg: [...changed].some((k) => k.startsWith(id + "|")),
    };
  });
  const i = d.order.indexOf(sel);
  const move = (dir: number) =>
    store.edit("조항 순서 변경", (x) => {
      const j = i + dir;
      if (j < 0 || j >= x.order.length) return;
      x.order.splice(j, 0, x.order.splice(i, 1)[0]);
    });

  const replaceAll = () => {
    if (!q) return;
    let cnt = 0;
    const probe = JSON.parse(JSON.stringify(d)) as typeof d;
    if (!replaceAllText(probe, q, to)) {
      showMessage({ message: "바꿀 문구가 없습니다.", alertType: "warning" });
      return;
    }
    store.edit("모두 바꾸기", (x) => (cnt = replaceAllText(x, q, to)));
    showMessage({ message: `${cnt}곳을 바꿨습니다. 되돌리려면 [되돌리기] 를 누르세요.`, alertType: "success", toast: true });
  };

  const hitRows = hits.slice(0, 40).map((h, k) => ({
    k,
    where: `${meta(h.id)?.t ?? h.id} · ${h.lg === "ko" ? "한" : "영"}`,
    lab: h.lab,
    t: h.t,
    j: h.j,
    len: q.length,
    id: h.id,
    bi: h.bi,
  }));

  return (
    <Stack>
      <Lead>
        오른쪽 종이에서 블록을 누르면 여기서 그 블록이 열리고, 끌어서 같은 조항 안 순서를 바꿀 수 있습니다. 조항은 블록(문단·그림·2단·표)을 쌓아 만들고, 조항을 끄면
        번호가 자동으로 당겨집니다.
      </Lead>

      <CardFrame title="문구 찾기">
        <Row>
          <div style={{ flex: 1, minWidth: 150 }}>
            <Input placeholder="찾을 문구 — 한글·영문 모두" aria-label="찾을 문구" value={store.ui.q} onChange={(v) => store.setUi({ q: v })} />
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <Input
              placeholder="바꿀 문구"
              aria-label="바꿀 문구"
              value={to}
              disabled={lock}
              onChange={setTo}
              onKeyDown={(e) => {
                if (e.key === "Enter") replaceAll();
              }}
            />
          </div>
          <Button size="sm" disabled={lock || !q} onClick={replaceAll}>
            모두 바꾸기
          </Button>
        </Row>
        <Hint>꺼둔 조항과 반대 언어까지 한 번에 찾습니다. 결과를 누르면 그 블록이 열립니다.</Hint>
        {q ? (
          <AgDataGrid
            gridId="wty-find"
            title="찾은 곳"
            count={hits.length}
            rowKey="k"
            columns={FIND_COLUMNS}
            data={hitRows}
            columnSizing="fit"
            height={hitRows.length > 6 ? 220 : "auto"}
            emptyMessage="찾는 문구가 없습니다."
            highlightedRowKey={hitRows.find((h) => h.id === sel && h.bi === selB)?.k ?? null}
            onRowClick={(r) => store.select(String(r.id), Number(r.bi))}
          />
        ) : null}
      </CardFrame>

      <AgDataGrid
        gridId="wty-clauses"
        title="조항 구성"
        count={rows.length}
        rowKey="id"
        columns={clauseCols}
        data={rows}
        columnSizing="fit"
        height="auto"
        highlightedRowKey={sel}
        onRowClick={(r) => store.select(String(r.id), 0)}
        onRowOrderChange={lock ? undefined : (keys) => store.edit("조항 순서 변경", (x) => (x.order = keys.map(String)))}
      />
      <Row>
        <Button size="sm" disabled={lock || i <= 0} onClick={() => move(-1)}>
          위로
        </Button>
        <Button size="sm" disabled={lock || i < 0 || i >= d.order.length - 1} onClick={() => move(1)}>
          아래로
        </Button>
        <Hint>행을 끌어도 순서가 바뀝니다.</Hint>
      </Row>

      <BlockList store={store} />
    </Stack>
  );
}

const FIND_COLUMNS: GridColumn[] = [
  { key: "where", header: "조항", width: 110, align: "left" },
  { key: "lab", header: "위치", width: 90, align: "left" },
  { key: "t", header: "문구", width: 260, minWidth: 160, align: "left", tooltip: false, render: (v, row) => snippet(String(v), Number(row.j), Number(row.len)) },
];
