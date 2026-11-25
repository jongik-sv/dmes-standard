"use client";

/**
 * 오른쪽 종이 패널 — 탭마다 무엇을 그릴지 정하고(목업 previewCtx), 적용 기준 보기·원본/사본·인쇄를 둔다.
 * 발행 탭은 저장된 발행본을 그대로, 다른 탭은 지금 규칙·초안으로 다시 계산한 결과를 그린다.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Badge, Button, Checkbox, SegmentedControl } from "@dk-oasis/shared/form";
import { MutedText } from "@dk-oasis/shared/card";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";

import { FORMNAME } from "./engine/constants";
import { formDiff } from "./engine/diff";
import { matchRule, ctxOf } from "./engine/resolve";
import { paperHtml, type PaperOpt } from "./engine/paper";
import type { Snap } from "./engine/types";
import { PaperFrame, type PaperFrameHandle } from "./PaperFrame";
import { loadPaperAssets, type PaperAssets } from "./paperAssets";
import { fmtAt, type MtcStore } from "./store";

export interface Preview {
  R: Snap;
  cap: string;
  sub?: string;
  chg?: Set<string> | null;
  draft?: boolean;
  verify?: PaperOpt["verify"];
}

/** 탭별 미리보기 대상(목업 previewCtx). */
export function previewOf(store: MtcStore): Preview | null {
  const d = store.data;
  if (!d) return null;
  const ui = store.ui;
  const mtc = (id: string) => d.certs[id]?.head.mtc ?? id;
  if (ui.tab === "issue") {
    const I = store.issuedOf(ui.sel) ?? store.issuedOf(store.issuedIds()[0] ?? "");
    if (!I) return null;
    return {
      R: I.snap,
      cap: mtc(I.certId),
      sub: `발행된 증명서 (${fmtAt(I.issuedAt)})`,
      verify: I.verifyCode ? { code: I.verifyCode, hash: I.docHash ?? "" } : null,
    };
  }
  if (ui.tab === "form") {
    const fk = ui.formSel;
    const fs = d.forms[fk];
    const id = store.formSample(fk);
    if (!id) return { R: store.resolve(Object.keys(d.certs)[0]), cap: "이 양식을 쓰는 예시 증명서가 없습니다", sub: "예외 규칙 「사용 양식」 을 확인하세요" };
    const chg = fs.draft ? new Set(formDiff(fs.applied, fs.draft).map((x) => x.key)) : null;
    return {
      R: store.resolve(id, "draft"),
      chg,
      draft: !!fs.draft,
      cap: FORMNAME[fk],
      sub: `양식 ${fs.draft ? "초안" : "적용본 v" + fs.applied.ver} — 이 양식으로 새로 발행되면 (예시 ${mtc(id)})`,
    };
  }
  if (ui.tab === "rule") {
    const r = store.rule();
    const v = r && (r.draft || r);
    const st = store.st();
    const id = Object.keys(d.certs).find((k) => v && matchRule(v, ctxOf(st, k)).ok);
    const first = Object.keys(d.certs)[0];
    if (!id) return { R: store.resolve(first, "rule"), cap: mtc(first), sub: "이 규칙에 걸리는 예시 증명서가 없습니다" };
    return { R: store.resolve(id, "rule"), cap: mtc(id), sub: `「${v!.name}」${r!.draft ? " 초안" : ""} 적용 미리보기` };
  }
  if (ui.tab === "sign") {
    const x = d.imgs.find((y) => y.name === ui.imgSel);
    const R = store.resolve("C1");
    if (x && x.kind === "서명") R.signImg = x.name;
    else if (x) {
      R.stampImg = x.name;
      R.stamp = true;
    }
    return { R, cap: "이미지 미리보기", sub: `${ui.imgSel} 을(를) 찍으면 (예시 ${mtc("C1")}, 실제 적용은 예외 규칙)` };
  }
  return { R: store.resolve(ui.ovrSel), cap: mtc(ui.ovrSel), sub: "재발행하면 (현재 규칙 + 단건 수정)" };
}

const BAR: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap", padding: "var(--spacing-xs) var(--spacing-md)" };
const GROW: CSSProperties = { flex: 1 };
const NOTE: CSSProperties = { padding: "0 var(--spacing-md)", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" };

export function PaperPreview({ store, version }: { store: MtcStore; version: number }) {
  const { showMessage } = useMessage();
  const [assets, setAssets] = useState<PaperAssets | null>(null);
  const frameRef = useRef<PaperFrameHandle>(null);

  useEffect(() => {
    let alive = true;
    loadPaperAssets()
      .then((a) => {
        if (alive) setAssets(a);
      })
      .catch((e: unknown) => showMessage({ title: "오류", message: errorMessage(e, "종이 양식을 불러오지 못했습니다."), alertType: "error" }));
    return () => {
      alive = false;
    };
  }, [showMessage]);

  // version 이 바뀌면(상태가 바뀌면) 다시 계산한다.
  const pv = useMemo(() => previewOf(store), [store, version]);
  const { origin, copy } = store.ui;
  const html = useMemo(() => {
    if (!pv || !assets) return "";
    return paperHtml(pv.R, { chg: pv.chg, draft: pv.draft, copy, verify: pv.verify }, { imgs: assets.imgs, imgSrc: store.imgSrc });
  }, [pv, assets, copy, store]);

  const notes: string[] = [];
  if (pv && origin) {
    if (pv.R.hidden.length) notes.push("숨긴 칸: " + pv.R.hidden.map(([l, w]) => `${l.replace(/\n/g, " ")} (${w})`).join(", "));
    if (pv.R.overflow) notes.push(`REMARK 줄이 ${pv.R.overflow}줄 넘쳐 종이에 안 보입니다`);
  }

  return (
    <>
      <div style={BAR}>
        <strong>{pv?.cap ?? "—"}</strong>
        <MutedText>
          {pv?.sub ?? ""} {pv ? `· ${pv.R.fname} v${pv.R.fver}` : ""}
        </MutedText>
        <span style={GROW} />
        {pv?.chg && pv.chg.size ? <Badge tone="warning" label="점선 = 초안에서 바뀐 곳" /> : null}
        <Checkbox label="적용 기준 보기" checked={origin} onChange={(v) => store.setUi({ origin: v })} />
        <SegmentedControl ariaLabel="출력" value={copy} options={["원본", "사본"]} onChange={(v) => store.setUi({ copy: v as "원본" | "사본" })} />
        <Button
          data-print-hide=""
          title="인쇄 창에서 「PDF로 저장」 을 고르면 A4 가로 PDF 한 장"
          disabled={!pv || !assets}
          onClick={() => pv && frameRef.current?.print(`검사증명서_${pv.R.T["h.mtc"]}_${copy}`)}
        >
          인쇄 · PDF
        </Button>
      </div>
      <div style={NOTE}>
        {origin ? (
          <>
            <Badge tone="primary" label="예외 규칙" /> <Badge tone="warning" label="단건 수정" /> 표시 없음 = 양식·MES 값. 값에 마우스를 올리면 규칙 이름이 보입니다.
            {notes.length ? ` · ${notes.join(" · ")}` : ""}
          </>
        ) : (
          "「적용 기준 보기」 를 켜면 값이 어디서 왔는지 색으로 보입니다."
        )}
      </div>
      {assets && pv ? (
        <PaperFrame ref={frameRef} assets={assets} html={html} className={`paper fm-${pv.R.fk}${origin ? " origin" : ""}`} />
      ) : (
        <div style={NOTE}>{pv ? "종이 양식을 불러오는 중입니다." : "발행된 증명서가 없습니다."}</div>
      )}
    </>
  );
}
