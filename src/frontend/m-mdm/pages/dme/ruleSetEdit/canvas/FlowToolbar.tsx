"use client";

/**
 * 흐름 툴바(2단계 계획 Task 10, P10) — 세트 고르기(page 가 `lead` 로 넘긴다)·세트 머리(ID·이름·상태·row_version)·보기/편집·자동 정렬·
 * 화면 맞춤·변수 흐름·세트 저장·폐기/되살리기·다시 불러오기·메시지 줄. 1단계 룰 세트 카드의 머리·버튼·메시지를 옮겼다.
 * 한 줄 툴바(2026-10-01): 세트 고르기 줄과 툴바 줄을 한 줄로 합치고, 글자 단추를 모두 아이콘 단추(`ToolButton`)로 바꿨다.
 * 세트 이름은 길면 말줄임하고 전체는 title 로 보인다. "버전·승인 없음" 은 상태 배지 title 로 옮겼다. 좁은 창에서는 묶음 단위로 다음 줄로 넘어간다.
 *
 * 폐기는 두 단계(폐기 → 폐기 확인/취소)로만 한다(I14·D14). 저장 버튼은 편집 모드·dirty·거부 검사 없음·조건식 IO 기다리지 않음일 때만 켜진다(P-D4·P10).
 *
 * 3단계(계획 P1·P12): 모드 단추 셋(보기·편집·디버그 — 디버그는 누구나), 되돌리기·다시 하기(편집 모드이고 기록이 있을 때), 미니맵 켜고 끄기.
 * 찾기 칸(Enter·[다음] 으로 돈다)과 단축키 도움말 [?] 를 둔다(Task 8). 도움말은 지금 모드의 단축키만 짧은 정의 목록으로 보인다.
 * 단추는 모두 아이콘만 있고(`ToolButton`), 이름·꺼진 이유는 단추를 감싼 `span.rsf-tip[data-tip]` 가 그리는 즉시 CSS 툴팁(`styles/toolbox.ts`, 단추 아래 — 단추 루트가 overflow:hidden 이라 단추 안에서 그리면 잘린다)이고 `title` 은 두지 않는다(브라우저 툴팁과 겹침 방지).
 * S1 의 [공간] 토글은 4단계 P1 에서 도구 상자(`FlowToolbox`)로 옮겼다.
 *
 * 자동 저장: 편집 모드에서만 [세트 저장] 옆에 [자동 저장] 켜고 끄기 단추와 짧은 상태 글(`set-autosave-status`, 길면 말줄임 — 경고 문장이 있으면 title, 없으면 상태 글이 title)을 둔다.
 * 단추는 [미니맵]·[변수 흐름] 과 같은 `aria-pressed` 토글이다 — 체크박스 입력은 눌러도 초점을 가져가 스페이스+끌기의 스페이스가
 * 값을 뒤집는다(`keepFocusOffButtons` 는 단추만 막는다). 자동 저장이 진행 중이면 수동 쓰기([세트 저장]·폐기·되살리기)를 막는다(같은 row_version
 * 으로 두 요청이 나가지 않게). 편집·되돌리기는 막지 않는다.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";

import {
  IconArchive,
  IconArrowBackUp,
  IconArrowDown,
  IconArrowForwardUp,
  IconArrowsMaximize,
  IconBug,
  IconCheck,
  IconClockPlay,
  IconDeviceFloppy,
  IconEye,
  IconHelp,
  IconId,
  IconLayoutDistributeHorizontal,
  IconMap,
  IconPencil,
  IconRefresh,
  IconRestore,
  IconSearch,
  IconTag,
  IconVariableOff,
  IconX,
} from "@tabler/icons-react";

import { Input } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import type { FindState } from "../state/useFind";
import type { VarDisplay } from "../types";
import type { AutoSave } from "../state/useAutoSave";
import type { FlowMode, RuleSetEditState, RuleSetMessage } from "../state/useRuleSetEdit";
import { SHORTCUT_HELP, isMacPlatform } from "./shortcuts";
import { ToolButton } from "./ToolButton";

/** [변수 흐름] 단추 이름 — 지금 상태를 보인다(aria-label·툴팁). */
export const VAR_DISPLAY_TEXT: Record<VarDisplay, string> = { off: "표시: 끔", id: "표시: ID", name: "표시: 이름" };
const VAR_DISPLAY_TIP = "선 변수 칩과 룰 노드 제목을 ID·이름으로 바꾼다. 끄면 변수 칩을 숨긴다";
/** [변수 흐름] 단추 아이콘 — 상태마다 다르다. */
const VAR_DISPLAY_ICON: Record<VarDisplay, ReactNode> = {
  off: <IconVariableOff size={14} aria-hidden="true" />,
  id: <IconId size={14} aria-hidden="true" />,
  name: <IconTag size={14} aria-hidden="true" />,
};
const MAC_FN_NOTE = "F9·F10·F5 는 fn 과 함께 누른다";
const DEPRECATE_WARNING = "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.";
/** 상태 배지 title — 한 줄 툴바로 줄이며 "버전·승인 없음" 배지를 여기로 옮겼다. */
export const STATUS_TITLE = "버전·승인 없음 — 저장하면 바로 반영된다";
/** 자동 저장 상태 글 색(의미 토큰). */
const AUTO_STATUS_COLOR: Record<"info" | "warning" | "error", string> = {
  info: "var(--color-text-secondary)",
  warning: "var(--color-warning)",
  error: "var(--color-danger)",
};

export interface FlowToolbarProps {
  /** 줄 맨 앞에 두는 세트 고르기(page 의 `IdPicker`). */
  lead?: ReactNode;
  state: RuleSetEditState;
  canDo: (action: string) => boolean;
  /** 편집 모드로 바꿀 수 있는가 — 담당자(editable)·INUSE·저장 권한. */
  canEdit: boolean;
  /** 지금 화면 모드(편집할 수 없으면 page 가 보기로 내려 넘긴다). */
  mode: FlowMode;
  onMode: (m: FlowMode) => void;
  varDisplay: VarDisplay;
  /** 누를 때마다 off → id → name → off. */
  onToggleVars: () => void;
  onAutoLayout: () => void;
  onFit: () => void;
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
  /** 노드 찾기(Task 8 이 찾기 칸을 그린다). */
  find: FindState;
  /** 찾기 칸 — 단축키 Ctrl/Cmd+F 가 여기로 초점을 옮긴다(Task 8 이 칸에 단다). */
  findInputRef: RefObject<HTMLInputElement | null>;
  /**
   * 도움말을 Esc 로 닫은 뒤, 초점이 [?] 단추·도움말 안·body 에 있을 때만 부른다 — page 가 캔버스로 초점을 돌려 다음 Esc·단축키가
   * 캔버스 디스패처에 닿게 한다(브라우저 확인 8번 단서).
   * [?] 를 다시 눌러 닫을 때는 부르지 않는다(마우스로 닫으면 초점을 억지로 옮기지 않는다).
   */
  onHelpEscape?: () => void;
  /** 자동 저장 켜고 끄기·상태 글(편집 모드에서만 보인다). */
  autoSave: AutoSave;
}

/** 단추 위 mousedown 의 기본 동작(초점 옮기기)을 막는다. 누르기(click)는 그대로 온다. */
export function keepFocusOffButtons(e: MouseEvent<HTMLElement>): void {
  if ((e.target as Element | null)?.closest?.("button")) e.preventDefault();
}

export function FlowToolbar(props: FlowToolbarProps) {
  const { state, canDo, canEdit, mode, onMode, varDisplay, onToggleVars, onAutoLayout, onFit, showMiniMap, onToggleMiniMap } = props;
  const { lead, find, findInputRef, onHelpEscape, autoSave } = props;
  const [helpOpen, setHelpOpen] = useState(false);
  const view = state.view!;
  const set = view.set;
  const inUse = set.status === "INUSE";
  const busy = state.loading;
  /** 쓰기 요청을 보낼 수 없다 — 로딩 중이거나 자동 저장이 진행 중이다. */
  const writeBusy = busy || state.autoSaving;
  const editing = mode === "edit";
  const mac = isMacPlatform();
  const [confirmDeprecate, setConfirmDeprecate] = useState(false);

  useEffect(() => setConfirmDeprecate(false), [view]);
  // 도움말은 Esc 로 닫는다. 캡처 단계에서 받아 멈춘다 — 열린 것만 닫고 캔버스 선택은 그대로 둔다(메뉴와 같은 규칙).
  // 닫은 뒤 초점이 [?] 단추·도움말 안·body 에 있을 때만 캔버스로 돌린다([?] 에 남으면 다음 Esc 가 캔버스 디스패처에 닿지 않는다).
  // 찾기 칸·속성 입력칸 같은 다른 초점은 그대로 둔다.
  const helpAnchorRef = useRef<HTMLSpanElement>(null);
  const helpEscRef = useRef(onHelpEscape);
  helpEscRef.current = onHelpEscape;
  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setHelpOpen(false);
      const a = document.activeElement;
      if (!a || a === document.body || helpAnchorRef.current?.contains(a)) helpEscRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [helpOpen]);

  const hasReject = state.checks.some((c) => c.severity === "REJECT");
  const canSave = editing && canEdit && state.dirty && !hasReject && !state.condIoPending && !writeBusy;
  const canDeprecate = view.editable && inUse && canDo("delete") && !writeBusy;
  const canRestore = view.restorable && !inUse && canDo("restore") && !writeBusy;
  const saveTitle = !editing
    ? "편집 모드에서 저장한다"
    : hasReject
      ? "거부 검사가 있어 저장할 수 없다. 아래 검사 결과를 고친다"
      : state.condIoPending
        ? "조건식을 확인하는 중이다"
        : state.autoSaving
          ? "자동 저장하는 중이다"
          : undefined;
  const autoStatus = autoSave.status;

  const message: RuleSetMessage | null = confirmDeprecate ? { kind: "error", text: DEPRECATE_WARNING } : state.message;

  const editTip = canEdit ? "편집" : "편집 — 담당자이고 사용 중인 세트이며 저장 권한이 있어야 편집한다";

  return (
    // 단추는 마우스로 눌러도 초점을 가져가지 않는다(Figma 툴바 방식, S1 리뷰 Important 2) — 초점이 단추에 남으면 스페이스+끌기(화면 이동)의
    // 스페이스가 그 단추를 다시 누른다. 키보드 Tab·Enter·Space 는 그대로이고, 찾기 칸 같은 입력칸은 해당 없다.
    <div data-testid="flow-toolbar" className="rsf-toolbar" onMouseDown={keepFocusOffButtons}>
      <div className="rsf-toolbar-row">
        {lead}
        {lead && <span className="rsf-toolbar-sep" aria-hidden />}
        <span className="rsf-toolbar-group rsf-toolbar-head">
          <span data-testid="set-edit-current" className="rsf-toolbar-title" title={`${set.setId} · ${set.setName}`}>
            <span data-testid="set-card-id" style={{ fontWeight: 600 }}>
              {set.setId}
            </span>
            {` · ${set.setName}`}
          </span>
          <span data-testid="set-status" style={{ ...badgeStyle(inUse ? "success" : "muted"), cursor: "default" }} title={STATUS_TITLE}>
            {set.status}
          </span>
          <span data-testid="set-row-version">{`row_version ${set.rowVersion}`}</span>
        </span>

        <span className="rsf-toolbar-sep" aria-hidden />
        <span className="rsf-toolbar-group" role="group" aria-label="보기·편집·디버그">
          <ToolButton
            data-testid="flow-mode-view"
            label="보기"
            icon={<IconEye size={14} aria-hidden="true" />}
            aria-pressed={mode === "view"}
            variant={mode === "view" ? "primary" : "default"}
            onClick={() => onMode("view")}
          />
          <ToolButton
            data-testid="flow-mode-edit"
            label="편집"
            tip={editTip}
            icon={<IconPencil size={14} aria-hidden="true" />}
            aria-pressed={editing}
            variant={editing ? "primary" : "default"}
            disabled={!canEdit || busy}
            onClick={() => onMode("edit")}
          />
          <ToolButton
            data-testid="flow-mode-debug"
            label="디버그"
            icon={<IconBug size={14} aria-hidden="true" />}
            aria-pressed={mode === "debug"}
            variant={mode === "debug" ? "primary" : "default"}
            onClick={() => onMode("debug")}
          />
        </span>

        <span className="rsf-toolbar-sep" aria-hidden />
        <span className="rsf-toolbar-group" role="group" aria-label="되돌리기">
          <ToolButton
            data-testid="flow-undo"
            label="되돌리기"
            tip={`되돌리기 (${mac ? "⌘Z" : "Ctrl+Z"})`}
            icon={<IconArrowBackUp size={14} aria-hidden="true" />}
            disabled={!editing || !state.canUndo || busy}
            onClick={state.undo}
          />
          <ToolButton
            data-testid="flow-redo"
            label="다시 하기"
            tip={`다시 하기 (${mac ? "⌘⇧Z" : "Ctrl+Shift+Z"})`}
            icon={<IconArrowForwardUp size={14} aria-hidden="true" />}
            disabled={!editing || !state.canRedo || busy}
            onClick={state.redo}
          />
        </span>

        <span className="rsf-toolbar-sep" aria-hidden />
        <span className="rsf-toolbar-group" role="search" aria-label="노드 찾기">
          <IconSearch size={14} aria-hidden="true" />
          <Input
            data-testid="flow-find"
            {...({ ref: findInputRef } as object)}
            className="rsf-find-input"
            placeholder="노드 찾기"
            title="룰 ID·이름·라벨로 찾는다"
            aria-label="노드 찾기"
            value={find.query}
            onChange={find.setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                find.next();
              }
            }}
          />
          <ToolButton
            data-testid="flow-find-next"
            label="다음 결과"
            tip="다음 결과 (Enter)"
            icon={<IconArrowDown size={14} aria-hidden="true" />}
            disabled={find.hits.length === 0}
            onClick={find.next}
          />
          <span data-testid="flow-find-count" className="rsf-find-count" aria-live="polite">
            {find.hits.length === 0 ? "0/0" : `${find.index + 1}/${find.hits.length}`}
          </span>
        </span>

        <span ref={helpAnchorRef} className="rsf-toolbar-group rsf-help-anchor">
          <ToolButton
            data-testid="flow-help"
            label="단축키 도움말"
            icon={<IconHelp size={14} aria-hidden="true" />}
            tipOff={helpOpen}
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((o) => !o)}
          />
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
          <ToolButton
            data-testid="flow-auto-layout"
            label="자동 정렬"
            icon={<IconLayoutDistributeHorizontal size={14} aria-hidden="true" />}
            disabled={!editing || busy}
            onClick={onAutoLayout}
          />
          <ToolButton data-testid="flow-fit" label="화면 맞춤" icon={<IconArrowsMaximize size={14} aria-hidden="true" />} onClick={onFit} />
          <ToolButton
            data-testid="flow-var-toggle"
            label={VAR_DISPLAY_TEXT[varDisplay]}
            tip={`${VAR_DISPLAY_TEXT[varDisplay]} — ${VAR_DISPLAY_TIP}`}
            icon={VAR_DISPLAY_ICON[varDisplay]}
            data-mode={varDisplay}
            aria-pressed={varDisplay !== "off"}
            variant={varDisplay !== "off" ? "primary" : "default"}
            onClick={onToggleVars}
          />
          <ToolButton
            data-testid="flow-minimap-toggle"
            label="미니맵"
            icon={<IconMap size={14} aria-hidden="true" />}
            aria-pressed={showMiniMap}
            variant={showMiniMap ? "primary" : "default"}
            onClick={onToggleMiniMap}
          />
        </span>

        <span className="rsf-toolbar-group rsf-toolbar-end">
          {state.conflict && (
            <ToolButton
              data-testid="set-reload"
              label="다시 불러오기"
              align="end"
              icon={<IconRefresh size={14} aria-hidden="true" />}
              disabled={busy}
              onClick={() => void state.reload()}
            />
          )}
          {inUse ? (
            confirmDeprecate ? (
              <>
                <ToolButton
                  variant="danger"
                  data-testid="set-deprecate-confirm"
                  label="폐기 확인"
                  align="end"
                  icon={<IconCheck size={14} aria-hidden="true" />}
                  disabled={!canDeprecate}
                  onClick={() => {
                    setConfirmDeprecate(false);
                    void state.deprecate();
                  }}
                />
                <ToolButton
                  data-testid="set-deprecate-cancel"
                  label="폐기 취소"
                  align="end"
                  icon={<IconX size={14} aria-hidden="true" />}
                  onClick={() => setConfirmDeprecate(false)}
                />
              </>
            ) : (
              <ToolButton
                data-testid="set-deprecate"
                label="폐기"
                align="end"
                icon={<IconArchive size={14} aria-hidden="true" />}
                disabled={!canDeprecate}
                onClick={() => setConfirmDeprecate(true)}
              />
            )
          ) : (
            <ToolButton
              data-testid="set-restore"
              label="되살리기"
              align="end"
              icon={<IconRestore size={14} aria-hidden="true" />}
              disabled={!canRestore}
              onClick={() => void state.restore()}
            />
          )}
          <ToolButton
            variant="primary"
            data-testid="set-save"
            label="세트 저장"
            tip={saveTitle ? `세트 저장 — ${saveTitle}` : "세트 저장"}
            align="end"
            icon={<IconDeviceFloppy size={14} aria-hidden="true" />}
            disabled={!canSave}
            onClick={() => void state.save()}
          />
          {editing && (
            <>
              <ToolButton
                data-testid="set-autosave"
                label="자동 저장"
                tip="자동 저장 — 켜 두면 마지막 변경 2초 뒤 저장한다. 거부 검사가 있으면 저장하지 않는다"
                align="end"
                icon={<IconClockPlay size={14} aria-hidden="true" />}
                aria-pressed={autoSave.enabled}
                variant={autoSave.enabled ? "primary" : "default"}
                onClick={() => autoSave.setEnabled(!autoSave.enabled)}
              />
              {autoStatus && (
                <span
                  data-testid="set-autosave-status"
                  className="rsf-autosave-status"
                  role="status"
                  title={autoStatus.title ?? autoStatus.text}
                  style={{ color: AUTO_STATUS_COLOR[autoStatus.kind] }}
                >
                  {autoStatus.text}
                </span>
              )}
            </>
          )}
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
