"use client";

/**
 * 오른쪽 검사기의 나머지 탭 — 칸 목록(이 양식의 칸 전부 · 언제 찍히나 · 현행 규칙 이관 상태 · 겹침), 코일 조건(규칙이 정한 것 · 조건 바꿔 보기),
 * 출력 점검(TAG 크기와 장비 · 용지, 프린터 해상도로 본 모양, 마크 · 이미지 새 버전).
 */
import { useEffect, useMemo, useRef } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Input, SegmentedControl, Select } from "@dk-oasis/shared/form";

import { cellBadge, DetailTable, Field, Hint } from "@/common/ui";

import { Cond, Sec } from "./bits";
import { FMF, HEAD6, HEAD8, KIND_NM, MAXLEN, MIG_TONE, PT_MM, SIZES, SRC_NM, WK_TONE } from "./engine/consts";
import { threshold, sizeOf, type FmapRow } from "./engine/sim";
import { ClashList, Decision, type PaneProps } from "./Inspector";

const tone = (t: string | undefined) => (t === "neutral" ? undefined : (t as "primary" | "success" | "warning" | "danger" | undefined));

// ───────── 칸 목록 ─────────
const LIST_COLUMNS: GridColumn[] = [
  { key: "name", header: "칸", width: 130, minWidth: 100, align: "left" },
  { key: "kind", header: "종류", width: 56, align: "center" },
  { key: "when", header: "언제 찍히나", width: 110, align: "center", render: (v, r) => cellBadge(String(v), tone(WK_TONE[String(r.wk)])) },
  { key: "now", header: "지금 값", width: 130, minWidth: 90, align: "left" },
  { key: "src", header: "출처", width: 90, align: "center", render: (v) => (v ? cellBadge(SRC_NM[String(v)] ?? String(v)) : "") },
  { key: "memo", header: "비고", width: 170, minWidth: 120, align: "left" },
];

export function ListPane({ store }: PaneProps) {
  const sim = store.sim!;
  const v = store.view;
  const { CUR } = store.model();
  const fid = CUR.fid;
  const rows = useMemo(() => (fid ? sim.fmapRows(CUR) : []), [sim, CUR, fid]);
  if (!fid)
    return (
      <Hint>
        이 코일은 TAG 가 없습니다. <b>코일 조건</b>에서 조건을 바꿔 보세요.
      </Hint>
    );
  const cl = sim.clashScan(fid, v.size);
  const fi = sim.FI[fid] || ({} as { nm?: string });
  const fill = sim.GOLD && sim.GOLD.fill && sim.GOLD.fill[fid];
  const cnt = (k: string) => rows.filter((r) => r.w.k === k).length;
  const gapN = rows.reduce((a, r) => a + r.gap, 0);
  const chkN = rows.reduce((a, r) => a + r.chk, 0);
  const titles = CUR.nodes.filter((n) => n.t === "title" && String(n.v).trim());
  const moved = Object.keys(sim.geoOf(store.S!, fid, v.size)).length || Object.keys(store.S!.style[fid] || {}).length;
  const clOf = (nm: string) => cl.fresh.filter((e) => e.a === nm || e.b === nm);
  const clOld = (nm: string) => cl.old.filter((e) => e.a === nm || e.b === nm);
  const clNo = (nm: string) => cl.apart.filter((e) => e.a === nm || e.b === nm);
  const f = v.fmf;
  const q = store.ui.fmQ.trim().toLowerCase();
  const pass = (r: FmapRow) =>
    (f === "all" ||
      (f === "cond" && /rule|gap|chk|tpl/.test(r.w.k)) ||
      (f === "chk" && r.chk) ||
      (f === "gap" && r.gap) ||
      (f === "clash" && (clOf(r.nm).length || clOld(r.nm).length)) ||
      (f === "same" && /fact|fixed|none/.test(r.w.k))) &&
    (!q || (r.nm + " " + sim.itemNm(r.nm) + " " + (r.n.v || "")).toLowerCase().includes(q));
  const pct = (r: FmapRow) => (r.fl ? `2주 ${Math.round((r.fl[0] / r.fn) * 100)}%` : fill && (sim.inGold(r.nm) || r.nm === "STD_MRK") ? "2주 0%" : "");
  const data = rows.filter(pass).map((r) => {
    const cf = clOf(r.nm);
    const memo = [pct(r), r.cr.length ? `현행 규칙 ${r.cr.length}` : "", r.gap ? `안 옮김 ${r.gap}` : "", r.chk ? `확인 ${r.chk}` : "", cf.length ? `겹침 ${cf.length}` : ""].filter(Boolean).join(" · ");
    return {
      nm: r.nm,
      name: sim.itemNm(r.nm),
      kind: KIND_NM[r.n.t] || r.n.t,
      when: r.w.t.replace(/^조건 따라 — /, ""),
      wk: r.w.k,
      now: !r.n.v ? "(빈칸)" : String(r.n.v).slice(0, 28),
      src: r.n.info?.src ?? "",
      memo,
    };
  });
  const sel = rows.find((r) => r.nm === store.ui.fmSel) || null;
  const nYes = cl.fresh.filter((e) => e.st === "yes").length;
  const nMaybe = cl.fresh.filter((e) => e.st === "maybe").length;
  const al = cl.old.filter((e) => e.conds.some((c) => !Object.keys(c).length)).length;
  const chip = (k: string, t: string) => (cnt(k) ? <Badge key={k} tone={WK_TONE[k]} label={`${t} ${cnt(k)}`} /> : null);

  return (
    <>
      <div>
        <h2 style={{ margin: 0, fontSize: "var(--font-size-lg)" }}>칸 목록</h2>
        <div className="tagm-muted">
          양식 {fid}
          {fi.nm ? " · " + fi.nm : ""} — 칸 {rows.length} · 고정 글자 {titles.length}
        </div>
      </div>
      <div className="tagm-bar" style={{ padding: 0 }}>
        {chip("rule", "조건 따라")}
        {chip("gap", "현행 규칙만")}
        {chip("chk", "확인 필요")}
        {chip("tpl", "양식 서식")}
        {chip("fact", "MES 값")}
        {chip("fixed", "항상 같은 값")}
        {chip("none", "값 없음")}
        {gapN ? <Badge tone="danger" label={`아직 안 옮긴 현행 규칙 ${gapN}`} /> : null}
        {chkN ? <Badge tone="warning" label={`확인 필요 ${chkN}`} /> : null}
      </div>
      <div className={"tagm-box" + (cl.fresh.length ? " bad" : "")}>
        <b>
          {moved
            ? cl.fresh.length
              ? `옮긴 배치에서 새로 겹치는 칸 — 같이 찍힘 ${nYes}쌍${nMaybe ? " · 확인 필요 " + nMaybe + "쌍" : ""}`
              : "옮긴 배치에서 새로 겹치는 칸 없음"
            : "이 양식은 옮긴 칸이 없습니다"}
        </b>
        {cl.old.length ? (
          <span className="tagm-muted">
            현행 양식에서도 원래 닿아 있는 쌍 {cl.old.length} — 늘 닿음 {al}(값과 단위처럼 붙여 그린 칸)
            {cl.old.length - al ? ` · 조건에 따라 닿음 ${cl.old.length - al} — 지금 운영 TAG 에서도 겹쳐 찍힐 수 있는 곳(「겹침」으로 보기)` : ""}
          </span>
        ) : null}
        <span className="tagm-muted">칸마다 「언제 찍히나」 규칙 조건을 서로 맞춰 본 결과{cl.apart.length ? ` · 상자는 겹쳐도 조건상 같이 안 찍히는 쌍 ${cl.apart.length}` : ""}</span>
      </div>
      <SegmentedControl fullWidth ariaLabel="칸 거르기" value={f} options={FMF.map(([value, label]) => ({ value, label }))} onChange={(x) => store.setView({ fmf: x })} />
      <Input type="search" aria-label="칸 찾기" placeholder="칸 찾기" value={store.ui.fmQ} onChange={(x) => store.setUi({ fmQ: x })} />
      <AgDataGrid
        gridId="tag-fields"
        title={`양식 ${fid} 칸`}
        count={data.length}
        rowKey="nm"
        columns={LIST_COLUMNS}
        data={data}
        columnSizing="fit"
        height={340}
        emptyMessage="맞는 칸이 없습니다."
        highlightedRowKey={store.ui.fmSel}
        onRowClick={(r) => store.setUi({ fmSel: store.ui.fmSel === r.nm ? null : String(r.nm) })}
      />
      {sel ? (
        <div className="tagm-box" data-testid="tag-field-detail">
          <div className="tagm-bar" style={{ padding: 0 }}>
            <b className="tagm-grow">{sim.itemNm(sel.nm)}</b>
            <Button
              size="sm"
              onClick={() => {
                store.setUi({ cusf: null });
                store.setView({ sel: sel.nm, itab: "field" });
              }}
            >
              칸 탭에서 고치기
            </Button>
          </div>
          <span className="tagm-muted">{sel.w.s}</span>
          {sel.fl ? (
            <Hint>
              운영 2주 이 양식 {sel.fn.toLocaleString()}장 중 현행 {sel.fl[0].toLocaleString()} · 새 규칙 {sel.fl[1].toLocaleString()}장에 찍힘
            </Hint>
          ) : null}
          <Decision store={store} n={sel.n} />
          {sel.cr.length ? (
            <Sec title={`현행 규칙 — 지금 MES 소스에 있는 것 ${sel.cr.length}개`}>
              {sim.gdiff(sel.nm, fid) ? (
                <Hint>운영 2주 비교: 이 양식에서 이 칸이 현행과 다른 TAG {sim.gdiff(sel.nm, fid).toLocaleString()}장 — 「현행과 다른 것」에서 판정</Hint>
              ) : sim.inGold(sel.nm) ? (
                <Hint>운영 2주 비교: 이 칸은 현행과 모두 같음 ✓</Hint>
              ) : null}
              <ul className="tagm-cards">
                {sel.cr.map((c, i) => (
                  <li key={c.id + i} className={c.mig.k === "gap" ? "bad" : ""}>
                    <div className="dv">
                      <Badge tone={MIG_TONE[c.mig.k]} label={c.mig.t} title={c.mig.d} />
                      <b>{c.v || "(빈칸)"}</b>
                    </div>
                    <div className="dw">{sim.sqlText(c.c || "")}</div>
                    <div className="dn">
                      <span>
                        {c.id} · {c.to} · {c.st}
                      </span>
                      {c.src ? <code title="현행 소스 위치">{String(c.src).split("/").pop()}</code> : null}
                    </div>
                    {c.note ? <div className="tagm-muted">{c.note}</div> : null}
                  </li>
                ))}
              </ul>
            </Sec>
          ) : null}
          {clOf(sel.nm).length || clOld(sel.nm).length || clNo(sel.nm).length ? (
            <Sec title="같이 찍히면 겹치는 칸">
              {clOf(sel.nm).length ? <ClashList store={store} list={clOf(sel.nm)} /> : null}
              {clNo(sel.nm).length ? (
                <details>
                  <summary className="tagm-muted">상자는 겹쳐도 조건상 같이 안 찍힘 {clNo(sel.nm).length}</summary>
                  <ClashList store={store} list={clNo(sel.nm)} />
                </details>
              ) : null}
              {clOld(sel.nm).length ? (
                <details>
                  <summary className="tagm-muted">현행 양식에서도 원래 닿아 있음 {clOld(sel.nm).length}</summary>
                  <ClashList store={store} list={clOld(sel.nm)} old />
                </details>
              ) : null}
            </Sec>
          ) : null}
        </div>
      ) : (
        <Hint>줄을 누르면 새 규칙 줄 · 현행 규칙 · 겹치는 칸이 펼쳐지고 가운데 TAG 에서 그 칸이 표시됩니다. 이 탭에서 TAG 칸을 누르면 그 줄이 열립니다.</Hint>
      )}
      <Hint>
        <b>조건 따라</b>: 새 규칙 표의 줄이 정함 · <b>현행 규칙만</b>: 현행엔 조건이 있는데 새 표에 없음 · <b>확인 필요</b>: 현행 조건이 새 표 어디로 갔는지 기록 없음 ·{" "}
        <b>양식 서식</b>: 차세대 양식이 처리할 몫(화면은 예시값) · <b>MES 값</b>: 코일 정보가 있으면 찍힘. 2주 %는 운영 라벨 {sim.GOLD ? sim.GOLD.at : ""}에서 이 양식 TAG 중 그 칸에
        값이 있던 비율. 글자 폭은 화면 글꼴 기준이라 실제 프린터 글꼴과 조금 다를 수 있습니다.
      </Hint>
    </>
  );
}

// ───────── 코일 조건 ─────────
export function CoilPane({ store }: PaneProps) {
  const sim = store.sim!;
  const S = store.S!;
  const v = S.view;
  const M = sim.M;
  const c = sim.coilOf(v.coil);
  const { CUR } = store.model();
  const R = CUR.R;
  const ce = R.ce;
  const mod = S.facts[v.coil] || {};
  const ap = sim.T.apply.rows.find((r) => r.uid === ce.apply);
  const flags = (
    [
      ["isPrimeGrade", "정품"],
      ["isExport", "수출"],
      ["isLamina", "Lamina"],
      ["isBisExcludedGrade", "BIS 제외 등급"],
      ["isBomU9", "BOM U · 9"],
    ] as const
  )
    .filter(([k]) => R.ctx["@" + k] !== undefined)
    .map(([k, nm]) => `${nm} ${R.ctx["@" + k] ? "예" : "아니오"}`)
    .join(" · ");
  const FACT_EDIT: [string, string, Record<string, string>?][] = [
    ["NAT_CD", "나라", M.NAT_CD],
    ["PRD_NM_CD", "품명", M.PRD_NM_CD],
    ["SHP", "형상", { C: "코일", S: "시트" }],
    ["OP_GRD", "OP 등급", { "1": "정품(1)", D: "D", S: "S", "": "(없음)" }],
    ["CUS_CD", "주문고객", M.CUS],
    ["FNL_CUS_CD", "최종고객", M.CUS],
    ["STD_MRK", "규격 마크", { "": "(없음)", KS: "KS", JIS: "JIS", MS: "MS", SNI: "SNI" }],
    ["MTL_CD", "재질코드"],
    ["ORD_EXC_THK", "두께"],
    ["TAG_SIZ", "TAG 치수"],
    ["CCL_BOM_NO", "BOM 번호"],
    ["ORD_TEM_CD", "영업팀"],
    ["ORD_USG_CD", "용도코드"],
    ["TAG_PART_NO", "Part No"],
  ];
  const setFact = (k: string, val: string) => {
    store.edit(
      "코일 조건 바꿔 보기",
      (S2) => {
        const f = (S2.facts[v.coil] = S2.facts[v.coil] || {});
        if (k === "SHP") {
          f.PRD_SHP = val;
          f.COIL_SHP = val;
        } else f[k] = val;
        const b = sim.coilBase(v.coil) || {};
        for (const kk of Object.keys(f)) if (String(b[kk] == null ? "" : b[kk]) === String(f[kk])) delete f[kk];
        if (!Object.keys(f).length) delete S2.facts[v.coil];
      },
      { factsOnly: true },
    );
    store.setView({ pick: "p0" });
  };
  return (
    <>
      <Hint>
        조건을 바꾸면 <b>규칙이 다시 돌아</b> TAG 가 바로 바뀝니다. 시험용 입력이라 승인 대상이 아닙니다(실제로는 MES 가 보내는 값).
      </Hint>
      <Sec title="규칙이 정한 것">
        <DetailTable>
          <Field label="찍을 TAG">
            {R.prints.length ? R.prints.map((p) => ((M.TAG_PUB_TYPE && M.TAG_PUB_TYPE[p.pt]) || p.pt) + " · " + (p.form || "?")).join(" / ") : "발행 안 함"}
          </Field>
          <Field label="적용 규격" hint={ap ? <Cond sim={sim} c={ap.c} /> : undefined}>
            {ce.std ? <b>{ce.std.r.ID}</b> : "—"}
          </Field>
          <Field label="인증서">{ce.lic ? `${ce.lic.r.ID} ${ce.lic.r.NO || ""}` : ce.certOff ? "인증 표시 안 함 (예외)" : "—"}</Field>
          <Field label="고객 요청">{Object.keys(R.cus.vals).length ? Object.keys(R.cus.vals).map(sim.itemNm).join(", ") : "—"}</Field>
          <Field label="판정">{flags}</Field>
        </DetailTable>
      </Sec>
      <Sec title="코일 조건">
        <div className="tagm-kv" data-testid="tag-facts">
          {FACT_EDIT.map(([k, nm, m]) => {
            const val = String(k === "SHP" ? c.PRD_SHP ?? "" : c[k] == null ? "" : c[k]);
            const chg = (k === "SHP" ? "PRD_SHP" : k) in mod;
            if (m) {
              const opts: Record<string, string> = { ...m };
              if (!(val in opts)) opts[val] = val;
              return (
                <Pair key={k} label={nm} chg={chg}>
                  <Select
                    aria-label={nm}
                    value={val}
                    options={Object.entries(opts).map(([a, b]) => ({ value: a, label: a === "" ? b : b === a ? a : `${b} (${a})` }))}
                    onChange={(x) => setFact(k, x)}
                  />
                </Pair>
              );
            }
            return (
              <Pair key={k} label={nm} chg={chg}>
                <Input aria-label={nm} value={val} onChange={(x) => setFact(k, x)} />
              </Pair>
            );
          })}
        </div>
        {Object.keys(mod).length ? (
          <Button
            size="sm"
            onClick={() =>
              store.edit("코일 조건 원래대로", (S2) => void delete S2.facts[v.coil], { factsOnly: true })
            }
          >
            원래대로
          </Button>
        ) : null}
      </Sec>
    </>
  );
}
function Pair({ label, chg, children }: { label: string; chg: boolean; children: React.ReactNode }) {
  return (
    <>
      <label>{label}</label>
      <div className={chg ? "chg" : ""}>{children}</div>
    </>
  );
}

// ───────── 출력 점검 ─────────
const MEDIA = [
  { value: "cut", label: "재단 용지" },
  { value: "cont", label: "이어진 용지 + 커터" },
  { value: "unknown", label: "모름" },
];
const RES = [
  { value: "screen", label: "화면" },
  { value: "300", label: "300dpi 흑백" },
  { value: "203", label: "203dpi 흑백" },
];

export function OutPane({ store, onPrint, toast }: PaneProps) {
  const sim = store.sim!;
  const S = store.S!;
  const v = S.view;
  const { CUR } = store.model();
  const z = sizeOf(v.size);
  const len = 235.3 * z.fx;
  const head = 122.8 * z.fy;
  const ok6 = head <= HEAD6;
  const ok8 = head <= HEAD8;
  const okLen = len <= MAXLEN;
  const md = v.media || "unknown";
  const longer = z.fx > 1;
  const media: [string, "success" | "danger"] =
    z.fy > 1 ? ["더 넓은 용지 · 새 용지 필요", "danger"] : !longer ? ["그대로 · 바꿀 것 없음", "success"] : md === "cut" ? ["재단 용지 · 새 용지 필요", "danger"] : md === "cont" ? ["이어진 용지 · 설정만 변경", "success"] : ["확인 전 · 현장 확인", "danger"];
  const mediaTxt =
    md === "cut"
      ? `지금 용지로는 안 됩니다. 프린터가 235mm 마다 경계를 읽어 한 장으로 알기 때문에, ${len.toFixed(0)}mm 를 보내면 다음 장까지 걸쳐 찍히거나 위치 오류로 멈춥니다(TAG 의 빨간 점선). 이 길이로 재단한 용지를 새로 주문해야 합니다.`
      : md === "cont"
        ? "용지는 그대로 씁니다. 프린터 커터가 원하는 길이에서 자르므로 ① 프린터의 용지 길이 설정 ② 프로그램의 용지 크기(현행 348×667pt)만 바꾸면 됩니다."
        : "지금 용지가 어느 쪽인지에 따라 갈립니다. 롤을 보아 235mm 마다 틈 · 구멍 · 검은 표시가 있으면 재단 용지(새 크기 용지 주문 필요), 끊김 없이 이어져 있으면 이어진 용지(설정만 변경)입니다.";
  const verdict =
    z.id === "std"
      ? { cls: "ok", t: "현행 크기 — ZT421 · ZT420 · PX6i(6인치기)로 찍습니다." }
      : !ok6 && ok8
        ? { cls: "bad", t: `지금 장비로는 안 됩니다. 세로 ${head.toFixed(1)}mm 가 6인치기 헤드 폭(168mm)을 넘습니다. 8인치급(최대 216mm)을 새로 들여야 하며 보유 대수는 0입니다.` }
        : !ok6
          ? { cls: "bad", t: `일반 TAG 프린터로는 안 됩니다. 세로 ${head.toFixed(1)}mm 는 8인치급(216mm)도 넘습니다.` }
          : { cls: md === "cont" ? "ok" : md === "cut" ? "bad" : "warn", t: `프린터는 지금 장비로 찍을 수 있습니다(최대 길이 1,854mm 안). 용지는 — ${mediaTxt}` };
  const imgs = [...new Map(CUR.nodes.filter((n) => n.t === "image" && n.v).map((n) => [n.v as string, n])).values()];
  const fileRef = useRef<HTMLInputElement>(null);
  const upFor = useRef("");
  const upload = (file: File | undefined) => {
    const f = upFor.current;
    if (!file || !f) return;
    if (file.size > 400 * 1024) return toast("400KB 이하 이미지만 올릴 수 있습니다. 마크는 작은 흑백 이미지면 충분합니다.");
    const rd = new FileReader();
    rd.onload = () => {
      store.edit("마크 새 버전", (S2) => void (S2.imgs[f] = S2.imgs[f] || []).push({ src: String(rd.result), at: "2026-11-25", name: file.name }));
      toast("새 버전을 등록했습니다. 승인 전까지는 발행에 쓰이지 않습니다.");
    };
    rd.readAsDataURL(file);
  };
  return (
    <>
      <Sec title="TAG 크기 — 장비로 찍을 수 있나">
        <SegmentedControl fullWidth ariaLabel="TAG 크기" value={v.size} options={SIZES.map((s) => ({ value: s.id, label: s.nm }))} onChange={(x) => store.setView({ size: x, zoom: "fit" })} />
        {longer ? (
          <div style={{ marginTop: 8 }}>
            <span className="tagm-muted">지금 쓰는 용지</span>
            <SegmentedControl fullWidth ariaLabel="지금 쓰는 용지" value={md} options={MEDIA} onChange={(x) => store.setView({ media: x })} />
          </div>
        ) : null}
        <DetailTable>
          <Field label="세로 (헤드 폭)">
            {head.toFixed(1)}mm <Badge tone={ok6 ? "success" : "danger"} label={ok6 ? "6인치기 가능" : ok8 ? "8인치기 필요" : "불가"} />
          </Field>
          <Field label="가로 (길이)">
            {len.toFixed(1)}mm <Badge tone={okLen ? "success" : "danger"} label={okLen ? "프린터 가능" : "불가"} />
          </Field>
          <Field label="용지">
            <Badge tone={media[1]} label={media[0]} />
          </Field>
        </DetailTable>
        <div className={"tagm-box " + verdict.cls} style={{ marginTop: 8 }}>
          {verdict.t}
        </div>
        {longer && ok6 ? (
          <Hint>
            남는 일: 양식을 새로 그리기 — 빗금 자리는 비어 있습니다. 가운데 <b>칸 옮기기</b>로 이 크기용 배치를 미리 그려 볼 수 있습니다.
          </Hint>
        ) : null}
      </Sec>
      <Sec title="프린터로 찍힐 모양">
        <SegmentedControl fullWidth ariaLabel="해상도" value={v.res} options={RES} onChange={(x) => store.setView({ res: x })} />
        <Hint>TAG 프린터는 흑백 점으로 찍습니다. 작은 한글 · 마크가 뭉개지는지 미리 봅니다(최종 판정은 실물 인쇄와 리더기).</Hint>
      </Sec>
      <Sec title="이 TAG 의 마크 · 이미지">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {imgs.length ? (
            imgs.map((n) => {
              const f = String(n.v);
              const isNew = sim.imgVers(f, S).length > sim.imgVers(f, S.base).length;
              return (
                <div className="tagm-asset" key={f}>
                  <div className="th">
                    <img src={sim.imgSrc(f, S) || ""} alt="" />
                  </div>
                  <div>
                    <div className="tagm-bar" style={{ padding: 0 }}>
                      <b>{sim.itemNm(n.n)}</b>
                      <Badge tone={isNew ? "warning" : "primary"} mono label={`v${sim.imgVer(f, S)}${isNew ? " 승인 전" : ""}`} />
                    </div>
                    <div className="tagm-muted">
                      {f} · 칸 {(n.w * PT_MM).toFixed(1)}×{(n.h * PT_MM).toFixed(1)}mm
                    </div>
                    <div className="tagm-bar" style={{ padding: "4px 0 0" }}>
                      <Button
                        size="sm"
                        disabled={store.locked}
                        onClick={() => {
                          upFor.current = f;
                          fileRef.current?.click();
                        }}
                      >
                        새 버전 등록
                      </Button>
                      {isNew ? (
                        <Button
                          size="sm"
                          disabled={store.locked}
                          onClick={() =>
                            store.edit("마크 새 버전 취소", (S2, s) => {
                              S2.imgs[f] = s.imgVers(f, S2).slice(0, s.imgVers(f, S2.base).length);
                              if (!S2.imgs[f].length) delete S2.imgs[f];
                            })
                          }
                        >
                          새 버전 취소
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <Dots src={sim.imgSrc(f, S) || ""} w={n.w} h={n.h} />
                </div>
              );
            })
          ) : (
            <Hint>이 TAG 에는 마크 · 이미지가 없습니다.</Hint>
          )}
        </div>
        <Hint>교체는 덮어쓰기가 아니라 새 버전 등록이고 승인 전에는 발행에 쓰이지 않습니다.</Hint>
      </Sec>
      <Button onClick={onPrint} disabled={!CUR.fid}>
        실물 크기로 인쇄 · PDF
      </Button>
    </>
  );
}

/** 마크를 프린터 해상도(203 · 300dpi) 흑백 점으로 본 모양. */
function Dots({ src, w, h }: { src: string; w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !src || typeof Image === "undefined") return;
    el.innerHTML = "";
    let live = true;
    [203, 300].forEach((dpi) => {
      const cw = Math.max(1, Math.round(((w * PT_MM) / 25.4) * dpi));
      const ch = Math.max(1, Math.round(((h * PT_MM) / 25.4) * dpi));
      const img = new Image();
      img.onload = () => {
        if (!live) return;
        const cv = document.createElement("canvas");
        cv.width = cw;
        cv.height = ch;
        const g = cv.getContext("2d");
        if (!g) return;
        g.fillStyle = "#fff";
        g.fillRect(0, 0, cw, ch);
        g.drawImage(img, 0, 0, cw, ch);
        threshold(g, cw, ch);
        const zm = Math.min(3, 140 / cw, 90 / ch);
        cv.style.width = cw * zm + "px";
        cv.style.height = ch * zm + "px";
        const fig = document.createElement("figure");
        fig.appendChild(cv);
        const cap = document.createElement("figcaption");
        cap.textContent = dpi + "dpi · " + cw + "×" + ch + "점";
        fig.appendChild(cap);
        el.appendChild(fig);
      };
      img.src = src;
    });
    return () => {
      live = false;
    };
  }, [src, w, h]);
  return <div className="tagm-dots" ref={ref} />;
}

