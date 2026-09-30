"use client";

/**
 * 흐름 툴바(2단계 계획 Task 10, P10) — 세트 머리(ID·상태·row_version)·보기/편집·자동 정렬·화면 맞춤·변수 흐름·세트 저장·폐기/되살리기·
 * 다시 불러오기·메시지 줄. 1단계 룰 세트 카드의 머리·버튼·메시지를 옮겼다.
 *
 * 폐기는 두 단계(폐기 → 폐기 확인/취소)로만 한다(I14·D14). 저장 버튼은 편집 모드·dirty·거부 검사 없음·조건식 IO 기다리지 않음일 때만 켜진다(P-D4·P10).
 */
import { useEffect, useState } from "react";

import { IconArrowsMaximize, IconLayoutDistributeHorizontal, IconVariable } from "@tabler/icons-react";

import { Button } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import type { RuleSetEditState, RuleSetMessage } from "../state/useRuleSetEdit";

const DEPRECATE_WARNING = "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.";

export interface FlowToolbarProps {
  state: RuleSetEditState;
  canDo: (action: string) => boolean;
  /** 편집 모드로 바꿀 수 있는가 — 담당자(editable)·INUSE·저장 권한. */
  canEdit: boolean;
  showVars: boolean;
  onToggleVars: () => void;
  onAutoLayout: () => void;
  onFit: () => void;
}

export function FlowToolbar({ state, canDo, canEdit, showVars, onToggleVars, onAutoLayout, onFit }: FlowToolbarProps) {
  const view = state.view!;
  const set = view.set;
  const inUse = set.status === "INUSE";
  const busy = state.loading;
  const editing = state.mode === "edit";
  const [confirmDeprecate, setConfirmDeprecate] = useState(false);

  useEffect(() => setConfirmDeprecate(false), [view]);

  const hasReject = state.checks.some((c) => c.severity === "REJECT");
  const canSave = editing && canEdit && state.dirty && !hasReject && !state.condIoPending && !busy;
  const canDeprecate = view.editable && inUse && canDo("delete") && !busy;
  const canRestore = view.restorable && !inUse && canDo("restore") && !busy;
  const saveTitle = !editing
    ? "편집 모드에서 저장한다"
    : hasReject
      ? "거부 검사가 있어 저장할 수 없다. 아래 검사 결과를 고친다"
      : state.condIoPending
        ? "조건식을 확인하는 중이다"
        : undefined;

  const message: RuleSetMessage | null = confirmDeprecate ? { kind: "error", text: DEPRECATE_WARNING } : state.message;

  return (
    <div data-testid="flow-toolbar" className="rsf-toolbar">
      <div className="rsf-toolbar-row">
        <span className="rsf-toolbar-group">
          <span data-testid="set-card-id" style={{ fontWeight: 600 }}>
            {set.setId}
          </span>
          <span data-testid="set-status" style={badgeStyle(inUse ? "success" : "muted")}>
            {set.status}
          </span>
          <span data-testid="set-row-version">{`row_version ${set.rowVersion}`}</span>
          <span style={badgeStyle("neutral")}>버전·승인 없음</span>
        </span>

        <span className="rsf-toolbar-sep" aria-hidden />
        <span className="rsf-toolbar-group" role="group" aria-label="보기·편집">
          <Button
            data-testid="flow-mode-view"
            aria-pressed={!editing}
            variant={editing ? "default" : "primary"}
            onClick={() => state.setMode("view")}
          >
            보기
          </Button>
          <Button
            data-testid="flow-mode-edit"
            aria-pressed={editing}
            variant={editing ? "primary" : "default"}
            disabled={!canEdit || busy}
            title={canEdit ? undefined : "담당자이고 사용 중인 세트이며 저장 권한이 있어야 편집한다"}
            onClick={() => state.setMode("edit")}
          >
            편집
          </Button>
        </span>

        <span className="rsf-toolbar-sep" aria-hidden />
        <span className="rsf-toolbar-group">
          <Button data-testid="flow-auto-layout" disabled={!editing || busy} onClick={onAutoLayout}>
            <IconLayoutDistributeHorizontal size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
            자동 정렬
          </Button>
          <Button data-testid="flow-fit" onClick={onFit}>
            <IconArrowsMaximize size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
            화면 맞춤
          </Button>
          <Button data-testid="flow-var-toggle" aria-pressed={showVars} variant={showVars ? "primary" : "default"} onClick={onToggleVars}>
            <IconVariable size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
            변수 흐름
          </Button>
        </span>

        <span className="rsf-toolbar-group rsf-toolbar-end">
          {state.conflict && (
            <Button data-testid="set-reload" onClick={() => void state.reload()} disabled={busy}>
              다시 불러오기
            </Button>
          )}
          {inUse ? (
            confirmDeprecate ? (
              <>
                <Button
                  variant="danger"
                  data-testid="set-deprecate-confirm"
                  disabled={!canDeprecate}
                  onClick={() => {
                    setConfirmDeprecate(false);
                    void state.deprecate();
                  }}
                >
                  폐기 확인
                </Button>
                <Button data-testid="set-deprecate-cancel" onClick={() => setConfirmDeprecate(false)}>
                  취소
                </Button>
              </>
            ) : (
              <Button data-testid="set-deprecate" disabled={!canDeprecate} onClick={() => setConfirmDeprecate(true)}>
                폐기
              </Button>
            )
          ) : (
            <Button data-testid="set-restore" disabled={!canRestore} onClick={() => void state.restore()}>
              되살리기
            </Button>
          )}
          <Button variant="primary" data-testid="set-save" disabled={!canSave} title={saveTitle} onClick={() => void state.save()}>
            세트 저장
          </Button>
        </span>
      </div>

      {message && (
        <div
          data-testid="set-message"
          role="status"
          className="rsf-toolbar-message"
          style={{ color: message.kind === "error" ? "var(--color-danger)" : "var(--color-text-secondary)" }}
        >
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{message.text}</p>
          {(message.lines ?? []).map((l, i) => (
            <p key={i} style={{ margin: 0 }}>
              <span style={badgeStyle("warning")}>경고</span> {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
