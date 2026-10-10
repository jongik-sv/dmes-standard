"use client";

/**
 * 담당 부서 고르기 팝업 — shared LookupModal(검색 칸 + 결과 목록 + 확인)에 userQueryMng/searchDepts 를 붙인다.
 * csa/commWidgetMng/DeptPicker.tsx 와 같은 모양이다(권한이 userQueryMng 메뉴 OBJECT 로 판정되도록 호출 action 만 다르다).
 * 서버가 최대 50건만 주므로 팝업 페이지 나누기는 화면에서 자른다.
 */
import { useCallback } from "react";

import { LookupModal, type LookupFetchFn, type LookupRow } from "@dk-oasis/shared/lookup";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { searchUserQueryDepts } from "../../_userq/api";

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
        const depts = await searchUserQueryDepts(keyword);
        const start = Math.max(0, page) * Math.max(1, size);
        return {
          rows: depts.slice(start, start + Math.max(1, size)).map((d) => ({ code: d.deptCd, name: d.deptNm })),
          totalElements: depts.length,
        };
      } catch (e) {
        showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });
        return { rows: [], totalElements: 0 };
      }
    },
    [showMessage]
  );

  const handleSelect = useCallback((row: LookupRow) => onPick({ deptCd: row.code, deptNm: row.name }), [onPick]);

  return (
    <LookupModal
      gridId="modal-userQueryDeptPicker"
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
