"use client";

/**
 * 흐름 툴바(2단계 계획 Task 10, P10) — 세트 머리(ID·상태·row_version)·보기/편집·자동 정렬·화면 맞춤·변수 흐름·세트 저장·폐기/되살리기·
 * 다시 불러오기·메시지 줄. 1단계 룰 세트 카드의 머리·버튼·메시지를 옮겼다.
 *
 * 폐기는 두 단계(폐기 → 폐기 확인/취소)로만 한다(I14·D14). 저장 버튼은 편집 모드·dirty·거부 검사 없음·조건식 IO 기다리지 않음일 때만 켜진다(P-D4·P10).
 *
 * 3단계(계획 P1·P12): 모드 단추 셋(보기·편집·디버그 — 디버그는 누구나), 되돌리기·다시 하기(편집 모드이고 기록이 있을 때), 미니맵 켜고 끄기.
 * 찾기 칸(Enter·[다음] 으로 돈다)과 단축키 도움말 [?] 를 둔다(Task 8). 도움말은 지금 모드의 단축키만 짧은 정의 목록으로 보인다.
 */
import { useEffect, useState, type RefObject } from "react";

import { IconArrowBackUp, IconArrowForwardUp, IconArrowsMaximize, IconHelp, IconLayoutDistributeHorizontal, IconMap, IconSearch, IconVariable } from "@tabler/icons-react";

import { Button, Input } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import type { FindState } from "../state/useFind";
import type { FlowMode, RuleSetEditState, RuleSetMessage } from "../state/useRuleSetEdit";
import { SHORTCUT_HELP, isMacPlatform } from "./shortcuts";

const MAC_FN_NOTE = "F9·F10·F5 는 fn 과 함께 누른다";
const DEPRECATE_WARNING = "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.";

export interface FlowToolbarProps {
  state: RuleSetEditState;
  canDo: (action: string) => boolean;
  /** 편집 모드로 바꿀 수 있는가 — 담당자(editable)·INUSE·저장 권한. */
  canEdit: boolean;
  /** 지금 화면 모드(편집할 수 없으면 page 가 보기로 내려 넘긴다). */
  mode: FlowMode;
  onMode: (m: FlowMode) => void;
  showVars: boolean;
  onToggleVars: () => void;
  onAutoLayout: () => void;
  onFit: () => void;
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
  /** 노드 찾기(Task 8 이 찾기 칸을 그린다). */
  find: FindState;
  /** 찾기 칸 — 단축키 Ctrl/Cmd+F 가 여기로 초점을 옮긴다(Task 8 이 칸에 단다). */
  findInputRef: RefObject<HTMLInputElement | null>;
}

export function FlowToolbar(props: FlowToolbarProps) {
  const { state, canDo, canEdit, mode, onMode, showVars, onToggleVars, onAutoLayout, onFit, showMiniMap, onToggleMiniMap } = props;
  const { find, findInputRef } = props;
  const [helpOpen, setHelpOpen] = useState(false);
  const view = state.view!;
  const set = view.set;
  const inUse = set.status === "INUSE";
  const busy = state.loading;
  const editing = mode === "edit";
  const mac = isMacPlatform();
  const [confirmDeprecate, setConfirmDeprecate] = useState(false);

  useEffect(() => setConfirmDeprecate(false), [view]);
  // 도움말은 Esc 로 닫는다.
  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [helpOpen]);

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
        <span className="rsf-toolbar-group" role="group" aria-label="보기·편집·디버그">
          <Button
            data-testid="flow-mode-view"
            aria-pressed={mode === "view"}
            variant={mode === "view" ? "primary" : "default"}
            onClick={() => onMode("view")}
          >
            보기
          </Button>
          <Button
            data-testid="flow-mode-edit"
            aria-pressed={editing}
            variant={editing ? "primary" : "default"}
            disabled={!canEdit || busy}
            title={canEdit ? undefined : "담당자이고 사용 중인 세트이며 저장 권한이 있어야 편집한다"}
            onClick={() => onMode("edit")}
          >
            편집
          </Button>
          <Button
            data-testid="flow-mode-debug"
            aria-pressed={mode === "debug"}
            variant={mode === "debug" ? "primary" : "default"}
            onClick={() => onMode("debug")}
          >
            디버그
          </Button>
        </span>

        <span className="rsf-toolbar-sep" aria-hidden />
        <span className="rsf-toolbar-group" role="group" aria-label="되돌리기">
          <Button
            data-testid="flow-undo"
            ariaLabel="되돌리기"
            title={`되돌리기 (${mac ? "⌘Z" : "Ctrl+Z"})`}
            disabled={!editing || !state.canUndo || busy}
            onClick={state.undo}
          >
            <IconArrowBackUp size={14} aria-hidden="true" />
          </Button>
          <Button
            data-testid="flow-redo"
            ariaLabel="다시 하기"
            title={`다시 하기 (${mac ? "⌘⇧Z" : "Ctrl+Shift+Z"})`}
            disabled={!editing || !state.canRedo || busy}
            onClick={state.redo}
          >
            <IconArrowForwardUp size={14} aria-hidden="true" />
          </Button>
        </span>

        <span className="rsf-toolbar-sep" aria-hidden />
        <span className="rsf-toolbar-group" role="search" aria-label="노드 찾기">
          <IconSearch size={14} aria-hidden="true" />
          <Input
            data-testid="flow-find"
            {...({ ref: findInputRef } as object)}
            className="rsf-find-input"
            placeholder="룰 ID·이름·라벨 찾기"
            aria-label="노드 찾기"
            value={find.query}
            onChange={find.setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                find.next();
              }
            }}
          />
          <Button data-testid="flow-find-next" ariaLabel="다음 결과" title="다음 결과 (Enter)" disabled={find.hits.length === 0} onClick={find.next}>
            다음
          </Button>
          <span data-testid="flow-find-count" className="rsf-find-count" aria-live="polite">
            {find.hits.length === 0 ? "0/0" : `${find.index + 1}/${find.hits.length}`}
          </span>
        </span>

        <span className="rsf-toolbar-group rsf-help-anchor">
          <Button data-testid="flow-help" ariaLabel="단축키 도움말" title="단축키 도움말" aria-expanded={helpOpen} onClick={() => setHelpOpen((o) => !o)}>
            <IconHelp size={14} aria-hidden="true" />
          </Button>
          {helpOpen && (
            <div data-testid="flow-help-panel" className="rsf-help-panel" role="dialog" aria-label="단축키">
              <dl className="rsf-help-list">
                {SHORTCUT_HELP.filter((h) => h.modes.includes(mode)).map((h) => (
                  <div key={h.id} className="rsf-help-row">
                    <dt>{mac ? h.mac : h.win}</dt>
                    <dd>{h.label}</dd>
                  </div>
                ))}
              </dl>
              {mac && <p className="rsf-help-note">{MAC_FN_NOTE}</p>}
            </div>
          )}
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
          <Button data-testid="flow-minimap-toggle" aria-pressed={showMiniMap} variant={showMiniMap ? "primary" : "default"} onClick={onToggleMiniMap}>
            <IconMap size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
            미니맵
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
