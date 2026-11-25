"use client";

/**
 * 설계 형상 — 원자재 → 압연 → 도금 → (칼라) → 제품 장면 띠와 고른 장면의 상세(큰 코일·단면·층 목록·값과 근거).
 * mes-to-be assets/shape(shape-svg.js·shape.css)의 React 이식. ShapeModel 은 서버가 Maru 룰 결과로 만든다.
 * 값마다 산식과 근거를 보이고, 근거 기준이 있으면 그 기준 화면을 포털 탭으로 연다. ←/→ 로 장면을 옮긴다.
 */
import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Badge } from "@dk-oasis/shared/form";

import { EVIDENCE_KIND_LABEL, EVIDENCE_KIND_TONE, openScreen, ruleRef, screenTitle } from "../format";
import type { ShapeModel, ShapeScene, ShapeValue } from "../types";
import { CoilSvg } from "./CoilSvg";
import { CIRCLED_SCENE, SHAPE_CSS } from "./shape-css";
import { COLORS, LEGEND, changeDetail, changeLine, coilLengths, geoLine, layerColor, layerThkText, valueText } from "./svg";

export interface ShapeViewProps {
  model: ShapeModel;
  /** 처음 고를 장면(기본 압연). */
  initialScene?: ShapeScene["id"];
}

export const ShapeView = memo(function ShapeView({ model, initialScene = "rolled" }: ShapeViewProps) {
  const scenes = model.scenes ?? [];
  const [selId, setSelId] = useState<string>(() =>
    scenes.some((s) => s.id === initialScene) ? initialScene : (scenes[0]?.id ?? ""),
  );
  const [expanded, setExpanded] = useState(false);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sel = scenes.find((s) => s.id === selId) ?? scenes[0];
  const small = useMemo(() => coilLengths(model, "sm"), [model]);

  const move = useCallback(
    (delta: number) => {
      if (!sel) return;
      const i = scenes.findIndex((s) => s.id === sel.id);
      const next = scenes[Math.max(0, Math.min(scenes.length - 1, i + delta))];
      if (next) {
        setSelId(next.id);
        tabRefs.current[next.id]?.focus();
      }
    },
    [scenes, sel],
  );

  const onKey = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelId(id);
    }
  };

  if (!sel) return <div className="mqc-shape-empty">설계 형상이 없습니다.</div>;

  return (
    <div className={`mqc-shape-root${expanded ? " expanded" : ""}`}>
      <style href="mqc-shape" precedence="default">
        {SHAPE_CSS}
      </style>
      {model.warnings?.length ? (
        <div className="mqc-shape-warns">
          {model.warnings.map((w) => (
            <span key={w} className="mqc-shape-warn">
              {w}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mqc-shape-strip" role="tablist" aria-label="설계 장면">
        {scenes.map((s, i) => {
          const on = s.id === sel.id;
          return (
            <div key={s.id} className="mqc-shape-cell">
              {i > 0 ? (
                <div className="mqc-shape-arr" aria-hidden="true">
                  →
                </div>
              ) : null}
              <div
                ref={(el) => {
                  tabRefs.current[s.id] = el;
                }}
                className={`mqc-shape-sc${on ? " on" : ""}`}
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                data-scene={s.id}
                onClick={() => setSelId(s.id)}
                onDoubleClick={() => setExpanded((v) => !v)}
                onKeyDown={(e) => onKey(e, s.id)}
              >
                <div className="mqc-shape-sc-t">
                  {CIRCLED_SCENE[i] ?? i + 1} {s.title}
                  {s.process ? <small>{`${s.process.code} ${s.process.name}`}</small> : null}
                </div>
                <CoilSvg scene={s} size="sm" length={small[s.id]} />
                <div className="mqc-shape-sc-g">{geoLine(s)}</div>
                <div className="mqc-shape-sc-d">{changeLine(s) || " "}</div>
              </div>
            </div>
          );
        })}
      </div>
      <SceneDetail scene={sel} index={scenes.findIndex((s) => s.id === sel.id)} />
      <div className="mqc-shape-legend">
        {LEGEND.map(([k, n]) => (
          <span key={k}>
            <i style={{ background: COLORS[k] }} />
            {n}
          </span>
        ))}
      </div>
    </div>
  );
});

function SceneDetail({ scene, index }: { scene: ShapeScene; index: number }) {
  const ch = changeDetail(scene);
  const head =
    (CIRCLED_SCENE[index] ?? index + 1) + " " + scene.title + (scene.process ? ` · ${scene.process.code} ${scene.process.name}` : "");
  return (
    <div className="mqc-shape-det">
      <div className="mqc-shape-fig">
        <CoilSvg scene={scene} size="lg" />
        <ul className="mqc-shape-layers">
          {scene.layers.map((l, i) => (
            <li key={l.id + i}>
              <i style={{ background: layerColor(l, scene) }} />
              <span>{l.label}</span>
              <b>{layerThkText(l)}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="mqc-shape-vals">
        <div className="mqc-shape-det-h">
          <b>{head}</b>
          {ch ? <span className="mqc-shape-delta">{ch}</span> : null}
          <span className="mqc-shape-note">이 장면에서 정해진 값 · 산식과 근거 기준</span>
        </div>
        {scene.values.map((v) => (
          <ShapeValueRow key={v.key} v={v} />
        ))}
      </div>
    </div>
  );
}

/** 값 한 줄 — 값·단위, 근거 배지(기준 화면 열기), 산식·주석. */
export function ShapeValueRow({ v }: { v: ShapeValue }) {
  const e = v.evidence ?? { kind: "missing", ruleId: null, ver: null, ruleKey: null, seq: null, screen: null, note: null };
  const shown = valueText(v.value, v.unit);
  const ref = ruleRef(e.ruleId, e.ver, e.ruleKey, e.seq);
  const foot = [v.formula, e.note].filter(Boolean).join(" · ");
  return (
    <div className="mqc-shape-v" tabIndex={0} data-key={v.key}>
      <div className="mqc-shape-v-k">{v.label}</div>
      <div className="mqc-shape-v-b">
        {shown ? (
          <>
            <span className="mqc-shape-n">{shown}</span>
            {v.unit ? ` ${v.unit}` : ""}
          </>
        ) : (
          <span className="mqc-shape-missing">설계값 없음</span>
        )}{" "}
        <Badge label={EVIDENCE_KIND_LABEL[e.kind] ?? e.kind} tone={EVIDENCE_KIND_TONE[e.kind] ?? "neutral"} />
        {ref ? <span className="mqc-shape-ref">{ref}</span> : null}
        {e.screen ? (
          <button type="button" className="mqc-shape-badge" onClick={() => openScreen(e.screen)} title={`${screenTitle(e.screen)} 화면 열기`}>
            {screenTitle(e.screen)} →
          </button>
        ) : null}
        {foot ? <div className="mqc-shape-v-f">{foot}</div> : null}
      </div>
    </div>
  );
}
