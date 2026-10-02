"use client";

/**
 * ruleMng 오른쪽 상세 ① 헤더 + ② 버전 (decisions.md D-105).
 *
 * <p>D-101(dmc)·D-104(dmd)에 이어 룰도 같은 분할을 따른다. 옛 `ruleEdit` 카드 ①② 를 여기로 옮긴 것이고, 서버
 * 서비스도 `ruleMng` 의 `view`·`save`(target HEADER)·`copy`·`delete`·`lock`·`unlock`·`handover` 로 옮겨 갔다.
 *
 * <p>Part B §4-3 MUST: 분할 영역(`ContentBody`/`ContentPanel`)은 `page.tsx` 의 **직접 자식**이어야 drag bar 가 붙는다
 * (shared `ContentBody.tsx` 의 `isLayoutItem` 은 `React.Children` 로 받은 직접 자식의 type 만 본다). 그래서 이 파일은
 * 골격을 그리지 않고 카드 내용만 돌려준다.
 *
 * <p>버전 관리는 여기서 끝난다 — 확정 이동(`openMdmPage("dme/ruleConfirm")`)만 남긴다. 적중 정책(HIT_POLICY)은 ② 버전 목록의
 * 「적중 정책」 칸에 <b>보이기만</b> 한다. 고치는 곳은 룰 편집 화면(`ruleEdit`) 의사결정표이고, 표 저장과 함께 저장된다
 * (D-133 — D-105 (4) 번복: 정책은 판정표의 해석 규칙이라 표와 한 묶음으로 고친다).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { DraftLockBadge, HANDOVER_AVAILABLE, VersionActionBar, VersionStatusBadge, openMdmPage } from "@/shell";

import {
  cancelConfirm,
  deleteDraft,
  deprecateRule,
  handoverVersion,
  lockVersion,
  newVersion,
  saveHeader,
  unlockVersion,
  type HeaderForm,
} from "./api";
import {
  RULE_KIND_LABELS,
  RULE_STATUS_LABELS,
  type RuleHeader,
  type RuleMngView,
  type RuleVersionInfo,
} from "./types";

/** D8-10 — 06 교차 효과. 되돌린 룰이 유일 확정 버전이었다면 룰 세트와 다른 룰의 확정이 막히고, 재확정하면 풀린다. */
export const CANCEL_CONFIRM_EFFECT =
  "적용 시각이 오기 전에는 취소할 수 있고, 이미 적용된 뒤에는 되돌릴 수 없습니다. "
  + "확정 취소하면 이 룰을 멤버로 가진 룰 세트와 이 룰의 결과를 쓰는 다른 룰의 확정이 잠시 막힙니다. 다시 확정하면 풀립니다. "
  + "취소해도 확정 기록은 남습니다.";

const KIND_LABEL: Record<string, string> = { DECISION: "판정(DECISION)", DERIVE: "산출(DERIVE)" };

/** 서버 `RuleVersions.isUnapplied` 와 같은 뜻 — DRAFT·REQUESTED·APPROVED·적용 전 RELEASED. 안내 문구용. */
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
  { key: "ver", header: "버전", width: 70, tooltip: false, render: (value) => String(value ?? "") },
  {
    key: "status",
    header: "상태",
    width: 120,
    tooltip: false,
    render: (_v, row) => <VersionStatusBadge status={row.status as RuleVersionInfo["status"]} applyFrom={row.applyFrom as string | null} />,
  },
  { key: "range", header: "적용 구간", width: 190 },
  { key: "ownerId", header: "소유자", width: 110 },
  { key: "baseVer", header: "base", width: 70 },
  // 버전마다 다를 수 있어 목록에 보인다(읽기 전용). 고치는 곳은 룰 편집 화면의 의사결정표(D-133).
  { key: "hitPolicy", header: "적중 정책", width: 90 },
];

export interface RuleDetailPanelProps {
  view: RuleMngView;
  /** 상세 재조회 — 쓰기 뒤 row_version·auditVer 을 맞춰야 한다. */
  reload: () => Promise<void>;
  canDo: (action: string) => boolean;
  busy: boolean;
  onError: (message: string) => void;
  onContentEdit: (ruleId: string, ver?: number) => void;
}

export function RuleDetailPanel({ view, reload, canDo, busy, onError, onContentEdit }: RuleDetailPanelProps) {
  const header: RuleHeader = view.header;
  const me = view.me ?? "";
  const flags = view.flags;
  const external = header.sourceKind !== "MDM";
  const id = header.maruRuleId;

  // ① 헤더 폼
  const initial = useMemo<HeaderForm>(
    () => ({ maruRuleName: header.maruRuleName ?? "", description: header.description ?? "", usageNote: header.usageNote ?? "" }),
    [header],
  );
  const [form, setForm] = useState<HeaderForm>(initial);
  const [confirmDeprecate, setConfirmDeprecate] = useState(false);
  useEffect(() => {
    setForm(initial);
    setConfirmDeprecate(false);
  }, [initial]);

  // ② 버전 — 선택은 이 화면이 갖고 있다(내용 화면은 읽기 전용 목록만 본다).
  const [selectedVer, setSelectedVer] = useState<number | null>(null);
  useEffect(() => {
    if (view.versions.some((v) => v.ver === selectedVer)) return;
    // 기본은 미적용 버전 → 현재 적용 버전 → 최대 버전 — 내용 화면과 같은 고르기 순서.
    const now = new Date();
    const unapplied = view.versions.find((v) => isUnapplied(v, now));
    const applied = view.versions.find((v) => v.status === "RELEASED" && !isUnapplied(v, now));
    setSelectedVer((unapplied ?? applied ?? view.versions[0])?.ver ?? null);
  }, [view.versions, selectedVer]);
  const selected = view.versions.find((v) => v.ver === selectedVer) ?? null;

  const [handoverTo, setHandoverTo] = useState("");

  const changed = form.maruRuleName !== initial.maruRuleName || form.description !== initial.description || form.usageNote !== initial.usageNote;
  const editable = flags.headerEditable && !external;
  const canSaveHeader = editable && !!form.maruRuleName.trim() && canDo("save") && !busy;
  const canDeprecate = editable && flags.canDeprecate && canDo("delete") && !busy;

  // 버전 관리 판정 — flags(서버 계산) + 소유자(D6) 를 함께 쓴다. 실제 거부는 서버가 다시 검사한다.
  const draft = selected?.status === "DRAFT";
  const mine = !!draft && !!selected?.ownerId && selected.ownerId === me;
  const canCopy = !external && flags.canNewVersion && canDo("copy") && !busy;
  const canDeleteDraft = !external && mine && canDo("delete") && !busy;
  const canUnlock = !external && mine && canDo("unlock") && !busy;
  const canCancelConfirm = !external && !!selected?.cancelConfirmable && canDo("delete") && !busy;
  // D2: 넘겨받는 사람의 담당자 여부를 확인할 수단이 생길 때까지 끈다(HANDOVER_AVAILABLE).
  const canHandover = HANDOVER_AVAILABLE && !external && mine && canDo("handover") && !busy;
  const showLock = !external && !!draft && !selected?.ownerId;
  const canMoveToConfirm = !external && !!draft && !busy;
  // 산출 룰(DERIVE)에는 적중 정책이 없다.
  const derive = header.ruleKind === "DERIVE";

  const versionRows = useMemo(
    () =>
      view.versions.map((v) => ({
        ver: v.ver,
        status: v.status,
        applyFrom: v.applyFrom,
        range: applyRange(v),
        ownerId: v.ownerId ?? "",
        baseVer: v.baseVer ?? "",
        hitPolicy: derive ? "-" : (v.hitPolicy ?? ""),
      })),
    [view.versions, derive],
  );

  /** 쓰기 한 번 — 성공하면 상세 를 다시 불러 row_version·auditVer 을 맞춘다. */
  const runWrite = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await reload();
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    },
    [reload, onError],
  );

  const set = (key: keyof HeaderForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)", minHeight: 0, overflow: "auto" }}>
      {/* ── ① 헤더 ── */}
      <section data-testid="rule-card-header" style={{ padding: "var(--spacing-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)", paddingBottom: "var(--spacing-xs)" }}>
          <strong style={{ flex: "1 1 auto" }}>① 헤더</strong>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
            {header.status === "INUSE"
              ? RULE_STATUS_LABELS.INUSE
              : header.status === "DEPRECATED"
                ? RULE_STATUS_LABELS.DEPRECATED
                : RULE_STATUS_LABELS.CREATED}
          </span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{KIND_LABEL[header.ruleKind] ?? header.ruleKind}</span>
        </div>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>룰 ID</th>
              <td style={DETAIL_VALUE_CELL} data-testid="rule-header-id">
                {id}
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>룰명 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="rule-header-name"
                  value={form.maruRuleName}
                  disabled={!editable || busy}
                  onChange={(v) => set("maruRuleName", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>설명</th>
              <td style={DETAIL_VALUE_CELL}>
                <Textarea
                  data-testid="rule-header-description"
                  value={form.description}
                  rows={2}
                  disabled={!editable || busy}
                  onChange={(v) => set("description", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>활용처 메모</th>
              <td style={DETAIL_VALUE_CELL}>
                <Textarea
                  data-testid="rule-header-usage"
                  value={form.usageNote}
                  rows={2}
                  disabled={!editable || busy}
                  onChange={(v) => set("usageNote", v)}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>원천</th>
              <td style={DETAIL_VALUE_CELL} data-testid="rule-header-source">
                {external ? `EXTERNAL · ${header.sourceSystem ?? ""}` : "MDM"}
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--spacing-xs)", paddingTop: "var(--spacing-sm)" }}>
          {header.status === "INUSE" &&
            (confirmDeprecate ? (
              <>
                <Button variant="danger" disabled={!canDeprecate} onClick={() => void runWrite(() => deprecateRule(id))}>
                  폐기 확인
                </Button>
                <Button onClick={() => setConfirmDeprecate(false)}>취소</Button>
              </>
            ) : (
              <Button disabled={!canDeprecate} onClick={() => setConfirmDeprecate(true)}>
                폐기
              </Button>
            ))}
          <Button
            variant="primary"
            data-testid="rule-header-save"
            disabled={!canSaveHeader || !changed}
            onClick={() => void runWrite(() => saveHeader(id, form, header.auditVer))}
          >
            헤더 저장
          </Button>
        </div>
      </section>

      {/* ── ② 버전 ── */}
      <section data-testid="rule-card-versions" style={{ padding: "0 var(--spacing-sm) var(--spacing-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)", paddingBottom: "var(--spacing-xs)" }}>
          <strong style={{ flex: "1 1 auto" }}>② 버전</strong>
          <Button disabled={!canDo("view") || busy} onClick={() => selected && onContentEdit(id, selected.ver)}>
            내용 편집 →
          </Button>
        </div>
        <div data-testid="rule-version-table">
          <AgDataGrid
            columns={versionColumns}
            data={versionRows}
            rowKey="ver"
            height="auto"
            columnSizing="fit"
            sortable={false}
            highlightedRowKey={selectedVer ?? undefined}
            onRowClick={(row) => setSelectedVer(row.ver as number)}
            emptyMessage="버전이 없습니다."
            ariaLabel="룰 버전 목록"
          />
        </div>

        {flags.unappliedCount > 0 && (
          <p data-testid="rule-unapplied-notice" style={{ color: "var(--color-text-secondary)", margin: "var(--spacing-xs) 0" }}>
            미적용 버전이 있어 새 버전을 만들 수 없습니다(한 번에 하나).
          </p>
        )}

        {/* 적중 정책은 목록 칸에 보이기만 한다 — 고치는 곳은 룰 편집 화면의 의사결정표(D-133). */}
        {!derive && (
          <p data-testid="rule-hit-policy-hint" style={{ color: "var(--color-text-secondary)", margin: "var(--spacing-xs) 0" }}>
            적중 정책은 [내용 편집 →] 의 의사결정표에서 바꾸고 표 저장과 함께 저장합니다.
          </p>
        )}

        <VersionActionBar
          ids={{
            newVersion: "rule-new-version", delete: "rule-version-delete", confirm: "rule-move-to-confirm",
            cancelConfirm: "rule-cancel-confirm", cancelConfirmWrap: "rule-cancel-confirm-wrap", lock: "rule-version-lock",
            unlock: "rule-version-unlock", handover: "rule-handover", handoverWrap: "rule-handover-wrap",
          }}
          newVersionMode="single"
          newVersion={{ enabled: canCopy }}
          delete={{ enabled: canDeleteDraft }}
          confirm={{ enabled: canMoveToConfirm, title: canMoveToConfirm ? "" : "DRAFT 버전만 확정할 수 있습니다" }}
          cancelConfirm={{
            enabled: canCancelConfirm,
            title: canCancelConfirm ? "" : "아직 적용 시각이 오지 않은 확정 버전만 취소할 수 있습니다",
          }}
          lock={{ enabled: showLock && canDo("lock") && !busy }}
          unlock={{ enabled: canUnlock }}
          handover={{ enabled: canHandover }}
          onNewVersion={() => void runWrite(() => newVersion(id))}
          onDelete={() => selected && void runWrite(() => deleteDraft(id, selected.ver, selected.rowVersion))}
          onConfirm={() => selected && openMdmPage("dme/ruleConfirm", { maruRuleId: id, ver: String(selected.ver) })}
          // D8 확정 취소 — 확인창에 06 교차 효과(룰 세트·다른 룰의 확정이 잠시 막힘)를 알린다.
          onCancelConfirm={() => selected && void runWrite(() => cancelConfirm(id, selected.ver, selected.rowVersion))}
          onLock={() => selected && void runWrite(() => lockVersion(id, selected.ver, selected.rowVersion))}
          onUnlock={() => selected && void runWrite(() => unlockVersion(id, selected.ver, selected.rowVersion))}
          onHandover={() => {
            if (!selected) return;
            if (!handoverTo.trim()) {
              onError("넘겨받을 사용자 ID 를 적으세요.");
              return;
            }
            const target = handoverTo.trim();
            void runWrite(() => handoverVersion(id, selected.ver, selected.rowVersion, target)).then(() => setHandoverTo(""));
          }}
          deleteMessage={`${selected?.ver ?? ""} DRAFT 를 삭제할까요?`}
          cancelConfirmMessage={`${selected?.ver ?? ""} 의 확정을 취소하고 작성 중인 상태로 되돌릴까요?\n${CANCEL_CONFIRM_EFFECT}`}
          beforeHandover={(
            <Input
              data-testid="rule-handover-target"
              value={handoverTo}
              placeholder="넘겨받을 사용자 ID"
              disabled={!HANDOVER_AVAILABLE || !mine || busy}
              onChange={setHandoverTo}
              style={{ width: 150 }}
            />
          )}
          trailing={selected ? <DraftLockBadge status={selected.status} ownerId={selected.ownerId} currentUserId={me} /> : null}
        />
      </section>
    </div>
  );
}
