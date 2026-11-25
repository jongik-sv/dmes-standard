"use client";

/**
 * 검사증명서관리(inspectionCertificate) — 검사증명서(MTC) 발행 시뮬레이터 목업을 옮긴 시연 화면이다.
 * 탭 5개(발행 · 양식 편집 · 단건 수정 · 예외 규칙 · 서명·스탬프)마다 왼쪽 편집 패널 + 오른쪽 A4 종이 미리보기.
 * 값 계산(단건 수정 > 예외 규칙 > 양식 기본값)·종이 그리기는 화면 엔진(engine/)이 하고, 저장·발행 번호·이력은 서버(OASIS inspectionCertificate)가 한다.
 * 계약: docs/mqc/demo/mtc-contract.md.
 */
import { useCallback, useEffect, useMemo } from "react";

import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { errorMessage } from "@/common/oasis";
import { screenMeta } from "@/common/screens";

import { realApi, SCREEN_ID, type MtcApi } from "./api";
import { FormPanel } from "./FormPanel";
import { IssuePanel } from "./IssuePanel";
import { OvrPanel } from "./OvrPanel";
import { PaperPreview } from "./PaperPreview";
import { RulePanel } from "./RulePanel";
import { SignPanel } from "./SignPanel";
import { useMtcStore, type TabKey } from "./store";
import { Lead, Stack } from "@/common/ui";

const PANELS = { issue: IssuePanel, form: FormPanel, ovr: OvrPanel, rule: RulePanel, sign: SignPanel } as const;

export function InspectionCertificatePage(_props: PageProps) {
  return <InspectionCertificateScreen api={realApi} />;
}

/** 화면 본체. 시험은 `api` 에 가짜를 넘긴다. */
export function InspectionCertificateScreen({ api }: { api: MtcApi }) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }), [showMessage]);
  const { store, version } = useMtcStore(api, fail);
  const d = store.data;
  const ui = store.ui;

  const reload = useCallback(() => void store.load().catch(fail), [store, fail]);
  // 조회 조건이 없는 화면이라 진입 때 한 번 모두 읽는다(서버가 비어 있으면 시드를 넣어 돌려준다).
  useEffect(reload, [reload]);

  const tabItems: TabItem[] = useMemo(() => {
    const nIssued = d?.issued.length ?? 0;
    const nDraft = d ? Object.values(d.forms).filter((f) => f.draft || f.pending).length : 0;
    const nOvr = d ? Object.keys(d.ovrs).length : 0;
    const nRuleDraft = d ? d.rules.filter((r) => r.draft).length : 0;
    return [
      { key: "issue", label: `발행 (${nIssued})` },
      { key: "form", label: nDraft ? `양식 편집 · 초안 ${nDraft}` : "양식 편집" },
      { key: "ovr", label: nOvr ? `단건 수정 · ${nOvr}건` : "단건 수정" },
      { key: "rule", label: nRuleDraft ? `예외 규칙 · 초안 ${nRuleDraft}` : "예외 규칙" },
      { key: "sign", label: "서명·스탬프" },
    ];
    // version: store 안 값이 바뀌면 다시 센다.
  }, [d, version]);

  const reset = () =>
    showMessage({
      title: "확인",
      message: "바꾼 양식·예외 규칙·단건 수정·이미지·발행 기록을 모두 지우고 처음 상태로 돌리시겠습니까?",
      alertType: "confirm",
      onConfirm: () =>
        void store
          .reset()
          .then(() => showMessage({ message: "처음 상태로 돌렸습니다.", alertType: "success", toast: true }))
          .catch(fail),
    });

  const Panel = PANELS[ui.tab];
  return (
    <PageLayout
      title={meta.title}
      breadcrumb={meta.breadcrumb}
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", type: "primary", action: "search", onClick: reload, disabled: store.loading },
        { id: "btn_reset", label: "초기화", action: "reset", resetsSearch: false, onClick: reset, disabled: store.loading || !d },
      ]}
    >
      <Tabs items={tabItems} activeKey={ui.tab} onChange={(k) => store.setUi({ tab: k as TabKey })} />
      <ContentBody root resizable storageKey="mqc.qpr.inspectionCertificate">
        <ContentPanel width={460} minSize={360} scrollY>
          {d ? (
            <Panel store={store} version={version} />
          ) : (
            <Stack>
              <Lead>{store.loading ? "불러오는 중입니다." : "자료를 불러오지 못했습니다. [조회] 를 누르세요."}</Lead>
            </Stack>
          )}
        </ContentPanel>
        <ContentPanel minSize={420} scrollY>
          {d ? <PaperPreview store={store} version={version} /> : null}
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
