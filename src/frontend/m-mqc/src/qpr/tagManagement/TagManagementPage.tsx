"use client";

/**
 * Tag관리(tagManagement) — TAG 발행 시뮬레이터 목업을 옮긴 시연 화면이다.
 * 왼쪽 예시 코일 · 양식 35종, 가운데 TAG 그림(현행 양식의 칸 위치 · 글꼴), 오른쪽 검사기(칸 · 칸 목록 · 코일 조건 · 출력 점검).
 * 기준값(인증서 · 규격 · 고객 요청) · 글자 크기 · 칸 배치 · 마크를 고치면 초안 → [승인 요청] → [승인] → 적용본 v+1.
 * 규칙 계산 · TAG 그리기 · 겹침 · 바꾼 것은 화면 엔진(engine/)이, 문서 저장 · 상태 · 버전 · 이력은 서버(OASIS tagManagement)가 한다.
 * 계약: docs/mqc/demo/tag-contract.md.
 */
import { useCallback, useEffect, useState } from "react";

import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { errorMessage } from "@/common/oasis";
import { screenMeta } from "@/common/screens";
import { Lead, Stack } from "@/common/ui";

import { realApi, SCREEN_ID, type TagApi } from "./api";
import { CoilList } from "./CoilList";
import { pageDims } from "./engine/sim";
import { Inspector } from "./Inspector";
import { BaseModal, ChangesModal, CompareModal, GoldModal, HelpModal, PrintModal } from "./Modals";
import { useTagStore } from "./store";
import { TAG_CSS } from "./tagCss";
import { TagStage } from "./TagStage";

type ModalKey = "base" | "chg" | "cmp" | "gold" | "help" | "print" | null;

export function TagManagementPage(_props: PageProps) {
  return <TagManagementScreen api={realApi} />;
}

/** 화면 본체. 시험은 `api` 에 가짜를 넘긴다. */
export function TagManagementScreen({ api }: { api: TagApi }) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }), [showMessage]);
  const toast = useCallback((message: string) => showMessage({ message, alertType: "success", toast: true }), [showMessage]);
  const { store, version } = useTagStore(api, fail);
  const [modal, setModal] = useState<ModalKey>(null);
  const [baseFocus, setBaseFocus] = useState<string | undefined>();
  const ready = !!store.sim;

  const reload = useCallback(() => void store.load().catch(fail), [store, fail]);
  // 조회 조건이 없는 화면이라 진입 때 한 번 읽는다(서버에 문서가 없으면 현행 규칙 이관본을 넣는다).
  useEffect(reload, [reload]);

  // 단축키 — 되돌리기 · 다시 실행, 이전 · 다음 코일, K 칸 목록, L 칸 옮기기, 방향키로 고른 칸 옮기기, Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!store.sim || modal) return;
      const typing = /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName || "") || (e.target as HTMLElement)?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const v = store.view;
      const sim = store.sim;
      if (mod && !typing && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const list = sim.COILS;
        const i = list.findIndex((c) => c.id === v.coil);
        store.setView({ coil: list[(i + (e.key === "ArrowUp" ? -1 : 1) + list.length) % list.length].id, pick: "p0" });
        return;
      }
      if (typing || mod || e.altKey) return;
      const fid = store.model().CUR.fid;
      if ((e.key === "k" || e.key === "K") && fid) store.setView({ itab: v.itab === "list" ? "field" : "list" });
      else if ((e.key === "l" || e.key === "L") && fid) store.setView({ lay: !v.lay, ...(!v.lay ? { itab: "field" as const } : {}) });
      else if (e.key === "Escape" && v.lay) store.setView(sim.selG() != null ? { gsel: null } : { lay: false });
      else if (v.lay && e.key.startsWith("Arrow") && sim.selG() != null && fid) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0;
        const dy = e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0;
        const g = sim.curGeo(sim.selG()!);
        if (!g) return;
        const { W, H } = pageDims(v.size);
        store.edit("칸 옮기기", (_S, s2) =>
          s2.setGeo((v.size === "std" ? fid : fid + "@" + v.size), g.gid, { x: Math.max(0, Math.min(W - g.w, g.x + dx)), y: Math.max(0, Math.min(H - g.h, g.y + dy)), w: g.w, h: g.h }),
        );
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [store, modal]);

  const reset = () =>
    showMessage({
      title: "확인",
      message: "바꾼 내용 · 버전 기록 · 이력을 모두 지우고 현행 규칙 이관 상태로 돌리시겠습니까?",
      alertType: "confirm",
      onConfirm: () =>
        void store
          .reset()
          .then(() => toast("처음 상태로 돌렸습니다."))
          .catch(fail),
    });

  const nChg = ready ? store.sim!.changes().length : 0;
  const nGold = ready ? store.sim!.goldOpen() : 0;
  const close = () => setModal(null);
  const mp = { store, version, onClose: close, toast, fail };
  const openBase = (tab?: "lic" | "std" | "cus", focus?: string) => {
    const role = ready ? store.view.role : "all";
    store.setView({ baseTab: tab ?? (role === "sales" ? "cus" : role === "qa" ? "lic" : store.view.baseTab) });
    setBaseFocus(focus);
    setModal("base");
  };

  return (
    <PageLayout
      title={meta.title}
      breadcrumb={meta.breadcrumb}
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", type: "primary", action: "search", onClick: reload, disabled: store.loading },
        { id: "btn_gold", label: `현행과 다른 것 ${nGold}`, action: "search", emitSearch: false, onClick: () => setModal("gold"), disabled: !ready },
        { id: "btn_base", label: "기준값 표", action: "search", emitSearch: false, onClick: () => openBase(), disabled: !ready },
        { id: "btn_chg", label: `바꾼 것 ${nChg}`, action: "search", emitSearch: false, onClick: () => setModal("chg"), disabled: !ready },
        { id: "btn_undo", label: "되돌리기", action: "save", onClick: () => store.undo(), disabled: !store.canUndo },
        { id: "btn_redo", label: "다시 실행", action: "save", onClick: () => store.redo(), disabled: !store.canRedo },
        { id: "btn_print", label: "인쇄", action: "print", onClick: () => setModal("print"), disabled: !ready || !store.model().CUR.fid },
        { id: "btn_help", label: "사용법", action: "search", emitSearch: false, onClick: () => setModal("help"), disabled: !ready },
        { id: "btn_reset", label: "초기화", action: "reset", resetsSearch: false, onClick: reset, disabled: store.loading || !ready },
      ]}
    >
      <style>{TAG_CSS}</style>
      {ready ? (
        <ContentBody root resizable storageKey="mqc.qpr.tagManagement">
          <ContentPanel width={260} minSize={200} scrollY>
            <CoilList store={store} version={version} />
          </ContentPanel>
          <ContentPanel minSize={480} scrollY>
            <TagStage store={store} version={version} toast={toast} fail={fail} onOpen={(m) => setModal(m)} />
          </ContentPanel>
          <ContentPanel width={400} minSize={320} scrollY>
            <Inspector store={store} version={version} toast={toast} onPrint={() => setModal("print")} onBase={openBase} />
          </ContentPanel>
        </ContentBody>
      ) : (
        <Stack>
          <Lead>{store.loading ? "불러오는 중입니다." : "자료를 불러오지 못했습니다. [조회] 를 누르세요."}</Lead>
        </Stack>
      )}
      {ready && modal === "base" ? <BaseModal {...mp} focus={baseFocus} /> : null}
      {ready && modal === "chg" ? <ChangesModal {...mp} onCompare={() => setModal("cmp")} /> : null}
      {ready && modal === "cmp" ? <CompareModal {...mp} /> : null}
      {ready && modal === "gold" ? <GoldModal {...mp} /> : null}
      {ready && modal === "help" ? <HelpModal {...mp} /> : null}
      {ready && modal === "print" ? <PrintModal {...mp} /> : null}
    </PageLayout>
  );
}
