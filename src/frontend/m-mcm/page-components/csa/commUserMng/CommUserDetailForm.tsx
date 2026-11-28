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
 *
 * 2026-11-28 시안 「사용자 비활성화·퇴직 처리」 — 맨 위에 계정 상태(상태·사유·관리·마지막 로그인·비밀번호)와
 * 상태별 단추(UserStateSection)를 둔다. 단추는 화면 루트의 onStateAction 으로 팝업을 연다. 「계정 재생성」 줄은 이 단추로 옮겼다.
 * 「비밀번호 사용 기간 제외」(PWD_EXPIRY_EXEMPT_YN) 칸을 더했다 — 저장(saveCmUser updated)으로 반영된다.
 */
import { memo, useCallback, useImperativeHandle, useState, type Ref } from "react";

import { DETAIL_TABLE_STYLE, DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { LookupModal, type LookupRow, type LookupFetchFn } from "@dk-oasis/shared/lookup";
import {
  Badge,
  Button,
  Checkbox,
  DatePicker,
  Input,
  Radio,
  Select,
  useDetailDraft,
  type DetailDraftHandle,
} from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";

import { searchDeptLov as apiSearchDeptLov } from "./api";
import { IN_OUT_OPTIONS, getRowKey, toDateInputValue } from "./detailUtils";
import type { CommUserMngGridRow } from "./types";
import {
  STATE_ACTION_LABEL,
  USER_ST_LABEL,
  fmtDateTime,
  manageLabel,
  stTone,
  stateActionsOf,
  stateNotes,
  type StateAction,
} from "./userState";

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
  /** 상태 단추(잠금 해제·비활성화·다시 사용·퇴직 처리·담당 데이터 인계·계정 재생성) — 루트가 확인 팝업을 연다. */
  onStateAction: (action: StateAction) => void;
  /** 상태 단추 권한(canDoButton). 없으면 단추를 비활성으로 그린다. */
  statePerms: Readonly<Record<StateAction, boolean>>;
  /** 퇴직자의 남은 담당 데이터 건수. 모르면 null. */
  ownedCnt: number | null;
  /** 담당 데이터를 읽지 못한 이유(MDM 연결 등). */
  ownedError: string | null;
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
  border: "1px solid var(--color-border)",
  background: "var(--color-bg)",
} as const;

/** "상세 정보" 헤더 (28px) — 양 그리드의 column-header (사용자ID*|...) 라인과 정렬. */
const PANEL_HEADER_STYLE = {
  height: 28,
  background: "var(--color-bg-header)",
  borderBottom: "1px solid var(--color-border)",
  padding: "0 10px",
  display: "flex",
  alignItems: "center",
  fontWeight: 600,
  fontSize: 13,
  color: "var(--color-text)",
  flexShrink: 0,
} as const;

const ROW_LAYOUT_STYLE = { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" } as const;

const NOTE_STYLE = { margin: 0, fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 } as const;
const STATE_BOX_STYLE = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-border)",
  display: "grid",
  gap: 6,
} as const;
const INLINE_STYLE = { display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" } as const;
const ACTION_BAR_STYLE = { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 } as const;
const HR_ST_LABEL: Record<string, string> = { ACTIVE: "재직", LEAVE: "휴직", RETIRED: "퇴직" };

/**
 * 계정 상태 + 상태별 단추 (시안 상세 영역). 저장된 행(row)만 보고 그린다 — 입력 초안과 무관해 글자 입력에 다시 그리지 않는다.
 * 신규 행(저장 전)은 상태가 없으므로 임시 비밀번호 안내만 보인다.
 */
const UserStateSection = memo(function UserStateSection({
  row,
  saving,
  statePerms,
  ownedCnt,
  ownedError,
  onStateAction,
}: {
  row: CommUserMngGridRow;
  saving: boolean;
  statePerms: Readonly<Record<StateAction, boolean>>;
  ownedCnt: number | null;
  ownedError: string | null;
  onStateAction: (action: StateAction) => void;
}) {
  if (row.nativeeditor_status === "inserted" || !row.USER_ST) {
    return (
      <div style={STATE_BOX_STYLE}>
        <p style={NOTE_STYLE}>
          저장하면 역할그룹 없이 임시 비밀번호로 계정을 만듭니다. 본인이 7일 뒤 23:59까지 로그인해 비밀번호를 바꿔야 합니다.
        </p>
      </div>
    );
  }
  const st = String(row.USER_ST);
  const actions = stateActionsOf(row, ownedCnt);
  const notes = stateNotes(row, ownedCnt);
  const hrSt = row.HR_ST ? HR_ST_LABEL[String(row.HR_ST)] ?? String(row.HR_ST) : "";
  const lastLogin = fmtDateTime(row.LAST_LOGIN_AT);
  const tempUntil = fmtDateTime(row.TEMP_PWD_EXP);
  const lastChng = fmtDateTime(row.LAST_PWD_CHNG_DATE);
  return (
    <div style={STATE_BOX_STYLE} data-testid="user-state">
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USER_ST" meta={false} label="상태" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <span style={INLINE_STYLE}>
                <Badge tone={stTone(st)} label={row.USER_ST_NM || USER_ST_LABEL[st] || st} testId="user-state-badge" />
                {row.ST_RSN ? <span style={NOTE_STYLE}>{row.ST_RSN}</span> : null}
              </span>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="MANAGE_TP" meta={false} label="관리" /></th>
            <td style={DETAIL_VALUE_CELL}>
              {row.MANAGE_TP === "MANUAL" ? "수동 관리 · 관리자가 직접 처리" : `${manageLabel(row.MANAGE_TP) || "ERP 인사"} 연동`}
              {hrSt ? ` · 인사 ${hrSt}` : ""}
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="LAST_LOGIN_AT" meta={false} label="마지막 로그인" /></th>
            <td style={DETAIL_VALUE_CELL}>{lastLogin || "기록 없음"}</td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PWD_TEMP_YN" meta={false} label="비밀번호" /></th>
            <td style={DETAIL_VALUE_CELL}>
              {row.PWD_TEMP_YN === "Y" ? (
                <span style={INLINE_STYLE}>
                  <Badge tone="warning" label="미변경" />
                  <span style={NOTE_STYLE}>임시 비밀번호{tempUntil ? ` · ${tempUntil}까지` : ""}</span>
                </span>
              ) : lastChng ? (
                `마지막 변경 ${lastChng}`
              ) : (
                "-"
              )}
            </td>
          </tr>
        </tbody>
      </table>
      {notes.map((n) => (
        <p key={n} style={NOTE_STYLE}>{n}</p>
      ))}
      {st === "RETIRED" && ownedError ? <p style={NOTE_STYLE}>담당 데이터를 확인하지 못했습니다({ownedError}).</p> : null}
      {actions.length > 0 && (
        <div style={ACTION_BAR_STYLE}>
          {actions.map((a) => (
            <Button
              key={a}
              variant={a === "retire" ? "danger" : a === "unlock" || a === "resume" || a === "handover" ? "primary" : "default"}
              disabled={saving || !statePerms[a]}
              title={statePerms[a] ? undefined : "권한이 없습니다"}
              onClick={() => onStateAction(a)}
              data-testid={`user-act-${a}`}
            >
              {STATE_ACTION_LABEL[a]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
});

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
  onStateAction,
  statePerms,
  ownedCnt,
  ownedError,
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
        <div style={{ padding: 16, color: "var(--color-text-muted)", background: "var(--color-bg)" }}>사용자를 선택하세요.</div>
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
        {/* 계정 상태 + 상태별 단추 — 저장된 행(row) 기준. 초안과 무관하다. */}
        {row && (
          <UserStateSection
            row={row}
            saving={saving}
            statePerms={statePerms}
            ownedCnt={ownedCnt}
            ownedError={ownedError}
            onStateAction={onStateAction}
          />
        )}
        {/* 폼 본문 — 내용물 크기에 맞춤 (flex:1 ✗) */}
        <div style={{ padding: 0, background: "var(--color-bg)" }}>
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
              {/* 비밀번호 사용 기간 제외 — 인터페이스·배치 계정은 만료되면 연동이 멈추므로 관리자가 직접 붙인다(시안 「비밀번호 사용 기간」). */}
              <tr>
                <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PWD_EXPIRY_EXEMPT_YN" meta={false} label="비밀번호 사용 기간 제외" /></th>
                <td style={DETAIL_VALUE_CELL}>
                  <Checkbox
                    checked={draft.PWD_EXPIRY_EXEMPT_YN === "Y"}
                    label="인터페이스·배치 계정은 만료에서 뺍니다"
                    aria-label="비밀번호 사용 기간 제외"
                    onChange={(c) => {
                      setField("PWD_EXPIRY_EXEMPT_YN", c ? "Y" : "N");
                      handle.commit();
                    }}
                  />
                </td>
              </tr>
              {/* 선택 행이 바뀌면 key 로 다시 만들어 입력(역할 복사 대상·라디오)을 비운다 (As-Is xfdl:1398~1402). */}
              <RoleCopyRow key={`rc-${rowKeyValue}`} saving={saving} onRoleCopy={onRoleCopy} />
              <ResetRow key={`pw-${rowKeyValue}`} sso={false} saving={saving} onReset={onReset} />
              <ResetRow key={`sso-${rowKeyValue}`} sso saving={saving} onReset={onReset} />
              {/* 2026-06-04 — D-019 정보처리의뢰서번호 / D-020 처리사유 UI 전부 제거 (사용자 결정).
                  BE 도 row 인입 시 null 처리 — 이력 (TB_MCM_SEC_USER_HIS / ROLL_HIS) 의 두 컬럼은 null 적재. */}
              {/* B-016 계정 재생성은 2026-11-28 에 위 상태 단추(퇴직 상태에서만)로 옮겼다 — 시안 D7 확인 팝업을 거친다. */}
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
