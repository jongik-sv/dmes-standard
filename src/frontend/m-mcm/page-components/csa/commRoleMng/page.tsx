"use client";

/**
 * commRoleMng 화면 — 역할 관리.
 *
 * 2026-11-27 perm-bench f6 — 새 설계(시안 docs/perm-bench/mock-v16.html lgRoleNext, decompose.md §0.4).
 *   ① 역할 목록에 집계 칸 그룹 수(GROUP_CNT) · 받은 사람(USER_CNT) · 퍼미션(PERM_CNT, -1 = 「모두」 — D13)
 *   ② 상세에 「들어 있는 그룹」(읽기만, 넣고 빼기는 역할 그룹 관리) · 받은 사람 수 · 「권한 작업대에서 이 역할 보기」(f7)
 *   ③ 옛 세 칸(현재 버튼 권한 · OBJECT 선택 · 권한 선택)을 「이 역할의 퍼미션」 한 칸으로 — 한 줄 = 퍼미션 한 건(ROLE_ID, OBJECT_ID),
 *      버튼·팝업 칩을 그 자리에서 켜고 끈다. PERMISSION_ID 고르기 없음
 *   ④ 「메뉴에서 오브젝트 추가」 — 메뉴 폴더 안 오브젝트를 골라 한 번에 퍼미션을 만든다(처음 버튼 = 조회만 / 허용 버튼 모두)
 *   ⑤ 사용 여부를 N 으로 둘 때 받은 사람 수·멈추는 퍼미션 수를 먼저 보이고 확인을 받는다
 *   그대로 둔 것: 조회 조건(역할 ID · 역할명 · 사용 여부), ROLE_ID 합성 규칙 role_ + MENU_ID + _ + ID, 상세 입력 칸,
 *   상단 조회 · 초기화 · 저장, 행추가 · 행복사 · 행삭제 · 행취소.
 *
 * 퍼미션 변경은 저장 전까지 화면 초안(role-perm.ts)으로 들고 있다가 [저장] 때 역할 마스터(save) 다음에
 * 퍼미션(saveCmRoleMap, 바뀐 줄만 MERGE·DEL)을 보낸다. 저장하지 않은 퍼미션 변경이 있으면 다른 역할로 옮기거나
 * 다시 조회할 때 확인을 받는다.
 *
 * AsIs 인용 정본(옛 화면):
 *   - xfdl: docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommRoleMng.xfdl
 *   - BPMN: services/csa/CommRoleMng.bpmn · Mapper: persistence/mappers-csa/CommRoleMngMapper.xml
 */

import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
  DETAIL_TABLE_STYLE,
  DETAIL_LABEL_CELL,
  DETAIL_VALUE_CELL,
  type PageButton,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Input, ComboBox, DatePicker, Radio, useDetailDraft, type DetailDraftHandle } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { openBench, useOpenWith } from "@/page-components/csa/commPermBench/nav";
import {
  searchCmRole as apiSearchCmRole,
  saveCmRole as apiSaveCmRole,
  searchRoleGroups as apiSearchRoleGroups,
  searchCmRoleMap as apiSearchCmRoleMap,
  saveCmRoleMap as apiSaveCmRoleMap,
  searchFolderObj as apiSearchFolderObj,
  loadLov as apiLoadLov,
} from "./api";
import { RolePermPanel } from "./RolePermPanel";
import { RoleAddControls, RoleAddPickGrid } from "./RoleAddObjPanel";
import {
  EMPTY_DRAFT,
  addFromFolder,
  applyRoleDraft,
  draftFromRows,
  effectiveFolder,
  emptyBtnObjects,
  folderFilterOptions,
  isSysAdmin,
  liveCount,
  openWithStep,
  pendingCount,
  permCntLabel,
  permSaveErrorText,
  pickableObjs,
  removePerm,
  saveRows,
  setBtns,
  setPops,
  undoPerm,
  roleOffMessage,
  viewRows,
  pickEmptyMessage,
  withRoleField,
  firstMissingRoleNm,
  keepSavedRole,
  type AddLevel,
  type BusinessError,
  type FolderOption,
  type PermDraft,
  roleDeleteBlock,
} from "./role-perm";
import type {
  CommRoleMngFilters,
  CommRoleMngRow,
  FolderObjRow,
  MenuIdLov,
  RoleGroupRow,
  RoleMenuLov,
  RoleRow,
  RowStatus,
} from "./types";

interface GridRow extends Record<string, unknown> {
  __gridTempId?: string;
  __rowId?: string;
  nativeeditor_status?: RowStatus;
}

type RoleGridRow = RoleRow & GridRow;

function getRowKey(row: GridRow): string {
  return (
    (row.__gridTempId as string) ||
    (row.__rowId as string) ||
    String((row as { ROLE_ID?: unknown }).ROLE_ID ?? "")
  );
}

/** 신규/조회 행 모두 `__rowId` 합성 — AgDataGrid rowKey 가 단일 컬럼만 지원 + 신규 row PK 충돌 회피. */
function withSyntheticId<T extends Partial<CommRoleMngRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `r-${idx}-${String(r.ROLE_ID ?? "")}` };
}

/** 저장 줄에서 화면 전용 칸(행 키·상태)과 계산 칸(집계)을 뺀다. */
const INTERNAL_KEYS = ["__gridTempId", "__rowId", "nativeeditor_status", "GROUP_CNT", "USER_CNT", "PERM_CNT"];

function stripInternal<T extends GridRow>(row: T): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...row };
  for (const k of INTERNAL_KEYS) delete rest[k];
  return rest;
}

const DEFAULT_FILTERS: CommRoleMngFilters = {
  edt_ROLE_ID: "",
  edt_ROLE_NM: "",
  cbo_USE_TP: "",
};

/** S-004 / G-007 / D-007 — LV-002 정적 Y/N (xfdl ds_useTp). */
const USE_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];

/** S-004 검색 — Combo 정적 옵션 "전체" + Y/N (AsIs xfdl displaynulltext="전체"). */
const USE_TP_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  ...USE_TP_OPTIONS,
];

const USE_TP_LABEL_MAP: Record<string, string> = Object.fromEntries(
  USE_TP_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * BE LocalDateTime ISO / "yyyyMMdd" 8자 / "yyyy-MM-dd" / null → "yyyy-MM-dd" 정규화 (W5 정본).
 */
function toDateInputValue(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s || s === "null") return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  if (/^\d{8}$/.test(s)) return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  return "";
}

/** 숫자 칸 표시(빈 값은 빈 칸). */
function numLabel(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

/**
 * 역할 목록 열 — 옛 7칸(AsIs grd_main) + 집계 3칸(계산 값, DB 칼럼 아님 — MDM 연결 끔).
 * 10칸이라 columnSizing="fixed"(9칸 이상 규칙).
 */
const ROLE_COLUMNS: GridColumn[] = [
  { key: "ROLE_ID", header: "ROLE ID", width: 190, editable: false, align: "left" },
  { key: "ROLE_NM", header: "ROLE 이름", width: 130, editable: false, align: "left" },
  { key: "ROLE_DESC", header: "ROLE 설명", width: 160, editable: false, align: "left" },
  { key: "MENU_ID", header: "MENU", width: 110, editable: false, align: "center" },
  {
    key: "USE_TP",
    header: "사용구분",
    width: 70,
    editable: false,
    align: "center",
    render: (v) => USE_TP_LABEL_MAP[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 96,
    editable: false,
    align: "center",
    render: (v) => toDateInputValue(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효기한일",
    width: 96,
    editable: false,
    align: "center",
    render: (v) => toDateInputValue(v),
  },
  { key: "GROUP_CNT", header: "그룹 수", meta: false, type: "number", width: 64, editable: false, align: "right", render: numLabel },
  { key: "USER_CNT", header: "받은 사람", meta: false, type: "number", width: 76, editable: false, align: "right", render: numLabel },
  { key: "PERM_CNT", header: "퍼미션", meta: false, type: "number", width: 64, editable: false, align: "right", render: permCntLabel },
];

/**
 * 저장된 MENU_ID 를 LoV 라벨("csa (시스템관리)") 로 치환. LoV 에 없으면 원본 코드를 그대로 보여준다.
 * (미지정이면 "" — 상세 영역에서 placeholder "(미지정)" 로 표기)
 */
function menuIdLabel(menuId: string, lov: MenuIdLov[]): string {
  if (!menuId) return "";
  const hit = lov.find((m) => String(m.MENU_ID ?? "") === menuId);
  return String(hit?.MENU_ID_NM ?? menuId);
}

/**
 * 행추가 default — AsIs xfdl:687~697 fn_rowAdd.
 */
function emptyRow(): CommRoleMngRow {
  const today = new Date().toISOString().slice(0, 10); // yyyy-MM-dd
  return {
    ROLE_ID: "",
    ROLE_NM: "",
    ROLE_DESC: "",
    MENU_ID: "",
    USE_TP: "Y",
    START_ACTIVE_DATE: today,
    END_ACTIVE_DATE: "9999-12-31",
    ID: "",
  };
}

// ── 화면 상태 모양 ────────────────────────────────────────────────────────────

/** 역할 하나에 묶인 값 — roleId 가 지금 고른 역할과 다르면 쓰지 않는다(지난 응답·지난 고르기를 버린다). */
interface PermState {
  roleId: string;
  draft: PermDraft;
  loading: boolean;
  /** 퍼미션 조회 실패 — 있으면 두 칸을 잠그고 저장하지 않는다(빈 목록을 「퍼미션 0건」으로 오해하지 않게). */
  error: string | null;
}
interface GroupState {
  roleId: string;
  groups: RoleGroupRow[];
  userCnt: number | null;
  loading: boolean;
  error: boolean;
}
interface RolePick {
  roleId: string;
  folder: string;
}
interface FolderObjState {
  /** `${roleId}|${폴더}` — 지금 고른 것과 다르면 쓰지 않는다. */
  scope: string;
  objs: FolderObjRow[];
  loading: boolean;
  failed: boolean;
}

const EMPTY_PERM: PermState = { roleId: "", draft: EMPTY_DRAFT, loading: false, error: null };
const EMPTY_GROUP: GroupState = { roleId: "", groups: [], userCnt: null, loading: false, error: false };
const NO_PICK: RolePick = { roleId: "", folder: "" };
const EMPTY_FOLDER_OBJS: FolderObjState = { scope: "", objs: [], loading: false, failed: false };
const NO_PICKS: { scope: string; ids: string[] } = { scope: "", ids: [] };
const EMPTY_OBJS: FolderObjRow[] = [];
const EMPTY_IDS: string[] = [];

const SYSADMIN_PERM_MSG = "시스템 관리자는 퍼미션 없이 모든 화면의 모든 버튼을 씁니다.";
const SYSADMIN_ADD_MSG = "시스템 관리자에게는 추가할 퍼미션이 없습니다.";
const NEW_ROLE_MSG = "새 역할입니다. 저장한 뒤 퍼미션을 줄 수 있습니다.";
const NO_ROLE_MSG = "역할을 고르세요.";
const DELETED_ROLE_MSG = "삭제할 역할입니다. 퍼미션을 바꾸지 않습니다.";
const PERM_LOAD_FAIL_MSG = "퍼미션을 불러오지 못했습니다. 다시 조회하세요.";

function saveDoneMessage(roleCnt: number | null, perm: { cnt_merge?: number; cnt_delete?: number } | null): string {
  const parts: string[] = [];
  if (roleCnt !== null) parts.push(`역할 ${roleCnt}건`);
  if (perm) parts.push(`퍼미션 추가·변경 ${perm.cnt_merge ?? 0}건 · 빼기 ${perm.cnt_delete ?? 0}건`);
  return `${parts.join(", ")} 저장되었습니다.`;
}

// ── 역할 목록 ────────────────────────────────────────────────────────────────

interface RoleListPanelProps {
  rows: RoleGridRow[];
  count: number;
  selectedKey: string | null;
  isSearching: boolean;
  isSaving: boolean;
  onSelect: (key: string) => void;
  onDataChange: (newData: Record<string, unknown>[], addedRowKey?: string) => void;
  onRowCancel: () => void;
}

const RoleListPanel = memo(function RoleListPanel({
  rows,
  count,
  selectedKey,
  isSearching,
  isSaving,
  onSelect,
  onDataChange,
  onRowCancel,
}: RoleListPanelProps) {
  const buttons = useMemo(
    () => [{ id: "btn_rowCancel", label: "행취소", onClick: onRowCancel, disabled: isSearching || isSaving }],
    [onRowCancel, isSearching, isSaving],
  );
  const handleRowClick = useCallback((row: Record<string, unknown>) => onSelect(getRowKey(row as GridRow)), [onSelect]);
  return (
    <GridPanel
      title="역할 목록"
      count={count}
      showAddButton
      showCopyButton
      showDeleteButton
      buttons={buttons}
      data={rows}
      rowKey="__rowId"
      columns={ROLE_COLUMNS}
      selectedRowKey={selectedKey}
      onDataChange={onDataChange}
      loading={isSaving}
    >
      <AgDataGrid
        gridId="roleList"
        columnSizing="fixed"
        columns={ROLE_COLUMNS}
        data={rows}
        rowKey="__rowId"
        sortable
        highlightedRowKey={selectedKey}
        onRowClick={handleRowClick}
        loading={isSearching}
        loadingMessage="조회 중..."
        emptyMessage="조회된 역할이 없습니다."
      />
    </GridPanel>
  );
});

// ── 상세 ─────────────────────────────────────────────────────────────────────

const ASK_BOX: CSSProperties = {
  marginTop: 6,
  padding: "6px 8px",
  border: "1px solid var(--color-warning)",
  background: "var(--color-warning-soft)",
  borderRadius: 4,
};
const ASK_ROW: CSSProperties = { display: "flex", gap: 6, marginTop: 6 };
const CHIPS: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" };
const INLINE: CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };

interface RoleDetailPanelProps {
  /** 루트가 저장·행 전환 때 초안을 읽는 핸들(R12 — 입력 초안은 이 패널 안에만 있다). */
  ref?: Ref<DetailDraftHandle<RoleGridRow>>;
  selected: RoleGridRow | null;
  menuLov: MenuIdLov[];
  groups: RoleGroupRow[];
  groupsLoading: boolean;
  groupsError: boolean;
  userCnt: number | null;
  /** 사용 안 함 확인 문구의 퍼미션 수 — 초안 기준(불러오기 전이면 저장된 PERM_CNT). -1 = 모두. */
  permCnt: number;
  /** 초안을 목록 행에 반영(blur·행 전환·저장 직전). 안정된 함수를 넘긴다. */
  onCommit: (draft: RoleGridRow) => void;
  /** 권한 작업대에서 이 역할 보기(f7). 없으면 단추를 잠근다. */
  onOpenBench?: (roleId: string) => void;
}

/**
 * 상세 정보 — 성능(화면 성능 가이드 R12): 입력 초안은 이 패널 안(useDetailDraft)에만 있다. 한 글자 입력은 이 패널만 다시 그리고,
 * 화면 루트·역할 목록 그리드에는 blur·행 전환·저장 직전에만 `onCommit` 으로 알린다. 사용 안 함 확인 상자 상태도 여기 둔다.
 */
const RoleDetailPanel = memo(function RoleDetailPanel({
  ref,
  selected,
  menuLov,
  groups,
  groupsLoading,
  groupsError,
  userCnt,
  permCnt,
  onCommit,
  onOpenBench,
}: RoleDetailPanelProps) {
  const { draft, setDraft, containerProps, handle } = useDetailDraft<RoleGridRow>(selected, {
    onCommit: (d) => onCommit(d),
    rowKey: getRowKey,
  });
  useImperativeHandle(ref, () => handle, [handle]);
  /**
   * 사용 안 함 확인을 기다리는 행 — 물을 때의 목록 행(selected) 참조째 둔다. 행취소·행 전환·다시 조회로 목록 행이 바뀌면
   * 참조가 달라져 상자가 사라진다(되돌린 행에 「사용 안 함」이 다시 써지지 않게).
   */
  const [askUseOff, setAskUseOff] = useState<{ row: RoleGridRow | null; key: string } | null>(null);

  /** 한 칸 바꾸기 — 늘 최신 초안 위에서 계산한다(연속 입력에도 낡은 값을 쓰지 않는다). */
  const onField = useCallback(
    (field: keyof CommRoleMngRow, value: string) => {
      const cur = handle.getDraft();
      if (cur) setDraft(withRoleField(cur, String(field), value));
    },
    [handle, setDraft],
  );
  const onUseChange = useCallback(
    (v: string) => {
      const cur = handle.getDraft();
      if (!cur) return;
      if (v === "N" && String(cur.USE_TP ?? "Y") !== "N" && cur.nativeeditor_status !== "inserted") {
        setAskUseOff({ row: selected, key: getRowKey(cur) });
        return;
      }
      setAskUseOff(null);
      onField("USE_TP", v);
    },
    [handle, onField, selected],
  );
  const onUseConfirm = useCallback(() => {
    setAskUseOff(null);
    onField("USE_TP", "N");
  }, [onField]);
  const onUseCancel = useCallback(() => setAskUseOff(null), []);

  if (!draft) {
    return (
      <CardFrame title="상세 정보" testId="role-detail">
        <MutedText>역할을 선택하거나 행을 추가하세요.</MutedText>
      </CardFrame>
    );
  }
  const isNewRow = draft.nativeeditor_status === "inserted";
  const roleId = String(draft.ROLE_ID ?? "");
  const people = userCnt ?? Number(draft.USER_CNT ?? 0);
  return (
    <CardFrame title="상세 정보" testId="role-detail">
      <div {...containerProps}>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ROLE_ID" label="역할 ID" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              {/* AsIs xfdl:243 readonly="true" — ROLE_ID 는 항상 자동 합성값(role_ + MENU_ID + _ + ID). */}
              <Input
                value={roleId}
                maxLength={100}
                readOnly
                placeholder="메뉴 ID + ID 입력 시 자동 생성"
              />
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="MENU_ID" label="메뉴 ID" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              {isNewRow ? (
                /* 메뉴 ID = 메뉴 폴더. 선택 즉시 ID 와 합쳐져 ROLE_ID = "role_{메뉴ID}_{ID}" 로 자동 생성된다. */
                <ComboBox
                  data={menuLov as unknown as Record<string, unknown>[]}
                  valueField="MENU_ID"
                  labelField="MENU_ID_NM"
                  value={String(draft.MENU_ID ?? "")}
                  onChange={(v) => onField("MENU_ID", v)}
                  placeholder="(선택)"
                />
              ) : (
                /* 기존 행의 메뉴 ID 는 ROLE_ID(PK) 구성요소라 변경 불가 — 읽기전용 표기. */
                <Input
                  value={menuIdLabel(String(draft.MENU_ID ?? ""), menuLov)}
                  readOnly
                  placeholder="(미지정 — 기존 역할은 변경 불가)"
                />
              )}
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ID" meta={false} label="ID" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              {/* 기존 역할 = ROLE_ID 전체(z2fix2 c — 마지막 _ 이후만 보이던 것을 없앴다). 새 역할 = 입력한 ID */}
              <Input
                value={isNewRow ? String(draft.ID ?? "") : roleId}
                maxLength={100}
                readOnly={!isNewRow}
                onChange={(v) => onField("ID", v)}
              />
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ROLE_NM" label="역할명" required /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                value={String(draft.ROLE_NM ?? "")}
                maxLength={100}
                onChange={(v) => onField("ROLE_NM", v)}
              />
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ROLE_DESC" label="역할 설명" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                value={String(draft.ROLE_DESC ?? "")}
                maxLength={100}
                onChange={(v) => onField("ROLE_DESC", v)}
              />
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USE_TP" label="사용 여부" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <Radio
                name="USE_TP"
                value={String(draft.USE_TP ?? "Y")}
                options={USE_TP_OPTIONS}
                onChange={onUseChange}
              />
              {askUseOff !== null && askUseOff.row === selected && askUseOff.key === getRowKey(draft) ? (
                <div role="alert" style={ASK_BOX} data-testid="role-use-off-ask">
                  <div>{roleOffMessage(String(draft.ROLE_NM || roleId), people, permCnt)}</div>
                  <div style={ASK_ROW}>
                    <Button size="sm" variant="danger" onClick={onUseConfirm}>
                      사용 안 함으로 두기
                    </Button>
                    <Button size="sm" onClick={onUseCancel}>
                      그만두기
                    </Button>
                  </div>
                </div>
              ) : null}
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="START_ACTIVE_DATE" label="유효 개시일" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <DatePicker
                value={toDateInputValue(draft.START_ACTIVE_DATE)}
                onChange={(iso) => onField("START_ACTIVE_DATE", iso ?? "")}
              />
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="END_ACTIVE_DATE" label="유효 기한일" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <DatePicker
                value={toDateInputValue(draft.END_ACTIVE_DATE)}
                onChange={(iso) => onField("END_ACTIVE_DATE", iso ?? "")}
              />
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ROLE_GROUPS" meta={false} label="들어 있는 그룹" /></th>
            <td style={DETAIL_VALUE_CELL}>
              {isNewRow ? (
                <MutedText>새 역할입니다. 저장한 뒤 역할 그룹 관리에서 그룹에 넣습니다.</MutedText>
              ) : groupsLoading ? (
                <MutedText>불러오는 중…</MutedText>
              ) : groupsError ? (
                <MutedText>그룹을 불러오지 못했습니다. 다시 조회하세요.</MutedText>
              ) : groups.length === 0 ? (
                <MutedText>없음 — 아무도 받지 않습니다</MutedText>
              ) : (
                <div style={CHIPS}>
                  {groups.map((g) => (
                    <Badge
                      key={g.ROLE_GROUP_ID}
                      label={`${g.ROLE_GROUP_NM || g.ROLE_GROUP_ID} ${numLabel(g.USER_CNT ?? 0)}명`}
                      tone={g.USE_TP === "N" ? "warning" : "neutral"}
                      title={g.ROLE_GROUP_ID}
                    />
                  ))}
                  <MutedText>넣고 빼기는 역할 그룹 관리에서 합니다.</MutedText>
                </div>
              )}
            </td>
          </tr>

          <tr>
            <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USER_CNT" meta={false} label="받은 사람" /></th>
            <td style={DETAIL_VALUE_CELL}>
              <div style={INLINE}>
                <span>
                  <b>{isNewRow ? 0 : numLabel(people)}</b>명
                </span>
                <Button
                  size="sm"
                  disabled={!onOpenBench || isNewRow || !roleId}
                  title={onOpenBench ? undefined : "권한 작업대 연결은 준비 중입니다."}
                  onClick={() => onOpenBench?.(roleId)}
                >
                  권한 작업대에서 이 역할 보기
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </CardFrame>
  );
});

// ── 화면 ─────────────────────────────────────────────────────────────────────

export default function CommRoleMngPage() {
  const { showMessage } = useMessage();

  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·선택 키는 가볍게, 조회 결과 행은 bulky.
  // 퍼미션·그룹·폴더 오브젝트는 고른 역할이 정해지면 다시 조회하므로 이어받지 않는다(useState).
  const [filters, setFilters] = useCarryState<CommRoleMngFilters>("filters", DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  /** 역할 목록을 한 번이라도 조회했는가(작업대에서 넘긴 역할을 찾을 때를 고른다). */
  const [searched, setSearched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useCarryState<RoleGridRow[]>("rows", [], { bulky: true });
  const [selectedKey, setSelectedKey] = useCarryState<string | null>("selectedKey", null);
  const restored = useCarryRestored();

  const [menuLov, setMenuLov] = useState<MenuIdLov[]>([]);
  const [menus, setMenus] = useState<RoleMenuLov[]>([]);

  const [perm, setPerm] = useState<PermState>(EMPTY_PERM);
  const [groupInfo, setGroupInfo] = useState<GroupState>(EMPTY_GROUP);
  const [permFolderPick, setPermFolderPick] = useState<RolePick>(NO_PICK);
  const [addFolderPick, setAddFolderPick] = useState<RolePick>(NO_PICK);
  const [folderObjs, setFolderObjs] = useState<FolderObjState>(EMPTY_FOLDER_OBJS);
  const [picks, setPicks] = useState(NO_PICKS);
  const [addLevel, setAddLevel] = useState<AddLevel>("read");
  const [objReload, setObjReload] = useState(0);
  /** 상세 패널 핸들 — 입력 초안은 패널 안에만 있다(R12). 저장·행취소·작업대 열기 때 읽는다. */
  const detailRef = useRef<DetailDraftHandle<RoleGridRow>>(null);

  const selected = useMemo<RoleGridRow | null>(() => {
    if (!selectedKey) return null;
    return rows.find((r) => getRowKey(r) === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const visibleCount = useMemo(() => rows.filter((r) => r.nativeeditor_status !== "deleted").length, [rows]);

  /**
   * 퍼미션·그룹 조회 대상 — 선택된 "저장된" 역할의 ROLE_ID. 신규(inserted) 행은 아직 DB 에 없다.
   * 행 key 가 아니라 ROLE_ID 로 본다(재조회로 key 가 바뀌어도 같은 역할이면 다시 부르지 않는다).
   */
  const isNewRow = selected?.nativeeditor_status === "inserted";
  const selectedRoleId = selected && !isNewRow ? String(selected.ROLE_ID ?? "") : "";
  const selectedMenuId = String(selected?.MENU_ID ?? "");
  const sysAdmin = isSysAdmin(selected);

  // 행삭제로 지울 역할 — 역할을 먼저 지우고 퍼미션을 보내면 FK 오류·고아 줄이 되므로 퍼미션을 잠근다.
  const isDeletedRow = selected?.nativeeditor_status === "deleted";
  const permLoadFailed = !!selectedRoleId && perm.roleId === selectedRoleId && perm.error !== null;
  const permBlocked = !selected
    ? NO_ROLE_MSG
    : isNewRow
      ? NEW_ROLE_MSG
      : isDeletedRow
        ? DELETED_ROLE_MSG
        : sysAdmin
          ? SYSADMIN_PERM_MSG
          : permLoadFailed
            ? PERM_LOAD_FAIL_MSG
            : null;
  const addBlocked = !selected
    ? NO_ROLE_MSG
    : isNewRow
      ? NEW_ROLE_MSG
      : isDeletedRow
        ? DELETED_ROLE_MSG
        : sysAdmin
          ? SYSADMIN_ADD_MSG
          : permLoadFailed
            ? PERM_LOAD_FAIL_MSG
            : null;

  const draft = perm.roleId === selectedRoleId && selectedRoleId ? perm.draft : EMPTY_DRAFT;
  const permLoading = perm.roleId === selectedRoleId && perm.loading;
  // 지울 역할의 퍼미션 변경은 저장하지 않으므로 세지 않는다(행취소하면 다시 센다).
  const pendingCnt = useMemo(() => (isDeletedRow ? 0 : pendingCount(draft)), [draft, isDeletedRow]);
  // 퍼미션을 불러오는 중이거나 저장 중이면 초안을 고치지 못하게 한다(응답·재조회가 덮어써 고친 것이 사라지지 않게).
  const permBusy = permLoading || isSaving;
  const permBusyRef = useRef(false);
  /** 사용 안 함 확인 문구의 퍼미션 수 — 초안 기준(시안 lgRoleNext: roleScreens(DRAFT)). */
  const detailPermCnt = sysAdmin
    ? -1
    : perm.roleId === selectedRoleId && selectedRoleId && !perm.loading && perm.error === null
      ? liveCount(draft)
      : Number(selected?.PERM_CNT ?? 0) || 0;

  // 확인 창·고르기 판정이 읽는 최신 값(콜백을 다시 만들지 않으려고 ref 로 둔다).
  const pendingRef = useRef(0);
  const selectedKeyRef = useRef<string | null>(selectedKey);
  useEffect(() => {
    pendingRef.current = pendingCnt;
    selectedKeyRef.current = selectedKey;
    permBusyRef.current = permBusy;
  }, [pendingCnt, selectedKey, permBusy]);

  // ── LoV (Form onload) ──
  useEffect(() => {
    void (async () => {
      try {
        const lov = await apiLoadLov();
        setMenuLov(lov.ds_lovMenuId ?? []);
        setMenus(lov.menus ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "LoV 조회 실패");
      }
    })();
  }, []);

  // ── 역할 고르기 — 저장하지 않은 퍼미션 변경이 있으면 확인 ──
  const requestSelect = useCallback(
    (key: string | null) => {
      if (key === selectedKeyRef.current) return;
      const n = pendingRef.current;
      if (n > 0) {
        showMessage({
          alertType: "confirm",
          title: "퍼미션 변경 버리기",
          message: `저장하지 않은 퍼미션 변경 ${n}건이 있습니다. 버리고 다른 역할을 볼까요?`,
          onConfirm: () => setSelectedKey(key),
        });
        return;
      }
      setSelectedKey(key);
    },
    [showMessage, setSelectedKey],
  );

  // ── 고른 역할의 퍼미션·그룹 (순번으로 낡은 응답을 버린다, 두 조회의 실패는 따로 본다) ──
  const detailSeq = useRef(0);
  const loadRoleDetail = useCallback(async (roleId: string) => {
    const seq = ++detailSeq.current;
    setPerm({ roleId, draft: EMPTY_DRAFT, loading: true, error: null });
    setGroupInfo({ roleId, groups: [], userCnt: null, loading: true, error: false });
    const [pm, gr] = await Promise.allSettled([apiSearchCmRoleMap(roleId), apiSearchRoleGroups(roleId)]);
    if (seq !== detailSeq.current) return;
    if (pm.status === "fulfilled") {
      setPerm({ roleId, draft: draftFromRows(pm.value.perms ?? []), loading: false, error: null });
    } else {
      const msg = pm.reason instanceof Error ? pm.reason.message : "퍼미션 조회 실패";
      setPerm({ roleId, draft: EMPTY_DRAFT, loading: false, error: msg });
      setError(msg);
    }
    if (gr.status === "fulfilled") {
      setGroupInfo({ roleId, groups: gr.value.groups ?? [], userCnt: gr.value.USER_CNT ?? null, loading: false, error: false });
    } else {
      setGroupInfo({ roleId, groups: [], userCnt: null, loading: false, error: true });
      if (pm.status === "fulfilled") setError(gr.reason instanceof Error ? gr.reason.message : "그룹 조회 실패");
    }
  }, []);

  // ── search (action=search) ──
  /** 마지막 조회의 행(행취소 때 고친 값을 되돌린다). 분리 창으로 이어받은 행은 없다 → 상태만 지운다. */
  const origRef = useRef<Map<string, RoleGridRow>>(new Map());
  /** 조회 후 고른 행의 ROLE_ID 를 돌려준다(없으면 null). */
  const loadList = useCallback(
    async (
      f: CommRoleMngFilters,
      opts?: { preferRoleId?: string; silent?: boolean; saved?: readonly RoleRow[] },
    ): Promise<string | null> => {
      setIsSearching(true);
      setError(null);
      try {
        const payload = await apiSearchCmRole(f);
        // 저장 뒤: 저장한 역할이 조건에 안 걸려 빠졌으면 저장 응답의 그 줄을 맨 위에 붙여 고른 채로 둔다(z2fix2 e)
        const list = keepSavedRole(payload.ds_main ?? [], opts?.preferRoleId, opts?.saved).map((r, i) => ({
          ...withSyntheticId(r, i),
          nativeeditor_status: "" as RowStatus,
        }));
        setRows(list);
        origRef.current = new Map(list.map((r) => [getRowKey(r), r]));
        let picked: string | null = null;
        if (list.length > 0) {
          // 보고 있던 역할이 결과에 남아 있으면 그 행을 유지한다(없을 때만 첫 행).
          const prefer = opts?.preferRoleId
            ? list.find((r) => String(r.ROLE_ID ?? "") === opts.preferRoleId)
            : undefined;
          const row = prefer ?? list[0];
          setSelectedKey(getRowKey(row));
          picked = String(row.ROLE_ID ?? "") || null;
        } else {
          setSelectedKey(null);
        }
        if (!opts?.silent) {
          showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
        }
        return picked;
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
        setSelectedKey(null);
        return null;
      } finally {
        setIsSearching(false);
        setSearched(true);
      }
    },
    [showMessage, setRows, setSelectedKey],
  );

  const handleFilterChange = useCallback(
    (k: keyof CommRoleMngFilters, v: string) => setFilters((p) => ({ ...p, [k]: v })),
    [setFilters],
  );

  const handleSearch = useCallback(() => {
    const prevRoleId = selectedRoleId;
    const run = () =>
      void (async () => {
        const kept = await loadList(filters, { preferRoleId: prevRoleId || undefined });
        // 같은 역할이 남으면 ROLE_ID 가 그대로라 퍼미션 조회 effect 가 돌지 않는다 → 퍼미션·그룹·폴더 오브젝트를 직접 다시 부른다.
        // 다른 역할로 바뀌면 effect 가 부른다(여기서 부르지 않아 두 호출이 겹치지 않는다).
        if (kept && kept === prevRoleId) {
          void loadRoleDetail(kept);
          setObjReload((n) => n + 1);
        }
      })();
    const n = pendingRef.current;
    if (n > 0) {
      showMessage({
        alertType: "confirm",
        title: "퍼미션 변경 버리기",
        message: `저장하지 않은 퍼미션 변경 ${n}건이 있습니다. 버리고 다시 조회할까요?`,
        // 다시 조회하면 초안이 서버 값으로 바뀐다.
        onConfirm: run,
      });
      return;
    }
    run();
  }, [filters, selectedRoleId, loadList, loadRoleDetail, showMessage]);

  /** B-002 초기화 (fn_reset, xfdl:634) — 조회 조건만 비운다. */
  const handleReset = useCallback(() => setFilters(DEFAULT_FILTERS), [setFilters]);

  useEffect(() => {
    if (!selectedRoleId) return;
    // 조회 결과를 상태에 담는 비동기 호출이라 effect 안 setState 규칙에 걸린다(의도된 동작).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRoleDetail(selectedRoleId);
  }, [selectedRoleId, loadRoleDetail]);

  // 복원됐는데 행이 없으면 이어받은 조건으로 조회한다. 복원 아닌 첫 조회는 SearchArea autoSearch 가 한다(설계 2026-10-07-search-defaults §6.4).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restored && rows.length === 0) void loadList(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 이 역할의 퍼미션: 폴더 거르기 · 칩 ──
  const permFolderOpt = useMemo(() => folderFilterOptions(draft, menus, selectedMenuId), [draft, menus, selectedMenuId]);
  const permFolder = effectiveFolder(
    permFolderPick.roleId === selectedRoleId ? permFolderPick.folder : "",
    permFolderOpt,
  );
  const permRows = useMemo(() => viewRows(draft, permFolder), [draft, permFolder]);
  const permCount = sysAdmin ? -1 : liveCount(draft);

  const handlePermFolderChange = useCallback(
    (folder: string) => setPermFolderPick({ roleId: selectedRoleId, folder }),
    [selectedRoleId],
  );

  const updateDraft = useCallback((fn: (d: PermDraft) => PermDraft) => {
    if (permBusyRef.current) return;
    setPerm((p) => {
      const d = fn(p.draft);
      return d === p.draft ? p : { ...p, draft: d };
    });
  }, []);
  const handleBtnChange = useCallback(
    (objectId: string, next: string[]) => updateDraft((d) => setBtns(d, objectId, next)),
    [updateDraft],
  );
  const handlePopChange = useCallback(
    (objectId: string, next: string[]) => updateDraft((d) => setPops(d, objectId, next)),
    [updateDraft],
  );
  const handleRemovePerm = useCallback((objectId: string) => updateDraft((d) => removePerm(d, objectId)), [updateDraft]);
  const handleUndoPerm = useCallback((objectId: string) => updateDraft((d) => undoPerm(d, objectId)), [updateDraft]);

  // ── 메뉴에서 오브젝트 추가 ──
  const addFolderOptions = useMemo<FolderOption[]>(
    () => menus.map((m) => ({ value: m.MENU_ID, label: m.MENU_PATH || m.MENU_NM || m.MENU_ID })),
    [menus],
  );
  const addFolderDefault = menus.some((m) => m.MENU_ID === selectedMenuId) ? selectedMenuId : (menus[0]?.MENU_ID ?? "");
  const addFolder =
    addFolderPick.roleId === selectedRoleId && addFolderPick.folder ? addFolderPick.folder : addFolderDefault;
  const objKey = `${selectedRoleId}|${addFolder}`;

  const objSeq = useRef(0);
  useEffect(() => {
    if (!selectedRoleId || !addFolder || sysAdmin) return;
    const seq = ++objSeq.current;
    const key = `${selectedRoleId}|${addFolder}`;
    // 조회 시작 표시 — effect 안 setState 는 의도된 동작이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFolderObjs((p) => ({ scope: key, objs: p.scope === key ? p.objs : EMPTY_OBJS, loading: true, failed: false }));
    void (async () => {
      try {
        const res = await apiSearchFolderObj(selectedRoleId, addFolder);
        if (seq !== objSeq.current) return;
        setFolderObjs({ scope: key, objs: res.objs ?? [], loading: false, failed: false });
      } catch (e) {
        if (seq !== objSeq.current) return;
        setError(e instanceof Error ? e.message : "메뉴 폴더 오브젝트 조회 실패");
        setFolderObjs({ scope: key, objs: [], loading: false, failed: true });
      }
    })();
  }, [selectedRoleId, addFolder, sysAdmin, objReload]);

  const folderObjList = folderObjs.scope === objKey ? folderObjs.objs : EMPTY_OBJS;
  const pickEmpty = pickEmptyMessage(folderObjs.scope === objKey && folderObjs.failed, folderObjList.length);
  const pickable = useMemo(() => pickableObjs(folderObjList, draft), [folderObjList, draft]);
  const pickedIds = useMemo(() => {
    if (picks.scope !== objKey || picks.ids.length === 0) return EMPTY_IDS;
    const ok = new Set(pickable.map((o) => o.OBJECT_ID));
    const ids = picks.ids.filter((id) => ok.has(id));
    return ids.length === picks.ids.length ? picks.ids : ids;
  }, [picks, objKey, pickable]);

  const handleAddFolderChange = useCallback(
    (folder: string) => setAddFolderPick({ roleId: selectedRoleId, folder }),
    [selectedRoleId],
  );
  const handlePickedChange = useCallback(
    (ids: string[]) =>
      // 그리드가 제어형 선택을 맞춘 뒤 같은 목록을 다시 알려도 상태를 바꾸지 않는다(되먹임 방지).
      setPicks((p) =>
        p.scope === objKey && p.ids.length === ids.length && p.ids.every((x, i) => x === ids[i]) ? p : { scope: objKey, ids },
      ),
    [objKey],
  );

  const addObjs = useCallback(
    (objs: FolderObjRow[]) => {
      if (objs.length === 0 || permBusyRef.current) return;
      const roleId = selectedRoleId;
      setPerm((p) =>
        p.roleId === roleId ? { ...p, draft: addFromFolder(p.draft, objs, addLevel, menus, addFolder) } : p,
      );
      setPicks({ scope: objKey, ids: [] });
      // 추가한 줄이 보이게 거르기를 그 폴더(또는 모든 폴더)로 둔다.
      setPermFolderPick({ roleId, folder: "*" });
    },
    [selectedRoleId, addLevel, menus, addFolder, objKey],
  );
  const handleAddPicked = useCallback(() => {
    const ids = new Set(pickedIds);
    addObjs(pickable.filter((o) => ids.has(o.OBJECT_ID)));
  }, [pickable, pickedIds, addObjs]);
  const handleAddAll = useCallback(() => addObjs(pickable), [pickable, addObjs]);

  // ── 행추가 / 행복사 / 행삭제 / 행취소 ──
  const handleRowCancel = useCallback(() => {
    if (!selectedKey) {
      setError("취소할 행을 선택하세요.");
      return;
    }
    const target = rows.find((r) => getRowKey(r) === selectedKey);
    if (!target?.nativeeditor_status) {
      setError("변경된 행이 아닙니다.");
      return;
    }
    // 반영 전 입력도 버린다(행이 조회 값으로 돌아오면 패널이 그 값을 다시 읽는다).
    detailRef.current?.reset(null);
    setRows((prev) => {
      if (target.nativeeditor_status === "inserted") {
        return prev.filter((r) => getRowKey(r) !== selectedKey);
      }
      // 고친 값도 조회 값으로 되돌린다(예: 사용 안 함으로 둔 뒤 행취소하면 다시 「사용」). 조회 값이 없으면 상태만 지운다.
      const orig = origRef.current.get(selectedKey);
      return prev.map((r) =>
        getRowKey(r) === selectedKey ? (orig ?? { ...r, nativeeditor_status: "" as RowStatus }) : r,
      );
    });
    if (target.nativeeditor_status === "inserted") setSelectedKey(null);
  }, [rows, selectedKey, setRows, setSelectedKey]);

  /** 행추가 / 행복사 / 행삭제 통합 (GridPanel showAddButton/showCopyButton/showDeleteButton onDataChange). */
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        const sourceRow = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey,
        ) as Partial<CommRoleMngRow> | undefined;
        // GridPanel.createEmptyRow 는 columns 전 컬럼을 ""(빈 문자열)로 채워 넘긴다 → 빈 값만 기본값으로 되메운다.
        const base = (sourceRow ?? {}) as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...emptyRow() };
        for (const [k, v] of Object.entries(base)) {
          if (v !== "" && v !== null && v !== undefined) merged[k] = v;
        }
        const newRow: RoleGridRow = {
          ...(merged as CommRoleMngRow),
          // ROLE_ID / ID 는 신규·복사 모두 비운다 — 메뉴 ID + ID 입력 시 ROLE_ID 자동 합성. 집계 칸은 복사하지 않는다.
          ROLE_ID: "",
          ID: "",
          GROUP_CNT: undefined,
          USER_CNT: undefined,
          PERM_CNT: undefined,
          __rowId: addedRowKey,
          __gridTempId: addedRowKey,
          nativeeditor_status: "inserted" as RowStatus,
        };
        const apply = () => {
          setRows((prev) => [...prev, newRow]);
          setSelectedKey(addedRowKey);
        };
        // 저장하지 않은 퍼미션 변경이 있으면 행을 붙이기 전에 묻는다(그만두면 빈 행이 남지 않게).
        const n = pendingRef.current;
        if (n > 0) {
          showMessage({
            alertType: "confirm",
            title: "퍼미션 변경 버리기",
            message: `저장하지 않은 퍼미션 변경 ${n}건이 있습니다. 버리고 새 역할 행을 만들까요?`,
            onConfirm: apply,
          });
          return;
        }
        apply();
      } else {
        // 행삭제 — 쓰는 역할·SYSADMIN 은 막는다(perm-crudfix c4, 서버 ROLE_IN_USE 와 같은 기준). 옛 동작 = 「역할 0건 저장」으로 조용히 끝남
        const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
        for (const r of rows) {
          if (newKeys.has(getRowKey(r))) continue;
          const why = roleDeleteBlock(r);
          if (why) {
            setError(why);
            return;
          }
        }
        setRows((prev) => {
          const removed = prev.filter((r) => !newKeys.has(getRowKey(r)));
          const kept = newData as RoleGridRow[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    [rows, setRows, setSelectedKey, showMessage],
  );

  // ── 권한 작업대에서 열기(dmes:open-with, f7) — 첫 조회가 끝난 뒤 받은 역할을 고르거나 새 역할 행을 연다 ──
  useOpenWith(
    "commRoleMng",
    (ow, attempt) => {
      const dirty = pendingRef.current > 0 || rows.some((r) => r.nativeeditor_status) || !!detailRef.current?.isDirty();
      const step = openWithStep(ow, rows, getRowKey, attempt, dirty);
      if (step.kind === "new") return void handleDataChange([{ __gridTempId: `__new_ow_${ow.at}` }], `__new_ow_${ow.at}`);
      if (step.kind === "select") return void requestSelect(step.key);
      if (step.kind === "skip") return;
      const f = { ...DEFAULT_FILTERS, edt_ROLE_ID: step.roleId };
      setFilters(f);
      void loadList(f, { preferRoleId: step.roleId });
      return "wait";
    },
    (searched || restored) && !isSearching,
  );

  const handleOpenBench = useCallback((roleId: string) => openBench("commRoleMng", roleId), []);

  /** 상세 초안 → 목록 행(blur·행 전환·저장 직전). 같은 행이 없으면 목록 그대로. */
  const handleDetailCommit = useCallback(
    (d: RoleGridRow) => setRows((prev) => applyRoleDraft(prev, d, getRowKey)),
    [setRows],
  );

  // ── 저장 (B-003): 역할 마스터(save) → 퍼미션(saveCmRoleMap) → 재조회 ──
  const handleSave = useCallback(async () => {
    // 아직 blur 가 안 일어난 입력까지 반영한다(저장 단추는 패널 밖에 있다).
    const detailDraft = detailRef.current?.getDraft() ?? null;
    const detailDirty = detailRef.current?.isDirty() ?? false;
    detailRef.current?.commit();
    const effective = detailDraft && detailDirty ? applyRoleDraft(rows, detailDraft, getRowKey) : rows;
    const masterDirty = effective.some((r) => r.nativeeditor_status);
    const permSave =
      selectedRoleId && !sysAdmin && !isDeletedRow && !permLoadFailed ? saveRows(selectedRoleId, draft) : [];
    if (!masterDirty && permSave.length === 0) {
      setError("저장할 데이터가 없습니다.");
      return;
    }
    for (const r of effective) {
      if (!r.nativeeditor_status || r.nativeeditor_status === "deleted") continue;
      // V-006 Essential — 신규 행은 메뉴 ID + ID 가 모두 있어야 ROLE_ID 가 합성된다.
      if (r.nativeeditor_status === "inserted") {
        if (!String(r.MENU_ID ?? "").trim()) {
          setError("메뉴 ID 는 필수 입력입니다.");
          return;
        }
        if (!String(r.ID ?? "").trim()) {
          setError("ID 는 필수 입력입니다.");
          return;
        }
      }
      if (!r.ROLE_ID || String(r.ROLE_ID).trim().length === 0) {
        setError("역할 ID 가 생성되지 않았습니다. 메뉴 ID 와 ID 를 입력하세요.");
        return;
      }
    }
    // 역할명 필수(메뉴 ID·ID 검사 뒤, z2fix2 d — BE 도 ROLE_NM_REQUIRED 로 거절)
    const noName = firstMissingRoleNm(effective);
    if (noName) {
      const id = String(noName.ROLE_ID ?? "").trim();
      setError(`역할명은 필수 입력입니다.${id ? ` (${id})` : ""}`);
      return;
    }
    const emptyBtn = emptyBtnObjects(permSave);
    if (emptyBtn.length > 0) {
      setError(`버튼 권한이 빈 퍼미션이 있습니다(${emptyBtn.join(", ")}). 버튼을 하나 이상 켜거나 「빼기」를 누르세요.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    // 새 행은 ROLE_ID 가 상세 초안에서 합성되므로 반영 전 초안을 먼저 본다.
    const keepRoleId = String((detailDraft && detailDirty ? detailDraft.ROLE_ID : selected?.ROLE_ID) ?? "");
    let roleCnt: number | null = null;
    let savedRoles: RoleRow[] | undefined;
    let permRes: { cnt_merge?: number; cnt_delete?: number } | null = null;
    try {
      if (masterDirty) {
        const payload = effective
          .filter((r) => r.nativeeditor_status)
          .map((r) => ({
            ...stripInternal(r),
            rowStatus: r.nativeeditor_status,
          })) as unknown as CommRoleMngRow[];
        const res = await apiSaveCmRole(payload);
        roleCnt = res.cnt_merge ?? 0;
        savedRoles = res.ds_main;
      }
      let permErr: string | null = null;
      if (permSave.length > 0) {
        try {
          permRes = await apiSaveCmRoleMap(selectedRoleId, permSave);
        } catch (e) {
          const msg = permSaveErrorText(
            e instanceof Error ? e.message : "퍼미션 저장 실패",
            (e as BusinessError | undefined)?.code,
          );
          permErr = roleCnt !== null ? `역할은 저장했지만 퍼미션은 저장하지 못했습니다.\n${msg}` : msg;
        }
      }
      if (roleCnt === null && !permRes) {
        // 아무것도 저장하지 못했다 — 다시 조회하지 않고 초안을 남겨 고칠 수 있게 한다.
        setError(permErr);
        return;
      }
      showMessage({ message: saveDoneMessage(roleCnt, permRes) });
      // 현재 조건으로 다시 조회하고 보던 역할을 유지한다(집계 칸이 바뀐다).
      const kept = await loadList(filters, { preferRoleId: keepRoleId || undefined, silent: true, saved: savedRoles });
      // loadList 가 오류를 지우므로 퍼미션 저장 실패는 재조회 뒤에 보인다.
      if (permErr) setError(permErr);
      // 같은 역할이 남으면 ROLE_ID 가 그대로라 퍼미션 조회 effect 가 돌지 않는다 → 퍼미션을 저장했을 때만 직접 다시 부른다.
      // 다른 역할로 바뀌었으면 effect 가 부른다. 퍼미션 저장이 실패하면 초안을 남겨 고칠 수 있게 한다.
      if (permRes && kept && kept === selectedRoleId) {
        await loadRoleDetail(kept);
        setObjReload((n) => n + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패 하였습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [rows, selectedRoleId, sysAdmin, isDeletedRow, permLoadFailed, draft, selected, filters, loadList, loadRoleDetail, showMessage]);

  const pageButtons = useMemo<PageButton[]>(
    () => [
      {
        id: "btn_search",
        label: "조회",
        onClick: handleSearch,
        type: "primary" as const,
        disabled: isSearching || isSaving,
        action: "search",
      },
      {
        id: "btn_reset",
        label: "초기화",
        onClick: handleReset,
        disabled: isSearching || isSaving,
        action: "cancel",
      },
      {
        id: "btn_save",
        label: "저장",
        onClick: () => void handleSave(),
        type: "save" as const,
        disabled: isSearching || isSaving,
        action: "save",
      },
    ],
    [handleSearch, handleReset, handleSave, isSearching, isSaving],
  );

  const groupsValid = groupInfo.roleId === selectedRoleId && !!selectedRoleId;

  return (
    <PageLayout
      title="역할 관리"
      breadcrumb="공통관리 > 시스템관리 > 역할 관리"
      objId="commRoleMng"
      buttons={pageButtons}
    >
      <SearchArea onSearch={handleSearch} autoSearch>
        <SearchField
          label="역할 ID"
          name="ROLE_ID"
          value={filters.edt_ROLE_ID}
          onChange={(v) => handleFilterChange("edt_ROLE_ID", v)}
        />
        <SearchField
          label="역할명"
          name="ROLE_NM"
          value={filters.edt_ROLE_NM}
          onChange={(v) => handleFilterChange("edt_ROLE_NM", v)}
        />
        <SearchField
          label="사용 여부"
          name="USE_TP"
          type="select"
          options={USE_TP_SEARCH_OPTIONS}
          value={filters.cbo_USE_TP}
          onChange={(v) => handleFilterChange("cbo_USE_TP", v)}
        />
      </SearchArea>

      {/* 위 = 역할 목록 + 상세, 아래 = 이 역할의 퍼미션 + 메뉴에서 오브젝트 추가 */}
      <ContentBody root direction="column" resizable storageKey="mcm.csa.commRoleMng">
        <ContentBody resizable storageKey="mcm.csa.commRoleMng.top">
          <ContentPanel>
            <RoleListPanel
              rows={rows}
              count={visibleCount}
              selectedKey={selectedKey}
              isSearching={isSearching}
              isSaving={isSaving}
              onSelect={requestSelect}
              onDataChange={handleDataChange}
              onRowCancel={handleRowCancel}
            />
          </ContentPanel>
          <ContentPanel width={480} scrollY>
            <RoleDetailPanel
              selected={selected}
              menuLov={menuLov}
              groups={groupsValid ? groupInfo.groups : EMPTY_GROUPS}
              groupsLoading={groupsValid ? groupInfo.loading : !!selectedRoleId}
              groupsError={groupsValid && groupInfo.error}
              userCnt={groupsValid ? groupInfo.userCnt : null}
              permCnt={detailPermCnt}
              ref={detailRef}
              onCommit={handleDetailCommit}
              onOpenBench={handleOpenBench}
            />
          </ContentPanel>
        </ContentBody>

        <ContentBody height="55%" resizable storageKey="mcm.csa.commRoleMng.bottom">
          <ContentPanel>
            <RolePermPanel
              rows={permRows}
              count={permCount}
              pendingCnt={pendingCnt}
              loading={permLoading}
              readOnly={permBusy}
              blockedMessage={permBlocked}
              folderOptions={permFolderOpt.options}
              folder={permFolder}
              onFolderChange={handlePermFolderChange}
              onBtnChange={handleBtnChange}
              onPopChange={handlePopChange}
              onRemove={handleRemovePerm}
              onUndo={handleUndoPerm}
            />
          </ContentPanel>
          <ContentBody direction="column" width={460}>
            <ContentPanel flex="0 0 auto">
              <RoleAddControls
                blockedMessage={addBlocked}
                busy={permBusy}
                folderOptions={addFolderOptions}
                folder={addFolder}
                onFolderChange={handleAddFolderChange}
                level={addLevel}
                onLevelChange={setAddLevel}
                pickedCnt={addBlocked ? 0 : pickedIds.length}
                pickableCnt={addBlocked ? 0 : pickable.length}
                onAddPicked={handleAddPicked}
                onAddAll={handleAddAll}
              />
            </ContentPanel>
            <ContentPanel>
              <RoleAddPickGrid
                blockedMessage={addBlocked}
                objs={pickable}
                loading={folderObjs.scope === objKey && folderObjs.loading}
                emptyMessage={pickEmpty}
                picked={pickedIds}
                onPickedChange={handlePickedChange}
              />
            </ContentPanel>
          </ContentBody>
        </ContentBody>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}

const EMPTY_GROUPS: RoleGroupRow[] = [];
