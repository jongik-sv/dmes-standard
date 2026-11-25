"use client";

/**
 * 왼쪽 목록 — 예시 코일(경우별 묶음) / 양식 35종(양식마다 12개월 발행 건수와 골라지는 경로). 찾기 칸으로 거른다.
 * 코일을 누르면 그 코일의 첫 TAG, 양식을 누르면 그 양식을 고르는 예시 코일(없으면 예시 코일 값을 넣어 본 모양)로 간다.
 */
import { Badge, Input, SegmentedControl } from "@dk-oasis/shared/form";

import { Hint, Stack } from "@/common/ui";

import { FAMS } from "./engine/consts";
import type { TagStore } from "./store";

const LMODE = [
  { value: "coil", label: "예시 코일" },
  { value: "form", label: "양식 35종" },
];

export function CoilList({ store }: { store: TagStore; version: number }) {
  const sim = store.sim!;
  const S = store.S!;
  const lm = S.view.lmode;
  const q = store.ui.coilQ.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const pass = (hay: string) => words.every((w) => hay.toLowerCase().includes(w));
  const goCoil = (id: string) => {
    store.setUi({ cusf: null });
    store.setView({ coil: id, pick: "p0" });
  };

  let body: React.ReactNode;
  let note: string;
  let count: string;
  if (lm === "form") {
    const fc = sim.formCoils();
    const all = Object.keys(sim.D.forms);
    const ids = all.filter((f) => pass(f + " " + sim.FI[f].nm + " " + sim.FI[f].fam));
    const cur = store.model().CUR.fid;
    note = "예시 코일로 나오는 양식 " + all.filter((f) => fc[f]).length + "종";
    count = ids.length + " / " + all.length;
    body = FAMS.map((fam) => {
      const list = ids.filter((f) => sim.FI[f].fam === fam).sort((a, b) => (sim.n12(b) || 0) - (sim.n12(a) || 0));
      if (!list.length) return null;
      return (
        <div className="tagm-grp" key={fam}>
          <h4>{fam}</h4>
          {list.map((f) => {
            const r = sim.formRoute(f, fc);
            const n = sim.n12(f);
            return (
              <button
                type="button"
                key={f}
                className="tagm-item"
                aria-current={cur === f}
                title={r.why || ""}
                onClick={() => {
                  store.setUi({ cusf: null });
                  store.setView(sim.formTarget(f));
                }}
              >
                <span className="n">
                  <b>{f}</b> {sim.FI[f].nm}
                </span>
                <span className="m">
                  <Badge tone={r.k === "rule" ? "success" : r.k === "norow" ? "danger" : "neutral"} label={r.t} />
                  <span className="tagm-muted">12개월 {n == null ? "—" : n.toLocaleString()}건</span>
                </span>
              </button>
            );
          })}
        </div>
      );
    });
    if (!ids.length) body = <Hint>찾는 양식이 없습니다.</Hint>;
  } else {
    note = "운영 2주 발행분의 실제 코일 — 경우(양식 · 규칙 줄)마다 1개";
    const groups: Record<string, typeof sim.COILS> = {};
    sim.COILS.slice()
      .sort((a, b) => Number(a.grp === "made") - Number(b.grp === "made") || (b.n2 || 0) - (a.n2 || 0))
      .forEach((c) => {
        const co = sim.coilOf(c.id);
        const nat = sim.M.NAT_CD[co.NAT_CD] || co.NAT_CD;
        const hay = [c.id, c.name, nat, sim.M.PRD_NM_CD[co.PRD_NM_CD] || "", sim.M.CUS[co.CUS_CD] || "", sim.M.CUS[co.FNL_CUS_CD] || "", sim.coilMeta(c.id).forms.join(" ")].join(" ");
        if (!pass(hay)) return;
        const fam = (sim.FI[c.form] || {}).fam || "";
        const g = c.grp === "made" ? "최근 2주 발행 없는 경우(규칙 확인용)" : fam === "제품 TAG" ? "제품 TAG — " + nat : fam || "기타";
        (groups[g] = groups[g] || []).push(c);
      });
    const n = Object.values(groups).reduce((a, g) => a + g.length, 0);
    count = n + " / " + sim.COILS.length;
    body = n ? (
      Object.entries(groups).map(([g, list]) => (
        <div className="tagm-grp" key={g}>
          <h4>{g}</h4>
          {list.map((c) => {
            const m = sim.coilMeta(c.id);
            return (
              <button type="button" key={c.id} className="tagm-item" aria-current={S.view.coil === c.id} data-coil={c.id} onClick={() => goCoil(c.id)}>
                <span className="n">{c.name}</span>
                <span className="tagm-muted">
                  {c.grp === "made"
                    ? `실제 ${c.base}에서 ${(c.changed || []).map((k: string) => sim.colLabel(k)).join(" · ")} 바꿈`
                    : `${c.COIL_ID} · 2주 ${(c.n2 || 0).toLocaleString()}장`}
                </span>
                <span className="m">
                  {m.none ? <Badge label="발행 안 함" /> : m.forms.map((f, i) => <Badge key={f + i} label={f} mono />)}
                  {m.scheme ? <Badge tone="success" label={m.scheme} /> : null}
                  {m.cus ? <Badge tone="danger" label="고객 요청" /> : null}
                  {S.facts[c.id] ? <Badge tone="warning" label="조건 바꿈" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ))
    ) : (
      <Hint>찾는 코일이 없습니다.</Hint>
    );
  }

  return (
    <>
      <Stack>
        <SegmentedControl
          fullWidth
          ariaLabel="목록 종류"
          value={lm}
          options={LMODE}
          onChange={(v) => {
            store.setUi({ coilQ: "" });
            store.setView({ lmode: v as "coil" | "form" });
          }}
        />
        <div className="tagm-bar" style={{ padding: 0 }}>
          <span className="tagm-muted tagm-grow">{note}</span>
          <span className="tagm-muted">{count}</span>
        </div>
        <Input
          type="search"
          aria-label="목록에서 찾기"
          placeholder={lm === "form" ? "찾기 — F0210, 서비스카드, 검사표…" : "찾기 — 인도, GI, 고객명…"}
          value={store.ui.coilQ}
          onChange={(v) => store.setUi({ coilQ: v })}
        />
      </Stack>
      <div className="tagm-list" data-testid="tag-coil-list">
        {body}
      </div>
    </>
  );
}
