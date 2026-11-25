"use client";

/**
 * 변경 전후 비교 — 왼쪽 적용본, 오른쪽 현재 문서를 나란히 놓고 글자 단위로 지운 글자·넣은 글자를 표시한다.
 * ◀ ▶(또는 ← →)로 변경 지점을 오가면 양쪽이 같이 이동하고, 목록에서 골라 바로 갈 수 있다. 「스크롤 같이」 를 켜면 한쪽을 굴릴 때 반대쪽도 따라온다.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Badge, Button, Checkbox, Select } from "@dk-oasis/shared/form";
import { MutedText } from "@dk-oasis/shared/card";
import { Modal } from "@dk-oasis/shared/modal";

import { Row } from "@/common/ui";

import { collectText, docHtml, type CompareCtx } from "./engine/doc";
import { PaperFrame, type PaperFrameHandle } from "./PaperFrame";
import type { WtyStore } from "./store";

const WRAP: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, minHeight: 0 };
const COL: CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0, borderRight: "1px solid var(--color-border)" };
const HEAD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-sm)",
  padding: "6px 12px",
  background: "var(--color-bg-light)",
  borderBottom: "1px solid var(--color-border-light)",
  fontSize: "var(--font-size-sm)",
  fontWeight: 600,
};
const SCROLL: CSSProperties = { height: "calc(80vh - 150px)", minHeight: 320, overflowY: "auto", background: "var(--color-bg-light)" };

export const stateLabel = (s: string) => (s === "APPLIED" ? "승인 완료" : s === "DRAFT" ? "초안 (미승인)" : "승인 대기");

export function CompareModal({ store, onClose }: { store: WtyStore; onClose: () => void }) {
  const d = store.doc!;
  // 적용본도 지금 고른 브랜드·언어·등급으로 그린다(보기 선택은 비교 대상이 아니다).
  const base = useMemo(() => (store.base ? { ...store.base, brand: d.brand, lang: d.lang, grade: d.grade } : null), [store.base, d.brand, d.lang, d.grade]);
  // 연 시점의 문서로 비교한다(열려 있는 동안 고칠 수 없다 — 모달이 화면을 덮는다).
  const view = useMemo(() => {
    const an = store.analysis();
    const txa = base ? collectText(base) : {};
    const txb = collectText(d);
    const ctx = (side: "a" | "b"): CompareCtx => ({ side, map: an, txa, txb });
    return {
      an,
      a: base ? docHtml(base, { ver: store.ver, diff: an.a, cmp: ctx("a") }) : "",
      b: docHtml(d, { ver: store.ver, diff: an.b, cmp: ctx("b") }),
    };
  }, [store, d, base]);
  const pairs = view.an.pairs;
  const [ci, setCi] = useState(-1);
  const [sync, setSync] = useState(true);
  const [pg, setPg] = useState<[number, number]>([1, 1]);
  const fa = useRef<PaperFrameHandle>(null);
  const fb = useRef<PaperFrameHandle>(null);
  const sa = useRef<HTMLDivElement>(null);
  const sb = useRef<HTMLDivElement>(null);
  const lock = useRef(false);

  const go = (i: number) => {
    if (!pairs.length) return;
    const n = (i + pairs.length) % pairs.length;
    setCi(n);
    const p = pairs[n];
    lock.current = true;
    for (const [f, s, key] of [
      [fa, sa, p.ka],
      [fb, sb, p.kb],
    ] as const) {
      const y = f.current?.focusBlock(key);
      if (y != null && s.current) s.current.scrollTop = Math.max(0, y - 110);
    }
    setTimeout(() => (lock.current = false), 150);
  };
  const goRef = useRef(go);
  goRef.current = go;
  const ciRef = useRef(ci);
  ciRef.current = ci;

  // 종이가 그려진 뒤 첫 변경 지점으로.
  useEffect(() => {
    if (!pairs.length) return;
    const t = setTimeout(() => goRef.current(0), 400);
    return () => clearTimeout(t);
  }, [pairs.length]);

  // ← → 로 이동(입력 칸 밖에서).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goRef.current(ciRef.current + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goRef.current(ciRef.current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const link = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (lock.current || !sync || !from || !to) return;
    const ra = from.scrollHeight - from.clientHeight;
    const rb = to.scrollHeight - to.clientHeight;
    if (ra <= 0 || rb <= 0) return;
    lock.current = true;
    to.scrollTop = (from.scrollTop / ra) * rb;
    requestAnimationFrame(() => (lock.current = false));
  };

  const p = ci >= 0 ? pairs[ci] : null;
  const kind = p ? (!p.ka ? "새로 생김" : !p.kb ? "지워짐" : "고쳐짐") : "";

  return (
    <Modal
      open
      size="xl"
      resizable
      draggable
      resizeStorageKey="mqc.qpr.qualityCertificate.compare"
      title="변경 전후 비교"
      onClose={onClose}
      toolbar={
        <Row>
          <Badge tone={pairs.length ? "warning" : "neutral"} label={pairs.length ? `${pairs.length}곳 다름` : "다른 곳 없음"} />
          <Button size="sm" disabled={!pairs.length} onClick={() => go(ci - 1)}>
            ◀ 이전
          </Button>
          <MutedText>{pairs.length ? (ci >= 0 ? `${ci + 1} / ${pairs.length} · ${kind}` : `— / ${pairs.length}`) : "—"}</MutedText>
          <Button size="sm" disabled={!pairs.length} onClick={() => go(ci + 1)}>
            다음 ▶
          </Button>
          <Select
            aria-label="변경 지점 선택"
            value={ci >= 0 ? String(ci) : ""}
            disabled={!pairs.length}
            placeholder={pairs.length ? "변경 지점 고르기" : "변경 없음"}
            options={pairs.map((x, i) => ({ value: String(i), label: `${i + 1}. ${x.lb}` }))}
            onChange={(v) => go(Number(v))}
          />
          <Checkbox label="스크롤 같이" checked={sync} onChange={setSync} />
          <Badge tone="danger" label="지운 글자" />
          <Badge tone="warning" label="넣은 글자" />
        </Row>
      }
    >
      <div style={WRAP}>
        <div style={COL}>
          <div style={HEAD}>
            <Badge tone="danger" label="변경 전" />
            적용본 v{store.ver}
            <span style={{ marginLeft: "auto" }}>{pg[0]}쪽</span>
          </div>
          <div ref={sa} style={SCROLL} onScroll={() => link(sa.current, sb.current)}>
            {base ? (
              <PaperFrame
                ref={fa}
                html={view.a}
                mode="cmpA"
                pin={base.pinSign !== false}
                margin={base.layout.margin}
                title="변경 전 — 적용본"
                onPages={(n) => setPg((x) => (x[0] === n ? x : [n, x[1]]))}
              />
            ) : (
              <MutedText>비교 기준이 없습니다.</MutedText>
            )}
          </div>
        </div>
        <div style={{ ...COL, borderRight: 0 }}>
          <div style={HEAD}>
            <Badge tone="warning" label="변경 후" />
            {store.state === "APPLIED" ? "현재 (변경 없음)" : store.state === "DRAFT" ? "현재 초안" : "승인 대기"}
            <span style={{ marginLeft: "auto" }}>{pg[1]}쪽</span>
          </div>
          <div ref={sb} style={SCROLL} onScroll={() => link(sb.current, sa.current)}>
            <PaperFrame
              ref={fb}
              html={view.b}
              mode="cmpB"
              pin={d.pinSign !== false}
              margin={d.layout.margin}
              title="변경 후 — 현재 문서"
              onPages={(n) => setPg((x) => (x[1] === n ? x : [x[0], n]))}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
