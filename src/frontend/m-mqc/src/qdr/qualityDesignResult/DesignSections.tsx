"use client";

/**
 * 설계결과 섹션 — 설계 형상·공통·재질·인수도·용융도금·전기도금·후공정·칼라·통과공정·성분. 품질설계결과와 시뮬레이션 ⑥ 이 함께 쓴다.
 * 띠 표(사양구분 × 하한/상한)는 AgDataGrid 두 단 머리(GridColumn.children, height auto)로 그린다.
 * onPick 이 있으면(시뮬레이션) 값을 눌러 근거 경로(「common.도금량코드」·「cgl.lines.적정」)를 고른다.
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";

import { CardGroup } from "@dk-oasis/shared/card";
import { AgDataGrid } from "@dk-oasis/shared/grid";
import { Badge, Button } from "@dk-oasis/shared/form";

import { EVIDENCE_KIND_LABEL, EVIDENCE_KIND_TONE, ruleRef } from "./format";
import { HEADS, SECTIONS, bandColumns, bandRows, sectionSummary, type HeadDef, type SectionKey } from "./sections";
import { ShapeView } from "./shape/ShapeView";
import type { DesignDoc, KvRow, ShapeModel, ValueTrace } from "./types";

export interface PickProps {
  /** 값을 눌러 근거 경로를 고른다(시뮬레이션). 없으면 누를 수 없다. */
  onPick?: (path: string) => void;
  picked?: string | null;
  trace?: Record<string, ValueTrace>;
}

// ── 라벨-값 격자 ───────────────────────────────────────────────

export interface KvItem {
  label: string;
  value: unknown;
  flag?: string;
  path?: string;
}

function traceTitle(t: ValueTrace | undefined): string | undefined {
  if (!t) return undefined;
  const ref = ruleRef(t.ruleId, t.ver, t.ruleKey, t.seq);
  return [`근거: ${EVIDENCE_KIND_LABEL[t.kind] ?? t.kind}`, ref, t.formula, t.note].filter(Boolean).join(" · ");
}

export function KvGrid({ items, onPick, picked, trace }: { items: KvItem[] } & PickProps) {
  return (
    <div className="mqc-qd-kv">
      {items.map((it, i) => {
        const t = it.path ? trace?.[it.path] : undefined;
        const value = it.value == null || String(it.value) === "" ? "" : String(it.value);
        const cls = ["mqc-qd-kv-v"];
        if (it.flag === "b") cls.push("b");
        if (it.flag === "warn") cls.push("warn");
        if (onPick && it.path) cls.push("pick");
        if (picked && it.path === picked) cls.push("on");
        if (onPick && t?.kind === "missing") cls.push("bad");
        return (
          <div key={`${it.label}-${i}`} className={`mqc-qd-kv-item${it.flag === "wide" ? " wide" : ""}`}>
            <label title={it.label}>{it.label}</label>
            <div
              className={cls.join(" ")}
              title={traceTitle(t) ?? value}
              role={onPick && it.path ? "button" : undefined}
              tabIndex={onPick && it.path ? 0 : undefined}
              onClick={onPick && it.path ? () => onPick(it.path as string) : undefined}
              onKeyDown={
                onPick && it.path
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPick(it.path as string);
                      }
                    }
                  : undefined
              }
            >
              <span>{value}</span>
              {onPick && t ? <Badge label={EVIDENCE_KIND_LABEL[t.kind] ?? t.kind} tone={EVIDENCE_KIND_TONE[t.kind] ?? "neutral"} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** [라벨, 값, flag] 줄 → KvItem(경로 = 섹션.라벨). */
export function kvItems(rows: readonly KvRow[] | readonly [string, string][] | undefined, section: string): KvItem[] {
  return (rows ?? []).map((r) => ({ label: r[0], value: r[1], flag: (r as KvRow)[2], path: `${section}.${r[0]}` }));
}

// ── 띠 표 ─────────────────────────────────────────────────────

export const BandGrid = memo(function BandGrid({
  gridId,
  title,
  heads,
  rows,
  path,
  onPick,
}: {
  gridId: string;
  title: string;
  heads: HeadDef[];
  rows: readonly (readonly unknown[])[] | undefined;
  /** 행을 누르면 「path.행머리」 를 고른다. */
  path?: string;
  onPick?: (path: string) => void;
}) {
  const columns = useMemo(() => bandColumns(heads), [heads]);
  const data = useMemo(() => bandRows(rows), [rows]);
  const onRowClick = useCallback(
    (row: Record<string, unknown>) => {
      if (onPick && path) onPick(`${path}.${String(row.c0 ?? "")}`);
    },
    [onPick, path],
  );
  return (
    <AgDataGrid
      gridId={gridId}
      title={title}
      rowKey="_k"
      columns={columns}
      data={data}
      height="auto"
      columnSizing="fit"
      personalize={false}
      onRowClick={onPick && path ? onRowClick : undefined}
    />
  );
});

// ── 섹션 본문 ─────────────────────────────────────────────────

function CommonBody({ d, ...pick }: { d: DesignDoc } & PickProps) {
  return <KvGrid items={kvItems(d.common, "common")} {...pick} />;
}

function MatBody({ d, onPick }: { d: DesignDoc } & PickProps) {
  return (
    <div className="mqc-qd-blocks">
      <BandGrid gridId="mat-bands" title="재질" heads={HEADS.matBands} rows={d.mat?.bands} path="mat.bands" onPick={onPick} />
      <BandGrid gridId="mat-spc" title="시편·도금량" heads={HEADS.matSpc} rows={d.mat?.spc} path="mat.spc" onPick={onPick} />
    </div>
  );
}

function TolBody({ d, onPick }: { d: DesignDoc } & PickProps) {
  return (
    <div className="mqc-qd-blocks">
      <BandGrid gridId="tol-tols" title="공차" heads={HEADS.tols} rows={d.tol?.tols} path="tol.tols" onPick={onPick} />
      <BandGrid gridId="tol-base" title="적용기준" heads={HEADS.tolBase} rows={d.tol?.base} path="tol.base" onPick={onPick} />
      <BandGrid gridId="tol-shape" title="형상 (mm)" heads={HEADS.tolShape} rows={d.tol?.shape} path="tol.shape" onPick={onPick} />
    </div>
  );
}

function CglBody({ d, ...pick }: { d: DesignDoc } & PickProps) {
  const c = d.cgl?.coat;
  const coat: KvItem[] = c
    ? [
        { label: "도금 부착량(하한)", value: c.min, path: "cgl.coat.min" },
        { label: "도금 부착량(상한)", value: c.max, path: "cgl.coat.max" },
        { label: "도금목표(도금량)", value: c.target, path: "cgl.coat.target" },
        { label: "도금목표(두께 µm)", value: c.thk, path: "cgl.coat.thk" },
        { label: "Spangle", value: c.spangle, path: "cgl.coat.spangle" },
        { label: "L/V", value: c.lv, path: "cgl.coat.lv" },
        { label: "Skin Pass", value: c.skin, path: "cgl.coat.skin" },
        { label: "목표 Size(두께 × 폭)", value: `${c.sizeT ?? ""} × ${c.sizeW ?? ""}`, path: "cgl.coat.sizeT" },
      ]
    : [];
  return (
    <div className="mqc-qd-blocks">
      <BandGrid gridId="cgl-lines" title="적차선" heads={HEADS.cglLines} rows={d.cgl?.lines} path="cgl.lines" onPick={pick.onPick} />
      <div className="mqc-qd-sub">PLTCM</div>
      <div className="mqc-qd-muted">※ 시스템 설계값 복원은 「설계계산」 으로 다시 계산합니다.</div>
      <KvGrid items={kvItems(d.cgl?.pltcm, "cgl.pltcm")} {...pick} />
      <BandGrid gridId="cgl-ops" title="CGL 소둔·라인" heads={HEADS.cglOps} rows={d.cgl?.ops} path="cgl.ops" onPick={pick.onPick} />
      <div className="mqc-qd-sub">도금 부착량·목표</div>
      <KvGrid items={coat} {...pick} />
    </div>
  );
}

function EglBody() {
  return (
    <div className="mqc-qd-muted">
      전기도금 라인 설계값이 없습니다. EGL 경유 시에만 적차선·ECL·TM·ANN·EGL 표준이 표시됩니다.
    </div>
  );
}

function PostBody({ d, ...pick }: { d: DesignDoc } & PickProps) {
  const p = d.post;
  if (!p) return <div className="mqc-qd-muted">후공정 설계값이 없습니다.</div>;
  const jz: KvItem[] = [
    { label: "폭 Set (조수 1~10)", value: (p.widSet ?? []).filter((v) => v !== "" && v != null).join(" · "), path: "post.widSet" },
    { label: "1T2C유무", value: p.t2c, path: "post.t2c" },
    { label: "S/T유무", value: p.st, path: "post.st" },
    { label: "제품폭범위(하한)", value: p.wMin, path: "post.wMin" },
    { label: "제품폭범위(상한)", value: p.wMax, path: "post.wMax" },
    { label: "엠보스무늬", value: p.emboss ?? "", path: "post.emboss" },
    { label: "SHEET적치방법", value: p.sheetLoad ?? "", path: "post.sheetLoad" },
    { label: "방청유", value: p.oil ?? "", path: "post.oil" },
    { label: "SHL 작업 SIZE", value: p.shlSize ?? "", path: "post.shlSize" },
  ];
  const msg: KvItem[] = [
    { label: "품질메세지", value: p.qMsg, path: "post.qMsg", flag: "wide" },
    { label: "포장방법", value: p.pack, path: "post.pack", flag: "wide" },
    { label: "포장메세지", value: p.packMsg, path: "post.packMsg", flag: "wide" },
  ];
  return (
    <div className="mqc-qd-blocks">
      <div className="mqc-qd-sub">정전</div>
      <KvGrid items={jz} {...pick} />
      <BandGrid gridId="post-film" title="보호필름" heads={HEADS.film} rows={p.film ?? []} />
      <div className="mqc-qd-sub">품질메세지 · 포장</div>
      <KvGrid items={msg} {...pick} />
    </div>
  );
}

function ColorBody({ d, ...pick }: { d: DesignDoc } & PickProps) {
  const c = d.color;
  if (!c) return <div className="mqc-qd-muted">칼라제조사양 해당 없음</div>;
  const s = c.sum;
  const sum: KvItem[] = [
    { label: "도장방식", value: s.way, path: "color.sum.way" },
    { label: "색상코드(Top/Back)", value: `${s.cT} · ${s.cB}`, path: "color.sum.cT" },
    { label: "도막두께(Top/Back)", value: `${s.thkT} · ${s.thkB}`, path: "color.sum.thkT" },
    { label: "광택코드(Top/Back)", value: `${s.glossT} · ${s.glossB}`, path: "color.sum.glossT" },
    { label: "수지코드(Top/Back)", value: `${s.resinT} · ${s.resinB}`, path: "color.sum.resinT" },
    { label: "목표 Size", value: `${s.szT} × ${s.szW}`, path: "color.sum.szT" },
    { label: "Chem Coat", value: s.chem, path: "color.sum.chem" },
    { label: "상세색상명", value: s.name, path: "color.sum.name" },
  ];
  return (
    <div className="mqc-qd-blocks">
      <BandGrid gridId="color-matrix" title="도장 사양" heads={HEADS.colorMatrix} rows={c.matrix} path="color.matrix" onPick={pick.onPick} />
      <div className="mqc-qd-sub">도장 요약</div>
      <KvGrid items={sum} {...pick} />
      <div className="mqc-qd-sub">시험기준</div>
      <KvGrid items={kvItems(c.test, "color.test")} {...pick} />
    </div>
  );
}

function RouteBody({ d, onPick }: { d: DesignDoc } & PickProps) {
  return (
    <div className="mqc-qd-blocks">
      <div className="mqc-qd-row">
        <span className="mqc-qd-muted">통과공정번호</span>
        <Badge label={d.route?.no || "-"} tone="primary" mono />
      </div>
      <BandGrid gridId="route-rows" title="통과공정" heads={HEADS.route} rows={d.route?.rows} path="route.rows" onPick={onPick} />
    </div>
  );
}

function CompBody({ d, onPick }: { d: DesignDoc } & PickProps) {
  return (
    <div className="mqc-qd-blocks">
      <BandGrid gridId="comp-g1" title="성분 1" heads={HEADS.compG1} rows={d.comp?.g1} path="comp.g1" onPick={onPick} />
      <BandGrid gridId="comp-g2" title="성분 2" heads={HEADS.compG2} rows={d.comp?.g2} path="comp.g2" onPick={onPick} />
    </div>
  );
}

function SectionBody({ k, d, shape, pick }: { k: SectionKey; d: DesignDoc; shape: ShapeModel | null; pick: PickProps }) {
  switch (k) {
    case "shape":
      return shape ? <ShapeView model={shape} /> : <div className="mqc-qd-muted">설계 형상이 없습니다.</div>;
    case "common":
      return <CommonBody d={d} {...pick} />;
    case "mat":
      return <MatBody d={d} {...pick} />;
    case "tol":
      return <TolBody d={d} {...pick} />;
    case "cgl":
      return <CglBody d={d} {...pick} />;
    case "egl":
      return <EglBody />;
    case "post":
      return <PostBody d={d} {...pick} />;
    case "color":
      return <ColorBody d={d} {...pick} />;
    case "route":
      return <RouteBody d={d} {...pick} />;
    case "comp":
      return <CompBody d={d} {...pick} />;
    default:
      return null;
  }
}

// ── 아코디언 ───────────────────────────────────────────────────

export interface DesignAccordionProps extends PickProps {
  design: DesignDoc;
  shape?: ShapeModel | null;
  /** 설계 형상 섹션을 넣는가(시뮬레이션 ⑥ 은 뺀다). */
  includeShape?: boolean;
  /** 섹션별 이상 건수(머리에 「이상 n」). */
  anomalyCounts?: Partial<Record<SectionKey, number>>;
  /** 처음 펼칠 섹션(기본 설계 형상·공통). */
  defaultOpen?: SectionKey[];
}

export const DesignAccordion = memo(function DesignAccordion(props: DesignAccordionProps) {
  const { design, shape = null, includeShape = true, anomalyCounts, onPick, picked, trace, defaultOpen = ["shape", "common"] } = props;
  const sections = useMemo(() => SECTIONS.filter((s) => includeShape || s.key !== "shape"), [includeShape]);
  // 섹션별 펼침 기본값과 다시 그릴 번호 — 「전체 펼치기·접기」·칩은 기본값을 바꾸고 그 섹션을 다시 마운트한다(CardGroup 은 비제어).
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.key, defaultOpen.includes(s.key)])),
  );
  const [gen, setGen] = useState<Record<string, number>>({});
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const pick: PickProps = { onPick, picked, trace: trace ?? design.trace };

  const setAll = (open: boolean) => {
    setOpenMap(Object.fromEntries(SECTIONS.map((s) => [s.key, open])));
    setGen((g) => Object.fromEntries(SECTIONS.map((s) => [s.key, (g[s.key] ?? 0) + 1])));
  };
  const jump = (key: SectionKey) => {
    setOpenMap((m) => ({ ...m, [key]: true }));
    setGen((g) => ({ ...g, [key]: (g[key] ?? 0) + 1 }));
    window.setTimeout(() => refs.current[key]?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
  };

  return (
    <div className="mqc-qd-sections">
      <div className="mqc-qd-row">
        <div className="mqc-qd-chips">
          {sections.map((s) => (
            <button key={s.key} type="button" className="mqc-qd-chip" onClick={() => jump(s.key)}>
              {s.title}
            </button>
          ))}
        </div>
        <span className="mqc-qd-spacer" />
        <Button onClick={() => setAll(true)}>
          전체 펼치기
        </Button>
        <Button onClick={() => setAll(false)}>
          전체 접기
        </Button>
      </div>
      {sections.map((s) => {
        const n = anomalyCounts?.[s.key] ?? 0;
        const sum = sectionSummary(s.key, design, shape);
        const title = `${s.title}${sum ? " — " + sum : ""}${n > 0 ? ` · 이상 ${n}` : ""}`;
        return (
          <div
            key={s.key}
            ref={(el) => {
              refs.current[s.key] = el;
            }}
          >
            <CardGroup
              key={`${s.key}-${gen[s.key] ?? 0}`}
              id={s.key}
              title={title}
              testIdPrefix="qd-sec"
              defaultOpen={!!openMap[s.key]}
            >
              <SectionBody k={s.key} d={design} shape={shape} pick={pick} />
            </CardGroup>
          </div>
        );
      })}
    </div>
  );
});
