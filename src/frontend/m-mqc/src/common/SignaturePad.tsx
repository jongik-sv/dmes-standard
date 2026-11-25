"use client";

/**
 * 직접 서명 칸 — 마우스·펜·손가락으로 끌어 그리고, 한 획 지우기·모두 지우기 뒤 [서명 적용] 으로 PNG data URL 을 넘긴다.
 * 업무에 묶이지 않는 입력 부품이라 m-mqc 공통에 둔다(shared 등록 후보). 색은 의미 토큰만 쓰고, 잉크 색만 캔버스에 직접 칠한다.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Button } from "@dk-oasis/shared/form";

import { RangeField } from "./RangeField";

export interface SignaturePadProps {
  /** 그린 서명(PNG data URL)을 넘긴다. */
  onApply: (dataUrl: string) => void;
  /** 빈 칸에서 [서명 적용] 을 눌렀을 때. */
  onEmpty?: () => void;
  width?: number;
  height?: number;
}

const BOX: CSSProperties = { position: "relative", border: "1px dashed var(--color-border)", borderRadius: 8, background: "var(--color-bg)" };
const CANVAS: CSSProperties = { width: "100%", height: "auto", display: "block", touchAction: "none", cursor: "crosshair" };
const PH: CSSProperties = { position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "var(--color-text-muted)" };
const BASE: CSSProperties = { position: "absolute", left: "8%", right: "8%", bottom: "26%", borderBottom: "1px solid var(--color-border)", pointerEvents: "none" };
const ROW: CSSProperties = { display: "flex", alignItems: "end", gap: "var(--spacing-sm)", marginTop: "var(--spacing-sm)", flexWrap: "wrap" };
const INK = "#1E2A38";

export function SignaturePad({ onApply, onEmpty, width = 1120, height = 380 }: SignaturePadProps) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const stack = useRef<ImageData[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);
  const [weight, setWeight] = useState(4);
  const [empty, setEmpty] = useState(true);

  const ctx = () => cvRef.current?.getContext("2d") ?? null;
  useEffect(() => {
    const x = ctx();
    if (!x) return;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.strokeStyle = INK;
    x.fillStyle = INK;
  }, []);

  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
  };
  const push = () => {
    const x = ctx();
    const cv = cvRef.current;
    if (!x || !cv) return;
    try {
      stack.current.push(x.getImageData(0, 0, cv.width, cv.height));
    } catch {
      /* 읽을 수 없으면 기록하지 않는다 */
    }
    if (stack.current.length > 24) stack.current.shift();
  };
  const isEmpty = () => {
    const x = ctx();
    const cv = cvRef.current;
    if (!x || !cv) return true;
    try {
      const a = x.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < a.length; i += 4) if (a[i] > 8) return false;
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div>
      <div style={BOX}>
        <canvas
          ref={cvRef}
          width={width}
          height={height}
          style={CANVAS}
          aria-label="서명 칸"
          onPointerDown={(e) => {
            const x = ctx();
            if (!x) return;
            push();
            drawing.current = true;
            setEmpty(false);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* 무시 */
            }
            last.current = pt(e);
            x.lineWidth = weight * 2.2;
            x.beginPath();
            x.arc(last.current.x, last.current.y, x.lineWidth / 2.6, 0, Math.PI * 2);
            x.fill();
          }}
          onPointerMove={(e) => {
            const x = ctx();
            if (!drawing.current || !x || !last.current) return;
            const p = pt(e);
            x.lineWidth = weight * 2.2;
            x.beginPath();
            x.moveTo(last.current.x, last.current.y);
            x.lineTo(p.x, p.y);
            x.stroke();
            last.current = p;
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
        />
        <div style={BASE} />
        {empty ? <div style={PH}>여기에 서명</div> : null}
      </div>
      <div style={ROW}>
        <div style={{ width: 180 }}>
          <RangeField label="굵기" value={weight} min={2} max={9} onChange={setWeight} />
        </div>
        <span style={{ flex: 1 }} />
        <Button
          onClick={() => {
            const x = ctx();
            const s = stack.current.pop();
            if (!x || !s) return;
            x.putImageData(s, 0, 0);
            setEmpty(isEmpty());
          }}
        >
          한 획 지우기
        </Button>
        <Button
          onClick={() => {
            const x = ctx();
            const cv = cvRef.current;
            if (!x || !cv) return;
            push();
            x.clearRect(0, 0, cv.width, cv.height);
            setEmpty(true);
          }}
        >
          모두 지우기
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (isEmpty()) onEmpty?.();
            else onApply(cvRef.current!.toDataURL("image/png"));
          }}
        >
          서명 적용
        </Button>
      </div>
    </div>
  );
}
