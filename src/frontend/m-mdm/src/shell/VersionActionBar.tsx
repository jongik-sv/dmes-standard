"use client";

/**
 * MDM 버전 상태 전이 버튼 묶음 — 마스터코드·룰 화면이 같은 이름·순서·모양을 쓰도록 한 곳에 둔다.
 *
 * 라벨·순서·variant·확인 문구는 이 컴포넌트가 정한다. 활성 조건은 각 화면이 계산해서 `enabled` 로 넘긴다
 * (서버 판정값을 여기서 다시 계산하지 않는다). 버튼은 늘 보이고, 해당하지 않으면 비활성으로 구분한다.
 * 순서: 새 버전(major) · 새 버전(minor) · 삭제 · 확정 · 확정취소 · 선점 · 해제 · 넘기기 (그 뒤 `trailing`).
 */
import type { ReactNode } from "react";

import { Button } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { HANDOVER_AVAILABLE, HANDOVER_PENDING_TEXT } from "./handover";

export interface VersionAction {
  enabled: boolean;
  /** 비활성 이유·안내 — 마우스를 올리면 보인다. */
  title?: string;
}

export interface VersionActionIds {
  newMajor?: string;
  newMinor?: string;
  newVersion?: string;
  delete: string;
  confirm: string;
  cancelConfirm: string;
  cancelConfirmWrap?: string;
  lock: string;
  unlock: string;
  handover: string;
  handoverWrap?: string;
}

export interface VersionActionBarProps {
  ids: VersionActionIds;
  /** 마스터코드는 major·minor 두 버튼, 룰은 단일 "새 버전" 이다. */
  newVersionMode: "majorMinor" | "single";
  newMajor?: VersionAction;
  newMinor?: VersionAction;
  newVersion?: VersionAction;
  delete: VersionAction;
  confirm: VersionAction;
  cancelConfirm: VersionAction;
  lock: VersionAction;
  unlock: VersionAction;
  handover: VersionAction;
  onNewMajor?: () => void;
  onNewMinor?: () => void;
  onNewVersion?: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onHandover: () => void;
  /** 삭제 확인창 본문. */
  deleteMessage: string;
  /** 확정취소 확인창 본문. */
  cancelConfirmMessage: string;
  /** 넘기기 앞에 놓을 입력 칸 등(룰 화면의 인라인 대상 입력). */
  beforeHandover?: ReactNode;
  /** 맨 뒤에 붙는 화면별 버튼·배지(코드 편집, 편집 중 배지). */
  trailing?: ReactNode;
}

const noop = () => {};

export function VersionActionBar(p: VersionActionBarProps) {
  const { showMessage } = useMessage();
  const confirmDelete = () =>
    showMessage({ title: "확인", message: p.deleteMessage, alertType: "confirm", onConfirm: p.onDelete });
  const confirmCancel = () =>
    showMessage({ title: "확정취소", message: p.cancelConfirmMessage, alertType: "confirm", onConfirm: p.onCancelConfirm });

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", alignItems: "center" }}>
      {p.newVersionMode === "majorMinor" ? (
        <>
          <span title={p.newMajor?.title}>
            <Button data-testid={p.ids.newMajor} disabled={!p.newMajor?.enabled} onClick={p.onNewMajor ?? noop}>
              새 버전(major)
            </Button>
          </span>
          <span title={p.newMinor?.title}>
            <Button data-testid={p.ids.newMinor} disabled={!p.newMinor?.enabled} onClick={p.onNewMinor ?? noop}>
              새 버전(minor)
            </Button>
          </span>
        </>
      ) : (
        <span title={p.newVersion?.title}>
          <Button data-testid={p.ids.newVersion} disabled={!p.newVersion?.enabled} onClick={p.onNewVersion ?? noop}>
            새 버전
          </Button>
        </span>
      )}
      <span title={p.delete.title}>
        <Button data-testid={p.ids.delete} variant="danger" disabled={!p.delete.enabled} onClick={confirmDelete}>
          삭제
        </Button>
      </span>
      <span title={p.confirm.title}>
        <Button data-testid={p.ids.confirm} variant="primary" disabled={!p.confirm.enabled} onClick={p.onConfirm}>
          확정
        </Button>
      </span>
      <span data-testid={p.ids.cancelConfirmWrap} title={p.cancelConfirm.title}>
        <Button data-testid={p.ids.cancelConfirm} variant="danger" disabled={!p.cancelConfirm.enabled} onClick={confirmCancel}>
          확정취소
        </Button>
      </span>
      <span title={p.lock.title}>
        <Button data-testid={p.ids.lock} disabled={!p.lock.enabled} onClick={p.onLock}>
          선점
        </Button>
      </span>
      <span title={p.unlock.title}>
        <Button data-testid={p.ids.unlock} disabled={!p.unlock.enabled} onClick={p.onUnlock}>
          해제
        </Button>
      </span>
      {p.beforeHandover}
      {/* D2: 넘겨받는 사람의 담당자 여부를 확인할 수단이 생길 때까지 끈다(HANDOVER_AVAILABLE). */}
      <span data-testid={p.ids.handoverWrap} title={HANDOVER_AVAILABLE ? p.handover.title ?? "" : HANDOVER_PENDING_TEXT}>
        <Button data-testid={p.ids.handover} disabled={!HANDOVER_AVAILABLE || !p.handover.enabled} onClick={p.onHandover}>
          {HANDOVER_AVAILABLE ? "넘기기" : "넘기기(준비 중)"}
        </Button>
      </span>
      {p.trailing}
    </div>
  );
}
