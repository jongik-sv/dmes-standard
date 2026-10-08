"use client";

/**
 * 룰 세트 버전 줄(D-144 2단계) — 버전 고르기·상태·소유자 배지와 공통 `VersionActionBar`(룰·마스터코드와 같은 이름·순서·모양).
 * 버전 고르기 칸은 조회 영역(`SearchArea`)의 「버전」 칸으로 옮겨 `SetVersionSelect` 가 그린다.
 * 활성 조건은 서버 판정(flags·cancelConfirmable·editable)과 RBAC 로 여기서 계산한다. 저장하지 않은 변경·자동 저장 중·불러오는 중에는 모두 끈다.
 *
 * 예약 버전: 서버의 기본 선택은 "내 DRAFT → 지금 적용 중인 RELEASED" 라 아직 적용 시각이 오지 않은(예약된) RELEASED 가 있어도 처음에는 적용 중인
 * 버전이 열린다(룰 화면은 미적용 버전을 먼저 연다). 놓치지 않게 예약 버전이 있으면 배지(`set-ver-reserved`)로 알린다. 예약 여부는 서버 판정
 * `flags.currentVer` 로 가린다 — 목록(VER 내림차순)에서 적용 중 버전보다 앞에 있는 RELEASED 가 예약 버전이다(적용 중 버전이 없으면 RELEASED 전부).
 */
import { useState } from "react";

import { Input, Select } from "@dk-oasis/shared/form";
import {
  DraftLockBadge,
  HANDOVER_AVAILABLE,
  VersionActionBar,
  VersionStatusBadge,
  badgeStyle,
  fmtVer,
  openMdmPage,
  sameVer,
  type MdmVersionStatus,
} from "@/shell";

import { cancelSetConfirm, deleteSetDraft, handoverSetVersion, lockSetVersion, newSetVersion, unlockSetVersion } from "../api";
import type { RuleSetEditState } from "../state/useRuleSetEdit";
import type { RuleSetVersionRow } from "../types";

/** D8-10 와 같은 결 — 세트 확정 취소의 효과 안내. */
const CANCEL_CONFIRM_TEXT =
  "적용 시각이 오기 전에는 취소할 수 있고, 이미 적용된 뒤에는 되돌릴 수 없습니다. 취소하면 이 버전은 DRAFT 로 돌아가고 직전 확정 버전이 계속 쓰입니다. 취소해도 확정 기록은 남습니다.";
const MINOR_LIMIT_HINT = "major 를 올리십시오";
const DIRTY_HINT = "저장하지 않은 변경이 있다";
const READONLY_TEXT = "읽기 전용 — 내 DRAFT 가 아니다";
/** 새 버전을 만들 수 있고 내 DRAFT 가 없을 때 읽기 전용 문구 뒤에 붙인다(V18 이행 뒤 RELEASED 만 있는 세트, Ruling P2-22 M-1). */
const NEW_VERSION_HINT = "고치려면 새 버전을 만든다";

export interface SetVersionRowProps {
  state: RuleSetEditState;
  canDo: (action: string) => boolean;
}

/** 예약된(아직 적용 전인) RELEASED 버전들 — 목록은 VER 내림차순이고, 적용 중 버전(`currentVer`)보다 앞의 RELEASED 가 예약 버전이다. */
export function reservedVersions(versions: readonly RuleSetVersionRow[], currentVer: string | null | undefined): RuleSetVersionRow[] {
  const out: RuleSetVersionRow[] = [];
  for (const v of versions) {
    if (currentVer && sameVer(v.ver, currentVer)) break;
    if (v.status === "RELEASED") out.push(v);
  }
  return out;
}

/** 버전 고르기 칸 — 편집기 조회 영역의 SearchField 「버전」 안에 둔다. 세트를 열기 전에는 그리지 않는다. */
export function SetVersionSelect({ state }: { state: RuleSetEditState }) {
  const view = state.view;
  if (!view) return null;
  const versions = view.versions ?? [];
  return (
    <Select
      data-testid="set-ver-select"
      value={view.set.ver ?? ""}
      options={versions.map((v) => ({ value: v.ver, label: `${fmtVer(v.ver)} (${v.status})` }))}
      onChange={(v) => void state.selectVer(String(v))}
      disabled={versions.length === 0 || state.loading}
    />
  );
}

export function SetVersionRow({ state, canDo }: SetVersionRowProps) {
  const [handoverTo, setHandoverTo] = useState("");
  const view = state.view;
  if (!view) return null;
  const setId = view.set.setId;
  const ver = view.set.ver ?? null;
  const versions = view.versions ?? [];
  const flags = view.flags;
  const me = view.me ?? null;
  const selected = versions.find((v) => sameVer(v.ver, ver)) ?? null;
  const busy = state.dirty || state.autoSaving || state.loading;
  const isDraft = selected?.status === "DRAFT";
  const mine = isDraft && !!me && selected?.ownerId === me;
  const hint = busy ? DIRTY_HINT : "";
  const rv = selected?.rowVersion ?? 0;
  // 폐기 세트는 새 버전이 모두 막혀 있으므로 "major 를 올리십시오" 안내를 보이지 않는다.
  const minorLimited =
    !!flags && !flags.canNewMinor && flags.unappliedCount === 0 && versions.length > 0 && view.set.status !== "DEPRECATED";
  const reserved = flags ? reservedVersions(versions, flags.currentVer).filter((v) => !sameVer(v.ver, ver)) : [];
  const hasMyDraft = !!me && versions.some((v) => v.status === "DRAFT" && v.ownerId === me);
  const readonlyText =
    (flags?.canNewMajor || flags?.canNewMinor) && canDo("copy") && !hasMyDraft ? `${READONLY_TEXT}. ${NEW_VERSION_HINT}` : READONLY_TEXT;

  return (
    <div data-testid="set-ver-row" className="rsf-toolbar">
      <div className="rsf-toolbar-row">
        {selected && <VersionStatusBadge status={selected.status as MdmVersionStatus} applyFrom={selected.applyFrom} />}
        {selected && <DraftLockBadge status={selected.status as MdmVersionStatus} ownerId={selected.ownerId} currentUserId={me} />}
        {!view.editable && (
          <span data-testid="set-ver-readonly" style={badgeStyle("muted")}>
            {versions.length === 0 ? "버전 없음 — 새 버전(major)을 만든다" : readonlyText}
          </span>
        )}
        {reserved.length > 0 && (
          <span
            data-testid="set-ver-reserved"
            style={badgeStyle("info")}
            title={reserved.map((v) => `${fmtVer(v.ver)} 은 ${v.applyFrom ?? "-"} 부터 적용된다. 버전 고르기에서 열 수 있다`).join("\n")}
          >
            {`예약 ${reserved.map((v) => fmtVer(v.ver)).join(", ")}`}
          </span>
        )}
        <span className="rsf-toolbar-sep" aria-hidden />
        <VersionActionBar
          ids={{
            newMajor: "set-ver-new-major", newMinor: "set-ver-new-minor", delete: "set-ver-delete", confirm: "set-ver-confirm",
            cancelConfirm: "set-ver-cancel-confirm", cancelConfirmWrap: "set-ver-cancel-confirm-wrap", lock: "set-ver-lock",
            unlock: "set-ver-unlock", handover: "set-ver-handover", handoverWrap: "set-ver-handover-wrap",
          }}
          newVersionMode="majorMinor"
          newMajor={{ enabled: !busy && !!flags?.canNewMajor && canDo("copy"), title: hint || (flags?.nextMajor ? `${fmtVer(flags.nextMajor)} 을 만든다` : "") }}
          newMinor={{
            enabled: !busy && !!flags?.canNewMinor && canDo("copy"),
            title: hint || (minorLimited ? MINOR_LIMIT_HINT : flags?.nextMinor ? `${fmtVer(flags.nextMinor)} 을 만든다` : ""),
          }}
          delete={{ enabled: !busy && mine && canDo("delete"), title: hint }}
          confirm={{ enabled: !busy && mine && canDo("confirm"), title: hint || (mine ? "" : "내 DRAFT 버전만 확정할 수 있습니다") }}
          cancelConfirm={{
            enabled: !busy && !!selected?.cancelConfirmable && canDo("delete"),
            title: hint || (selected?.cancelConfirmable ? "" : "아직 적용 시각이 오지 않은 내 확정 버전만 취소할 수 있습니다"),
          }}
          lock={{ enabled: !busy && isDraft && !selected?.ownerId && canDo("lock"), title: hint }}
          unlock={{ enabled: !busy && mine && canDo("unlock"), title: hint }}
          handover={{ enabled: !busy && mine && canDo("handover") && handoverTo.trim() !== "", title: hint }}
          onNewMajor={() => void state.versionWrite(() => newSetVersion(setId, "MAJOR"), { next: "result", done: "새 버전(major)을 만들었다" })}
          onNewMinor={() => void state.versionWrite(() => newSetVersion(setId, "MINOR"), { next: "result", done: "새 버전(minor)을 만들었다" })}
          onDelete={() => ver && void state.versionWrite(() => deleteSetDraft(setId, ver, rv), { next: "default", done: `${fmtVer(ver)} 을 지웠다` })}
          onConfirm={() => ver && openMdmPage("dme/ruleSetConfirm", { setId, ver })}
          onCancelConfirm={() => ver && void state.versionWrite(() => cancelSetConfirm(setId, ver, rv), { next: "same", done: "확정을 취소했다" })}
          onLock={() => ver && void state.versionWrite(() => lockSetVersion(setId, ver, rv), { next: "same", done: "선점했다" })}
          onUnlock={() => ver && void state.versionWrite(() => unlockSetVersion(setId, ver, rv), { next: "same", done: "해제했다" })}
          onHandover={() =>
            ver &&
            void state
              .versionWrite(() => handoverSetVersion(setId, ver, rv, handoverTo.trim()), { next: "same", done: "넘겼다" })
              .then(() => setHandoverTo(""))
          }
          deleteMessage={`${fmtVer(ver)} DRAFT 를 지운다. 되돌릴 수 없다`}
          cancelConfirmMessage={CANCEL_CONFIRM_TEXT}
          beforeHandover={
            <Input
              data-testid="set-ver-handover-to"
              value={handoverTo}
              placeholder="넘겨받는 사람 ID"
              disabled={!HANDOVER_AVAILABLE || !mine || busy}
              onChange={setHandoverTo}
              style={{ width: 140 }}
            />
          }
        />
      </div>
    </div>
  );
}
