"use client";

/**
 * ruleSetEdit — 룰 세트 편집(TSK-08-06). 정본: docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md, design §6.9.
 *
 * 상단 바의 세트 고르기(`IdPicker`)로 고르거나, 룰 세트 화면(등록·목록 링크)이 넘긴 setId 로 연다(`useMdmPageParams`, I22). 16칸 그리드에 룰 세트 카드(10)와
 * 세트 구성 지침 카드(6)를 둔다. 편집 여부는 서버 판정(`editable`·`restorable`)과 RBAC 만 따른다. 세트 값 테스트 카드는 두지 않는다(D2).
 */
import { useCallback } from "react";

import { ErrorModal, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { IdPicker, MdmPageLayout, useMdmPageParams, type IdPickRow } from "@/shell";

import { searchSets } from "./api";
import { GuideCard } from "./cards/GuideCard";
import { RuleSetCard } from "./cards/RuleSetCard";
import { useRuleSetEdit } from "./state/useRuleSetEdit";

const SCREEN_ID = "ruleSetEdit";
const COMPONENT_PATH = "dme/ruleSetEdit";
/** 서버 `RuleSetEditService.PICK_LIMIT` 과 같다. */
const SET_PICK_LIMIT = 20;

async function searchSetPicks(keyword: string): Promise<IdPickRow[]> {
  const res = await searchSets(keyword);
  return (res.sets ?? []).map((s) => ({ id: s.setId, name: s.setName, status: s.status }));
}

export default function RuleSetEditPage({ tabId }: { tabId?: string }) {
  const rbac = useUserButtonRbac();
  const state = useRuleSetEdit();
  const { open } = state;

  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.setId) void open(params.setId);
  });

  const canDo = useCallback((action: string) => canDoButton(rbac, SCREEN_ID, action), [rbac]);
  const view = state.view;
  const canEditList = !!view && view.editable && view.set.status === "INUSE" && canDo("save");

  return (
    <MdmPageLayout group="dme" screenId={SCREEN_ID} title="룰 세트 편집">
      <div
        data-testid="set-edit-topbar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          padding: "var(--spacing-sm) var(--spacing-md)",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <IdPicker
          label="룰 세트"
          placeholder="세트 ID·세트명"
          noun="세트"
          testId="set-pick"
          search={searchSetPicks}
          limit={SET_PICK_LIMIT}
          onPick={(setId) => void open(setId)}
          onError={state.reportError}
        />
        {view && (
          <>
            <span aria-hidden style={{ alignSelf: "stretch", width: 1, margin: "2px var(--spacing-xs)", background: "var(--color-border)" }} />
            <span data-testid="set-edit-current" style={{ fontWeight: 600 }}>
              {`${view.set.setId} · ${view.set.setName}`}
            </span>
          </>
        )}
      </div>

      {/* 본문 영역: PageLayout 은 children 에 스크롤 컨테이너를 두지 않고 overflow:hidden 이라
          카드가 넘치면 잘린다. flex:1 + minHeight:0 로 남는 공간을 흡수해 푸터를 맨 아래에 밀고,
          넘칠 때만 이 div 가 스크롤된다(ContentBody 가 하는 역할의 로컬 버전). */}
      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
        {!view ? (
          <p data-testid="set-edit-empty" style={{ padding: "var(--spacing-lg) var(--spacing-md)", color: "var(--color-text-muted)" }}>
            세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(16, minmax(0, 1fr))",
              gap: "var(--spacing-sm)",
              padding: "var(--spacing-sm) var(--spacing-md)",
            }}
          >
            <div style={{ gridColumn: "span 10", minWidth: 0 }}>
              <RuleSetCard state={state} canDo={canDo} canEditList={canEditList} />
            </div>
            <div style={{ gridColumn: "span 6", minWidth: 0 }}>
              <GuideCard canApply={canEditList && !state.loading} onApply={state.applyGuide} onError={state.reportError} />
            </div>
          </div>
        )}
      </div>

      {state.error && <ErrorModal message={state.error} onClose={state.clearError} />}
    </MdmPageLayout>
  );
}
