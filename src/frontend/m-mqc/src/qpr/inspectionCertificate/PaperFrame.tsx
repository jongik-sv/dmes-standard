"use client";

/**
 * A4 가로 종이 미리보기 — 목업 종이 HTML 을 격리된 iframe 에 그린다(양식 CSS 가 포털 화면으로 새지 않게).
 * iframe 문서(글꼴·양식 CSS)는 한 번만 만들고, 값이 바뀌면 종이 본문만 바꿔 넣는다. 폭에 맞춰 줄이고(최대 1.25배),
 * `print()` 는 iframe 문서만 인쇄한다(인쇄 창에서 「PDF로 저장」 → A4 가로 한 장).
 */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from "react";

import { frameDoc, PAPER_H, PAPER_W, type PaperAssets } from "./paperAssets";

export interface PaperFrameHandle {
  print(fileName: string): void;
}

const PAD = 16;
const FRAME_STYLE: CSSProperties = { display: "block", width: "100%", border: 0, background: "transparent" };

export function PaperFrame({ ref, assets, html, className }: { ref?: Ref<PaperFrameHandle>; assets: PaperAssets; html: string; className: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  // 문서는 처음 한 번만 만든다(글꼴 data URL 을 다시 읽지 않게).
  const [srcDoc] = useState(() => frameDoc(assets, "검사증명서"));

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

  const scale = width > 0 ? Math.min(1.25, (width - PAD * 2) / PAPER_W) : 0.6;
  const height = Math.ceil(PAPER_H * scale + PAD * 2);

  useEffect(() => {
    if (!ready) return;
    const doc = frameRef.current?.contentDocument;
    const paper = doc?.getElementById("paper");
    const ps = doc?.getElementById("ps");
    if (!paper || !ps) return;
    paper.className = className;
    paper.innerHTML = html;
    paper.style.transform = `scale(${scale})`;
    ps.style.width = `${PAPER_W * scale}px`;
    ps.style.height = `${PAPER_H * scale}px`;
  }, [ready, html, className, scale]);

  useImperativeHandle(
    ref,
    () => ({
      print(fileName: string) {
        const win = frameRef.current?.contentWindow;
        if (!win) return;
        win.document.title = fileName;
        win.focus();
        win.print();
      },
    }),
    [],
  );

  return (
    <iframe
      ref={frameRef}
      title="검사증명서 종이 미리보기"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-modals"
      onLoad={() => setReady(true)}
      style={{ ...FRAME_STYLE, height }}
      data-testid="mtc-paper-frame"
    />
  );
}
