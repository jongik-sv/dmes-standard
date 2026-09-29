"use client";

/**
 * 카드 ② 버전 목록(TSK-08-02 design §6.7.2). 행을 누르면 그 버전을 연다.
 * 새 버전(copy)은 미적용 버전이 없을 때만(수용 5), 삭제·해제·넘기기는 DRAFT 소유자만, 선점은 소유자 없는 DRAFT 에서만 보인다.
 * 소유·삭제 판정은 서버 공통 버전 서비스가 한다(I6) — 화면 비활성은 보조다. 확정 이동은 MDM 원천의 DRAFT 를 고르면 켜지고
 * 버전 확정 화면(dme/ruleConfirm, TSK-08-05 I40)을 그 룰·버전으로 연다. 소유자 판정은 확정 화면·서버가 한다.
 */
import { useMemo, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { DraftLockBadge, HANDOVER_AVAILABLE, HANDOVER_PENDING_TEXT, VersionStatusBadge, openMdmPage } from "@/shell";

import { cancelConfirm, deleteDraft, handoverVersion, lockVersion, newVersion, unlockVersion } from "../api";
import type { RuleEditCardProps } from "../cards";
import type { RuleVersionInfo } from "../types";
import { CardFrame } from "./CardFrame";

/** D8-10 — 06 교차 효과. 되돌린 룰이 유일 확정 버전이었다면 룰 세트와 다른 룰의 확정이 막히고, 재확정하면 풀린다. */
export const CANCEL_CONFIRM_EFFECT =
  "적용 시각이 오기 전에는 취소할 수 있고, 이미 적용된 뒤에는 되돌릴 수 없습니다. "
  + "확정 취소하면 이 룰을 멤버로 가진 룰 세트와 이 룰의 결과를 쓰는 다른 룰의 확정이 잠시 막힙니다. 다시 확정하면 풀립니다. "
  + "취소해도 확정 기록은 남습니다.";

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

const versionColumns: GridColumn[] = [
  {
    key: "ver",
    header: "버전",
    width: 80,
    // 행 전체 클릭이 버전을 여는 동작이라 글자 링크는 모양만 맡는다(누르면 행 클릭으로 올라간다).
    render: (value) => (
      <button
        type="button"
        data-testid={`rule-ver-row-${String(value)}`}
        style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "var(--color-primary)", font: "inherit" }}
      >
        {String(value)}
      </button>
    ),
  },
  {
    key: "status",
    header: "상태",
    width: 120,
    tooltip: false,
    render: (_value, row) => <VersionStatusBadge status={row.status as RuleVersionInfo["status"]} applyFrom={row.applyFrom as string | null} />,
  },
  { key: "range", header: "적용 구간", width: 200 },
  { key: "ownerId", header: "소유자", width: 120 },
  { key: "baseVer", header: "base", width: 80 },
];

export function RuleVersionCard({ view, me, selectVer, runWrite, canDo, busy, notify }: RuleEditCardProps) {
  const [handoverTo, setHandoverTo] = useState("");
  const { showMessage } = useMessage();
  const rule = view.rule;
  const mdm = rule.sourceKind === "MDM";
  const selected = view.versions.find((v) => v.ver === view.selectedVer) ?? null;
  const unapplied = view.versions.find((v) => isUnapplied(v, new Date()));
  const draft = selected?.status === "DRAFT";
  const mine = draft && !!selected?.ownerId && selected.ownerId === me;

  const canCopy = mdm && !view.unappliedVersionExists && rule.status !== "DEPRECATED" && canDo("copy") && !busy;
  const canDelete = mdm && mine && canDo("delete") && !busy;
  const canUnlock = mdm && mine && canDo("unlock") && !busy;
  // D8 확정 취소 — 다른 판정과 달리 서버 판정값(cancelConfirmable)만 따른다. 적용 시각 경계·미적용 개수·소유자를
  // 화면에서 다시 계산하면 서버와 어긋나므로 재계산하지 않는다. 확정 버전은 RELEASED 라 mine(draft 전용)은 걸지 않는다.
  const canCancelConfirm = mdm && !!selected?.cancelConfirmable && canDo("delete") && !busy;
  // D2: 넘겨받는 사람의 담당자 여부를 확인할 수단이 생길 때까지 끈다(HANDOVER_AVAILABLE).
  const canHandover = HANDOVER_AVAILABLE && mdm && mine && canDo("handover") && !busy;
  const showLock = mdm && draft && !selected?.ownerId;
  const canMoveToConfirm = view.confirmScreenReady && mdm && draft && !busy;

  const id = rule.maruRuleId;
  const versionRows = useMemo(
    () => view.versions.map((v) => ({ ver: v.ver, status: v.status, applyFrom: v.applyFrom, range: applyRange(v), ownerId: v.ownerId ?? "", baseVer: v.baseVer ?? "" })),
    [view.versions],
  );

  return (
    <CardFrame title="② 버전" testId="rule-card-versions">
      <div data-testid="rule-version-table">
        <AgDataGrid
          columns={versionColumns}
          data={versionRows}
          rowKey="ver"
          height="auto"
          columnSizing="fit"
          sortable={false}
          highlightedRowKey={view.selectedVer}
          onRowClick={(row) => void selectVer(row.ver as number)}
          emptyMessage="버전이 없습니다."
          ariaLabel="룰 버전 목록"
        />
      </div>

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
            {/* D8 확정 취소 — 확인창에 06 교차 효과(룰 세트·다른 룰의 확정이 잠시 막힘)를 알린다. */}
            <span
              data-testid="rule-cancel-confirm-wrap"
              title={canCancelConfirm ? "" : "아직 적용 시각이 오지 않은 확정 버전만 취소할 수 있습니다"}
            >
              <Button
                data-testid="rule-cancel-confirm"
                disabled={!canCancelConfirm}
                onClick={() => {
                  if (!selected) return;
                  showMessage({
                    title: "확정 취소",
                    message: `${selected.ver} 의 확정을 취소하고 작성 중인 상태로 되돌릴까요?\n${CANCEL_CONFIRM_EFFECT}`,
                    alertType: "confirm",
                    onConfirm: () => void runWrite(() => cancelConfirm(id, selected.ver, selected.rowVersion), () => null),
                  });
                }}
              >
                확정 취소
              </Button>
            </span>
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
              disabled={!HANDOVER_AVAILABLE || !mdm || !mine || busy}
              onChange={setHandoverTo}
              style={{ width: 160 }}
            />
            <span data-testid="rule-handover-wrap" title={HANDOVER_AVAILABLE ? "" : HANDOVER_PENDING_TEXT}>
            <Button
              data-testid="rule-handover"
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
              {HANDOVER_AVAILABLE ? "넘기기" : "넘기기(준비 중)"}
            </Button>
            </span>
          </>
        )}
        {selected && <DraftLockBadge status={selected.status} ownerId={selected.ownerId} currentUserId={me} />}
      </div>
    </CardFrame>
  );
}
