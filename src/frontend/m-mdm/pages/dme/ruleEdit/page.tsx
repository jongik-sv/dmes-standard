"use client";

/**
 * ruleEdit — 룰 화면 골격(TSK-08-02). 정본: docs/mdm/screens/ruleEdit/ruleEdit_기능설계서.md.
 *
 * 상단 바(룰 고르기·버전 고르기·잠금 배지·알림)와 `cards.ts` 의 카드를 순서대로 그린다. 룰 조회 화면에서 넘어오면
 * handoff 대상(`@/dme/rule-handoff`)을 한 번 읽어 그 룰을 연다. 이미 열린 탭은 대상 이벤트를 듣고 바꾼다(D9·I28).
 * 편집 여부는 서버 판정(`editable`·`headerEditable`)만 따른다(I7).
 */
import { useCallback, useEffect, useState } from "react";

import { ErrorModal, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { DraftLockBadge, MdmPageLayout, VersionStatusBadge, badgeStyle } from "@/shell";
import { RULE_EDIT_TARGET_EVENT, takeRuleEditTarget, type RuleEditTarget } from "@/dme/rule-handoff";

import { searchRulePrefix } from "./api";
import { RULE_EDIT_CARDS, type RuleEditCardProps } from "./cards";
import { useRuleEdit } from "./state/useRuleEdit";
import type { RulePickRow } from "./types";

const SCREEN_ID = "ruleEdit";

export default function RuleEditPage() {
  const rbac = useUserButtonRbac();
  const state = useRuleEdit();
  const { open } = state;
  const [keyword, setKeyword] = useState("");
  const [picks, setPicks] = useState<RulePickRow[] | null>(null);

  // handoff — 마운트할 때 남은 대상을 읽고, 열린 뒤에는 이벤트로 받는다(읽은 대상은 지운다).
  useEffect(() => {
    const target = takeRuleEditTarget();
    if (target) void open(target.ruleId, target.ver);
    const onTarget = (e: Event) => {
      const detail = (e as CustomEvent<RuleEditTarget>).detail;
      takeRuleEditTarget();
      if (detail?.ruleId) void open(detail.ruleId, detail.ver);
    };
    window.addEventListener(RULE_EDIT_TARGET_EVENT, onTarget);
    return () => window.removeEventListener(RULE_EDIT_TARGET_EVENT, onTarget);
  }, [open]);

  const handleFind = useCallback(async () => {
    try {
      setPicks(await searchRulePrefix(keyword));
    } catch (e) {
      state.notify({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }, [keyword, state]);

  const view = state.view;
  const selected = view?.versions.find((v) => v.ver === view.selectedVer) ?? null;
  const canDo = useCallback((action: string) => canDoButton(rbac, SCREEN_ID, action), [rbac]);

  const cardProps: RuleEditCardProps | null = view
    ? {
        view,
        me: view.me,
        editable: view.editable,
        reload: state.reload,
        selectVer: state.selectVer,
        notify: state.notify,
        runWrite: state.runWrite,
        setDirty: state.setDirty,
        canDo,
        busy: state.loading,
      }
    : null;

  return (
    <MdmPageLayout group="dme" screenId={SCREEN_ID} title="룰 화면">
      <div
        data-testid="rule-edit-topbar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          padding: "var(--spacing-sm) var(--spacing-md)",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <span style={{ fontWeight: 600 }}>룰</span>
        <Input
          data-testid="rule-pick-keyword"
          value={keyword}
          placeholder="룰 ID·룰명 앞부분"
          onChange={setKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleFind();
          }}
          style={{ width: 220 }}
        />
        <Button onClick={() => void handleFind()}>찾기</Button>
        {view && (
          <>
            <span data-testid="rule-edit-current" style={{ fontWeight: 600 }}>
              {view.rule.maruRuleId}
            </span>
            <span data-testid="rule-edit-current-name">{view.rule.maruRuleName}</span>
            <span>버전</span>
            <Select
              data-testid="rule-ver-select"
              value={view.selectedVer ?? ""}
              options={view.versions.map((v) => ({ value: String(v.ver), label: `${v.ver} (${v.status})` }))}
              onChange={(v) => void state.selectVer(Number(v))}
              style={{ width: 150 }}
            />
            {selected && <VersionStatusBadge status={selected.status} applyFrom={selected.applyFrom} />}
            {selected && <DraftLockBadge status={selected.status} ownerId={selected.ownerId} currentUserId={view.me} />}
            {view.rule.sourceKind !== "MDM" && (
              <span data-testid="rule-readonly-badge" style={badgeStyle("muted")}>
                조회 전용(외부 원천)
              </span>
            )}
          </>
        )}
        {state.conflict && (
          <Button onClick={() => void state.reload()} disabled={state.loading}>
            다시 불러오기
          </Button>
        )}
        {state.notice && (
          <span
            role="status"
            data-testid="rule-edit-notice"
            style={{ color: state.notice.kind === "error" ? "var(--color-danger)" : "var(--color-text-secondary)" }}
          >
            {state.notice.text}
          </span>
        )}
      </div>

      {picks && (
        <div data-testid="rule-pick-list" style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", padding: "var(--spacing-xs) var(--spacing-md)" }}>
          {picks.length === 0 ? (
            <span style={{ color: "var(--color-text-muted)" }}>찾은 룰이 없습니다.</span>
          ) : (
            picks.map((p) => (
              <Button
                key={p.maruRuleId}
                size="sm"
                data-testid={`rule-pick-${p.maruRuleId}`}
                onClick={() => {
                  setPicks(null);
                  void state.open(p.maruRuleId);
                }}
              >
                {`${p.maruRuleId} · ${p.maruRuleName}`}
              </Button>
            ))
          )}
        </div>
      )}

      {!cardProps ? (
        <p data-testid="rule-edit-empty" style={{ padding: "var(--spacing-lg) var(--spacing-md)", color: "var(--color-text-muted)" }}>
          룰을 고르세요. 위 칸에 룰 ID·룰명 앞부분을 넣고 [찾기] 를 누르거나 룰 목록에서 룰 ID 를 누릅니다.
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
          {RULE_EDIT_CARDS.map((slot) => (
            <div key={slot.id} style={{ gridColumn: `span ${slot.span}`, minWidth: 0 }}>
              <slot.Component {...cardProps} />
            </div>
          ))}
        </div>
      )}

      {state.error && <ErrorModal message={state.error} onClose={state.clearError} />}
    </MdmPageLayout>
  );
}
