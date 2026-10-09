"use client";

/**
 * commUserMng 사용자 상세 폼 (D-001~D-018, B-013/14/15/16).
 *
 * 입력 초안은 이 컴포넌트에만 둔다(Screen-Performance-Guide R12, useDetailDraft). 화면 루트가 상세 입력을 들고 있으면
 * 글자마다 루트와 그리드가 다시 그려졌다. 루트는 `ref` 핸들(getDraft·isDirty·commit·reset)로 초안을 읽고,
 * 행에는 blur·저장 직전 commit()·행 전환 때만 반영된다(onCommit).
 *
 * 이 폼 안에서만 쓰는 입력 state — 역할그룹 복사 대상 ID·비밀번호/SSO 초기화 라디오·부서 LoV 열림 — 도 여기에 둔다.
 * 선택 행이 바뀌면 `key` 로 다시 만들어 As-Is(edt_user_id_onchanged) 처럼 비운다.
 */
import { memo, useCallback, useImperativeHandle, useState, type Ref } from "react";

import { DETAIL_TABLE_STYLE, DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { LookupModal, type LookupRow, type LookupFetchFn } from "@dk-oasis/shared/lookup";
import { Button, Input, Select, DatePicker, Radio, useDetailDraft, type DetailDraftHandle } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";

import { searchDeptLov as apiSearchDeptLov } from "./api";
import { IN_OUT_OPTIONS, getRowKey, toDateInputValue } from "./detailUtils";
import type { CommUserMngGridRow } from "./types";

/** 루트가 상세 폼과 대화하는 핸들 (getDraft·isDirty·commit·reset). */
export type CommUserDetailHandle = DetailDraftHandle<CommUserMngGridRow>;

type Props = {
  ref: Ref<CommUserDetailHandle>;
  /** 선택한 사용자 행. 없으면 "사용자를 선택하세요." 를 보인다. */
  row: CommUserMngGridRow | null;
  /** 저장·초기화 등 쓰기 작업 진행 중 — 단추 비활성 (루트 useBusy "save"). */
  saving: boolean;
  /** 초안을 행에 반영할 때(blur·저장 직전·행 전환). 인자는 초안과 그 초안이 시작된 행. */
  onCommit: (draft: CommUserMngGridRow, base: CommUserMngGridRow) => void;
  /** B-014 역할그룹 복사 — 입력한 복사 출처 USER_ID 를 넘긴다. */
  onRoleCopy: (sourceUserId: string) => Promise<void>;
  /** B-013 / B-015 초기화 — 라디오 값을 넘기고, 돌려받은 true 면 라디오를 "N" 으로 되돌린다(As-Is 처리 후 N 복귀). */
  onReset: (sso: boolean, flag: string) => Promise<boolean>;
  /** B-016 계정 재생성. */
  onReRegister: () => Promise<void>;
};

/** 부서 LoV 조회 — shared LookupFetchFn 계약({keyword,page,size}→LookupPageResult). DEPT LoV 는 client-side 페이징(slice). */
const fetchDeptLov: LookupFetchFn = async ({ keyword, page, size }) => {
  const res = await apiSearchDeptLov(keyword);
  const all: LookupRow[] = (res.ds_deptLov ?? []).map((r) => ({
    code: String(r.DEPT_CD ?? ""),
    name: String(r.DEPT_NM ?? ""),
  }));
  return { rows: all.slice(page * size, page * size + size), totalElements: all.length };
};

const PANEL_STYLE = {
  marginTop: 32, // panel-header 자리(행추가/행삭제 라인) 비움 — wrapper 밖이라 라인 ✗ (사용자 검수 J-015)
  display: "flex",
  flexDirection: "column",
  border: "1px solid #d4dae0",
  background: "#fff",
} as const;

/** "상세 정보" 헤더 (28px) — 양 그리드의 column-header (사용자ID*|...) 라인과 정렬. */
const PANEL_HEADER_STYLE = {
  height: 28,
  background: "#f4f6f8",
  borderBottom: "1px solid #d4dae0",
  padding: "0 10px",
  display: "flex",
  alignItems: "center",
  fontWeight: 600,
  fontSize: 13,
  color: "#333",
  flexShrink: 0,
} as const;

const ROW_LAYOUT_STYLE = { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" } as const;

const YN_OPTIONS = [
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];

/** D-017 사용자 역할그룹 복사 + B-014 역할그룹등록 (xfdl:162~163). 입력 state 는 이 행에만 둔다. */
const RoleCopyRow = memo(function RoleCopyRow({
  saving,
  onRoleCopy,
}: {
  saving: boolean;
  onRoleCopy: (sourceUserId: string) => Promise<void>;
}) {
  const [sourceUserId, setSourceUserId] = useState("");
  return (
    <tr>
      <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="roleCopyUserId" meta={false} label="사용자 역할그룹 복사" /></th>
      <td style={DETAIL_VALUE_CELL}>
        <div style={ROW_LAYOUT_STYLE}>
          <div style={{ flex: 1 }}>
            <Input
              type="text"
              value={sourceUserId}
              placeholder="USER_ID 입력"
              onChange={(v) => setSourceUserId(v)}
            />
          </div>
          <div style={{ width: 110, flexShrink: 0 }}>
            <Button
              style={{ width: "100%" }}
              disabled={saving}
              onClick={() => void onRoleCopy(sourceUserId)}
            >
              역할그룹등록
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
});

/** D-016 비밀번호 초기화 / D-018 SSO 초기화 — Radio(Y/N, 기본 "N") + 버튼. As-Is 처럼 Y 일 때만 처리가 진행된다. */
const ResetRow = memo(function ResetRow({
  sso,
  saving,
  onReset,
}: {
  sso: boolean;
  saving: boolean;
  onReset: (sso: boolean, flag: string) => Promise<boolean>;
}) {
  const [flag, setFlag] = useState("N");
  const labelName = sso ? "ssoResetFlag" : "pwdResetFlag";
  const label = sso ? "SSO 초기화" : "비밀번호 초기화";
  return (
    <tr>
      <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name={labelName} meta={false} label={label} /></th>
      <td style={DETAIL_VALUE_CELL}>
        <div style={ROW_LAYOUT_STYLE}>
          <div style={{ flex: 1 }}>
            <Radio
              name={sso ? "rdo_SSOReset" : "rdo_PwdReset"}
              value={flag}
              onChange={(v) => setFlag(v)}
              options={YN_OPTIONS}
            />
          </div>
          <div style={{ width: 110, flexShrink: 0 }}>
            <Button
              style={{ width: "100%" }}
              disabled={saving}
              onClick={() => {
                // 처리가 진행됐거나 확인을 취소한 경우 As-Is 처럼 라디오를 N 으로 되돌린다.
                void onReset(sso, flag).then((back) => {
                  if (back) setFlag("N");
                });
              }}
            >
              {label}
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
});

export const CommUserDetailForm = memo(function CommUserDetailForm({
  ref,
  row,
  saving,
  onCommit,
  onRoleCopy,
  onReset,
  onReRegister,
}: Props) {
  const { draft, setField, containerProps, handle } = useDetailDraft<CommUserMngGridRow>(row, {
    onCommit,
    rowKey: (r) => getRowKey(r),
  });
  useImperativeHandle(ref, () => handle, [handle]);

  const [isDeptLovOpen, setIsDeptLovOpen] = useState(false);

  // 선택 시 DEPT_CD + DEPT_NM 두 컬럼을 동시에 세트하고, 목록 그리드의 부서 칸이 바로 바뀌도록 곧장 반영한다.
  const handleDeptLovPick = useCallback(
    (picked: LookupRow) => {
      setField("DEPT_CD", picked.code);
      setField("DEPT_NM", picked.name);
      handle.commit();
    },
    [setField, handle],
  );
  const closeDeptLov = useCallback(() => setIsDeptLovOpen(false), []);

  if (!draft) {
    return (
      <div style={PANEL_STYLE}>
        <div style={PANEL_HEADER_STYLE}>상세 정보</div>
        <div style={{ padding: 16, color: "#888", background: "#fff" }}>사용자를 선택하세요.</div>
      </div>
    );
  }

  const isNewRow = draft.nativeeditor_status === "inserted";
  const rowKeyValue = getRowKey(draft);

  return (
    <>
      {/* 폼 래퍼 — 높이는 내용물 크기에 맞춤(flex:1 ✗). 포커스가 폼 밖으로 나가면 초안을 행에 반영한다. */}
      <div {...containerProps} style={PANEL_STYLE}>
        <div style={PANEL_HEADER_STYLE}>상세 정보</div>
        {/* 폼 본문 — 내용물 크기에 맞춤 (flex:1 ✗) */}
        <div style={{ padding: 0, background: "#fff" }}>
          {/* 2026-06-01 — As-Is xfdl Detail 영역 1:1 정합 (D-001~D-020 / B-013/14/15/16).
              shared form 컴포넌트 (Input / Select / DatePicker / Radio / Button) 정합 — 가이드 §11. */}
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              {/* D-001 사용자ID (Essential, 신규 행에서만 편집 — As-Is xfdl:1211 readonly 룰) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USER_ID" label="사용자ID" required /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    type="text"
                    value={draft.USER_ID ?? ""}
                    maxLength={90}
                    readOnly={!isNewRow}
                    onChange={(v) => setField("USER_ID", v)}
                  />
                </td>
              </tr>
              {/* D-002 사번 (Essential, maxlength=10, digit+alpha) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USER_EMP_NO" label="사번" required /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    type="text"
                    value={draft.USER_EMP_NO ?? ""}
                    maxLength={10}
                    onChange={(v) => setField("USER_EMP_NO", v)}
                  />
                </td>
              </tr>
              {/* D-003 SSO ID — displaynulltext="UNI DOS 연동" */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="SSO_ID" label="SSO ID" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    type="text"
                    value={draft.SSO_ID ?? ""}
                    maxLength={90}
                    placeholder="UNI DOS 연동"
                    onChange={(v) => setField("SSO_ID", v)}
                  />
                </td>
              </tr>
              {/* D-004 사용자명 (Essential, maxlength=90) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USER_NM" label="사용자명" required /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    type="text"
                    value={draft.USER_NM ?? ""}
                    maxLength={90}
                    onChange={(v) => setField("USER_NM", v)}
                  />
                </td>
              </tr>
              {/* D-005 유효개시일 — Calendar (yyyy-MM-dd) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="START_ACTIVE_DATE" label="유효개시일" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <DatePicker
                    value={toDateInputValue(draft.START_ACTIVE_DATE)}
                    onChange={(v) => setField("START_ACTIVE_DATE", v)}
                  />
                </td>
              </tr>
              {/* D-006 유효기한일 — Calendar (yyyy-MM-dd) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="END_ACTIVE_DATE" label="유효기한일" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <DatePicker
                    value={toDateInputValue(draft.END_ACTIVE_DATE)}
                    onChange={(v) => setField("END_ACTIVE_DATE", v)}
                  />
                </td>
              </tr>
              {/* D-007 부서코드 (Essential).
                  2026-06-04 — 사용자 결정: 직접 타이핑 ✗ → 검색 버튼 + LoV 모달 (DEPT_CD/DEPT_NM 그리드)
                  → 선택 시 DEPT_CD + DEPT_NM 자동 세트. commRoleMng round-3 searchObjectLov 정합 패턴.
                  레이아웃: 코드(100px readOnly) + 검색버튼(50px) + 부서명(flex:1 readOnly). */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="DEPT_CD" label="부서코드" required /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <div style={{ width: 100, flexShrink: 0 }}>
                      <Input
                        type="text"
                        value={draft.DEPT_CD ?? ""}
                        readOnly
                        placeholder="(검색)"
                      />
                    </div>
                    <div style={{ width: 56, flexShrink: 0 }}>
                      <Button
                        style={{ width: "100%" }}
                        disabled={saving}
                        onClick={() => setIsDeptLovOpen(true)}
                      >
                        검색
                      </Button>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Input
                        type="text"
                        value={draft.DEPT_NM ?? ""}
                        readOnly
                        placeholder="(부서명)"
                      />
                    </div>
                  </div>
                </td>
              </tr>
              {/* D-008 사용자분류코드 */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USER_CATEGORY_CD" label="사용자분류코드" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    type="text"
                    value={draft.USER_CATEGORY_CD ?? ""}
                    maxLength={20}
                    onChange={(v) => setField("USER_CATEGORY_CD", v)}
                  />
                </td>
              </tr>
              {/* D-009 이메일 (Essential, maxlength=300) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="EMAIL" label="이메일" required /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    type="email"
                    value={draft.EMAIL ?? ""}
                    maxLength={300}
                    onChange={(v) => setField("EMAIL", v)}
                  />
                </td>
              </tr>
              {/* D-010 전화 번호 (maxlength=90, digit) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="TEL_NO" label="전화 번호" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    type="text"
                    value={draft.TEL_NO ?? ""}
                    maxLength={90}
                    onChange={(v) => setField("TEL_NO", v)}
                  />
                </td>
              </tr>
              {/* D-011 모바일번호 (maxlength=90, digit) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="MOBILE_TEL_NO" label="모바일번호" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    type="text"
                    value={draft.MOBILE_TEL_NO ?? ""}
                    maxLength={90}
                    onChange={(v) => setField("MOBILE_TEL_NO", v)}
                  />
                </td>
              </tr>
              {/* D-012 내부 외부 구분 (Essential, Combo ds_inOutEmpTp) */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="IN_OUT_EMP_TP" label="내부 외부 구분" required /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Select
                    value={draft.IN_OUT_EMP_TP ?? ""}
                    onChange={(v) => setField("IN_OUT_EMP_TP", v)}
                    options={IN_OUT_OPTIONS}
                    placeholder="선택"
                  />
                </td>
              </tr>
              {/* 선택 행이 바뀌면 key 로 다시 만들어 입력(역할 복사 대상·라디오)을 비운다 (As-Is xfdl:1398~1402). */}
              <RoleCopyRow key={`rc-${rowKeyValue}`} saving={saving} onRoleCopy={onRoleCopy} />
              <ResetRow key={`pw-${rowKeyValue}`} sso={false} saving={saving} onReset={onReset} />
              <ResetRow key={`sso-${rowKeyValue}`} sso saving={saving} onReset={onReset} />
              {/* 2026-06-04 — D-019 정보처리의뢰서번호 / D-020 처리사유 UI 전부 제거 (사용자 결정).
                  BE 도 row 인입 시 null 처리 — 이력 (TB_MCM_SEC_USER_HIS / ROLL_HIS) 의 두 컬럼은 null 적재. */}
              {/* B-016 계정 재생성 (As-Is enable=false 기본 / USE_TP=Y 면 비활성화 — xfdl:1218~1222).
                  2026-06-02 — AsIs row-state 기반 비활성 (USE_TP=Y) 유지. 버튼 너비 110px 정렬 + 텍스트 wrap. */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="reRegister" meta={false} label="계정 재생성" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <div style={{ width: 110 }}>
                    <Button
                      style={{ width: "100%" }}
                      disabled={saving || draft.USE_TP === "Y" || isNewRow}
                      onClick={() => void onReRegister()}
                    >
                      계정 재생성
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 2026-06-04 — Detail 부서 LoV 모달 (사용자 결정).
          shared LookupModal {code, name} 표준 사용 → fetchDeptLov 이 DEPT_CD/DEPT_NM 매핑.
          선택 확정 시 handleDeptLovPick 이 DEPT_CD + DEPT_NM 두 컬럼 동시 set. 폼 래퍼 밖에 둬 모달 안 포커스 이동이 blur 반영을 일으키지 않게 한다. */}
      <LookupModal
        gridId="modal-deptLookup"
        open={isDeptLovOpen}
        title="부서 검색"
        fetchFn={fetchDeptLov}
        onSelect={handleDeptLovPick}
        onClose={closeDeptLov}
        placeholder="부서코드 또는 부서명 입력"
        searchOnOpen
      />
    </>
  );
});
