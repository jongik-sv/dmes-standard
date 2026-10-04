"use client";

/**
 * codeMng 오른쪽 상세(옛 codeEdit 화면 본문, 2026-09-28 통합 D-101·D-102) — 카드 내용 컴포넌트 셋.
 *
 * Part B §4-3 MUST: 분할 영역(ContentBody/ContentPanel)은 직접 자식이어야 drag bar 가 붙는다
 * (shared `ContentBody.tsx` 의 `isLayoutItem` 은 `React.Children` 로 받은 **직접 자식의 type** 만 본다 — 함수
 * 컴포넌트로 감싸면 그 자식(예: 여기 있던 `<ContentBody>`)이 보이지 않는다). 그래서 이 파일은 `ContentBody`·
 * `ContentPanel` 을 반환하지 않고 카드 **내용**만 반환한다 — 골격(`ContentBody`/`ContentPanel` 배치, storageKey)은
 * `page.tsx` 가 직접 그린다. 모달(`NewVersionModal`·`HandoverModal`)도 옛 codeEdit 처럼 그 골격 바깥, `page.tsx` 의
 * 최상위 형제로 둔다.
 *
 * 서버 호출·권한 판정은 옛 codeEdit 그대로 이어간다: 모든 쓰기는 `codeEdit` 서비스(`/api/mdm/oasis/codeEdit/...`)를
 * 부르고 버튼 권한도 `canDoButton(rbac,"codeEdit",action)` 으로 본다(서버 OBJECT codeEdit 는 메뉴만 없어지고 남는다).
 * `buttons`(versionButtons 결과)·`allowed`(busy·권한 판정)는 page.tsx 가 한 번만 계산해 내려준다.
 * [코드 편집] 하나로 줄인 버튼(D-101)은 버전을 하나 고르면 늘 켠다 — 읽기 전용 여부는 codeItemEdit 이 판단하므로
 * 권한도 쓰기 액션이 아닌 `view` 로 본다. 헤더의 [폐기]/[삭제] 전환(D-102)은 `flags.neverReleased` 로 고른다.
 */
import { useCallback, useMemo } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { DraftLockBadge, VersionActionBar, VersionStatusBadge, type MdmVersionStatus } from "@/shell";

import type { VersionButtons } from "./buttons";
import type { VerKind } from "./NewVersionModal";
import { ATTR_KEYS, LVL_CNT_OPTIONS, type CodeEditFlags, type CodeEditView, type CodeHeaderView, type HeaderForm } from "./edit-types";

export const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const cardTitle = { padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 } as const;

const VERSION_GRID_HEIGHT = 240;

// 버전 목록 열. 행 원본(VersionView)을 render 로 받아 배지·조합 문구를 그린다.
function versionColumns(currentUserId: string | null): GridColumn[] {
  return [
    {
      key: "verLabel", header: "버전", width: 110,
      render: (_v, row) => {
        const v = row as unknown as CodeEditView["versions"][number];
        return (
          <>
            {v.verLabel}
            {v.restoredLabel ? <span style={mutedText}> ({v.restoredLabel})</span> : null}
          </>
        );
      },
    },
    { key: "verKind", header: "종류", width: 80 },
    {
      key: "status", header: "상태", width: 110,
      render: (_v, row) => {
        const v = row as unknown as CodeEditView["versions"][number];
        return <VersionStatusBadge status={v.status as MdmVersionStatus} applyFrom={v.applyFrom} />;
      },
    },
    {
      key: "applyFrom", header: "적용 구간", width: 200,
      render: (_v, row) => {
        const v = row as unknown as CodeEditView["versions"][number];
        return v.applyFrom ? `${v.applyFrom} - ${v.applyTo ?? ""}` : "—";
      },
    },
    { key: "releasedAt", header: "확정 일시", width: 150, render: (v) => (v as string | null | undefined) ?? "—" },
    {
      key: "ownerId", header: "소유자", width: 120,
      render: (_v, row) => {
        const v = row as unknown as CodeEditView["versions"][number];
        return <DraftLockBadge status={v.status as MdmVersionStatus} ownerId={v.ownerId} currentUserId={currentUserId} />;
      },
    },
    { key: "description", header: "설명", width: 160, render: (v) => (v as string | null | undefined) ?? "" },
  ];
}


/** busy·권한을 함께 보는 판정 — page.tsx 가 만들어 각 카드에 내려준다. */
export type Allowed = (enabled: boolean, action: string) => boolean;

// ── ① 헤더 ──

export interface CodeHeaderCardProps {
  header: CodeHeaderView;
  form: HeaderForm;
  flags: CodeEditFlags;
  buttons: VersionButtons;
  allowed: Allowed;
  editable: boolean;
  busy: boolean;
  onFieldChange: (key: keyof HeaderForm, value: string) => void;
  onSaveHeader: () => void;
  onDeprecate: () => void;
  onDeleteCode: () => void;
}

export function CodeHeaderCard({
  header, form, flags, buttons, allowed, editable, busy, onFieldChange, onSaveHeader, onDeprecate, onDeleteCode,
}: CodeHeaderCardProps) {
  const { showMessage } = useMessage();
  const neverReleased = !!flags.neverReleased;
  const canSaveHeader = allowed(buttons.headerSave.enabled, "save");
  const canDeprecate = allowed(buttons.deprecate.enabled, "execute");
  const canDeleteCodeBtn = allowed(!!flags.canDeleteCode, "delete");

  const handleDeprecate = useCallback(() => {
    showMessage({
      title: "확인",
      message: "폐기하면 새 버전을 만들 수 없습니다. 폐기할까요?",
      alertType: "confirm",
      onConfirm: onDeprecate,
    });
  }, [onDeprecate, showMessage]);

  const handleDeleteCode = useCallback(() => {
    showMessage({
      title: "확인",
      message: "이 마루 코드를 삭제하면 되돌릴 수 없습니다. 삭제할까요?",
      alertType: "confirm",
      onConfirm: onDeleteCode,
    });
  }, [onDeleteCode, showMessage]);

  return (
    <>
      <p style={cardTitle}>① 헤더</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>마루 코드 ID</th>
            <td style={DETAIL_VALUE_CELL} data-testid="header-code-id">{header.maruCodeId}</td>
            <th style={DETAIL_LABEL_CELL}>원천</th>
            <td style={DETAIL_VALUE_CELL}>{header.sourceKind}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>상태</th>
            <td style={DETAIL_VALUE_CELL}>
              <span data-testid="header-status">{header.status}</span>
            </td>
            <th style={DETAIL_LABEL_CELL}>현재 버전</th>
            <td style={DETAIL_VALUE_CELL}>
              {header.currentVerLabel} · 미적용 {header.unappliedLabel}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>이름 *</th>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              <Input
                data-testid="header-name"
                value={form.maruCodeName}
                maxLength={100}
                disabled={!editable || busy}
                onChange={(v) => onFieldChange("maruCodeName", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              <Textarea
                data-testid="header-desc"
                value={form.description}
                disabled={!editable || busy}
                onChange={(v) => onFieldChange("description", v)}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>계층 칸 수</th>
            <td style={DETAIL_VALUE_CELL} colSpan={3}>
              <Select
                data-testid="header-lvl"
                value={form.lvlCnt}
                options={LVL_CNT_OPTIONS}
                disabled={!editable || busy}
                onChange={(v) => onFieldChange("lvlCnt", v)}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ padding: "0 var(--spacing-md)", ...mutedText }}>
        이름·설명·계층 칸 수·라벨은 버전 밖의 값이라 결재 없이 고친다
      </p>
      <div style={{ display: "flex", gap: "var(--spacing-sm)", justifyContent: "flex-end", padding: "var(--spacing-sm) var(--spacing-md)" }}>
        <Button data-testid="header-save" variant="primary" disabled={!canSaveHeader} onClick={onSaveHeader}>
          저장
        </Button>
        {neverReleased ? (
          <Button data-testid="header-delete-code" variant="danger" disabled={!canDeleteCodeBtn} onClick={handleDeleteCode}>
            삭제
          </Button>
        ) : (
          <Button data-testid="header-deprecate" variant="danger" disabled={!canDeprecate} onClick={handleDeprecate}>
            폐기
          </Button>
        )}
      </div>
    </>
  );
}

// ── ② 추가 컬럼 라벨 ──

export interface CodeLabelsCardProps {
  form: HeaderForm;
  editable: boolean;
  busy: boolean;
  onFieldChange: (key: keyof HeaderForm, value: string) => void;
}

export function CodeLabelsCard({ form, editable, busy, onFieldChange }: CodeLabelsCardProps) {
  return (
    <>
      <p style={cardTitle}>② 추가 컬럼 라벨</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          {ATTR_KEYS.map((key, i) => {
            const no = String(i + 1).padStart(2, "0");
            return (
              <tr key={key}>
                <th style={DETAIL_LABEL_CELL}>attr{no}</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid={`label-attr${no}`}
                    value={form[key]}
                    maxLength={100}
                    disabled={!editable || busy}
                    onChange={(v) => onFieldChange(key, v)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ padding: "0 var(--spacing-md) var(--spacing-sm)", ...mutedText }}>
        라벨이 있는 번호만 값을 받는다. 지운 번호를 다른 뜻으로 다시 쓰지 않는다
      </p>
    </>
  );
}

// ── ③ 버전 목록 ──

export interface CodeVersionCardProps {
  view: CodeEditView;
  selectedVer: string | null;
  buttons: VersionButtons;
  allowed: Allowed;
  onSelectVer: (ver: string) => void;
  onDeleteDraft: () => void;
  onCancelConfirm: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onOpenNewVersion: (kind: VerKind) => void;
  onOpenHandover: () => void;
  onConfirmMove: () => void;
  onItemEdit: () => void;
}

export function CodeVersionCard({
  view, selectedVer, buttons, allowed, onSelectVer, onDeleteDraft, onCancelConfirm, onLock, onUnlock, onOpenNewVersion,
  onOpenHandover, onConfirmMove, onItemEdit,
}: CodeVersionCardProps) {
  const { showMessage } = useMessage();
  const selected = view.versions.find((v) => v.ver === selectedVer) ?? null;

  // 렌더마다 새 열 배열을 만들면 부모의 검색 입력 한 글자마다 그리드 열 정의가 다시 만들어진다.
  const columns = useMemo(() => versionColumns(view.me), [view.me]);

  return (
    <>
      <p style={cardTitle}>③ 버전 목록</p>
      <div style={{ padding: "var(--spacing-xs) var(--spacing-md)" }}>
        <VersionActionBar
          ids={{
            newMajor: "ver-new-major", newMinor: "ver-new-minor", delete: "ver-delete", confirm: "ver-confirm-move",
            cancelConfirm: "ver-cancel-confirm", lock: "ver-lock", unlock: "ver-unlock", handover: "ver-handover",
            handoverWrap: "ver-handover-wrap",
          }}
          newVersionMode="majorMinor"
          newMajor={{ enabled: allowed(buttons.newMajor.enabled, "reg") }}
          newMinor={{ enabled: allowed(buttons.newMinor.enabled, "reg"), title: buttons.newMinor.hint }}
          delete={{ enabled: allowed(buttons.delete.enabled, "delete") }}
          confirm={{ enabled: allowed(buttons.confirmMove.enabled, "confirm") }}
          // D8 확정 취소 — 서버 판정값(cancelConfirmable)이 true 일 때만 켠다.
          cancelConfirm={{ enabled: allowed(buttons.cancelConfirm.enabled, "delete") }}
          lock={{ enabled: allowed(buttons.lock.enabled, "lock") }}
          unlock={{ enabled: allowed(buttons.unlock.enabled, "unlock") }}
          handover={{ enabled: allowed(buttons.handover.enabled, "handover") }}
          onNewMajor={() => onOpenNewVersion("MAJOR")}
          onNewMinor={() => onOpenNewVersion("MINOR")}
          onDelete={onDeleteDraft}
          onConfirm={onConfirmMove}
          onCancelConfirm={onCancelConfirm}
          onLock={onLock}
          onUnlock={onUnlock}
          onHandover={onOpenHandover}
          deleteMessage={`${selected?.verLabel ?? ""} DRAFT 를 삭제할까요? 이 버전에서 바꾼 코드·카테고리도 되돌립니다.`}
          // 확정 취소 확인창 — D8-10. 이미 적용된 버전은 되돌릴 수 없고(D8-1), 되돌리면 그 자리가 작성 중이 되어
          // 편집을 이어 갈 수 있다. 확정 기록(row_version·확정 칸)은 남는다.
          cancelConfirmMessage={`${selected?.verLabel ?? ""} 의 확정을 취소하고 작성 중인 상태로 되돌릴까요?\n`
            + `적용 시각(${selected?.applyFrom ?? ""})이 오기 전에만 되돌릴 수 있고, 이미 적용된 뒤에는 되돌릴 수 없습니다. `
            + `취소해도 확정 기록은 남습니다.`}
          trailing={(
            <Button data-testid="ver-item-edit" disabled={!allowed(buttons.itemEdit.enabled, "view")} onClick={onItemEdit}>
              코드 편집
            </Button>
          )}
        />
      </div>
      {buttons.newVersionHint ? (
        <p data-testid="ver-new-hint" style={{ padding: "0 var(--spacing-md)", ...mutedText }}>
          {buttons.newVersionHint}
        </p>
      ) : null}
      {buttons.warning ? (
        <p data-testid="ver-unapplied-warning" style={{ padding: "0 var(--spacing-md)", color: "var(--color-danger)" }}>
          {buttons.warning}
        </p>
      ) : null}
      <div data-testid="version-list" style={{ padding: "0 var(--spacing-md)", height: VERSION_GRID_HEIGHT }}>
        <AgDataGrid
          columnSizing="fit"
          columns={columns}
          data={view.versions as unknown as Record<string, unknown>[]}
          rowKey="ver"
          highlightedRowKey={selectedVer}
          onRowClick={(r) => onSelectVer(String(r.ver))}
          emptyMessage="버전이 없습니다"
          emptyTestId="version-empty"
        />
      </div>
    </>
  );
}
