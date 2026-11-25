"use client";

/**
 * 코일 SVG — 작은 것(띠 칸)과 큰 것(상세: 폭 치수선·단면 확대 원). shape-svg.js renderCoil 의 React 이식.
 */
import { useId } from "react";

import type { ShapeScene } from "../types";
import { CUT, SIZES, fmtMm, layerColor, layerDesc, layerHeights, layerThkText, surfaceOf, surfaceTones, type CoilSize } from "./svg";

export interface CoilSvgProps {
  scene: ShapeScene;
  size: CoilSize;
  /** 몸통 길이(px). coilLengths 결과. */
  length?: number;
}

export function CoilSvg({ scene, size, length }: CoilSvgProps) {
  const uid = "mqc-coil-" + useId().replace(/[^a-zA-Z0-9-]/g, "");
  const sz = SIZES[size];
  const len = length ?? sz.maxLen;
  const surf = surfaceTones(surfaceOf(scene));
  const x0 = sz.x0;
  const x1 = x0 + len;
  const cy = sz.cy;
  const title = `${scene.title} 코일, 두께 ${fmtMm(scene.geometry.thkMm)} mm, 폭 ${fmtMm(scene.geometry.widMm)} mm`;
  const dy = cy + sz.ry + 16;

  const sub: string[] = [];
  if (scene.geometry.idMm != null) sub.push("내경 " + fmtMm(scene.geometry.idMm));
  if (scene.geometry.weightT != null) sub.push("단중 " + scene.geometry.weightT.toFixed(1) + "t");

  return (
    <svg
      className={`mqc-shape-coil mqc-shape-coil-${size}`}
      viewBox={`0 0 ${sz.w} ${sz.h}`}
      role="img"
      aria-labelledby={`${uid}-t ${uid}-d`}
    >
      <title id={`${uid}-t`}>{title}</title>
      <desc id={`${uid}-d`}>{layerDesc(scene)}</desc>
      <defs>
        <linearGradient id={`${uid}-g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={surf.body[0]} />
          <stop offset=".6" stopColor={surf.body[1]} />
          <stop offset="1" stopColor={surf.body[2]} />
        </linearGradient>
        {size === "lg" ? (
          <clipPath id={`${uid}-c`}>
            <circle cx={CUT.cx} cy={CUT.cy} r={CUT.r} />
          </clipPath>
        ) : null}
      </defs>
      <rect x={x0} y={cy - sz.ry} width={len} height={sz.ry * 2} fill={`url(#${uid}-g)`} />
      <ellipse cx={x1} cy={cy} rx={sz.rx} ry={sz.ry} fill={surf.body[1]} />
      <ellipse cx={x0} cy={cy} rx={sz.rx} ry={sz.ry} fill={surf.face[0]} stroke={surf.face[2]} />
      {[0.72, 0.5, 0.3].map((k) => (
        <ellipse key={k} cx={x0} cy={cy} rx={+(sz.rx * k).toFixed(1)} ry={+(sz.ry * k).toFixed(1)} fill="none" stroke={surf.face[1]} />
      ))}
      <ellipse cx={x0} cy={cy} rx={+(sz.rx * 0.28).toFixed(1)} ry={+(sz.ry * 0.28).toFixed(1)} fill={surf.face[2]} />

      {size === "lg" ? (
        <>
          <line x1={x0} y1={dy} x2={x1} y2={dy} className="mqc-shape-dim" />
          <line x1={x0} y1={dy - 5} x2={x0} y2={dy + 5} className="mqc-shape-dim" />
          <line x1={x1} y1={dy - 5} x2={x1} y2={dy + 5} className="mqc-shape-dim" />
          <text x={(x0 + x1) / 2} y={dy + 16} textAnchor="middle" className="mqc-shape-txt">
            폭 {fmtMm(scene.geometry.widMm)}
          </text>
          {sub.length ? (
            <text x={(x0 + x1) / 2} y={dy + 30} textAnchor="middle" className="mqc-shape-txt mqc-shape-txt-dim">
              {sub.join(" · ")}
            </text>
          ) : null}
          <line x1={x1 - 10} y1={cy - sz.ry + 8} x2={CUT.cx - 40} y2={CUT.cy - 32} className="mqc-shape-lead" />
          <circle cx={CUT.cx} cy={CUT.cy} r={CUT.r} className="mqc-shape-cut" />
          <text x={CUT.cx} y={CUT.cy - CUT.r - 6} textAnchor="middle" className="mqc-shape-txt mqc-shape-txt-acc">
            단면 확대
          </text>
          <g clipPath={`url(#${uid}-c)`}>
            <CutawayLayers scene={scene} />
          </g>
          <text x={CUT.cx} y={CUT.cy + CUT.r + 22} textAnchor="middle" className="mqc-shape-txt mqc-shape-txt-dim">
            두께 눈금은 과장 · 숫자는 원값
          </text>
        </>
      ) : null}
    </svg>
  );
}

function CutawayLayers({ scene }: { scene: ShapeScene }) {
  const hs = layerHeights(scene.layers, CUT.innerH);
  const total = hs.reduce((a, b) => a + b, 0);
  let y = CUT.cy - total / 2;
  return (
    <>
      {scene.layers.map((l, i) => {
        const top = y;
        y += hs[i];
        return (
          <g key={l.id + i}>
            <rect x={CUT.x} y={+top.toFixed(1)} width={CUT.w} height={hs[i]} fill={layerColor(l, scene)} className="mqc-shape-layer">
              <title>{l.label + " " + layerThkText(l)}</title>
            </rect>
            {l.kind === "substrate" && hs[i] >= 14 ? (
              <text x={CUT.cx} y={+(top + hs[i] / 2 + 3.5).toFixed(1)} textAnchor="middle" className="mqc-shape-txt mqc-shape-txt-onink">
                {layerThkText(l)}
              </text>
            ) : null}
          </g>
        );
      })}
    </>
  );
}
