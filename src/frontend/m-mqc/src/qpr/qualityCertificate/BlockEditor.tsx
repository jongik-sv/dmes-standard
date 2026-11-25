"use client";

/**
 * 블록 편집 — 고른 조항의 블록(문단·그림·2단·표)을 고치고, 끌어서 순서를 바꾸고, 2단으로 묶거나 1단으로 나눈다.
 * 블록은 정해진 틀 안에서만 조합되므로 무엇을 쌓아도 문서가 깨지지 않는다. 변수 칩을 누르면 커서 자리에 `{{변수}}` 가 들어간다.
 */
import { useId, useRef, useState, type CSSProperties } from "react";

import { Badge, Button, Checkbox, Input, Select, Textarea, type BadgeTone } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { RangeField } from "@/common/RangeField";
import { Hint, Row, Stack } from "@/common/ui";

import { AKEYS, ALIGNS, ASSETS, KIND, T, VAR_NAMES, meta, type Block, type BlockKind, type Half, type ImageBlock, type LText, type WtyDoc } from "./engine/data";
import { clauseOf, cur } from "./engine/doc";
import type { WtyStore } from "./store";

const TONE: Record<BlockKind, BadgeTone> = { text: "primary", image: "warning", two: "neutral", table: "success" };
const CARD: CSSProperties = { border: "1px solid var(--color-border)", borderRadius: 7, background: "var(--color-bg)", overflow: "hidden" };
const CARD_SEL: CSSProperties = { ...CARD, borderColor: "var(--color-primary)", boxShadow: "0 0 0 2px var(--color-primary-soft)" };
const HEAD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-xs)",
  padding: "6px 9px",
  background: "var(--color-bg-light)",
  borderBottom: "1px solid var(--color-border-light)",
  cursor: "grab",
};
const SUM: CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" };
const BODY: CSSProperties = { padding: 9, display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" };
const HALF: CSSProperties = { border: "1px dashed var(--color-border)", borderRadius: 6, padding: 8, display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" };
const GRIP: CSSProperties = { color: "var(--color-text-muted)", userSelect: "none" };
const CHIPS: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4 };

const mergeable = (b: Block | undefined) => !!b && (b.t === "text" || b.t === "image");
const toHalf = (b: Block): Half => (b.t === "image" ? { t: "image", k: b.k } : { t: "text", c: { ...(b as { c: LText }).c } });
const toBlock = (x: Half): Block => (x.t === "image" ? { t: "image", k: x.k, w: 300, al: "center", dy: 0 } : { t: "text", c: { ...x.c } });

function summary(b: Block, lang: string) {
  if (b.t === "text") return cur(b.c, lang).slice(0, 34);
  if (b.t === "image") return ASSETS[b.k]?.nm ?? b.k;
  if (b.t === "two") return "그림·글 2단";
  return `${b.rows.length}행 ${b.rows[0]?.length ?? 0}열`;
}

/** 변수 칩 — 누르면 `{{이름}}` 을 넘긴다. */
function VarChips({ onPick, disabled }: { onPick: (name: string) => void; disabled?: boolean }) {
  return (
    <div style={CHIPS}>
      {VAR_NAMES.map((v) => (
        <Button key={v} size="mini" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(v)}>
          {`{{${v}}}`}
        </Button>
      ))}
    </div>
  );
}

/** 커서 자리에 글을 넣는다. 입력 칸을 못 찾으면 끝에 붙인다. */
function insertAt(id: string, value: string, tok: string, set: (v: string) => void) {
  const el = typeof document === "undefined" ? null : (document.getElementById(id) as HTMLTextAreaElement | HTMLInputElement | null);
  const at = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? at;
  set(value.slice(0, at) + tok + value.slice(end));
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(at + tok.length, at + tok.length);
  });
}

function TextEdit({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const id = useId();
  return (
    <>
      <Textarea id={id} rows={4} value={value} disabled={disabled} spellCheck={false} aria-label="문단 글" onChange={onChange} />
      <VarChips disabled={disabled} onPick={(v) => insertAt(id, value, `{{${v}}}`, onChange)} />
    </>
  );
}

type Edit = (msg: string, fn: (b: Block, all: Block[]) => void) => void;

function ImageEdit({ b, inCol, edit, disabled }: { b: ImageBlock | Half; inCol: boolean; edit: (fn: (x: ImageBlock) => void) => void; disabled: boolean }) {
  const ib = b as ImageBlock;
  return (
    <>
      <Row>
        <Select
          aria-label="그림"
          value={ib.k}
          disabled={disabled}
          options={AKEYS.map((k) => ({ value: k, label: ASSETS[k].nm }))}
          onChange={(v) => edit((x) => (x.k = v))}
        />
        {inCol ? null : (
          <Select
            aria-label="배치"
            value={ib.al || "center"}
            disabled={disabled}
            options={ALIGNS.map(([value, label]) => ({ value, label }))}
            onChange={(v) => edit((x) => (x.al = v))}
          />
        )}
      </Row>
      {inCol ? null : (
        <>
          <RangeField label="최대 폭" unit="px" min={140} max={520} step={10} value={ib.w || 300} disabled={disabled} onChange={(v) => edit((x) => (x.w = v))} />
          <RangeField
            label="세로 위치"
            unit="px"
            min={-60}
            max={160}
            step={2}
            value={ib.dy || 0}
            disabled={disabled}
            onChange={(v) => edit((x) => (x.dy = v))}
            onReset={() => edit((x) => (x.dy = 0))}
            resetLabel="0"
          />
          {(ib.al || "").startsWith("fl-") ? <Hint>감쌀 글은 이 블록 아래에 있는 문단입니다. 그림 블록을 글 블록 위로 끌어 올리세요.</Hint> : null}
        </>
      )}
    </>
  );
}

function HalfEdit({ x, side, lang, edit, disabled }: { x: Half; side: "L" | "R"; lang: string; edit: Edit; disabled: boolean }) {
  const setHalf = (fn: (h: Half) => Half | void) =>
    edit("2단 칸 수정", (b) => {
      const tb = b as Extract<Block, { t: "two" }>;
      const r = fn(tb[side]);
      if (r) tb[side] = r;
    });
  return (
    <div style={HALF}>
      <Row>
        <MutedText>{side === "L" ? "왼쪽" : "오른쪽"}</MutedText>
        <Select
          aria-label={`${side === "L" ? "왼쪽" : "오른쪽"} 칸 종류`}
          value={x.t}
          disabled={disabled}
          options={[
            { value: "text", label: "문단" },
            { value: "image", label: "그림" },
          ]}
          onChange={(v) => setHalf(() => (v === "image" ? { t: "image", k: AKEYS[0] } : { t: "text", c: T("새 문단", "New paragraph") }))}
        />
      </Row>
      {x.t === "image" ? (
        <ImageEdit b={x} inCol disabled={disabled} edit={(fn) => setHalf((h) => void fn(h as unknown as ImageBlock))} />
      ) : (
        <TextEdit value={cur(x.c, lang)} disabled={disabled} onChange={(v) => setHalf((h) => void ((h as { c: LText }).c[lang as keyof LText] = v))} />
      )}
    </div>
  );
}

function TableEdit({ b, lang, edit, disabled }: { b: Extract<Block, { t: "table" }>; lang: string; edit: Edit; disabled: boolean }) {
  const id = useId();
  const last = useRef<[number, number]>([0, 0]);
  const cols = b.rows[0]?.length ?? 1;
  const setCell = (ri: number, ci: number, v: string) =>
    edit("표 칸 수정", (x) => {
      (x as typeof b).rows[ri][ci][lang as keyof LText] = v;
    });
  const tbl = (fn: (x: typeof b) => void, msg = "표 모양 수정") => edit(msg, (x) => fn(x as typeof b));
  return (
    <>
      <Row>
        <Checkbox label="첫 줄을 머리글로" checked={b.head} disabled={disabled} onChange={(v) => tbl((x) => (x.head = v))} />
        <span style={{ flex: 1 }} />
        <Button size="sm" disabled={disabled} onClick={() => tbl((x) => x.rows.push(x.rows[0].map(() => T("", ""))))}>
          행 +
        </Button>
        <Button size="sm" disabled={disabled || b.rows.length <= 1} onClick={() => tbl((x) => void x.rows.pop())}>
          행 −
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => tbl((x) => x.rows.forEach((r) => r.push(T("", ""))))}>
          열 +
        </Button>
        <Button size="sm" disabled={disabled || cols <= 1} onClick={() => tbl((x) => x.rows.forEach((r) => r.pop()))}>
          열 −
        </Button>
      </Row>
      <div style={{ display: "grid", gap: 4, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {b.rows.map((row, ri) =>
          row.map((cell, ci) => (
            <Input
              key={`${ri}.${ci}`}
              id={`${id}-${ri}-${ci}`}
              aria-label={`${ri + 1}행 ${ci + 1}열`}
              value={cur(cell, lang)}
              disabled={disabled}
              style={b.head && ri === 0 ? { fontWeight: 700 } : undefined}
              onFocus={() => (last.current = [ri, ci])}
              onChange={(v) => setCell(ri, ci, v)}
            />
          )),
        )}
      </div>
      <VarChips
        disabled={disabled}
        onPick={(v) => {
          const [ri, ci] = last.current[0] < b.rows.length && last.current[1] < cols ? last.current : [0, 0];
          insertAt(`${id}-${ri}-${ci}`, cur(b.rows[ri][ci], lang), `{{${v}}}`, (val) => setCell(ri, ci, val));
        }}
      />
    </>
  );
}

function BlockBody({ b, lang, edit, disabled }: { b: Block; lang: string; edit: Edit; disabled: boolean }) {
  if (b.t === "text") return <TextEdit value={cur(b.c, lang)} disabled={disabled} onChange={(v) => edit("문단 수정", (x) => ((x as typeof b).c[lang as keyof LText] = v))} />;
  if (b.t === "image") return <ImageEdit b={b} inCol={false} disabled={disabled} edit={(fn) => edit("그림 블록 수정", (x) => fn(x as ImageBlock))} />;
  if (b.t === "two")
    return (
      <>
        <RangeField
          label="왼쪽 칸 비율"
          unit="%"
          min={20}
          max={80}
          step={5}
          value={b.ratio || 40}
          disabled={disabled}
          onChange={(v) => edit("2단 비율 수정", (x) => ((x as typeof b).ratio = v))}
        />
        <Row>
          <MutedText>세로 맞춤</MutedText>
          <Select
            aria-label="세로 맞춤"
            value={b.va || "start"}
            disabled={disabled}
            options={[
              { value: "start", label: "위" },
              { value: "center", label: "가운데" },
              { value: "end", label: "아래" },
            ]}
            onChange={(v) => edit("2단 맞춤 수정", (x) => ((x as typeof b).va = v))}
          />
        </Row>
        <HalfEdit x={b.L} side="L" lang={lang} edit={edit} disabled={disabled} />
        <HalfEdit x={b.R} side="R" lang={lang} edit={edit} disabled={disabled} />
      </>
    );
  return <TableEdit b={b} lang={lang} edit={edit} disabled={disabled} />;
}

const NEW: Record<BlockKind, () => Block> = {
  text: () => ({ t: "text", c: T("새 문단입니다. 변수를 넣어보세요.", "New paragraph.") }),
  image: () => ({ t: "image", k: AKEYS[0], w: 300, al: "center" }),
  two: () => ({ t: "two", ratio: 40, L: { t: "image", k: AKEYS[0] }, R: { t: "text", c: T("그림 옆에 들어갈 설명입니다.", "Text beside the figure.") } }),
  table: () => ({
    t: "table",
    head: true,
    rows: [
      [T("항목", "Item"), T("기준", "Standard")],
      [T("", ""), T("", "")],
    ],
  }),
};

export function BlockList({ store }: { store: WtyStore }) {
  const { showMessage } = useMessage();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<{ i: number; top: boolean } | null>(null);
  const d = store.doc!;
  const { sel, selB } = store.ui;
  const c = clauseOf(d, sel);
  const lock = store.locked;
  if (!c) return null;
  const blocks = c.b;
  const inClause = (msg: string, fn: (arr: Block[], x: WtyDoc) => void) => store.edit(msg, (x) => fn(clauseOf(x, sel)!.b, x));
  const editAt =
    (i: number): Edit =>
    (msg, fn) =>
      inClause(msg, (arr) => fn(arr[i], arr));

  const add = (k: BlockKind) => {
    inClause(`${KIND[k]} 블록 추가`, (arr) => arr.push(NEW[k]()));
    store.select(sel, blocks.length - 1);
  };
  const del = (i: number) => {
    if (blocks.length <= 1) {
      showMessage({ message: "조항에는 블록이 하나 이상 있어야 합니다.", alertType: "warning" });
      return;
    }
    inClause("블록 삭제", (arr) => arr.splice(i, 1));
    store.select(sel, Math.min(i, blocks.length - 1));
  };
  const split = (i: number) => {
    inClause("2단 블록 1단 분리", (arr) => {
      const b = arr[i];
      if (b.t === "two") arr.splice(i, 1, toBlock(b.L), toBlock(b.R));
    });
    store.select(sel, i);
  };
  const merge = (i: number) => {
    inClause("두 블록 2단으로 묶기", (arr) => {
      if (mergeable(arr[i]) && mergeable(arr[i + 1])) arr.splice(i, 2, { t: "two", ratio: 40, va: "start", L: toHalf(arr[i]), R: toHalf(arr[i + 1]) });
    });
    store.select(sel, i);
  };
  const drop = (to: number, top: boolean) => {
    const from = drag;
    setDrag(null);
    setOver(null);
    if (from == null || from === to) return;
    let at = from;
    inClause("블록 순서 변경", (arr) => {
      const [m] = arr.splice(from, 1);
      at = Math.max(0, Math.min(arr.length, to > from ? (top ? to - 1 : to) : top ? to : to + 1));
      arr.splice(at, 0, m);
    });
    store.select(sel, at);
  };

  return (
    <CardFrame title={`블록 편집 — ${meta(sel)?.t ?? sel}`}>
      <Stack>
        {blocks.map((b, i) => {
          const ov = over?.i === i && drag !== i ? { boxShadow: `inset 0 ${over.top ? 3 : -3}px 0 var(--color-primary)` } : null;
          return (
            <div
              key={`${sel}.${i}.${b.t}`}
              data-testid={`wty-block-${i}`}
              style={{ ...(selB === i ? CARD_SEL : CARD), ...(drag === i ? { opacity: 0.35 } : null), ...ov }}
              onMouseDown={() => selB !== i && store.select(sel, i)}
              onDragOver={(e) => {
                if (drag == null) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setOver({ i, top: e.clientY - r.top < r.height / 2 });
              }}
              onDrop={(e) => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                drop(i, e.clientY - r.top < r.height / 2);
              }}
            >
              <div
                style={HEAD}
                draggable={!lock}
                onDragStart={(e) => {
                  setDrag(i);
                  e.dataTransfer.effectAllowed = "move";
                  try {
                    e.dataTransfer.setData("text/plain", "b");
                  } catch {
                    /* 무시 */
                  }
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
              >
                <span style={GRIP} aria-hidden="true">
                  ⠿
                </span>
                <Badge tone={TONE[b.t]} label={KIND[b.t]} />
                <span style={SUM}>{summary(b, d.lang)}</span>
                {b.t === "two" ? (
                  <Button size="mini" disabled={lock} title="왼쪽·오른쪽을 각각 1단 블록으로 나눕니다" onClick={() => split(i)}>
                    ↔ 1단 분리
                  </Button>
                ) : null}
                {mergeable(b) && mergeable(blocks[i + 1]) ? (
                  <Button size="mini" disabled={lock} title="바로 아래 블록과 묶어 좌우 2단으로 만듭니다" onClick={() => merge(i)}>
                    ↓ 아래와 2단
                  </Button>
                ) : null}
                <Button size="mini" disabled={lock} ariaLabel="블록 삭제" title="블록 삭제" onClick={() => del(i)}>
                  ✕
                </Button>
              </div>
              <div style={BODY}>
                <BlockBody b={b} lang={d.lang} edit={editAt(i)} disabled={lock} />
              </div>
            </div>
          );
        })}
        <Row>
          {(["text", "image", "two", "table"] as BlockKind[]).map((k) => (
            <Button key={k} size="sm" disabled={lock} onClick={() => add(k)}>
              + {KIND[k]}
            </Button>
          ))}
        </Row>
        <Hint>블록은 정해진 틀 안에서만 조합됩니다. 그래서 무엇을 쌓아도 문서가 깨지지 않고, 내용이 길어지면 알아서 다음 쪽으로 넘어갑니다.</Hint>
      </Stack>
    </CardFrame>
  );
}
