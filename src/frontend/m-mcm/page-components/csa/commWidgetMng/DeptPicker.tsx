"use client";

/**
 * 부서 고르기 팝업 — 기본 배치 탭의 [부서 추가]. shared LookupModal(검색 칸 + 결과 목록 + 확인)에
 * commWidgetMng/searchDepts 를 붙인다(스펙 2026-10-02-widget-admin-generic §10.2).
 * 서버가 최대 50건만 주므로 팝업 페이지 나누기는 화면에서 자른다(pageDeptLookupRows).
 */
import { useCallback } from "react";

import { LookupModal, type LookupFetchFn, type LookupRow } from "@dk-oasis/shared/lookup";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { searchDepts } from "./layout-api";
import { pageDeptLookupRows } from "./layout-model";

export interface DeptPickerProps {
  open: boolean;
  /** 부서를 확정했을 때(이어서 onClose 도 불린다). */
  onPick: (dept: { deptCd: string; deptNm: string }) => void;
  onClose: () => void;
}

export function DeptPicker({ open, onPick, onClose }: DeptPickerProps) {
  const { showMessage } = useMessage();

  // LookupModal 은 fetchFn 의 오류를 console.warn 으로만 남기므로 여기서 사용자에게 알린다.
  const fetchDepts = useCallback<LookupFetchFn>(
    async ({ keyword, page, size }) => {
      try {
        return pageDeptLookupRows(await searchDepts(keyword), page, size);
      } catch (e) {
        showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });
        return { rows: [], totalElements: 0 };
      }
    },
    [showMessage]
  );

  const handleSelect = useCallback(
    (row: LookupRow) => onPick({ deptCd: row.code, deptNm: row.name }),
    [onPick]
  );

  return (
    <LookupModal
      gridId="modal-deptPicker"
      open={open}
      title="부서 검색"
      placeholder="부서코드 또는 부서명 입력"
      fetchFn={fetchDepts}
      onSelect={handleSelect}
      onClose={onClose}
      searchOnOpen
    />
  );
}
