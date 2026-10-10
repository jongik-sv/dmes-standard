"use client";

/**
 * 버전 막대(스펙 2.1·4.7, S2-10) — m-mdm VersionActionBar 를 쓴다. 확정취소는 넘기지 않는다(ERD 에 그 액션이 없다).
 * - 새 버전(copy)·삭제 뒤에는 서버가 reload 를 보내지만, 단계 2 서버가 머지되기 전에도 맞도록 응답을 받으면 바로 다시 읽는다.
 * - 선점·해제는 응답 rowVersion 을 곧바로 반영한다(version 이벤트를 기다리지 않는다, deferred 39).
 * - 넘기기는 담당자 조회가 없어 끈다(handover.ts). 확정은 ConfirmDialog, 공동 편집자는 EditorsModal 이 맡는다.
 */
import { useRef, useState } from "react";

import { Button } from "@dk-oasis/shared/form";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";

import { VersionActionBar, type VersionAction } from "@/shell";

import { SCREEN_ID, deleteDraft, lockDraft, newVersion, unlockDraft } from "../api";
import type { ErdEditContext } from "../edit-context";
import { localVersionEvent } from "../state/model-delta";
import type { ErdVersionEvent } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditorsModal } from "./EditorsModal";

export interface VersionBarProps { ctx: ErdEditContext; onReload(): Promise<void>; onVersion(ev: ErdVersionEvent): void }

export type VersionButtonKey = "newVersion" | "delete" | "confirm" | "lock" | "unlock";

/** 단추 활성 판정(순수). can 은 RBAC 액션 권한(copy·delete·lock·unlock). 확정은 rights.confirm 을 따른다. */
export function versionButtons(ctx: Pick<ErdEditContext, "state" | "rights">, can: (action: string) => boolean): Record<VersionButtonKey, VersionAction> {
  const s = ctx.state;
  const draft = s.status === "DRAFT";
  const owner = ctx.rights.owner;
  const ownerName = s.ownerId ?? "없음";
  const noRight = "권한이 없습니다. 권한은 시스템 관리자에게 요청하세요.";
  return {
    newVersion: !can("copy") ? { enabled: false, title: noRight }
      : draft ? { enabled: false, title: "이미 DRAFT 가 있습니다. DRAFT 를 확정하거나 지운 뒤 새 버전을 만드세요." } : { enabled: true },
    delete: !can("delete") ? { enabled: false, title: noRight } : !draft ? { enabled: false, title: "지울 DRAFT 가 없습니다." }
      : !owner ? { enabled: false, title: `DRAFT 는 소유자(${ownerName})만 지울 수 있습니다.` } : { enabled: true },
    confirm: { enabled: ctx.rights.confirm.ok, title: ctx.rights.confirm.reason ?? undefined },
    lock: !can("lock") ? { enabled: false, title: noRight } : !draft ? { enabled: false, title: "선점할 DRAFT 가 없습니다." }
      : s.ownerId !== null ? { enabled: false, title: `이미 ${ownerName} 이(가) 선점했습니다.` } : { enabled: true },
    unlock: !can("unlock") ? { enabled: false, title: noRight } : !draft || !owner
      ? { enabled: false, title: `해제는 DRAFT 소유자(${ownerName})만 할 수 있습니다.` } : { enabled: true },
  };
}

const noop = () => undefined;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function VersionBar({ ctx, onReload, onVersion }: VersionBarProps) {
  const rbac = useUserButtonRbac();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editorsOpen, setEditorsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = ctx.state;
  // 응답 때의 최신 state 로 이벤트를 만든다(눌렀을 때 값이면 그 사이 SSE 로 온 더 새 rowVersion 을 덮는다).
  const stateRef = useRef(ctx.state);
  stateRef.current = ctx.state;
  const busyRef = useRef(false);
  const b = versionButtons(ctx, (a) => !rbac.isLoading && canDoButton(rbac, SCREEN_ID, a));
  const off = (a: VersionAction): VersionAction => (busy ? { ...a, enabled: false } : a);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (busyRef.current) return; // 두 번 눌러도 한 번만 보낸다
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      ctx.notify(`${label}: ${errText(e)}`, "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const newVer = (kind: "MAJOR" | "MINOR") => run("새 버전", async () => {
    const r = await newVersion(ctx.modelId, kind);
    ctx.notify(`새 버전 ${r.ver} DRAFT 를 만들었습니다.`);
    await onReload();
  });
  const del = () => run("삭제", async () => {
    await deleteDraft(ctx.modelId, s.ver, s.rowVersion);
    ctx.notify(`DRAFT ${s.ver} 를 지웠습니다.`);
    await onReload();
  });
  const lock = () => run("선점", async () => {
    const r = await lockDraft(ctx.modelId, s.ver, s.rowVersion);
    onVersion(localVersionEvent(stateRef.current, ctx.me, "LOCK", { ownerId: ctx.me, rowVersion: r.rowVersion }));
    ctx.notify("DRAFT 를 선점했습니다.");
  });
  const unlock = () => run("해제", async () => {
    const r = await unlockDraft(ctx.modelId, s.ver, s.rowVersion);
    onVersion(localVersionEvent(stateRef.current, ctx.me, "UNLOCK", { ownerId: null, rowVersion: r.rowVersion }));
    ctx.notify("DRAFT 선점을 풀었습니다.");
  });

  return (
    <div className="erd-bar__row erd-version" data-testid="erd-version-bar">
      <VersionActionBar
        ids={{
          newMajor: "erd-ver-major", newMinor: "erd-ver-minor", delete: "erd-ver-delete", confirm: "erd-ver-confirm",
          lock: "erd-ver-lock", unlock: "erd-ver-unlock", handover: "erd-ver-handover", handoverWrap: "erd-ver-handover-wrap",
        }}
        newVersionMode="majorMinor"
        newMajor={off(b.newVersion)} newMinor={off(b.newVersion)} delete={off(b.delete)} confirm={off(b.confirm)}
        lock={off(b.lock)} unlock={off(b.unlock)} handover={{ enabled: false, title: "담당자 조회가 아직 없어 넘기기를 쓸 수 없습니다" }}
        onNewMajor={() => void newVer("MAJOR")} onNewMinor={() => void newVer("MINOR")} onDelete={() => void del()}
        onConfirm={() => setConfirmOpen(true)} onLock={() => void lock()} onUnlock={() => void unlock()} onHandover={noop}
        deleteMessage={`DRAFT ${s.ver} 를 지울까요? 이 버전에서 고친 모델·다이어그램이 모두 사라지고 되돌릴 수 없습니다.`}
        trailing={(
          <Button size="sm" data-testid="erd-editors-open" onClick={() => setEditorsOpen(true)}>
            공동 편집자({s.editors.length})
          </Button>
        )}
      />
      <ConfirmDialog ctx={ctx} opened={confirmOpen} onClose={() => setConfirmOpen(false)}
        onConfirmed={() => {
          setConfirmOpen(false);
          void onReload();
        }} />
      <EditorsModal ctx={ctx} opened={editorsOpen} onClose={() => setEditorsOpen(false)} onVersion={onVersion} />
    </div>
  );
}
