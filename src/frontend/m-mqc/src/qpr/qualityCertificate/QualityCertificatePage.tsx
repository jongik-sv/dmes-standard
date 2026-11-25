"use client";

/**
 * 품질보증서관리(qualityCertificate) — 보증서 편집 시뮬레이터 목업을 옮긴 시연 화면이다.
 * 왼쪽 편집기(조항·블록 · 기준값 · 양식 · 이미지·서명 · 이력) + 오른쪽 A4 종이 미리보기. 고치면 초안 → [승인 요청] → [승인] → 적용본 v+1.
 * 종이 그리기·쪽 나눔·되돌리기·찾기/바꾸기·변경 비교는 화면 엔진(engine/)이, 문서 저장·상태·버전·이력은 서버(OASIS qualityCertificate)가 한다.
 * 계약: docs/mqc/demo/wty-contract.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";
import { Button, Badge } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { errorMessage } from "@/common/oasis";
import { screenMeta } from "@/common/screens";
import { DetailTable, Field, Lead, Stack } from "@/common/ui";

import { realApi, SCREEN_ID, type WtyApi } from "./api";
import { ClausePanel } from "./ClausePanel";
import { FormPanel } from "./FormPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ImagePanel } from "./ImagePanel";
import type { PaperFrameHandle } from "./PaperFrame";
import { PaperPreview } from "./PaperPreview";
import { useWtyStore, type TabKey } from "./store";
import { ValuePanel } from "./ValuePanel";

const PANELS = { clause: ClausePanel, value: ValuePanel, form: FormPanel, image: ImagePanel, hist: HistoryPanel } as const;
const TABS: TabItem[] = [
  { key: "clause", label: "조항·블록" },
  { key: "value", label: "기준값" },
  { key: "form", label: "양식" },
  { key: "image", label: "이미지·서명" },
  { key: "hist", label: "이력" },
];

export function QualityCertificatePage(_props: PageProps) {
  return <QualityCertificateScreen api={realApi} />;
}

/** 화면 본체. 시험은 `api` 에 가짜를 넘긴다. */
export function QualityCertificateScreen({ api }: { api: WtyApi }) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }), [showMessage]);
  const { store, version } = useWtyStore(api, fail);
  const frameRef = useRef<PaperFrameHandle>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const d = store.doc;

  const reload = useCallback(() => void store.load().catch(fail), [store, fail]);
  // 조회 조건이 없는 화면이라 진입 때 한 번 읽는다(서버에 문서가 없으면 기본 문서를 넣는다).
  useEffect(reload, [reload]);

  const reset = () =>
    showMessage({
      title: "확인",
      message: "문서·버전 기록·이력을 모두 지우고 처음 상태로 돌리시겠습니까?",
      alertType: "confirm",
      onConfirm: () =>
        void store
          .reset()
          .then(() => showMessage({ message: "처음 상태로 돌렸습니다.", alertType: "success", toast: true }))
          .catch(fail),
    });

  const Panel = PANELS[store.ui.tab];
  return (
    <PageLayout
      title={meta.title}
      breadcrumb={meta.breadcrumb}
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", type: "primary", action: "search", onClick: reload, disabled: store.loading },
        { id: "btn_undo", label: "되돌리기", action: "save", onClick: () => store.undo(), disabled: !store.canUndo },
        { id: "btn_redo", label: "다시 실행", action: "save", onClick: () => store.redo(), disabled: !store.canRedo },
        { id: "btn_print", label: "인쇄 · PDF", action: "print", onClick: () => frameRef.current?.print(`품질보증서_${d?.brand ?? ""}_v${store.ver}`), disabled: !d },
        { id: "btn_help", label: "사용법", action: "search", emitSearch: false, onClick: () => setHelpOpen(true) },
        { id: "btn_reset", label: "초기화", action: "reset", resetsSearch: false, onClick: reset, disabled: store.loading || !d },
      ]}
    >
      <ContentBody root resizable storageKey="mqc.qpr.qualityCertificate">
        <ContentPanel width={460} minSize={380} scrollY>
          <Tabs items={TABS} activeKey={store.ui.tab} onChange={(k) => store.setUi({ tab: k as TabKey })} />
          {d ? (
            <>
              {store.locked ? (
                <Stack>
                  <Badge tone="warning" label="승인 대기 중에는 고칠 수 없습니다. 더 고치려면 오른쪽 [요청 취소] 를 누르세요." />
                </Stack>
              ) : null}
              <Panel store={store} version={version} />
            </>
          ) : (
            <Stack>
              <Lead>{store.loading ? "불러오는 중입니다." : "자료를 불러오지 못했습니다. [조회] 를 누르세요."}</Lead>
            </Stack>
          )}
        </ContentPanel>
        <ContentPanel minSize={420} scrollY>
          {d ? <PaperPreview store={store} version={version} frameRef={frameRef} /> : null}
        </ContentPanel>
      </ContentBody>
      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}
    </PageLayout>
  );
}

/** 사용법 한 장 요약(목업 도움말을 줄였다). */
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      open
      size="lg"
      title="사용법 — 한 장 요약"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <Stack>
        <Lead>TO-BE 보증서를 담당자가 직접 편집하는 방식을 확인하는 시연 화면입니다. 조항 문구와 보증 수치는 현재 양식을 본뜬 예시값입니다.</Lead>
        <DetailTable>
          <Field label="조항·블록">문구 찾기·모두 바꾸기, 조항 켜고 끄기·순서, 블록(문단·그림·2단·표) 편집. 변수는 {"{{천공보증기간}}"} 처럼 넣습니다.</Field>
          <Field label="기준값">보증 수치 — 고치면 그 값을 쓰는 모든 곳이 함께 바뀝니다.</Field>
          <Field label="양식">글자 크기·줄 간격·여백, 서명 위치 고정, 양식 선택 규칙.</Field>
          <Field label="이미지·서명">그림 교체, 로고·인증마크, 서명자 — 글자 서명·이미지 올리기·직접 서명.</Field>
          <Field label="종이">블록을 누르면 왼쪽에서 열리고, 끌면 같은 조항 안 순서가 바뀝니다. 빨간 점선이 쪽 경계입니다.</Field>
          <Field label="승인 흐름">고치면 초안(빨간 띠) → [승인 요청] → 승인 대기 → [승인] → 적용본 v+1. 승인한 시점이 다음 비교 기준입니다.</Field>
          <Field label="변경 전과 비교">왼쪽 적용본, 오른쪽 현재 문서. 지운 글자·넣은 글자를 표시하고 ◀ ▶ 또는 ← → 로 변경 지점을 오갑니다.</Field>
          <Field label="되돌리기·인쇄">상단 [되돌리기]·[다시 실행]. [인쇄 · PDF] 는 종이만 A4 로 인쇄합니다(인쇄 창에서 「PDF로 저장」).</Field>
        </DetailTable>
      </Stack>
    </Modal>
  );
}
