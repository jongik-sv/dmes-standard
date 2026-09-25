"use client";

/**
 * ruleSetEdit — 룰 세트 편집(TSK-08-06). 정본: docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md, design §6.9.
 *
 * 상단 바에서 세트를 고르거나, 룰 세트 화면(등록·목록 링크)이 넘긴 setId 로 연다(`useMdmPageParams`, I22). 16칸 그리드에 룰 세트 카드(10)와
 * 세트 구성 지침 카드(6)를 둔다. 편집 여부는 서버 판정(`editable`·`restorable`)과 RBAC 만 따른다. 세트 값 테스트 카드는 두지 않는다(D2).
 */
import { useCallback, useState } from "react";

import { ErrorModal, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { Button, Input } from "@dk-oasis/shared/form";
import { MdmPageLayout, useMdmPageParams } from "@/shell";

import { searchSets } from "./api";
import { GuideCard } from "./cards/GuideCard";
import { RuleSetCard } from "./cards/RuleSetCard";
import { useRuleSetEdit } from "./state/useRuleSetEdit";
import type { RuleSetPick } from "./types";

const SCREEN_ID = "ruleSetEdit";
const COMPONENT_PATH = "dme/ruleSetEdit";

export default function RuleSetEditPage({ tabId }: { tabId?: string }) {
  const rbac = useUserButtonRbac();
  const state = useRuleSetEdit();
  const { open } = state;
  const [keyword, setKeyword] = useState("");
  const [picks, setPicks] = useState<RuleSetPick[] | null>(null);

  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.setId) void open(params.setId);
  });

  const handleFind = useCallback(async () => {
    try {
      const res = await searchSets(keyword);
      setPicks(res.sets ?? []);
    } catch (e) {
      state.reportError(e);
    }
  }, [keyword, state]);

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
        <span style={{ fontWeight: 600 }}>룰 세트</span>
        <Input
          data-testid="set-pick-keyword"
          value={keyword}
          placeholder="세트 ID·세트명"
          onChange={setKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleFind();
          }}
          style={{ width: 220 }}
        />
        <Button onClick={() => void handleFind()}>찾기</Button>
        {view && (
          <span data-testid="set-edit-current" style={{ fontWeight: 600 }}>
            {`${view.set.setId} · ${view.set.setName}`}
          </span>
        )}
      </div>

      {picks && (
        <div data-testid="set-pick-list" style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", padding: "var(--spacing-xs) var(--spacing-md)" }}>
          {picks.length === 0 ? (
            <span style={{ color: "var(--color-text-muted)" }}>찾은 세트가 없다</span>
          ) : (
            picks.map((p) => (
              <Button
                key={p.setId}
                size="sm"
                data-testid={`set-pick-${p.setId}`}
                onClick={() => {
                  setPicks(null);
                  void open(p.setId);
                }}
              >
                {`${p.setId} · ${p.setName} · ${p.status}`}
              </Button>
            ))
          )}
        </div>
      )}

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

      {state.error && <ErrorModal message={state.error} onClose={state.clearError} />}
    </MdmPageLayout>
  );
}
