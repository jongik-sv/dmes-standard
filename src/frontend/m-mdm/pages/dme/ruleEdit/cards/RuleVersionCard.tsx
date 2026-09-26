"use client";

/**
 * 카드 ② 버전 목록(TSK-08-02 design §6.7.2). 행을 누르면 그 버전을 연다.
 * 새 버전(copy)은 미적용 버전이 없을 때만(수용 5), 삭제·해제·넘기기는 DRAFT 소유자만, 선점은 소유자 없는 DRAFT 에서만 보인다.
 * 소유·삭제 판정은 서버 공통 버전 서비스가 한다(I6) — 화면 비활성은 보조다. 확정 이동은 MDM 원천의 DRAFT 를 고르면 켜지고
 * 버전 확정 화면(dme/ruleConfirm, TSK-08-05 I40)을 그 룰·버전으로 연다. 소유자 판정은 확정 화면·서버가 한다.
 */
import { useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { DraftLockBadge, VersionStatusBadge, openMdmPage } from "@/shell";

import { deleteDraft, handoverVersion, lockVersion, newVersion, unlockVersion } from "../api";
import type { RuleEditCardProps } from "../cards";
import type { RuleVersionInfo } from "../types";
import { CardFrame, MutedText } from "./CardFrame";

/** 서버 `RuleVersions.isUnapplied` 와 같은 뜻 — DRAFT·REQUESTED·APPROVED·적용 전 RELEASED. 안내 문구에만 쓴다. */
function isUnapplied(v: RuleVersionInfo, now: Date): boolean {
  if (v.status === "DRAFT" || v.status === "REQUESTED" || v.status === "APPROVED") return true;
  if (v.status !== "RELEASED" || !v.applyFrom) return false;
  const from = new Date(`${v.applyFrom.replace(" ", "T")}+09:00`);
  return !Number.isNaN(from.getTime()) && from.getTime() > now.getTime();
}

function applyRange(v: RuleVersionInfo): string {
  if (!v.applyFrom) return "";
  return `${v.applyFrom.slice(0, 10)} ~ ${v.applyTo ? v.applyTo.slice(0, 10) : ""}`;
}

export function RuleVersionCard({ view, me, selectVer, runWrite, canDo, busy, notify }: RuleEditCardProps) {
  const [handoverTo, setHandoverTo] = useState("");
  const rule = view.rule;
  const mdm = rule.sourceKind === "MDM";
  const selected = view.versions.find((v) => v.ver === view.selectedVer) ?? null;
  const unapplied = view.versions.find((v) => isUnapplied(v, new Date()));
  const draft = selected?.status === "DRAFT";
  const mine = draft && !!selected?.ownerId && selected.ownerId === me;

  const canCopy = mdm && !view.unappliedVersionExists && rule.status !== "DEPRECATED" && canDo("copy") && !busy;
  const canDelete = mdm && mine && canDo("delete") && !busy;
  const canUnlock = mdm && mine && canDo("unlock") && !busy;
  const canHandover = mdm && mine && canDo("handover") && !busy;
  const showLock = mdm && draft && !selected?.ownerId;
  const canMoveToConfirm = view.confirmScreenReady && mdm && draft && !busy;

  const id = rule.maruRuleId;

  return (
    <CardFrame title="② 버전" testId="rule-card-versions">
      <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="rule-version-table">
        <thead>
          <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
            <th>버전</th>
            <th>상태</th>
            <th>적용 구간</th>
            <th>소유자</th>
            <th>base</th>
          </tr>
        </thead>
        <tbody>
          {view.versions.map((v) => (
            <tr
              key={v.ver}
              style={{ background: v.ver === view.selectedVer ? "var(--color-selection)" : undefined }}
              data-selected={v.ver === view.selectedVer ? "true" : "false"}
            >
              <td>
                <button
                  type="button"
                  data-testid={`rule-ver-row-${v.ver}`}
                  onClick={() => void selectVer(v.ver)}
                  style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "var(--color-primary)", font: "inherit" }}
                >
                  {v.ver}
                </button>
              </td>
              <td>
                <VersionStatusBadge status={v.status} applyFrom={v.applyFrom} />
              </td>
              <td>{applyRange(v)}</td>
              <td>{v.ownerId ?? ""}</td>
              <td>{v.baseVer ?? ""}</td>
            </tr>
          ))}
          {view.versions.length === 0 && (
            <tr>
              <td colSpan={5}>
                <MutedText>버전이 없습니다.</MutedText>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {view.unappliedVersionExists && (
        <p data-testid="rule-unapplied-notice" style={{ color: "var(--color-text-secondary)", margin: "var(--spacing-xs) 0" }}>
          미적용 버전{unapplied ? ` ${unapplied.ver}` : ""} 이 있어 새 버전을 만들 수 없습니다(한 번에 하나).
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", alignItems: "center", paddingTop: "var(--spacing-sm)" }}>
        <Button disabled={!canCopy} onClick={() => void runWrite(() => newVersion(id), (r) => r.ver ?? null)}>
          새 버전
        </Button>
        <span title={canMoveToConfirm ? "" : "DRAFT 버전만 확정할 수 있습니다"}>
          <Button
            disabled={!canMoveToConfirm}
            onClick={() => selected && openMdmPage("dme/ruleConfirm", { maruRuleId: id, ver: String(selected.ver) })}
          >
            확정 이동
          </Button>
        </span>
        {selected && (
          <>
            <Button
              disabled={!canDelete}
              onClick={() => void runWrite(() => deleteDraft(id, selected.ver, selected.rowVersion), () => null)}
            >
              삭제
            </Button>
            {showLock && (
              <Button
                disabled={!mdm || !canDo("lock") || busy}
                onClick={() => void runWrite(() => lockVersion(id, selected.ver, selected.rowVersion))}
              >
                선점
              </Button>
            )}
            <Button disabled={!canUnlock} onClick={() => void runWrite(() => unlockVersion(id, selected.ver, selected.rowVersion))}>
              해제
            </Button>
            <Input
              data-testid="rule-handover-target"
              value={handoverTo}
              placeholder="넘겨받을 사용자 ID"
              disabled={!mdm || !mine || busy}
              onChange={setHandoverTo}
              style={{ width: 160 }}
            />
            <Button
              disabled={!canHandover}
              onClick={() => {
                if (!handoverTo.trim()) {
                  notify({ kind: "warning", text: "넘겨받을 사용자 ID 를 적으세요." });
                  return;
                }
                void runWrite(() => handoverVersion(id, selected.ver, selected.rowVersion, handoverTo.trim())).then((r) => {
                  if (r) setHandoverTo("");
                });
              }}
            >
              넘기기
            </Button>
          </>
        )}
        {selected && <DraftLockBadge status={selected.status} ownerId={selected.ownerId} currentUserId={me} />}
      </div>
    </CardFrame>
  );
}
