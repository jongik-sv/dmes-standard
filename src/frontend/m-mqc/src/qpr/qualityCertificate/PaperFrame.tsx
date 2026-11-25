"use client";

/**
 * A4 세로 종이 — 목업 종이 HTML 을 iframe 에 그린다(종이 CSS·글꼴이 포털 화면으로 새지 않게).
 * 그린 뒤 iframe 안에서 높이를 재어 서명 고정(pinTail)·쪽 경계·쪽수를 계산하고, 폭에 맞춰 줄인다(최대 1배).
 * live 모드에서는 종이의 블록을 누르면 고르고(onPick), 같은 조항 안에서 끌어 순서를 바꾼다(onMove). 머리·제목·서명을 누르면 그 탭으로(onGo).
 * iframe 안에는 스크립트가 없다 — 이벤트는 화면이 iframe 문서에 직접 단다. `print()` 는 iframe 문서만 인쇄한다.
 */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from "react";

import { MM, PAGE_H, PAPER_W } from "./engine/data";
import { frameDoc } from "./paperCss";

export interface PaperFrameHandle {
  print(title: string): void;
  /** 블록(`조항|블록`)을 강조하고 iframe 위쪽에서의 세로 위치(px)를 돌려준다. 없으면 null. */
  focusBlock(key: string | null): number | null;
}

export interface PaperFrameProps {
  ref?: Ref<PaperFrameHandle>;
  /** 종이 안 HTML(띠 + 문서). */
  html: string;
  mode: "live" | "cmpA" | "cmpB";
  /** 회사명·서명을 마지막 쪽 아래로. */
  pin: boolean;
  /** 여백(mm) — 서명 고정 계산. */
  margin: number;
  title: string;
  testId?: string;
  onPages?: (n: number) => void;
  onPick?: (cid: string, bi: number) => void;
  onGo?: (tab: string) => void;
  onMove?: (cid: string, from: number, to: number, top: boolean) => void;
}

const PAD = 16;
const FRAME_STYLE: CSSProperties = { display: "block", width: "100%", border: 0, background: "transparent" };

/** 서명 고정 — 본문 끝과 서명 사이 빈칸(tailpad)을 늘려 서명·발행일 줄을 마지막 쪽 맨 아래에 붙인다(목업 pinTail). */
function pinTail(root: HTMLElement, pad: number, on: boolean) {
  const tp = root.querySelector<HTMLElement>(".tailpad");
  if (!tp) return;
  tp.style.height = "0px";
  if (!on) return;
  const doc = root.querySelector<HTMLElement>(".doc");
  const meta = doc?.querySelector<HTMLElement>(".meta");
  if (!doc || !meta) return;
  let add = 0;
  for (let i = 0; i < 4; i++) {
    const pg = Math.max(1, Math.ceil(root.scrollHeight / PAGE_H));
    const target = pg * PAGE_H - pad - 2;
    const now = doc.offsetTop + meta.offsetTop + meta.offsetHeight;
    const d = target - now;
    if (d <= 1) break;
    add += d;
    tp.style.height = `${add}px`;
  }
}

export function PaperFrame(props: PaperFrameProps) {
  const { ref, html, mode, pin, margin, title, testId } = props;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const cb = useRef(props);
  cb.current = props;
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(PAGE_H * 0.6);
  const [srcDoc] = useState(() => frameDoc(title, mode));

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? Math.min(1, (width - PAD * 2) / PAPER_W) : 0.6;

  // 종이 다시 그리기 → 서명 고정 → 높이·쪽수 재기.
  useEffect(() => {
    if (!ready) return;
    const doc = frameRef.current?.contentDocument;
    const paper = doc?.getElementById("paper");
    const ps = doc?.getElementById("ps");
    if (!doc || !paper || !ps) return;
    paper.innerHTML = `<div class="breaks"></div>${html}`;
    const layout = () => {
      pinTail(paper, margin * MM, pin);
      paper.style.transform = `scale(${scale})`;
      const h = paper.scrollHeight;
      const pg = Math.max(1, Math.ceil(h / PAGE_H));
      const br = paper.querySelector(".breaks");
      if (br) {
        let t = "";
        for (let i = 1; i < pg; i++) t += `<div class="brk" style="top:${i * PAGE_H}px"><span>${i} / ${pg} 쪽 경계</span></div>`;
        br.innerHTML = t;
      }
      ps.style.width = `${PAPER_W * scale}px`;
      ps.style.height = `${h * scale}px`;
      setHeight(Math.ceil(h * scale + PAD * 2));
      cb.current.onPages?.(pg);
    };
    layout();
    // 그림(data URL)이 늦게 읽히면 다시 잰다.
    const imgs = [...paper.querySelectorAll("img")].filter((x) => !x.complete);
    imgs.forEach((x) => x.addEventListener("load", layout, { once: true }));
    // 글꼴이 늦게 오면 높이가 바뀐다.
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
    let alive = true;
    fonts?.ready.then(() => alive && layout()).catch(() => undefined);
    return () => {
      alive = false;
      imgs.forEach((x) => x.removeEventListener("load", layout));
    };
  }, [ready, html, scale, pin, margin]);

  // live — 누르기·끌어 옮기기.
  useEffect(() => {
    if (!ready || mode !== "live") return;
    const doc = frameRef.current?.contentDocument;
    const paper = doc?.getElementById("paper");
    if (!doc || !paper) return;
    let drag: { c: string; b: number } | null = null;
    const clear = () => paper.querySelectorAll(".dz-top,.dz-bot,.dz-drag").forEach((x) => x.classList.remove("dz-top", "dz-bot", "dz-drag"));
    const blockOf = (t: EventTarget | null) => (t instanceof doc.defaultView!.Element ? t.closest<HTMLElement>("[data-b]") : null);
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof doc.defaultView!.Element ? e.target : null;
      const el = t?.closest<HTMLElement>("[data-b]");
      if (el?.dataset.c) {
        cb.current.onPick?.(el.dataset.c, Number(el.dataset.b));
        return;
      }
      const go = t?.closest<HTMLElement>("[data-go]");
      if (go?.dataset.go) cb.current.onGo?.(go.dataset.go);
    };
    const onStart = (e: DragEvent) => {
      const el = blockOf(e.target);
      if (!el || !cb.current.onMove) {
        e.preventDefault();
        return;
      }
      drag = { c: el.dataset.c ?? "", b: Number(el.dataset.b) };
      el.classList.add("dz-drag");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", "pb");
        } catch {
          /* 일부 브라우저는 막는다 */
        }
      }
    };
    const onOver = (e: DragEvent) => {
      if (!drag) return;
      const el = blockOf(e.target);
      clear();
      paper.querySelector(`[data-c="${drag.c}"][data-b="${drag.b}"]`)?.classList.add("dz-drag");
      if (!el || el.dataset.c !== drag.c) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
        return;
      }
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (Number(el.dataset.b) === drag.b) return;
      const r = el.getBoundingClientRect();
      el.classList.add(e.clientY - r.top < r.height / 2 ? "dz-top" : "dz-bot");
    };
    const onDrop = (e: DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      const el = blockOf(e.target);
      const from = drag;
      drag = null;
      clear();
      if (el && el.dataset.c === from.c) {
        const to = Number(el.dataset.b);
        const r = el.getBoundingClientRect();
        if (to !== from.b) cb.current.onMove?.(from.c, from.b, to, e.clientY - r.top < r.height / 2);
      }
    };
    const onEnd = () => {
      drag = null;
      clear();
    };
    paper.addEventListener("click", onClick);
    paper.addEventListener("dragstart", onStart);
    paper.addEventListener("dragover", onOver);
    paper.addEventListener("drop", onDrop);
    paper.addEventListener("dragend", onEnd);
    return () => {
      paper.removeEventListener("click", onClick);
      paper.removeEventListener("dragstart", onStart);
      paper.removeEventListener("dragover", onOver);
      paper.removeEventListener("drop", onDrop);
      paper.removeEventListener("dragend", onEnd);
    };
  }, [ready, mode]);

  useImperativeHandle(
    ref,
    () => ({
      print(t: string) {
        const win = frameRef.current?.contentWindow;
        if (!win) return;
        win.document.title = t;
        win.focus();
        win.print();
      },
      focusBlock(key: string | null) {
        const doc = frameRef.current?.contentDocument;
        if (!doc) return null;
        doc.querySelectorAll(".act").forEach((x) => x.classList.remove("act"));
        if (!key) return null;
        const [c, b] = key.split("|");
        const el = doc.querySelector<HTMLElement>(`[data-c="${c}"][data-b="${b}"]`);
        if (!el) return null;
        el.classList.add("act");
        let top = 0;
        for (let n: HTMLElement | null = el; n && n.id !== "paper"; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
        return PAD + top * scale;
      },
    }),
    [scale],
  );

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={srcDoc}
      onLoad={() => setReady(true)}
      style={{ ...FRAME_STYLE, height }}
      data-testid={testId}
    />
  );
}
