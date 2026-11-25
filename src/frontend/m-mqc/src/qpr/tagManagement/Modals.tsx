"use client";

/**
 * 넓은 창들 — 기준값 표(인증서 · 규격 · 고객 요청), 바꾼 것(하나씩 되돌리기 · 적용 이력 · 승인), 적용본과 비교(TAG 두 장),
 * 현행과 다른 것(운영 2주 TAG 를 새 규칙으로 다시 찍어 다른 것만 판정), 사용법, 실물 크기 인쇄.
 */
import { useMemo, useRef, useState } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Input, Select } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { Tabs } from "@dk-oasis/shared/tabs";
import { printElementAsPage } from "@dk-oasis/shared/utils";

import { cellBadge, DetailTable, Field, Hint, Lead, Stack } from "@/common/ui";

import { Val } from "./bits";
import { LIC_F, OWNER, PT_MM, SRC_NM, STD_F, VERD, roleNm } from "./engine/consts";
import { NONE } from "./engine/rules";
import { pageDims } from "./engine/sim";
import { isEdChanged, markOptions, setEd } from "./Inspector";
import { fmtAt, type TagStore } from "./store";

interface MP {
  store: TagStore;
  version: number;
  onClose: () => void;
  toast: (m: string) => void;
  fail: (e: unknown) => void;
}

// ───────── 기준값 표 ─────────
export function BaseModal({ store, onClose, focus }: MP & { focus?: string }) {
  const sim = store.sim!;
  const S = store.S!;
  const tab = S.view.baseTab;
  const [q, setQ] = useState("");
  const U = sim.usage();
  const { CUR } = store.model();
  const ce = CUR.R.ce;
  const lock = store.locked;
  const ql = q.trim().toLowerCase();
  const hitQ = (r: { r: Record<string, string>; c?: unknown }) => !ql || JSON.stringify([r.r, r.c ? sim.condText(r.c as never) : ""]).toLowerCase().includes(ql);
  const chgRule = (kind: string, col: string) => ({ "tagm-cell-chg": (row: Record<string, unknown>) => isEdChanged(store, `${kind}|${String(row.__id)}|${col}`) });
  const ed = (kind: string, col: string, header: string, width = 160): GridColumn => ({
    key: col,
    header,
    width,
    minWidth: 90,
    align: "left",
    editable: () => !lock,
    ...(col === "MARK" ? { cellEditor: "select" as const, cellEditorValues: markOptions(store).map((o) => o.value) } : {}),
    cellClassRules: chgRule(kind, col),
  });
  const used = new Set(Object.values(CUR.R.cus.from));
  let cols: GridColumn[];
  let data: Record<string, unknown>[];
  let lead: string;
  if (tab === "lic") {
    lead = "규격 하나에 우리 공장 인증서 하나. 번호 · 마크 · QR 은 여기 한 곳에만 있고, 그 규격을 쓰는 모든 TAG 가 이 값을 씁니다 — 품질 관리.";
    cols = [
      { key: "ID", header: "인증서", width: 110, align: "left" },
      { key: "SCHEME", header: "제도", width: 70, align: "center" },
      { key: "STD", header: "규격", width: 90, align: "left" },
      ed("lic", "NO", LIC_F.NO, 170),
      ed("lic", "MARK", LIC_F.MARK, 150),
      ed("lic", "QR", LIC_F.QR, 200),
      ed("lic", "TO", LIC_F.TO, 100),
      { key: "use", header: "쓰는 코일", width: 80, align: "right" },
    ];
    data = S.data.lic.filter(hitQ).map((r) => ({ __id: r.r.ID, ...r.r, use: (U.lic[r.r.ID] || 0).toLocaleString(), hit: ce.lic?.r.ID === r.r.ID }));
  } else if (tab === "std") {
    lead = "규격 번호 · 표기 · 영문 품명. 규격이 개정되면 이 줄 하나만 고칩니다 — 품질 관리. ({…}는 코일 값으로 채워지는 자리)";
    cols = [
      { key: "ID", header: "규격", width: 100, align: "left" },
      { key: "KIND", header: "구분", width: 90, align: "center" },
      ...["SHORT", "FULL", "T1", "T2", "DISP"].map((c) => ed("std", c, STD_F[c], c === "T1" || c === "T2" ? 220 : 130)),
      { key: "use", header: "쓰는 코일", width: 80, align: "right" },
    ];
    data = S.data.std.filter(hitQ).map((r) => {
      const o: Record<string, unknown> = { __id: r.r.ID, ...r.r, use: (U.std[r.r.ID] || 0).toLocaleString(), hit: ce.std?.r.ID === r.r.ID };
      for (const c of ["SHORT", "FULL", "T1", "T2", "DISP"]) if (o[c] === NONE) o[c] = "";
      return o;
    });
  } else {
    lead = "한 줄 = 고객 요청 한 건. 위에서부터 먼저 적용되고, 고객 요청은 인증 · 규격 규칙보다 앞섭니다 — 영업 관리. 새 줄은 TAG 에서 칸을 누르고 「이 고객만 다르게」로 넣습니다.";
    cols = [
      { key: "prio", header: "순서", width: 70, align: "center" },
      { key: "cond", header: "언제 (조건)", width: 320, minWidth: 200, align: "left", tooltip: true },
      { key: "item", header: "칸", width: 120, align: "left" },
      {
        key: "val",
        header: "찍을 값",
        width: 240,
        minWidth: 140,
        align: "left",
        editable: () => !lock,
        cellClassRules: { "tagm-cell-chg": (row) => isEdChanged(store, `cus|${String(row.uid)}|${String(row.k)}`) },
      },
      { key: "use", header: "걸리는 코일", width: 90, align: "right" },
      {
        key: "del",
        header: "",
        width: 80,
        align: "center",
        render: (_v, row) =>
          row.first ? (
            <Button size="mini" disabled={lock} onClick={() => store.edit("고객 요청 지우기", (S2) => void (S2.data.cus = S2.data.cus.filter((x) => x.uid !== row.uid)))}>
              지우기
            </Button>
          ) : null,
      },
    ];
    data = S.data.cus
      .slice()
      .sort((a, b) => a.prio - b.prio)
      .filter(hitQ)
      .flatMap((r) =>
        Object.keys(r.r).map((k, i) => ({
          __id: r.uid + "|" + k,
          uid: r.uid,
          k,
          first: i === 0,
          prio: i ? "" : String(r.prio) + (S.base.data.cus.some((b) => b.uid === r.uid) ? "" : " (새)"),
          cond: i ? "" : sim.condText(r.c) + (r.note ? " — " + r.note : ""),
          item: sim.itemNm(k),
          val: r.r[k] === NONE ? "" : r.r[k],
          use: i ? "" : (U.cus[r.uid] || 0).toLocaleString(),
          hit: used.has(r.uid),
        })),
      );
  }
  const tabs = [
    { key: "lic", label: `인증서 ${S.data.lic.length}` },
    { key: "std", label: `규격 ${S.data.std.length}` },
    { key: "cus", label: `고객 요청 ${S.data.cus.length}` },
  ];
  const focusKey = focus && tab === "cus" ? data.find((r) => r.uid === focus)?.__id : focus;
  return (
    <Modal open size="xl" title="기준값 표" onClose={onClose} resizable draggable footer={<Button onClick={onClose}>닫기</Button>}>
      <Stack>
        <div className="tagm-bar" style={{ padding: 0 }}>
          <Tabs items={tabs} activeKey={tab} onChange={(k) => store.setView({ baseTab: k as "lic" | "std" | "cus" })} />
          <span className="tagm-grow" />
          <div style={{ width: 220 }}>
            <Input type="search" aria-label="표에서 찾기" placeholder="표에서 찾기" value={q} onChange={setQ} />
          </div>
        </div>
        <Lead>{lead}</Lead>
        <AgDataGrid
          gridId={"tag-base-" + tab}
          title={tabs.find((t) => t.key === tab)!.label}
          count={data.length}
          rowKey="__id"
          columns={cols}
          data={data}
          height={460}
          singleClickEdit
          highlightedRowKey={(focusKey as string) ?? null}
          scrollToRow={(focusKey as string) ?? null}
          getRowClassExtra={(row) => (row.hit ? "tagm-row-hit" : undefined)}
          rowClassRefreshToken={store.getVersion()}
          onCellValueChanged={({ rowKey, field, newValue }) => {
            const val = String(newValue ?? "");
            if (tab === "cus") {
              const [uid, k] = String(rowKey).split("|");
              setEd(store, `cus|${uid}|${k}`, val);
            } else setEd(store, `${tab}|${String(rowKey)}|${field}`, val);
          }}
        />
        <Hint>
          고친 칸은 주황 · 이 TAG 가 쓰는 줄은 파랑. 쓰는 코일 = 시험용 가상 코일 {U.n.toLocaleString()}건(예시 코일 {sim.COILS.length} + 무작위 조합 1,200) 중 그 줄을 쓰는 코일 수. 실제 생산
          비율이 아닙니다.
        </Hint>
      </Stack>
    </Modal>
  );
}

// ───────── 바꾼 것 ─────────
const VER_COLUMNS: GridColumn[] = [
  { key: "ver", header: "버전", width: 56, align: "center", render: (v) => `v${String(v)}` },
  { key: "at", header: "승인 시각", width: 120, align: "center" },
  { key: "by", header: "승인자", width: 80, align: "center" },
  { key: "memo", header: "내용", width: 300, minWidth: 160, align: "left", tooltip: true },
];
const ACT: Record<string, string> = { INIT: "이관", DRAFT: "초안 수정", REQUEST: "승인 요청", UNREQUEST: "요청 취소", DISCARD: "초안 버림", APPROVE: "승인", RESET: "초기화" };
const HIST_COLUMNS: GridColumn[] = [
  { key: "at", header: "시각", width: 120, align: "center" },
  { key: "act", header: "구분", width: 80, align: "center" },
  { key: "msg", header: "내용", width: 260, minWidth: 140, align: "left", tooltip: true },
  { key: "by", header: "사용자", width: 80, align: "center" },
];

export function ChangesModal({ store, onClose, toast, fail, onCompare }: MP & { onCompare: () => void }) {
  const sim = store.sim!;
  const { showMessage } = useMessage();
  const list = sim.changes();
  const lock = store.locked;
  const st = store.state;
  const cols: GridColumn[] = [
    { key: "who", header: "소관", width: 110, align: "center", render: (v) => cellBadge(String(v)) },
    { key: "what", header: "무엇", width: 220, minWidth: 140, align: "left", tooltip: true },
    { key: "from", header: "적용본", width: 170, minWidth: 100, align: "left", tooltip: true },
    { key: "to", header: "바꾼 뒤", width: 170, minWidth: 100, align: "left", tooltip: true },
    {
      key: "act",
      header: "",
      width: 90,
      align: "center",
      render: (_v, row) => (
        <Button size="mini" disabled={lock} onClick={() => store.edit("하나 되돌리기", (_S, s) => s.revertChange(String(row.id)))}>
          되돌리기
        </Button>
      ),
    },
  ];
  const fmt = (v: unknown) => (v === undefined ? "" : v === NONE ? "(숨김)" : String(v) || "(빈칸)");
  const data = list.map((c) => ({ ...c, from: fmt(c.from), to: fmt(c.to) }));
  const revertAll = () =>
    showMessage({
      title: "확인",
      message: "바꾼 것을 모두 적용본으로 되돌리시겠습니까?",
      alertType: "confirm",
      onConfirm: () => {
        store.edit("모두 되돌리기", (S) => {
          const b = JSON.parse(JSON.stringify(S.base));
          S.data = b.data;
          S.style = b.style;
          S.geo = b.geo || {};
          S.imgs = b.imgs;
        });
        toast("모두 되돌렸습니다. 상단 [되돌리기] 로 다시 살릴 수 있습니다.");
      },
    });
  return (
    <Modal
      open
      size="xl"
      title="바꾼 것"
      onClose={onClose}
      footer={
        <>
          <Button disabled={!list.length} onClick={onCompare}>
            TAG 로 비교
          </Button>
          <Button disabled={!list.length || lock} onClick={revertAll}>
            모두 되돌리기
          </Button>
          {st === "PENDING" ? (
            <Button variant="primary" onClick={() => void store.approve().then((n) => toast(`적용본 v${n} — 이제부터 발행에 쓰입니다.`)).catch(fail)}>
              승인
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={st !== "DRAFT"}
              onClick={() => void store.request().then(() => toast("승인 요청을 보냈습니다. 실제로는 소관 팀장에게 갑니다.")).catch(fail)}
            >
              승인 요청
            </Button>
          )}
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <Stack>
        <Lead>
          {list.length ? `${list.length}건 · 적용본 v${store.ver} 기준. 하나씩 되돌리거나 「TAG 로 비교」 로 두 장을 나란히 본 뒤 승인 요청 → 승인하면 적용본 버전이 올라갑니다.` : "바꾼 것이 없습니다. TAG 에서 칸을 누르고 오른쪽에서 값을 고쳐 보세요."}
        </Lead>
        <AgDataGrid gridId="tag-changes" title="바꾼 것" count={data.length} rowKey="id" columns={cols} data={data} columnSizing="fit" height={data.length > 8 ? 320 : "auto"} emptyMessage="바꾼 것이 없습니다." />
        <AgDataGrid
          gridId="tag-versions"
          title="적용 이력"
          count={store.versions.length}
          rowKey="ver"
          columns={VER_COLUMNS}
          data={store.versions.map((x) => ({ ver: x.ver, at: fmtAt(x.approvedAt), by: x.approvedBy ?? "", memo: x.memo ?? "" }))}
          columnSizing="fit"
          height="auto"
          emptyMessage="적용 이력이 없습니다."
        />
        <AgDataGrid
          gridId="tag-hist"
          title="저장 · 승인 기록"
          count={store.hist.length}
          rowKey="i"
          columns={HIST_COLUMNS}
          data={store.hist.map((h, i) => ({ i, at: fmtAt(h.at), act: ACT[h.act] ?? h.act, msg: h.msg ?? "", by: h.by ?? "" }))}
          columnSizing="fit"
          height={220}
          emptyMessage="기록이 없습니다."
        />
      </Stack>
    </Modal>
  );
}

// ───────── 적용본과 비교 ─────────
const DIFF_COLUMNS: GridColumn[] = [
  { key: "nm", header: "칸", width: 140, align: "left" },
  { key: "a", header: "적용본", width: 220, minWidth: 120, align: "left", tooltip: true },
  { key: "b", header: "바꾼 뒤", width: 220, minWidth: 120, align: "left", tooltip: true },
  { key: "src", header: "출처", width: 100, align: "center", render: (v) => (v ? cellBadge(SRC_NM[String(v)] ?? String(v)) : "") },
];
export function CompareModal({ store, onClose }: MP) {
  const sim = store.sim!;
  const imp = useMemo(() => sim.impact(), [sim]);
  const ch = imp.changedCoils;
  const [idx, setIdx] = useState(() => Math.max(0, ch.findIndex((c) => c.id === store.view.coil)));
  const n = ch.length;
  const c = n ? ch[((idx % n) + n) % n] : null;
  const a = c ? sim.modelOf(c.id, "base", "p0") : null;
  const b = c ? sim.modelOf(c.id, "cur", "p0") : null;
  const chg = a && b ? sim.changedSet(b, a) : new Set<string>();
  const { W } = pageDims(store.view.size);
  const k = Math.min(1.25, (1080 / 2 - 40) / W);
  const fmt = (x: any) => (!x ? "—" : x.t === "image" ? (x.v ? x.v + (x.ver > 1 ? " v" + x.ver : "") : "—") : (x.v || "—") + (x.t === "data" && x.fs !== x.fs0 ? ` (${x.fs}pt)` : ""));
  const rows =
    a && b
      ? b.nodes
          .filter((x, i) => x.t !== "title" && x.t !== "line" && a.nodes[i] && fmt(x) + [x.x, x.y, x.w, x.h].join() !== fmt(a.nodes[i]) + [a.nodes[i].x, a.nodes[i].y, a.nodes[i].w, a.nodes[i].h].join())
          .reduce<typeof b.nodes>((m, x) => (m.some((y) => y.n === x.n) ? m : [...m, x]), [])
          .map((x) => ({ nm: sim.itemNm(x.n), a: fmt(a.nodes[x.i]), b: fmt(x), src: x.info?.src ?? "" }))
      : [];
  return (
    <Modal
      open
      size="xl"
      title="적용본과 비교"
      onClose={onClose}
      resizable
      footer={
        <>
          <Button disabled={n < 2} onClick={() => setIdx(idx - 1)}>
            ◀ 앞 코일
          </Button>
          <Button disabled={n < 2} onClick={() => setIdx(idx + 1)}>
            다음 코일 ▶
          </Button>
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <Stack>
        {!c ? (
          <Lead>지금 내용이 적용본 v{store.ver} 과 같습니다.</Lead>
        ) : (
          <>
            <div className="tagm-bar" style={{ padding: 0 }}>
              <Lead>
                TAG 가 바뀌는 코일 — 예시 코일 {sim.COILS.length}건 중 {n}건 · 무작위 가상 코일 1,200건 중 {imp.sample.changed}건
              </Lead>
              <span className="tagm-grow" />
              <div style={{ width: 280 }}>
                <Select aria-label="코일" value={c.id} options={ch.map((x) => ({ value: x.id, label: x.name }))} onChange={(id) => setIdx(ch.findIndex((x) => x.id === id))} />
              </div>
            </div>
            <div className="tagm-cmp">
              <div>
                <h4>
                  <Badge tone="danger" label={`적용본 v${store.ver}`} /> {a!.fid || ""}
                </h4>
                <div className="tagm-wrap" style={{ display: "inline-block" }} dangerouslySetInnerHTML={{ __html: a!.fid ? sim.tagSvg(a!, { k, chg }) : "" }} />
              </div>
              <div>
                <h4>
                  <Badge tone="warning" label="바꾼 뒤" /> {b!.fid || ""}
                </h4>
                <div className="tagm-wrap" style={{ display: "inline-block" }} dangerouslySetInnerHTML={{ __html: b!.fid ? sim.tagSvg(b!, { k, chg }) : "" }} />
              </div>
            </div>
            <AgDataGrid
              gridId="tag-compare"
              title="바뀐 칸"
              count={rows.length}
              rowKey="nm"
              columns={DIFF_COLUMNS}
              data={rows}
              columnSizing="fit"
              height="auto"
              emptyMessage="첫 번째 TAG 는 같고, 같은 코일의 다른 장이 바뀌었습니다."
            />
          </>
        )}
      </Stack>
    </Modal>
  );
}

// ───────── 현행과 다른 것 ─────────
export function GoldModal({ store, onClose }: MP) {
  const sim = store.sim!;
  const G = sim.GOLD;
  const S = store.S!;
  if (!G)
    return (
      <Modal open size="lg" title="현행과 다른 것" onClose={onClose} footer={<Button onClick={onClose}>닫기</Button>}>
        <Lead>운영 비교 자료가 없습니다.</Lead>
      </Modal>
    );
  const pc = (x: number) => ((x / G.total) * 100).toFixed(1);
  const by: Record<string, number> = { qa: 0, sales: 0, it: 0 };
  G.groups.forEach((g: any) => (by[OWNER[g.src]] += g.n));
  const gs = sim.goldGroups();
  const role = S.view.role;
  return (
    <Modal open size="lg" title={`현행과 다른 것 — ${G.at} · ${G.total.toLocaleString()}장`} onClose={onClose} footer={<Button onClick={onClose}>닫기</Button>}>
      <Stack>
        <div className="tagm-gbar">
          <i className="ok" style={{ width: pc(G.same) + "%" }} />
          <i className="bad" style={{ width: pc(G.diff) + "%" }} />
        </div>
        <Lead>
          운영에서 실제로 찍힌 TAG <b>{G.total.toLocaleString()}</b>장을 <b>새 규칙</b>으로 다시 찍어 칸마다 비교했습니다 — 같음 {G.same.toLocaleString()}장({pc(G.same)}%) · 다름{" "}
          {G.diff.toLocaleString()}장{G.noFacts ? ` · 코일 · 주문을 못 찾음 ${G.noFacts}장` : ""}. 같은 것은 볼 필요가 없습니다. 아래 다른 것만 판정하면 됩니다.
        </Lead>
        <DetailTable>
          {(
            [
              ["qa", "품질", "인증 · 규격 칸"],
              ["sales", "영업", "고객 요청 칸"],
              ["it", "생산 · IT", "아직 옮기지 않은 규칙(기본값이 찍힘)"],
            ] as const
          ).map(([k2, nm, d]) => (
            <Field key={k2} label={nm}>
              {d} <Badge tone={by[k2] ? "danger" : "success"} label={by[k2] ? "다름 " + by[k2].toLocaleString() + "장" : "모두 같음 ✓"} />
            </Field>
          ))}
        </DetailTable>
        {role && role !== "all" ? <Hint>보는 사람 「{roleNm(role)}」 소관만 보입니다.</Hint> : null}
        {gs.length ? (
          <ul className="tagm-cards" data-testid="tag-gold">
            {gs.map((g) => {
              const k2 = sim.goldKey(g);
              const r = S.review[k2] || {};
              return (
                <li key={k2} className={r.v ? "done" : ""}>
                  <div className="dv">
                    <b>{sim.itemNm(g.k)}</b>
                    <Badge label={roleNm(OWNER[g.src])} />
                    <span className="tagm-grow" />
                    <b>{g.n.toLocaleString()}장</b>
                    <span className="tagm-muted">{Object.keys(g.forms).join(" · ")}</span>
                  </div>
                  <div className="gv">
                    <div>
                      <span className="tagm-muted">현행</span>
                      <span>
                        <Val sim={sim} v={g.prod} />
                      </span>
                    </div>
                    <div>
                      <span className="tagm-muted">새 규칙</span>
                      <span>
                        <Val sim={sim} v={g.neu} />
                      </span>
                    </div>
                  </div>
                  <div className="dw">{sim.goldWhy(g)}</div>
                  <div className="dv">
                    <Button
                      size="mini"
                      onClick={() => {
                        if (!g.ex[0]) return;
                        store.showCoilForm(sim.exCoil(g.ex[0]), g.ex[0].form, g.k);
                        onClose();
                      }}
                    >
                      실제 TAG 보기
                    </Button>
                    <span className="tagm-grow" />
                    {VERD.map(([vv, t]) => (
                      <Button key={vv} size="mini" variant={r.v === vv ? "primary" : "default"} onClick={() => store.setReview(k2, { v: r.v === vv ? undefined : vv })}>
                        {t}
                      </Button>
                    ))}
                  </div>
                  <Input aria-label="판정 메모" placeholder="메모 — 판정 이유 · 할 일" value={r.memo || ""} onChange={(x) => store.setReview(k2, { memo: x })} />
                </li>
              );
            })}
          </ul>
        ) : (
          <Lead>이 소관에는 현행과 다른 것이 없습니다.</Lead>
        )}
        <Hint>
          비교 방법: 2주 라벨마다 그 코일 · 주문의 조건을 지금 값으로 가져와 새 규칙을 돌리고, 새 규칙이 값을 정하는 칸(고객 요청 · 인증 · 규격 · 기본값 문자)만 실제 찍힌 값과 비교했습니다.
          코일번호 · 무게처럼 MES 가 보내는 값은 보지 않습니다. 판정 · 메모는 이 화면을 연 동안만 남습니다(시연).
        </Hint>
      </Stack>
    </Modal>
  );
}

// ───────── 사용법 ─────────
export function HelpModal({ store, onClose }: MP) {
  const D = store.sim!.D;
  return (
    <Modal open size="lg" title="사용법 — 한 장 요약" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>닫기</Button>}>
      <Stack>
        <Lead>
          차세대 TAG 의 규칙 구조를 TAG 그림으로 확인하고 의견을 받기 위한 시연 화면입니다. 규칙 표는 현행 SQL 에서 옮겨 와 대조 검증한 것이고, 왼쪽 예시 코일은 규칙이 갈리는 경우마다
          하나씩 만든 코일입니다(무게 · 치수 · 검사자 같은 값은 예시값).
        </Lead>
        <DetailTable>
          <Field label="왼쪽">예시 코일 — 경우별로 묶음, 찾기 칸으로 거름. 양식 35종 — 양식마다 12개월 발행 건수와 골라지는 경로, 누르면 그 양식을 고르는 예시 코일로 봄.</Field>
          <Field label="가운데">그 코일의 TAG — 현행 양식의 칸 위치 · 글꼴 그대로. 마우스를 올리면 칸 이름과 값, 누르면 오른쪽에 자세히. 출처 색칠 · 바뀐 칸 · 빈 칸 · 칸 옮기기 · 확대.</Field>
          <Field label="오른쪽">칸: 값이 어디서 왔는지 · 그 자리에서 고치기 · 이 칸에 나올 수 있는 값 / 칸 목록: 칸 전부 · 언제 찍히나 · 겹침 / 코일 조건: 조건 바꿔 보기 / 출력 점검: 크기 · 해상도 · 마크.</Field>
          <Field label="값은 어디서 오나">고객 요청(영업) → 인증 · 규격(품질) → 표시 규칙 → MES 코일 정보 → 기본값. 출처 색칠을 켜면 TAG 가 이 색으로 칠해집니다.</Field>
          <Field label="고치고 승인하기">값을 고치면 TAG 에 바로 반영되고 초안 띠가 붙습니다(0.7초 뒤 서버에 저장). 바꾼 것에서 하나씩 되돌리거나 TAG 로 비교한 뒤 승인 요청 → 승인하면 적용본 버전이 올라갑니다.</Field>
          <Field label="칸 옮기기">칸을 끌어 옮기고 모서리 점으로 크기를 바꿉니다. 다른 칸 가장자리 · 가운데에 저절로 맞춰지고(Alt 누르면 끔), 방향키 1pt · Shift 10pt. 배치는 양식 하나에 대한 것입니다.</Field>
          <Field label="단축키">Ctrl+Z · Ctrl+Shift+Z 되돌리기 · 다시 실행 / Alt+↑↓ 이전 · 다음 코일 / K 칸 목록 / L 칸 옮기기 / Esc 칸 옮기기 끝내기</Field>
          <Field label="알아둘 것">배율 · 바코드 판독은 화면으로 드러나지 않습니다. 실물 인쇄와 리더기 스캔이 최종 확인입니다. ZT421 300dpi 제조사 사양(헤드 폭 168mm · 인쇄 길이 1,854mm).</Field>
        </DetailTable>
        <Hint>
          만든 때 {D.built} · 규칙 표는 현행 SQL 과 코일 {D.verify.coils.toLocaleString()}건 대조(차이{" "}
          {Object.entries(D.verify.diffs)
            .map(([k, n]) => k + " " + n + "건")
            .join(", ") || "없음"}
          ).
        </Hint>
      </Stack>
    </Modal>
  );
}

// ───────── 실물 크기 인쇄 ─────────
export function PrintModal({ store, onClose, toast }: MP) {
  const sim = store.sim!;
  const ref = useRef<HTMLDivElement>(null);
  const { CUR } = store.model();
  const { W, H } = pageDims(store.view.size);
  const wmm = (W * PT_MM).toFixed(1);
  const hmm = (H * PT_MM).toFixed(1);
  const draft = store.state !== "APPLIED";
  const print = () => {
    if (!ref.current) return;
    try {
      printElementAsPage(ref.current, { title: `TAG_${CUR.fid}_v${store.ver}` });
    } catch {
      toast("이 창에서는 인쇄가 막혀 있습니다.");
    }
  };
  return (
    <Modal
      open
      size="xl"
      title="인쇄용 보기"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={print} title="인쇄 창에서 'PDF로 저장' 을 고르세요">
            인쇄 · PDF 저장
          </Button>
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <Stack>
        <Hint>
          {CUR.fid} · {wmm} × {hmm} mm 실물 크기 — 배율 · 바코드 판독은 실제 TAG 프린터로만 확인됩니다.
        </Hint>
        <div className="tagm-print">
          <div ref={ref} className={"tagm-wrap" + (draft ? " draft" : "")}>
            {draft ? <div className="tagm-ribbon">초안 — 승인 전에는 발행에 쓰이지 않습니다</div> : null}
            <div dangerouslySetInnerHTML={{ __html: CUR.fid ? sim.tagSvg(CUR, { mm: true }) : "" }} />
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
