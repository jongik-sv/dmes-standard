"use client";

/**
 * 가운데 — 보는 사람 · 상태 · 승인 흐름, 코일 제목과 규칙이 정한 것, 찍을 TAG(발행 유형 · 양식) 고르기, 보기 켜고 끄기(출처 색칠 · 바뀐 칸 · 빈 칸 · 칸 옮기기), 확대,
 * 그리고 TAG 그림(현행 양식의 칸 위치 · 글꼴). 칸에 마우스를 올리면 이름과 값, 누르면 오른쪽에 자세히. 칸 옮기기를 켜면 끌어서 옮기고 모서리로 크기를 바꾼다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent } from "react";

import { Badge, Button, Checkbox, Select, SegmentedControl, type BadgeTone } from "@dk-oasis/shared/form";

import { PT_MM, PX_PT, ROLES, SRC_FILL, SRC_NM } from "./engine/consts";
import { esc, geoTxt, layKey, pageDims, rasterize } from "./engine/sim";
import type { TagStore } from "./store";

const STATE_TONE: Record<string, BadgeTone> = { APPLIED: "success", DRAFT: "warning", PENDING: "primary" };
export const stateLabel = (st: string, ver: number) => (st === "APPLIED" ? `적용본 v${ver}` : st === "DRAFT" ? "초안 — 발행 안 됨" : "승인 대기");
const ROLE_OPTS = ROLES.map(([value, t]) => ({ value, label: `보는 사람: ${t}` }));

export interface StageProps {
  store: TagStore;
  version: number;
  onOpen: (m: "chg" | "print") => void;
  toast: (m: string) => void;
  fail: (e: unknown) => void;
}

export function TagStage({ store, onOpen, toast, fail }: StageProps) {
  const sim = store.sim!;
  const S = store.S!;
  const v = S.view;
  const { CUR } = store.model();
  const R = CUR.R;
  const ce = R.ce;
  const st = store.state;
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 900, h: 480 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.max(300, el.clientWidth - 44), h: Math.max(220, window.innerHeight - r.top - 74) });
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const { W, H, z } = pageDims(v.size);
  const fit = Math.min(box.w / W, box.h / H, 2.2);
  const k = v.zoom === "fit" ? fit : v.zoom;
  const lay = v.lay && !!CUR.fid;
  const dragging = !!store.drag;
  const cl = CUR.fid && !dragging && (lay || v.itab === "list") ? sim.clashScan(CUR.fid, v.size) : null;
  const svg = CUR.fid
    ? sim.tagSvg(CUR, {
        k,
        sel: lay ? null : v.itab === "field" ? v.sel : v.itab === "list" ? store.ui.fmSel : null,
        clash: cl,
        chg: v.diff ? CUR.chg : null,
        names: v.names,
        hit: true,
        tint: v.tint,
        media: v.media,
        lay,
        gsel: sim.selG(),
        role: lay ? null : v.role,
        guides: store.guides,
      })
    : "";

  // 프린터 해상도 보기 — 그린 뒤 흑백 점 그림을 겹친다.
  useEffect(() => {
    const wrap0 = stageRef.current?.querySelector(".tagm-wrap");
    wrap0?.querySelector("canvas.ras")?.remove();
    wrap0?.querySelector("svg")?.classList.remove("ghost");
    if (v.res === "screen" || !CUR.fid || dragging) return;
    let live = true;
    const wmm = W * PT_MM;
    const hmm = H * PT_MM;
    rasterize(sim.tagSvg(CUR, { k: 1 }), wmm, hmm, +v.res)
      .then((cv) => {
        const wrap = stageRef.current?.querySelector(".tagm-wrap");
        const sv = wrap?.querySelector("svg");
        if (!live || !wrap || !sv) return;
        wrap.querySelector("canvas.ras")?.remove();
        cv.className = "ras";
        cv.style.width = sv.getAttribute("width") + "px";
        cv.style.height = sv.getAttribute("height") + "px";
        sv.classList.add("ghost");
        wrap.insertBefore(cv, sv);
      })
      .catch(() => toast("이 브라우저에서는 해상도 보기를 만들 수 없습니다."));
    return () => {
      live = false;
    };
    // svg 문자열이 바뀌면 다시 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, v.res, dragging]);

  // 끄는 중 — 문서 전체에서 마우스를 따라간다.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const D = store.drag;
      if (!D) return;
      if (!D.moved && Math.abs(e.clientX - D.sx) < 3 && Math.abs(e.clientY - D.sy) < 3) return;
      const r = sim.dragGeom(D, (e.clientX - D.sx) / D.k, (e.clientY - D.sy) / D.k, e.altKey);
      showTip(e.clientX, e.clientY, `<b>${esc(sim.gName(CUR.fid!, D.gid))}</b><span>${geoTxt(r.g)}</span>${e.altKey ? "<span>맞춤 끔(Alt)</span>" : ""}`);
      store.dragTo(r.g, r.guides);
    };
    const up = () => {
      hideTip();
      store.endDrag();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const showTip = (x: number, y: number, html: string) => {
    const t = tipRef.current;
    if (!t) return;
    t.innerHTML = html;
    t.style.left = Math.min(window.innerWidth - 330, x + 14) + "px";
    t.style.top = y + 16 + "px";
    t.style.display = "block";
  };
  const hideTip = () => {
    if (tipRef.current) tipRef.current.style.display = "none";
  };

  const selectField = (name: string) => {
    if (v.sel !== name) store.setUi({ cusf: null });
    store.setView({ sel: name, itab: "field" });
  };
  const listPick = (name: string) => store.setUi({ fmSel: store.ui.fmSel === name ? null : name });
  const target = (e: { target: EventTarget }) => (e.target as Element).closest?.("[data-f]") as Element | null;

  const onClick = (e: RMouseEvent) => {
    if (lay) return;
    const g = target(e);
    if (!g) return;
    const f = g.getAttribute("data-f")!;
    if (v.itab === "list") listPick(f);
    else selectField(f);
  };
  const onMove = (e: RMouseEvent) => {
    if (dragging) return;
    if (lay) {
      const b = (e.target as Element).closest?.("[data-g]");
      const g = b && sim.curGeo(+b.getAttribute("data-g")!);
      if (!g) return hideTip();
      return showTip(e.clientX, e.clientY, `<b>${esc(sim.gName(CUR.fid!, g.gid))}</b><span>${geoTxt(g)}</span><span>끌어서 옮기기</span>`);
    }
    const g = target(e);
    const n = g && sim.curNode(g.getAttribute("data-f")!);
    if (!n) return hideTip();
    showTip(
      e.clientX,
      e.clientY,
      `<b>${esc(sim.itemNm(n.n))}</b><span>${n.t === "image" ? (n.v ? "이미지" : "비어 있음") : esc(n.v || "비어 있음")}</span><span>${SRC_NM[(n.info || {}).src] || ""}${n.over ? " · 글자 넘침" : ""}${CUR.chg!.has(n.n) ? " · 바뀐 칸" : ""}</span>`,
    );
  };
  const onDown = (e: RMouseEvent) => {
    if (!lay || e.button !== 0) return;
    const el = e.target as Element;
    const hdl = el.closest?.("[data-h]");
    const bx = el.closest?.("[data-g]");
    if (!hdl && !bx) {
      if (sim.selG() != null) store.setView({ gsel: null });
      return;
    }
    if (store.locked) return toast("승인 대기 중에는 고칠 수 없습니다. 승인 요청을 먼저 취소하세요.");
    e.preventDefault();
    const gid = hdl ? sim.selG()! : +bx!.getAttribute("data-g")!;
    const g = sim.curGeo(gid);
    if (!g) return;
    const sv = stageRef.current!.querySelector("svg")!;
    store.startDrag({
      gid,
      h: hdl ? hdl.getAttribute("data-h")! : "move",
      sx: e.clientX,
      sy: e.clientY,
      k: sv.getBoundingClientRect().width / W || k,
      W,
      H,
      g0: { x: g.x, y: g.y, w: g.w, h: g.h },
      key: layKey(CUR.fid!, v.size),
    });
    store.setView({ gsel: gid, gfid: CUR.fid });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const g = target(e);
    if (!g) return;
    e.preventDefault();
    selectField(g.getAttribute("data-f")!);
  };

  const moveCoil = (d: number) => {
    const list = sim.COILS;
    const i = list.findIndex((c) => c.id === v.coil);
    store.setUi({ cusf: null });
    store.setView({ coil: list[(i + d + list.length) % list.length].id, pick: "p0" });
  };

  const cc = sim.coilOf(v.coil);
  const forced = v.pick.startsWith("f:");
  const fr = forced ? sim.formRoute(v.pick.slice(2), sim.formCoils()) : null;
  const tt = R.tt ? (sim.M.TAG_PUB_TYPE && sim.M.TAG_PUB_TYPE[R.tt]) || R.tt : "발행 안 함";
  const prints = R.prints;
  const printOpts = prints.map((p, i) => ({
    value: "p" + i,
    label: `${prints.length > 1 ? i + 1 + ". " : ""}${(sim.M.TAG_PUB_TYPE && sim.M.TAG_PUB_TYPE[p.pt]) || p.pt} · ${p.form || "?"}`,
  }));
  const formOpts = [
    { value: "", label: "다른 양식에 넣어 보기…" },
    ...Object.keys(sim.D.forms)
      .sort()
      .map((f) => ({ value: "f:" + f, label: `${f} · ${(sim.D.forms[f].status || "").split(" · ")[0]}` })),
  ];

  const fs = sim.uniqFields(CUR).filter((n) => n.v);
  const cnt: Record<string, number> = {};
  fs.forEach((n) => {
    const s = n.info.src;
    cnt[s] = (cnt[s] || 0) + 1;
  });
  const over = fs.filter((n) => n.over);
  const wmm = (W * PT_MM).toFixed(1);
  const hmm = (H * PT_MM).toFixed(1);
  const nMoved = CUR.fid ? Object.keys(sim.geoOf(S, CUR.fid, v.size)).length : 0;
  const fitAll = () => {
    let n = 0;
    store.edit("글자 크기 맞추기", (_S, s) => {
      over.forEach((x) => {
        const f = s.fitSize(x);
        if (f) {
          s.setFs(CUR.fid!, x, f);
          n++;
        }
      });
    });
    toast(n ? `${n}칸을 칸 크기에 맞게 줄였습니다.` : "줄여서 맞출 수 있는 칸이 없습니다.");
  };
  const nextOver = () => {
    const i = over.findIndex((x) => x.n === v.sel);
    selectField(over[(i + 1) % over.length].n);
  };

  return (
    <div>
      <div className="tagm-bar">
        <div style={{ width: 170 }}>
          <Select
            aria-label="보는 사람"
            value={v.role}
            options={ROLE_OPTS}
            onChange={(r) => {
              store.setView({ role: r });
              toast(r === "all" ? "모든 소관을 봅니다." : `「${ROLES.find((x) => x[0] === r)?.[1]}」 소관의 칸 · 규칙 줄 · 차이만 또렷하게 보입니다.`);
            }}
          />
        </div>
        <span className="tagm-grow" />
        <Badge tone={STATE_TONE[st]} label={stateLabel(st, store.ver)} testId="tag-state" />
        {st === "PENDING" ? (
          <>
            <Button variant="primary" onClick={() => void store.approve().then((n) => toast(`적용본 v${n} — 이제부터 발행에 쓰입니다.`)).catch(fail)}>
              승인
            </Button>
            <Button onClick={() => void store.unrequest().then(() => toast("승인 요청을 취소했습니다.")).catch(fail)}>요청 취소</Button>
          </>
        ) : (
          <Button variant="primary" disabled={st === "APPLIED"} onClick={() => onOpen("chg")} title={st === "APPLIED" ? "고친 것이 없습니다" : "바꾼 것을 확인하고 소관 팀장에게 승인 요청"}>
            승인 요청
          </Button>
        )}
      </div>
      <div className="tagm-bar">
        <Button size="sm" onClick={() => moveCoil(-1)} title="이전 코일 (Alt+↑)">
          ▲
        </Button>
        <Button size="sm" onClick={() => moveCoil(1)} title="다음 코일 (Alt+↓)">
          ▼
        </Button>
        <h2 className="tagm-title" data-testid="tag-coil-title">
          {sim.coilName(v.coil)}
        </h2>
      </div>
      <div className="tagm-bar">
        {cc.grp === "made" ? (
          <Badge
            tone="warning"
            label={`만든 경우 — 실제 ${cc.base}에서 ${(cc.changed || []).map((x: string) => sim.colLabel(x)).join(" · ")} 바꿈`}
            title={`최근 2주 운영 발행분에 이 경우가 없어, 실제 코일 ${cc.base}에서 그 경우를 가르는 조건만 바꿨습니다.`}
          />
        ) : cc.grp === "real" ? (
          <Badge label={`운영 실제 ${cc.COIL_ID}${sim.D.act[cc.act] ? "" : " · 찍힌 값 없음(보관 기간 지남)"}`} />
        ) : (
          <Badge tone="warning" label="규칙에서 만든 코일 — 주문 값 비움" />
        )}
        <Badge label={tt} />
        {ce.std ? <Badge label={`규격 ${ce.std.r.SHORT && !/\{/.test(ce.std.r.SHORT) ? ce.std.r.SHORT : ce.std.r.ID}`} /> : null}
        {ce.lic ? <Badge tone="success" label={`인증서 ${ce.lic.r.ID}`} /> : ce.certOff ? <Badge label="인증 표시 안 함(예외)" /> : null}
        {S.facts[v.coil] ? <Badge tone="warning" label="조건 바꿈" /> : null}
        {forced && fr ? (
          <Badge tone="warning" title={fr.why || ""} label={`${v.pick.slice(2)}은(는) 이 코일이 실제로 찍는 양식이 아님 — 이 코일 값을 넣어 본 모양`} />
        ) : null}
        <Button size="sm" onClick={() => store.setView({ itab: "coil" })}>
          조건 바꿔 보기
        </Button>
      </div>
      <div className="tagm-bar">
        {printOpts.length ? (
          <SegmentedControl ariaLabel="찍을 TAG" value={forced ? "" : "p" + CUR.pi} options={printOpts} onChange={(p) => store.setView({ pick: p })} />
        ) : (
          <Badge label="발행 안 함" />
        )}
        <div style={{ width: 200 }}>
          <Select aria-label="다른 양식에 넣어 보기" value={forced ? v.pick : ""} options={formOpts} onChange={(p) => p && store.setView({ pick: p })} />
        </div>
        <span className="tagm-grow" />
        <Checkbox label="출처 색칠" checked={v.tint} onChange={(x) => store.setView({ tint: x })} />
        <Checkbox label="바뀐 칸" checked={v.diff} onChange={(x) => store.setView({ diff: x })} />
        <Checkbox label="빈 칸" checked={v.names} onChange={(x) => store.setView({ names: x })} />
        <Checkbox
          label="칸 옮기기"
          checked={v.lay}
          onChange={(x) => {
            hideTip();
            store.setView({ lay: x, ...(x ? { itab: "field" as const } : {}) });
          }}
        />
        <span className="tagm-zoom">
          <Button size="sm" title="축소" onClick={() => store.setView({ zoom: Math.max(0.4, k / 1.2) })}>
            −
          </Button>
          <span>{Math.round((k / PX_PT) * 100)}%</span>
          <Button size="sm" title="확대" onClick={() => store.setView({ zoom: Math.min(4, k * 1.2) })}>
            +
          </Button>
          <Button size="sm" title="화면에 맞춤" onClick={() => store.setView({ zoom: "fit" })}>
            맞춤
          </Button>
          <Button size="sm" title="실물 크기(모니터 96dpi 기준)" onClick={() => store.setView({ zoom: PX_PT })}>
            실물
          </Button>
        </span>
      </div>
      <div className="tagm-stagebox" ref={boxRef}>
        {CUR.fid ? (
          <>
            <div
              ref={stageRef}
              className={"tagm-stage" + (lay ? " lay" : "")}
              data-testid="tag-stage"
              onClick={onClick}
              onMouseMove={onMove}
              onMouseLeave={() => !dragging && hideTip()}
              onMouseDown={onDown}
              onKeyDown={onKey}
            >
              <div className={"tagm-wrap" + (st !== "APPLIED" ? " draft" : "")}>
                {st !== "APPLIED" ? (
                  <div className={"tagm-ribbon" + (st === "PENDING" ? " pending" : "")}>{st === "PENDING" ? "승인 대기" : "초안"} — 승인 전에는 발행에 쓰이지 않습니다</div>
                ) : null}
                <div dangerouslySetInnerHTML={{ __html: svg }} />
              </div>
            </div>
            <div className="tagm-under">
              <span>
                <b>{CUR.fid}</b> · {wmm} × {hmm} mm{z.id !== "std" ? " · " + z.nm + (lay ? " 배치" : "") : ""}
                {!lay && v.res !== "screen" ? ` · 프린터 ${v.res}dpi 흑백으로 본 모양` : ""}
              </span>
              {lay ? (
                <>
                  <span>
                    <b>칸 옮기기</b> — 끌어서 옮기기 · 모서리 점으로 크기 · 방향키 1pt(Shift 10pt) · Alt 를 누른 채 끌면 맞춤 끔
                  </span>
                  {nMoved ? <span className="tagm-lg">옮긴 칸 {nMoved}</span> : null}
                  {over.length ? <span className="tagm-alert">글자가 넘친 칸 {over.length}개</span> : null}
                  {dragging ? (
                    <span>놓으면 겹침을 다시 셉니다</span>
                  ) : cl && cl.fresh.length ? (
                    <span className="tagm-alert">
                      같이 찍히면 겹치는 칸 {cl.fresh.filter((e) => e.st === "yes").length}쌍
                      {cl.fresh.some((e) => e.st === "maybe") ? " · 확인 필요 " + cl.fresh.filter((e) => e.st === "maybe").length : ""} — 오른쪽에서 확인
                    </span>
                  ) : nMoved ? (
                    <span className="tagm-lg">새로 겹치는 칸 없음 ✓</span>
                  ) : null}
                  <Button size="sm" onClick={() => store.setView({ lay: false })}>
                    칸 옮기기 끝내기
                  </Button>
                </>
              ) : (
                <>
                  {["cus", "disp", "show", "fact", "else"]
                    .filter((s) => cnt[s])
                    .map((s) => (
                      <span className="tagm-lg" key={s}>
                        <i style={{ background: SRC_FILL[s] }} />
                        {SRC_NM[s]} {cnt[s]}
                      </span>
                    ))}
                  {over.length ? (
                    <span className="tagm-alert">
                      글자가 넘친 칸 {over.length}개
                      <Button size="sm" onClick={nextOver}>
                        하나씩 보기
                      </Button>
                      <Button size="sm" disabled={store.locked} onClick={fitAll}>
                        모두 칸에 맞추기
                      </Button>
                    </span>
                  ) : null}
                  <Button size="sm" onClick={() => onOpen("print")}>
                    실물 크기로 인쇄
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="tagm-box" style={{ maxWidth: 420, marginTop: 40, textAlign: "center" }}>
            <b>이 코일은 TAG 를 발행하지 않습니다.</b>
            <span>발행 규칙에 걸리지 않습니다(태그 유형 없음). 오른쪽 「코일 조건」에서 조건을 바꿔 보세요.</span>
          </div>
        )}
      </div>
      <div className="tagm-tip" ref={tipRef} role="tooltip" />
    </div>
  );
}
