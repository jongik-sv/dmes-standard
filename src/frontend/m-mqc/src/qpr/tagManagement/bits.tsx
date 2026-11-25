"use client";

/** Tag관리 화면 안 작은 표시 부품 — 출처 배지, 조건 글(값만 굵게), 칸 값(그림이면 작은 그림), 섹션 제목. */
import type { ReactNode } from "react";

import { Badge } from "@dk-oasis/shared/form";

import { SRC_NM, SRC_TONE } from "./engine/consts";
import type { Cons } from "./engine/types";
import type { Sim } from "./engine/sim";

export const SrcBadge = ({ src, label }: { src: string; label?: string }) => <Badge tone={SRC_TONE[src] ?? "neutral"} label={label ?? SRC_NM[src] ?? src} />;

export function Cond({ sim, c }: { sim: Sim; c: Record<string, Cons> | null | undefined }) {
  const ps = sim.condParts(c);
  if (!ps.length) return <>조건 없음 — 모든 코일</>;
  return (
    <>
      {ps.map(([a, b], i) => (
        <span key={i}>
          {i ? " · " : ""}
          {a} <b>{b}</b>
        </span>
      ))}
    </>
  );
}

export function Val({ sim, v }: { sim: Sim; v: unknown }) {
  const s = v == null ? "" : String(v);
  if (!s) return <span className="tagm-muted">(빈칸)</span>;
  if (/\.(jpe?g|png)$/i.test(s)) {
    const src = sim.imgSrc(s, sim.S);
    return (
      <>
        {src ? <img src={src} alt="" className="tagm-vimg" /> : null}
        <code>{s}</code>
      </>
    );
  }
  return <>{s}</>;
}

export const H3 = ({ children }: { children: ReactNode }) => <h3 className="tagm-h3">{children}</h3>;
export const Sec = ({ title, children }: { title?: ReactNode; children: ReactNode }) => (
  <div>
    {title ? <H3>{title}</H3> : null}
    {children}
  </div>
);
