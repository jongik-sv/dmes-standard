"use client";

/**
 * 오른쪽 검사기 — 탭 4개(칸 · 칸 목록 · 코일 조건 · 출력 점검). 이 파일은 「칸」 탭(값이 어디서 왔나 · 그 자리에서 고치기 · 글자 크기 ·
 * 이 칸에 나올 수 있는 값 · 이 고객만 다르게)과 칸 옮기기 중의 배치 탭을 그린다.
 */
import { Fragment, type ReactNode } from "react";

import { Badge, Button, Input, Select } from "@dk-oasis/shared/form";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { Hint, Stack } from "@/common/ui";

import { Cond, Sec, SrcBadge } from "./bits";
import { LIC_F, PT_MM, SRC_NM, STD_F, roleNm } from "./engine/consts";
import { NONE, fill, LIC_REF, STD_REF } from "./engine/rules";
import { geoTxt, layKey, mm, pageDims, sizeOf, type ClashEdge, type TagNode } from "./engine/sim";
import type { ItabKey, Row } from "./engine/types";
import { CoilPane, ListPane, OutPane } from "./SidePanes";
import type { TagStore } from "./store";

const TABS: TabItem[] = [
  { key: "field", label: "칸" },
  { key: "list", label: "칸 목록" },
  { key: "coil", label: "코일 조건" },
  { key: "out", label: "출력 점검" },
];

export interface PaneProps {
  store: TagStore;
  version: number;
  toast: (m: string) => void;
  onPrint: () => void;
  onBase: (tab: "lic" | "std" | "cus", focus?: string) => void;
}

export function Inspector(p: PaneProps) {
  const { store } = p;
  const v = store.view;
  const Pane = v.itab === "list" ? ListPane : v.itab === "coil" ? CoilPane : v.itab === "out" ? OutPane : FieldPane;
  return (
    <>
      <Tabs items={TABS} activeKey={v.itab} onChange={(k) => store.setView({ itab: k as ItabKey })} />
      {store.locked ? (
        <Stack>
          <Badge tone="warning" label="승인 대기 중에는 고칠 수 없습니다. 더 고치려면 [요청 취소] 를 누르세요." />
        </Stack>
      ) : null}
      <Stack>
        <Pane {...p} />
      </Stack>
    </>
  );
}

// ───────── 기준값 한 칸 고치기 ─────────
/** key = "lic|ID|열" · "std|ID|열" · "cus|uid|칸". */
export function edRow(store: TagStore, key: string): Row | undefined {
  const [kind, id] = key.split("|");
  const S = store.S!;
  return kind === "cus" ? S.data.cus.find((r) => r.uid === id) : S.data[kind as "lic" | "std"].find((r) => r.r.ID === id);
}
export function isEdChanged(store: TagStore, key: string) {
  const [kind, , col] = key.split("|");
  const r = edRow(store, key);
  if (!r) return false;
  const b = store.S!.base.data[kind as "lic" | "std" | "cus"].find((x) => x.uid === r.uid);
  return !b || String(b.r[col] == null ? "" : b.r[col]) !== String(r.r[col] == null ? "" : r.r[col]);
}
export function setEd(store: TagStore, key: string, val: string) {
  const [kind, , col] = key.split("|");
  store.edit("기준값 수정", () => {
    const row = edRow(store, key);
    if (row) row.r[col] = kind === "cus" && val === "" ? NONE : val;
  });
}
export const markOptions = (store: TagStore) =>
  Object.keys(store.sim!.D.images)
    .filter((f) => /^std_/.test(f))
    .sort()
    .map((f) => ({ value: f, label: f }));

function EdInput({ store, k, label, extra }: { store: TagStore; k: string; label: string; extra?: ReactNode }) {
  const col = k.split("|")[2];
  const r = edRow(store, k);
  const v = r ? (r.r[col] == null ? "" : r.r[col]) : "";
  return (
    <div className={"tagm-edit" + (isEdChanged(store, k) ? " chg" : "")}>
      <label>{label}</label>
      {col === "MARK" ? (
        <Select aria-label={label} value={v} options={markOptions(store)} disabled={store.locked} onChange={(x) => setEd(store, k, x)} />
      ) : (
        <Input
          aria-label={label}
          value={v === NONE ? "" : v}
          placeholder={v === NONE ? "(숨김 — 비워 찍음)" : ""}
          disabled={store.locked}
          onChange={(x) => setEd(store, k, x)}
          data-ed={k}
        />
      )}
      {extra ? <span className="tagm-muted">{extra}</span> : null}
    </div>
  );
}
const Who = ({ t }: { t: string }) => <Badge variant="outline" label={t} />;

// ───────── 칸 탭 ─────────
function FieldPane(p: PaneProps) {
  const { store, toast } = p;
  const sim = store.sim!;
  const v = store.view;
  const { CUR, BASE } = store.model();
  if (!CUR.fid)
    return (
      <Hint>
        이 코일은 TAG 가 없습니다. <b>코일 조건</b>에서 조건을 바꿔 보세요.
      </Hint>
    );
  if (v.lay) return <LayPane {...p} />;
  const n = sim.curNode(v.sel);
  if (!n)
    return (
      <Hint>
        가운데 TAG 에서 <b>칸을 누르세요</b>. 마우스를 올리면 칸 이름이 먼저 보입니다.
      </Hint>
    );
  const info = n.info || { src: "none" };
  const base = BASE.nodes[n.i];
  const list = sim.uniqFields(CUR);
  const idx = list.findIndex((x) => x.n === n.n);
  const changed = CUR.chg!.has(n.n);
  const go = (d: number) => {
    const t = list[idx + d];
    if (t) {
      store.setUi({ cusf: null });
      store.setView({ sel: t.n });
    }
  };
  const fit = n.over ? sim.fitSize(n) : 0;
  const lock = store.locked;
  const { lo, hi } = n.t === "data" ? sim.fsRange(n) : { lo: 0, hi: 0 };
  const setFs = (fs: number, msg = "글자 크기") => store.edit(msg, (_S, s) => s.setFs(CUR.fid!, n, fs));

  return (
    <>
      <div className="tagm-bar" style={{ padding: 0, alignItems: "flex-start" }}>
        <div className="tagm-grow">
          <h2 style={{ margin: 0, fontSize: "var(--font-size-lg)" }} data-testid="tag-field-name">
            {sim.itemNm(n.n)}
          </h2>
          <div className="tagm-bar" style={{ padding: "4px 0 0" }}>
            <SrcBadge src={info.src} />
            <code className="tagm-muted">{n.n}</code>
          </div>
        </div>
        <Button size="sm" title="앞 칸" disabled={idx <= 0} onClick={() => go(-1)}>
          ‹
        </Button>
        <Button size="sm" title="다음 칸" disabled={idx >= list.length - 1} onClick={() => go(1)}>
          ›
        </Button>
      </div>
      <div className={"tagm-valbox" + (n.v ? "" : " empty") + (changed ? " chg" : "")} data-testid="tag-valbox">
        {n.t === "image" && n.v ? (
          <>
            <img src={n.src || ""} alt="" />
            <span className="tagm-muted">{n.ver > 1 ? "v" + n.ver + " (새 버전)" : ""}</span>
          </>
        ) : n.v ? (
          String(n.v)
        ) : info.hidden ? (
          "숨김 — 이 코일에는 비워 찍습니다"
        ) : (
          "이 코일에는 비어 있습니다"
        )}
      </div>
      {changed && base ? (
        <div className="tagm-was">
          적용본: <del>{base.t === "image" ? (base.v || "없음") + (base.ver > 1 ? " v" + base.ver : "") : base.v || "(비어 있음)"}</del>
          {base.fs && base.fs !== n.fs ? " · " + base.fs + "pt" : ""}
        </div>
      ) : null}
      {n.over ? (
        <div className="tagm-box bad">
          <span>
            <b>글자가 칸보다 깁니다.</b> 칸 {(n.w * PT_MM).toFixed(0)}mm 에 글자 {(n.tw * PT_MM).toFixed(0)}mm. 현행은 경고 없이 옆 칸에 겹쳐 찍힙니다.
          </span>
          {fit ? (
            <Button
              size="sm"
              disabled={lock}
              onClick={() => {
                setFs(fit, "칸에 맞추기");
                toast(`${sim.itemNm(n.n)} ${fit}pt 로 줄였습니다.`);
              }}
            >
              칸에 맞추기 ({n.fs} → {fit}pt)
            </Button>
          ) : (
            <span>글자 크기를 최소로 줄여도 안 들어갑니다 — 값을 줄이거나 양식을 고쳐야 합니다.</span>
          )}
        </div>
      ) : null}
      <Sec title="어디서 왔나">
        <ol className="tagm-path">
          <PathItems store={store} n={n} onBase={p.onBase} />
        </ol>
      </Sec>
      {n.t === "data" ? (
        <Sec title={`글자 크기 — 양식 ${CUR.fid}`}>
          <div className="tagm-bar" style={{ padding: 0 }}>
            <span className="tagm-stepper">
              <Button size="sm" title="작게" disabled={lock || n.fs <= lo} onClick={() => setFs(n.fs - 1)}>
                −
              </Button>
              <span>{n.fs}pt</span>
              <Button size="sm" title="크게" disabled={lock || n.fs >= hi} onClick={() => setFs(n.fs + 1)}>
                +
              </Button>
            </span>
            {n.fs !== n.fs0 ? (
              <Button size="sm" disabled={lock} onClick={() => setFs(n.fs0)}>
                기본 {n.fs0}pt 로
              </Button>
            ) : null}
            <span className="tagm-muted">
              {lo}~{hi}pt 안에서만 · 칸 위치는 고정
            </span>
          </div>
        </Sec>
      ) : null}
      <Decision store={store} n={n} />
      <Button
        size="sm"
        onClick={() => {
          store.setUi({ fmSel: v.sel });
          store.setView({ itab: "list" });
        }}
      >
        이 양식의 칸 전부 보기 — 칸 목록 탭 (K)
      </Button>
      {n.t === "data" || n.t === "image" ? <CusBox store={store} n={n} toast={toast} /> : null}
    </>
  );
}

/** 「어디서 왔나」 — 출처별 경로(고객 요청 / 표시 규칙 / 인증 · 규격 / MES / 기본값)와 그 자리에서 고치는 칸. */
function PathItems({ store, n, onBase }: { store: TagStore; n: TagNode; onBase: PaneProps["onBase"] }) {
  const sim = store.sim!;
  const { CUR } = store.model();
  const R = CUR.R;
  const info = n.info;
  const out: ReactNode[] = [];
  if (info.src === "cus") {
    const r = R.D.cus.find((x) => x.uid === info.uid);
    if (r) {
      const u = sim.usage().cus[r.uid] || 0;
      out.push(
        <li className="key" key="cus">
          <div className="lab">
            고객 요청 <Who t="영업" />
          </div>
          <div className="body">
            <Cond sim={sim} c={r.c} />
            {r.note ? <div className="tagm-muted">{r.note}</div> : null}
          </div>
          <EdInput store={store} k={"cus|" + r.uid + "|" + n.n} label="이 칸에 찍을 값 (비우면 숨김)" extra={"이 요청이 걸리는 코일 — " + sim.useTxt(u)} />
          <div className="tagm-bar" style={{ padding: "6px 0 0" }}>
            <Button size="sm" onClick={() => onBase("cus", r.uid)}>
              표에서 보기
            </Button>
            <Button size="sm" disabled={store.locked} onClick={() => store.edit("고객 요청 지우기", (S) => void (S.data.cus = S.data.cus.filter((x) => x.uid !== r.uid)))}>
              이 요청 지우기
            </Button>
          </div>
        </li>,
      );
      if (R.ce.vals[n.n] !== undefined)
        out.push(
          <li key="hid">
            <div className="lab">원래 값 (가려짐)</div>
            <div className="body">
              인증 · 규격 규칙으로는 <b>{R.ce.vals[n.n] === NONE ? "(숨김)" : String(fill(R.ce.vals[n.n], R.ctx))}</b> — 고객 요청이 먼저라 가려졌습니다.
            </div>
          </li>,
        );
      else {
        const e = sim.fieldOf({ cus: { vals: {}, from: {}, rows: [] }, ce: R.ce, ctx: R.ctx, show: R.show }, n.n);
        out.push(
          <li key="no">
            <div className="lab">고객 요청이 없으면</div>
            <div className="body">{e.v ? <><b>{String(e.v)}</b> ({SRC_NM[e.src]})</> : "비어 있음"}</div>
          </li>,
        );
      }
    }
  } else if (info.src === "show") {
    const r = sim.T.display.rows.find((x) => x.uid === info.uid);
    out.push(
      <li className="key" key="show">
        <div className="lab">
          표시 규칙 <Who t="IT(양식) · 영업" />
        </div>
        <div className="body">
          {r ? <Cond sim={sim} c={r.c} /> : null} → <b>{sim.refText(info.raw)}</b>
          {r && r.src && r.src.length ? <div className="tagm-muted">현행 규칙 {r.src.join(" · ")}</div> : null}
        </div>
      </li>,
    );
  } else if (info.src === "disp") {
    const dr = sim.T.disp.rows.find((r) => r.uid === info.uid);
    const g = dr && (sim.T.disp.groups || []).find((x) => x.id === dr.grp);
    const ap = sim.T.apply.rows.find((r) => r.uid === R.ce.apply);
    const ex = R.ce.ex ? sim.T.apply.rows.find((r) => r.uid === R.ce.ex) : null;
    if (ap)
      out.push(
        <li key="ap">
          <div className="lab">
            ① 나라 × 품명 → 적용 규격 <Who t="품질" />
          </div>
          <div className="body">
            <Cond sim={sim} c={ap.c} /> → <b>{ap.r.STD_ID || ""}</b>
          </div>
        </li>,
      );
    if (ex)
      out.push(
        <li key="ex">
          <div className="lab">
            예외 <Who t="품질" />
          </div>
          <div className="body">
            <Cond sim={sim} c={ex.c} /> → 인증 표시 안 함{ex.note ? <div className="tagm-muted">{ex.note}</div> : null}
          </div>
        </li>,
      );
    let refs = 0;
    for (const m of String(info.raw || "").matchAll(/\{(규격|인증):([^}]+)\}/g)) {
      const parts = m[2].split(":");
      const field = parts.pop()!;
      const id = parts.join(":");
      if (m[1] === "규격") {
        const row = id ? R.D.std.find((r) => r.r.ID === id) : R.ce.std;
        const col = STD_REF[field];
        if (row && STD_F[col]) {
          refs++;
          out.push(
            <li className="key" key={"s" + refs}>
              <div className="lab">
                {refs === 1 ? "②" : "③"} 규격 {row.r.ID} <Who t="품질" />
              </div>
              <EdInput store={store} k={"std|" + row.r.ID + "|" + col} label={STD_F[col]} extra={sim.useTxt(sim.usage().std[row.r.ID] || 0)} />
            </li>,
          );
        }
      } else {
        const row = id ? R.D.lic.find((r) => r.r.ID === id) : R.ce.lic;
        const col = LIC_REF[field];
        if (row && LIC_F[col]) {
          refs++;
          out.push(
            <li className="key" key={"l" + refs}>
              <div className="lab">
                {refs === 1 ? "②" : "③"} 인증서 {row.r.ID} ({row.r.SCHEME}) <Who t="품질" />
              </div>
              <EdInput store={store} k={"lic|" + row.r.ID + "|" + col} label={LIC_F[col]} extra={sim.useTxt(sim.usage().lic[row.r.ID] || 0)} />
            </li>,
          );
        }
      }
    }
    if (g && dr)
      out.push(
        <li key="g">
          <div className="lab">
            TAG 에 찍는 방식 <Who t="IT" />
          </div>
          <div className="body">
            「{g.name}」 — {refs ? "위 값을 이 칸에 그대로" : <code>{String(info.raw)}</code>}
            {dr.kind === "현행" ? (
              <div className="tagm-muted">
                현업 확인 {dr.q} 답을 기다리는 중 — 지금은 현행 규칙대로: <Cond sim={sim} c={dr.c} />
              </div>
            ) : null}
          </div>
        </li>,
      );
    if (info.hidden)
      out.push(
        <li key="h">
          <div className="lab">숨김</div>
          <div className="body">
            이 코일에는 이 칸을 <b>비워</b> 찍습니다.
          </div>
        </li>,
      );
    if (!refs && !info.hidden)
      out.push(
        <li key="fix">
          <div className="lab">고치려면</div>
          <div className="body tagm-muted">이 값은 규칙에 바로 적힌 글자라 규칙관리 화면(IT)에서 고칩니다. 특정 고객만 다르게 하려면 아래 「이 고객만 다르게」.</div>
        </li>,
      );
  } else if (info.src === "fact")
    out.push(
      <li className="key" key="fact">
        <div className="lab">MES 코일 정보</div>
        <div className="body">
          코일마다 MES 가 보내는 <b>사실 값</b>입니다. 규칙이 아니라 여기서 고치지 않습니다.
          <div className="tagm-muted">이 화면의 무게 · 치수 · 검사자 등은 예시값</div>
        </div>
      </li>,
    );
  else if (info.src === "else")
    out.push(
      <li className="key" key="else">
        <div className="lab">기본값</div>
        <div className="body">{info.why || "어느 규칙에도 걸리지 않아 기본값"}</div>
      </li>,
    );
  else
    out.push(
      <li key="none">
        <div className="lab">값 없음</div>
        <div className="body">이 코일에는 이 칸을 정하는 규칙이 없습니다.</div>
      </li>,
    );
  return <>{out}</>;
}

/** 이 칸에 나올 수 있는 값 — 그 칸을 정하는 규칙 줄 전부(위에서부터 먼저 맞는 줄), 운영 2주 장수와 실제 예. */
export function Decision({ store, n }: { store: TagStore; n: TagNode }) {
  const sim = store.sim!;
  const all = sim.decisionRows(n.n);
  if (!all.length) return null;
  const rows = all.filter((r) => sim.roleOk(r.src));
  const use = (sim.GOLD && sim.GOLD.use[n.n]) || {};
  const info = n.info || {};
  const curU = info.src === "cus" || info.src === "disp" ? info.uid : "else";
  const role = store.view.role;
  return (
    <Sec title={`이 칸에 나올 수 있는 값 — ${all.length}가지${rows.length < all.length ? ` (${roleNm(role)} 소관 ${rows.length})` : ""}`}>
      <Hint>위에서부터 먼저 맞는 줄의 값이 찍힙니다. 장수는 운영 2주 실제 TAG 를 새 규칙으로 다시 찍었을 때 그 줄이 정한 수.</Hint>
      <ul className="tagm-cards" data-testid="tag-decision">
        {rows.map((r) => {
          const u = use[r.uid];
          const gen = sim.genFor(r);
          return (
            <li key={r.src + r.uid} className={r.uid === curU ? "cur" : ""}>
              <div className="dv">
                <SrcBadge src={r.src} label={r.src === "else" ? "그 외" : undefined} />
                {r.v == null ? <span className="tagm-muted">MES 값 또는 빈칸</span> : r.v === NONE ? <span className="tagm-muted">(비워 찍음)</span> : <b>{sim.refText(r.v)}</b>}
              </div>
              <div className="dw">
                {r.c ? <Cond sim={sim} c={r.c} /> : "위 어느 줄에도 안 맞으면"}
                {r.note ? <div>{r.note}</div> : null}
              </div>
              <div className="dn">
                <span>{u ? "2주 " + u.n.toLocaleString() + "장" : sim.GOLD ? "2주 0장" : ""}</span>
                {u ? (
                  <Button size="mini" onClick={() => store.showCoilForm(sim.exCoil(u.ex), u.ex.form, n.n)}>
                    실제 예
                  </Button>
                ) : gen ? (
                  <Button size="mini" onClick={() => store.showCoilForm(gen.id, store.model().CUR.fid!, store.view.sel)}>
                    예 보기
                  </Button>
                ) : null}
                {r.uid === curU ? <span className="here">지금 코일</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Sec>
  );
}

/** 이 고객만 다르게 찍기 — 고객 요청 한 줄 추가(인증 · 규격보다 먼저, 이 고객의 모든 코일에 적용). */
function CusBox({ store, n, toast }: { store: TagStore; n: TagNode; toast: (m: string) => void }) {
  const sim = store.sim!;
  const c = sim.coilOf(store.view.coil);
  const cf = store.ui.cusf;
  if (!cf || cf.f !== n.n)
    return (
      <Button disabled={store.locked} onClick={() => store.setUi({ cusf: { f: n.n, who: "CUS_CD", v: "" } })}>
        이 고객만 다르게 찍기…
      </Button>
    );
  const whos = (
    [
      ["CUS_CD", "주문고객"],
      ["FNL_CUS_CD", "최종고객"],
      ["ACT_CUS_CD", "실수요가"],
    ] as const
  ).filter(([k]) => c[k]);
  const add = () => {
    const w = cf.who;
    const val = cf.v.trim();
    store.edit("고객 요청 추가", (S) => {
      const prio = Math.min(...S.data.cus.map((r) => r.prio)) - 1;
      S.data.cus.push({ uid: "n" + Date.now().toString(36), prio, c: { [w]: { in: [c[w]] } }, r: { [cf.f]: val === "" ? NONE : val }, src: [], q: "", note: "시뮬레이터에서 추가" });
    });
    store.setUi({ cusf: null });
    toast(`${sim.M.CUS[c[w]] || c[w]}의 모든 코일에 「${sim.itemNm(cf.f)}」 고객 요청을 적용했습니다.`);
  };
  return (
    <div className="tagm-box" data-testid="tag-cusbox">
      <b>고객 요청 추가 — {sim.itemNm(n.n)}</b>
      <div className="tagm-kv">
        <label>누구</label>
        <Select
          aria-label="누구"
          value={cf.who}
          options={whos.map(([k, nm]) => ({ value: k, label: `${nm} ${sim.M.CUS[c[k]] || c[k]}` }))}
          onChange={(x) => store.setUi({ cusf: { ...cf, who: x } })}
        />
        <label>값</label>
        <Input aria-label="찍을 값" value={cf.v} placeholder="비우면 이 칸을 숨김" onChange={(x) => store.setUi({ cusf: { ...cf, v: x } })} />
      </div>
      <div className="tagm-bar" style={{ padding: 0 }}>
        <Button variant="primary" size="sm" onClick={add}>
          추가
        </Button>
        <Button size="sm" onClick={() => store.setUi({ cusf: null })}>
          취소
        </Button>
      </div>
      <Hint>
        고객 요청은 인증 · 규격 규칙보다 <b>먼저</b> 적용되고, 이 고객의 <b>다른 코일에도</b> 모두 적용됩니다.
      </Hint>
    </div>
  );
}

// ───────── 칸 옮기기 탭 ─────────
export function ClashList({ store, list, old }: { store: TagStore; list: ClashEdge[]; old?: boolean }) {
  const sim = store.sim!;
  const fid = store.model().CUR.fid!;
  const go = (e: ClashEdge) => {
    if (!e.ex) return;
    const id = sim.witCoil(e.ex.c);
    const nm = /^t\d+$/.test(e.a) ? e.b : e.a;
    const v = store.view;
    if (v.lay || v.itab === "list") {
      store.setUi({ fmSel: nm });
      store.showCoilForm(id, fid);
    } else store.showCoilForm(id, fid, nm);
  };
  return (
    <ul className="tagm-cards">
      {list.map((e) => {
        const nm = (
          <>
            <b>{sim.clashNm(fid, e.a)}</b> ↔ <b>{sim.clashNm(fid, e.b)}</b>
          </>
        );
        if (e.st === "no")
          return (
            <li key={e.a + e.b}>
              <div className="dv">{nm}</div>
              <div className="dw">같이 안 찍힘 — {sim.whyNo(e.why)}</div>
            </li>
          );
        return (
          <li key={e.a + e.b} className={old ? "" : e.st === "yes" ? "bad" : "warn"}>
            <div className="dv">
              {nm}
              <Badge tone={e.st === "yes" ? "danger" : "warning"} label={e.st === "yes" ? "같이 찍힘" : "확인 필요"} />
            </div>
            <div className="dw">
              이럴 때:{" "}
              {e.conds.slice(0, 3).map((c, i) => (
                <div key={i}>
                  {i ? "또는 " : ""}
                  <Cond sim={sim} c={c} />
                </div>
              ))}
              {e.conds.length > 3 ? <div>외 {e.conds.length - 3}가지 조건</div> : null}
              {e.fact ? <div>MES 값이 있을 때만 — 그 값이 언제 비는지는 규칙 표에 없음</div> : null}
              {e.ex ? (
                <div>
                  예: 「{String(e.ex.va).slice(0, 24)}」 · 「{String(e.ex.vb).slice(0, 24)}」
                </div>
              ) : e.fact ? null : (
                <div>조건은 같이 맞지만, 그 조건의 코일을 만들어 확인하지 못함(파생속성 · 우선순위)</div>
              )}
            </div>
            {e.ex ? (
              <div className="dn">
                <Button size="mini" onClick={() => go(e)}>
                  예시 코일로 보기
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function LayPane({ store }: PaneProps) {
  const sim = store.sim!;
  const S = store.S!;
  const v = S.view;
  const { CUR } = store.model();
  const fid = CUR.fid!;
  const key = layKey(fid, v.size);
  const own = S.geo[key] || {};
  const all = sim.geoOf(S, fid, v.size);
  const gid = sim.selG();
  const nForm = sim.usage().form[fid] || 0;
  const z = sizeOf(v.size);
  const g = gid != null ? sim.layGroups(CUR).find((x) => x.gid === gid) : null;
  // 끄는 중에는 겹침을 다시 세지 않는다(놓으면 센다 — 목업과 같다).
  const cl = store.drag ? { fresh: [], old: [], apart: [], short: false } : sim.clashScan(fid, v.size);
  const mine = g ? cl.fresh.filter((e) => e.ga === gid || e.gb === gid) : [];
  const rest = cl.fresh.filter((e) => !mine.includes(e));
  const no = g ? cl.apart.filter((e) => e.ga === gid || e.gb === gid) : [];
  const moved = Object.keys(own).map(Number);
  const reset = (id: number) => store.edit("칸 원래 위치로", (_S, s) => s.setGeo(key, id, null));
  const setNum = (k: "x" | "y" | "w" | "h", raw: string) => {
    const val = parseFloat(raw);
    if (!g || !isFinite(val)) return;
    const { W, H } = pageDims(v.size);
    store.edit("칸 옮기기", (_S, s) => {
      const ng = { x: g.x, y: g.y, w: g.w, h: g.h };
      ng[k] = Math.round(Math.max(k === "w" || k === "h" ? 4 : 0, val / PT_MM) * 10) / 10;
      ng.x = Math.min(ng.x, W - 4);
      ng.y = Math.min(ng.y, H - 4);
      s.setGeo(key, g.gid, ng);
    });
  };
  const items = g ? CUR.nodes.filter((n) => n.gid === gid && n.t !== "line") : [];
  const orig = g ? sim.flat(fid).find((n) => n.gid === gid) : null;
  return (
    <>
      <div className="tagm-bar" style={{ padding: 0 }}>
        <div className="tagm-grow">
          <h2 style={{ margin: 0, fontSize: "var(--font-size-lg)" }}>칸 옮기기</h2>
          <div className="tagm-muted">
            양식 {fid}
            {z.id !== "std" ? " · " + z.nm + " 배치" : ""} — 소관 IT(양식)
          </div>
        </div>
        <Button size="sm" onClick={() => store.setView({ lay: false })}>
          끝내기
        </Button>
      </div>
      {!g ? (
        <Hint>
          TAG 에서 <b>칸을 누르거나 끌어</b> 보세요. 점선 상자 하나가 현행 양식의 칸 하나입니다(테두리 · 제목 글자 · 값이 함께 움직임).
        </Hint>
      ) : (
        <>
          <div className={"tagm-valbox" + (all[g.gid] ? " chg" : "")} style={{ fontSize: "var(--font-size-md)", flexDirection: "column", alignItems: "flex-start" }}>
            <b>{sim.gName(fid, g.gid)}</b>
            {items.length > 1 ? (
              <span className="tagm-muted">
                이 칸에 함께 있는 것: {items.map((n) => (n.t === "title" ? "「" + String(n.n).trim() + "」" : sim.itemNm(n.t === "barcode" ? "BARCD" : n.n))).join(", ")}
              </span>
            ) : null}
          </div>
          {g.over ? (
            <div className="tagm-box bad">
              <span>
                <b>글자가 칸보다 깁니다.</b> 폭을 넓히거나 글자 크기를 줄여야 합니다.
              </span>
            </div>
          ) : null}
          <Sec title="좌표 (mm, 왼쪽 위 기준)">
            <div className="tagm-geo">
              {(
                [
                  ["x", "X"],
                  ["y", "Y"],
                  ["w", "폭"],
                  ["h", "높이"],
                ] as const
              ).map(([k, t]) => (
                <Fragment key={k}>
                  <label>{t}</label>
                  <Input aria-label={t} type="number" step="0.5" min="0" value={mm(g[k])} disabled={store.locked} onChange={(x) => setNum(k, x)} />
                </Fragment>
              ))}
            </div>
            <Hint>
              현행 위치: {geoTxt(orig)}
              {all[g.gid] && !own[g.gid] ? " · 표준 크기 배치에서 옮긴 위치를 이어받음" : ""}
            </Hint>
            {own[g.gid] ? (
              <Button size="sm" disabled={store.locked} onClick={() => reset(g.gid)}>
                이 칸 원래 위치로
              </Button>
            ) : null}
          </Sec>
        </>
      )}
      <Sec title="같이 찍히면 겹치는 칸">
        {cl.fresh.length ? (
          <>
            {mine.length ? (
              <>
                <Hint>고른 칸과 겹침 {mine.length}쌍</Hint>
                <ClashList store={store} list={mine} />
              </>
            ) : null}
            {rest.length ? (
              <>
                <Hint>
                  {mine.length ? "그 밖에" : "옮긴 배치에서"} 새로 겹침 {rest.length}쌍
                </Hint>
                <ClashList store={store} list={rest} />
              </>
            ) : null}
          </>
        ) : (
          <Hint>{Object.keys(all).length ? "옮긴 배치에서 새로 겹치는 칸이 없습니다 ✓" : "칸을 옮기면, 옮긴 자리에서 겹치는 칸이 어떤 조건일 때 같이 찍히는지 여기서 바로 봅니다."}</Hint>
        )}
        {no.length ? (
          <details>
            <summary className="tagm-muted">고른 칸과 상자는 겹쳐도 조건상 같이 안 찍힘 {no.length}</summary>
            <ClashList store={store} list={no} />
          </details>
        ) : null}
        <Hint>
          찍힌 자리(글자 폭 · 그림 · 바코드)가 겹치는 두 칸의 「언제 찍히나」 규칙 조건을 서로 맞춰 봅니다. 두 조건이 동시에 맞을 수 없으면 같이 안 찍힙니다. 맞을 수 있으면 그 조건대로
          코일을 만들어 규칙 엔진으로 찍어 확인합니다(같이 찍힘).
          {cl.old.length ? ` 현행 양식에서도 원래 닿아 있던 쌍 ${cl.old.length}개는 빼고 봅니다(칸 목록 탭 「겹침」).` : ""}
        </Hint>
      </Sec>
      <Sec title={`옮긴 칸 ${moved.length}`}>
        {moved.length ? (
          <ul className="tagm-cards">
            {moved.map((id) => (
              <li key={id}>
                <div className="dv">
                  <Button size="mini" onClick={() => store.setView({ gsel: id, gfid: fid })}>
                    {sim.gName(fid, id)}
                  </Button>
                  <span className="tagm-grow" />
                  <Button size="mini" disabled={store.locked} onClick={() => reset(id)}>
                    되돌리기
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Hint>아직 없습니다.</Hint>
        )}
        {moved.length ? (
          <Button size="sm" disabled={store.locked} onClick={() => store.edit("배치 모두 원래대로", (S2) => void delete S2.geo[key])}>
            이 배치 모두 원래대로
          </Button>
        ) : null}
      </Sec>
      <Hint>
        배치는 양식에 대한 것이라 이 양식을 쓰는 <b>모든 코일</b>의 TAG 가 함께 바뀝니다 — {sim.useTxt(nForm).replace("이 값을", "이 양식을")}.
        {z.id !== "std" ? " 이 크기용 배치는 표준 TAG 에는 영향이 없습니다." : ""}
      </Hint>
    </>
  );
}

