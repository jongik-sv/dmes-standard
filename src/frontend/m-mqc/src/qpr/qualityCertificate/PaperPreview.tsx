"use client";

/**
 * 오른쪽 종이 패널 — 브랜드·언어·등급 고르기, 쪽수, 버전·상태와 승인 흐름(승인 요청 → 승인 → 적용본 v+1), 변경 전과 비교, 바뀐 곳 표시,
 * 적용본 대비 변경 목록, A4 종이 미리보기(누르면 그 블록이 열리고, 끌어서 순서를 바꾼다).
 */
import { useState, type CSSProperties, type Ref } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Checkbox, Select, type BadgeTone } from "@dk-oasis/shared/form";
import { MutedText } from "@dk-oasis/shared/card";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";
import { cellBadge, Hint, Row } from "@/common/ui";

import { CompareModal, stateLabel } from "./ComparePanel";
import { BASE_PAGES, BRANDS, GRADES, LANGS } from "./engine/data";
import { clauseOf, docHtml, matchRule, moveBlock, ribbonHtml } from "./engine/doc";
import { PaperFrame, type PaperFrameHandle } from "./PaperFrame";
import type { TabKey, WtyStore } from "./store";

const BAR: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap", padding: "var(--spacing-xs) var(--spacing-md)" };
const GROW: CSSProperties = { flex: 1 };
const BOX: CSSProperties = { padding: "0 var(--spacing-md)" };
const STATE_TONE: Record<string, BadgeTone> = { APPLIED: "success", DRAFT: "warning", PENDING: "primary" };
const DIFF_COLUMNS: GridColumn[] = [
  { key: "tag", header: "구분", width: 90, align: "center", render: (v) => cellBadge(String(v), "warning") },
  { key: "text", header: "내용", width: 320, minWidth: 180, align: "left" },
];

export function PaperPreview({ store, frameRef }: { store: WtyStore; version: number; frameRef: Ref<PaperFrameHandle> }) {
  const { showMessage } = useMessage();
  const [cmpOpen, setCmpOpen] = useState(false);
  const d = store.doc!;
  const { sel, selB, diffOn, pages } = store.ui;
  const q = store.ui.q.trim();
  const st = store.state;
  const an = store.analysis();
  const rule = matchRule(d);
  // 같은 글이면 PaperFrame 이 다시 그리지 않는다(문자열 비교).
  const html = ribbonHtml(st) + docHtml(d, { ver: store.ver, sel: { c: sel, b: selB }, diff: diffOn ? an.b : undefined, q, drag: !store.locked });
  const fail = (e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" });
  const toast = (message: string) => showMessage({ message, alertType: "success", toast: true });

  const approve = () =>
    void store
      .approve()
      .then((v) => toast(`적용본 v${v} 이 되었습니다. 이 시점이 다음 비교 기준입니다.`))
      .catch(fail);
  const discard = () =>
    showMessage({
      title: "확인",
      message: "초안을 버리고 적용본으로 되돌리시겠습니까? 고친 내용이 모두 사라집니다.",
      alertType: "confirm",
      onConfirm: () => void store.discard().then(() => toast("적용본으로 되돌렸습니다.")).catch(fail),
    });

  const pick = (cid: string, bi: number) => {
    store.setUi({ tab: "clause" });
    store.select(cid, bi);
    requestAnimationFrame(() => document.querySelector(`[data-testid="wty-block-${bi}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  const move = (cid: string, from: number, to: number, top: boolean) => {
    if (store.locked) return;
    let at = from;
    store.edit("블록 순서 변경", (x) => {
      const c = clauseOf(x, cid);
      if (c) at = moveBlock(c.b, from, to, top);
    });
    store.select(cid, at);
  };

  return (
    <>
      <div style={BAR}>
        <MutedText>브랜드</MutedText>
        <Select aria-label="브랜드" value={d.brand} options={BRANDS} onChange={(v) => store.setView("brand", v)} />
        <MutedText>언어</MutedText>
        <Select aria-label="언어" value={d.lang} options={LANGS} onChange={(v) => store.setView("lang", v)} />
        <MutedText>등급</MutedText>
        <Select aria-label="등급" value={d.grade} options={GRADES} onChange={(v) => store.setView("grade", v)} />
        <span style={GROW} />
        <Badge tone={pages > BASE_PAGES ? "warning" : "success"} label={`쪽수 ${pages} / 기준 ${BASE_PAGES}`} title={pages > BASE_PAGES ? "기준 쪽수를 넘었습니다" : undefined} />
        <MutedText>적용 양식 · {rule.tpl}</MutedText>
      </div>
      <div style={BAR}>
        <Badge mono label={`적용본 v${store.ver}`} />
        <Badge tone={STATE_TONE[st]} label={stateLabel(st)} testId="wty-state" />
        {st === "PENDING" ? (
          <>
            <Button variant="primary" onClick={approve}>
              승인
            </Button>
            <Button onClick={() => void store.unrequest().then(() => toast("승인 요청을 취소했습니다.")).catch(fail)}>요청 취소</Button>
          </>
        ) : (
          <>
            <Button
              disabled={st !== "DRAFT"}
              onClick={() => void store.request().then(() => toast("승인 요청했습니다. 팀장 역할로 [승인] 을 눌러 보세요.")).catch(fail)}
            >
              승인 요청
            </Button>
            <Button variant="danger" disabled={st !== "DRAFT"} onClick={discard}>
              초안 버리기
            </Button>
          </>
        )}
        <Button onClick={() => setCmpOpen(true)}>변경 전과 비교</Button>
        <Checkbox label="바뀐 곳 표시" checked={diffOn} onChange={(v) => store.setUi({ diffOn: v })} />
      </div>
      {an.rows.length ? (
        <div style={BOX}>
          <AgDataGrid
            gridId="wty-diff"
            title={`적용본 v${store.ver} 대비 변경`}
            count={an.rows.length}
            rowKey="i"
            columns={DIFF_COLUMNS}
            data={an.rows.map(([tag, text], i) => ({ i, tag, text }))}
            columnSizing="fit"
            height={an.rows.length > 6 ? 210 : "auto"}
          />
          <Hint>승인하면 이 변경이 적용본 v{store.ver + 1} 이 되고, 다음 비교 기준도 그때부터입니다. 「변경 전과 비교」 를 누르면 적용본과 나란히 놓고 볼 수 있습니다.</Hint>
        </div>
      ) : null}
      <PaperFrame
        ref={frameRef}
        html={html}
        mode="live"
        pin={d.pinSign !== false}
        margin={d.layout.margin}
        title="품질보증서 종이 미리보기"
        testId="wty-paper-frame"
        onPages={(n) => store.setPages(n)}
        onPick={pick}
        onGo={(tab) => store.setUi({ tab: tab as TabKey })}
        onMove={move}
      />
      {cmpOpen ? <CompareModal store={store} onClose={() => setCmpOpen(false)} /> : null}
    </>
  );
}
