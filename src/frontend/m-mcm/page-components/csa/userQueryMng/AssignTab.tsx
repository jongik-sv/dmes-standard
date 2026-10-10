"use client";

/**
 * [할당] 탭 — shared TransferList(왼쪽 미할당 사용자, 오른쪽 할당 사용자). 스펙 2026-10-10-user-query-program-design §8.2.
 * - 후보는 searchUserList(사용 중 사용자, 최대 5000)를 탭이 처음 열릴 때 한 번 받고, 할당은 쿼리를 고를 때마다 searchAssign 으로 받는다.
 * - [할당 저장] 이 saveAssign(전체 교체)을 부른다. 사용자 표에 없는 사용자는 배지 「없는 사용자」 를 단다.
 * - 새 쿼리(저장 전)에는 할당할 수 없다 — 먼저 [정의] 를 저장한다.
 * - 탭을 바꿔도 상태가 남도록 화면이 항상 마운트해 두고 active 로 후보 조회 시점만 알린다.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { TransferList } from "@dk-oasis/shared/transfer-list";

import { saveUserQueryAssigns, searchUserQueryAssigns, searchUserQueryCandidates } from "../../_userq/api";
import type { UserQueryAssignRow, UserQueryCandidate } from "../../_userq/types";

import { ASSIGN_MAX, buildAssignItems, sameSet, type AssignItem } from "./form-model";

const NONE: ReadonlySet<string> = new Set();

const LABELS = {
  search: "ID·이름 검색",
  available: "미할당 사용자",
  member: "할당 사용자",
  countUnit: "명",
  groupAll: "부서 전체",
};

const MISSING_BADGE = { label: "없는 사용자", bg: "var(--color-warning-soft)", color: "var(--color-warning)" };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface AssignTabProps {
  /** 저장된 쿼리 ID. 새 쿼리(저장 전)·선택 없음은 null. */
  queryId: string | null;
  /** 이 탭이 지금 보이는가 — 처음 보일 때 후보를 받는다. */
  active: boolean;
  /** saveAssign 권한. */
  canSave: boolean;
  onDirtyChange: (dirty: boolean) => void;
  /** 조회·저장 처리 중 여부가 바뀔 때 — 화면이 그동안 행 선택·조회를 막는다. */
  onBusyChange: (busy: boolean) => void;
  /** 할당을 저장한 뒤(목록의 할당 수를 다시 받으라고 알린다). */
  onSaved: () => void;
}

export const AssignTab = memo(function AssignTab({ queryId, active, canSave, onDirtyChange, onBusyChange, onSaved }: AssignTabProps) {
  const { showMessage } = useMessage();
  const [candidates, setCandidates] = useState<{ rows: UserQueryCandidate[]; truncated: boolean } | null>(null);
  const [assigned, setAssigned] = useState<UserQueryAssignRow[]>([]);
  const [value, setValue] = useState<ReadonlySet<string>>(NONE);
  const [baseline, setBaseline] = useState<ReadonlySet<string>>(NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidatesLoading = useRef(false);
  /** 지금 보고 있는 쿼리 — 늦게 끝난 저장·조회가 다른 쿼리 상태를 덮어쓰지 않게 비교한다. */
  const queryIdRef = useRef(queryId);
  useEffect(() => {
    queryIdRef.current = queryId;
  }, [queryId]);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  const dirty = !sameSet(value, baseline);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const showError = useCallback(
    (e: unknown) => showMessage({ title: "오류", message: errorText(e), alertType: "error" }),
    [showMessage]
  );
  // 쿼리를 고를 때만 할당을 다시 받아야 하므로, effect 가 최신 showError 를 ref 로 읽는다(메시지 훅 참조가 바뀌어도 다시 조회하지 않는다).
  const showErrorRef = useRef(showError);
  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);

  // 후보 — 탭이 처음 보일 때 한 번. 실패하면 다시 보일 때 재시도한다.
  useEffect(() => {
    if (!active || candidates || candidatesLoading.current) return;
    candidatesLoading.current = true;
    setError(null);
    searchUserQueryCandidates()
      .then(setCandidates)
      .catch((e: unknown) => {
        setError(`사용자 목록을 불러오지 못했습니다: ${errorText(e)}`);
      })
      .finally(() => {
        candidatesLoading.current = false;
      });
  }, [active, candidates]);

  const applyAssigned = useCallback((rows: UserQueryAssignRow[]) => {
    const ids = new Set(rows.map((r) => r.userId));
    setAssigned(rows);
    setValue(ids);
    setBaseline(ids);
  }, []);

  // 할당 — 쿼리를 고를 때마다. 늦게 온 이전 응답은 버린다.
  useEffect(() => {
    let cancelled = false;
    // 이전 쿼리의 할당이 새 쿼리 응답 전까지 남아 변경 있음으로 보이지 않게 먼저 비운다.
    applyAssigned([]);
    if (!queryId) return;
    setBusy(true);
    searchUserQueryAssigns(queryId)
      .then((rows) => {
        if (!cancelled) applyAssigned(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          applyAssigned([]);
          showErrorRef.current(e);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryId, applyAssigned]);

  const items = useMemo<AssignItem[]>(() => buildAssignItems(candidates?.rows ?? [], assigned), [candidates, assigned]);
  const overLimit = value.size > ASSIGN_MAX;
  const editable = !!queryId && !busy && canSave;

  const handleSave = useCallback(async () => {
    if (!queryId) return;
    if (overLimit) {
      showMessage({ message: `할당은 최대 ${ASSIGN_MAX}명까지 가능합니다.`, alertType: "warning" });
      return;
    }
    // 사용자 표에 없는 사용자는 서버가 거절하므로 저장 집합에서 뺀다(할당에서 정리된다).
    const missingIds = new Set(items.filter((it) => it.missing).map((it) => it.code));
    const ids = [...value].filter((id) => !missingIds.has(id));
    const dropped = value.size - ids.length;
    setBusy(true);
    try {
      await saveUserQueryAssigns(queryId, ids);
      showMessage({
        message: dropped > 0 ? `저장되었습니다. 없는 사용자 ${dropped}명은 제외했습니다.` : "저장되었습니다.",
        alertType: "success",
        toast: true,
      });
      const fresh = await searchUserQueryAssigns(queryId);
      // 저장 중 다른 쿼리로 옮겼으면 그 쿼리의 상태를 덮어쓰지 않는다.
      if (queryIdRef.current === queryId) applyAssigned(fresh);
      onSaved();
    } catch (e) {
      showError(e);
    } finally {
      if (queryIdRef.current === queryId) setBusy(false);
    }
  }, [queryId, value, items, overLimit, applyAssigned, onSaved, showMessage, showError]);

  return (
    <div data-testid="userq-admin-assign" style={{ display: "contents" }}>
      {!queryId ? (
        <p role="status" style={{ margin: "var(--spacing-sm)", color: "var(--color-text-secondary)" }}>
          쿼리를 저장한 뒤 사용자를 할당할 수 있습니다.
        </p>
      ) : null}
      {error ? (
        <span className="form-error-message" role="alert" data-testid="userq-admin-assign-error">
          {error}
        </span>
      ) : null}
      {candidates?.truncated ? (
        <span role="status" data-testid="userq-admin-assign-truncated">
          사용자가 많아 앞 {candidates.rows.length}명만 후보로 보입니다.
        </span>
      ) : null}
      <TransferList<AssignItem>
        items={items}
        value={value}
        onChange={setValue}
        editable={editable}
        testId="userq-assign"
        getGroup={(it) => it.deptNm}
        getBadge={(it) => (it.missing ? MISSING_BADGE : null)}
        labels={LABELS}
      />
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          gap: "var(--spacing-sm)",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "var(--spacing-sm)",
        }}
      >
        <Button
          variant="primary"
          disabled={!editable || !dirty}
          data-testid="userq-admin-assign-save"
          onClick={() => void handleSave()}
        >
          할당 저장
        </Button>
      </div>
    </div>
  );
});
