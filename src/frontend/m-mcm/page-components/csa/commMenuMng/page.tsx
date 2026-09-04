"use client";

/**
 * commMenuMng 화면 — 메뉴 관리 (As-Is CommMenuMng.xfdl).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트) / §4 (이벤트 30 메서드) / §6 (SQL 8) / §8 (BPMN 6 action / To-Be 5)
 *   - 기능설계서 §3 (조회+그리드) / §4 (Detail D-NNN 18 필드) / §5 (버튼) / §6 (validation V-001~V-902) / §10 (메시지)
 *   - 디자인설계서 §2 (3 분할 레이아웃) / §4 (그리드)
 *   - BPMN설계서 §1.1 (5 API To-Be) / §2 (action 흐름)
 *
 * 페이지 유형: D 다중 그리드 + 단일 상세 폼 (G + GT + GO + D — 3 분할 좌(트리) / 중(리스트+OBJECT) / 우(상세)).
 * 호출: POST /api/mcm/oasis/commMenuMng/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 * To-Be 정책 #1: BIZ_SYSTEM_CODE/APP_HOST_ID 폐기 → S-001 / GO-008 / DS-007 / LV-004 / fn_lov / lov action 모두 제거.
 *
 * 패턴: W1 commObjMng (단일 그리드 + Detail) 의 확장 — 트리 + 리스트 + OBJECT + Detail.
 *
 * 2026-06-02 iter#5 — W5 (commUserMng) A~G 패턴 전파:
 *   - A Layout: Detail 패널 narrow (width=420), 좌측 트리/리스트 flex:1. 메인 그리드 wider.
 *   - B Detail wrapper: marginTop:32 + height:auto + border #d4dae0 + bg #fff + 28px 회색 헤더 "상세 정보".
 *   - C Form row: commMenuMng Detail 은 multi-component row 없음 (역할복사 / pwd reset 버튼 ✗) — N/A.
 *   - D Grid: 모든 컬럼 editable:false (행 클릭 → Detail 폼 수정 패턴). Date toDateInputValue 통일. LABEL_MAP 통일.
 *   - E Buttons: AsIs xfdl:362 ["btn_search","btn_reset","btn_save","btn_close"] 정합. !hasAnyChanges 사전 disabled 제거.
 *   - F Auto-search: useEffect (mount) 에서 트리 + 메인 그리드 동시 자동 조회 (csa 자동조회 정책 J-017).
 *   - G BE: END_OF_TIME = 9999-12-31 00:00:00 (W5 정합, AsIs Mapper #{} 직접 바인딩 결과 정합).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import {
  Input,
  Select,
  Radio,
  DatePicker,
  Textarea,
  Button,
} from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { Tree, type TreeNode } from "@dk-oasis/shared/tree";
import "@dk-oasis/shared/tree.css";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  searchCmMenu as apiSearchCmMenu,
  searchMenuGrp as apiSearchMenuGrp,
  saveCmMenu as apiSaveCmMenu,
  searchObj as apiSearchObj,
  commonList as apiCommonList,
  searchCmMenuFld as apiSearchCmMenuFld,
  saveCmMenuFld as apiSaveCmMenuFld,
  type CommMenuMngFldRow,
} from "./api";
import type {
  CommMenuMngFilters,
  CommMenuMngObjLovRow,
  CommMenuMngObjRow,
  CommMenuMngRow,
  CommMenuMngTreeRow,
  RowStatus,
} from "./types";

interface GridRow extends Record<string, unknown> {
  __gridTempId?: string;
  __rowId?: string;
  nativeeditor_status?: RowStatus;
}

function getRowKey(row: GridRow): string {
  return (
    (row.__gridTempId as string) ||
    (row.__rowId as string) ||
    `${String((row as { MENU_ID?: unknown }).MENU_ID ?? "")}::${String((row as { MENU_SEQ?: unknown }).MENU_SEQ ?? "")}`
  );
}

/**
 * 신규/조회 행 모두 `__rowId` 합성 — AgDataGrid rowKey 가 단일 컬럼만 지원 + 복합 PK (MENU_ID+MENU_SEQ)
 * + 신규 row PK 빈 값 충돌 회피 (W1 commObjMng 패턴). spread base 이후 PK 명시 (정책 #17 학습).
 */
function withSyntheticId<T extends Partial<CommMenuMngRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `r-${idx}-${String(r.MENU_ID ?? "")}-${String(r.MENU_SEQ ?? "")}` };
}

function stripInternal<T extends GridRow>(row: T): Record<string, unknown> {
  const {
    __gridTempId: _t,
    __rowId: _r,
    nativeeditor_status: _s,
    ...rest
  } = row as Record<string, unknown>;
  return rest;
}

/**
 * BE LocalDateTime ISO / "yyyyMMdd" 8자 / "yyyy-MM-dd" / null → DatePicker (`<input type="date">`)
 * 가 받을 수 있는 "yyyy-MM-dd" 문자열로 정규화. invalid → 빈 문자열.
 * As-Is xfdl Calendar dateformat="yyyy-MM-dd" (xfdl:158/159) 정합.
 * 2026-06-02 W5 패턴 D — formatDateCell / toIsoDate / fromIsoDate 통합 (W5 commUserMng 정본).
 */
function toDateInputValue(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s || s === "null") return "";
  // ISO yyyy-MM-dd[Thh:mm:ss...] → 앞 10자
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // yyyyMMdd 8자
  if (/^\d{8}$/.test(s)) return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  return "";
}

/** DatePicker onChange (yyyy-MM-dd) → As-Is dataset 8자 보존 (BE parseLocalDateTime 가 yyyy-MM-dd 도 지원). */
function fromIsoDate(iso: string): string {
  if (!iso) return "";
  if (iso.length === 10 && iso.charAt(4) === "-") {
    return iso.replace(/-/g, "");
  }
  return iso;
}

const DEFAULT_FILTERS: CommMenuMngFilters = {
  edt_MENU_ID: "",
  edt_MENU_NM: "",
  cbo_USE_TP: "",
};

/** S-004 / G-007 / D-010 — LV-001 정적 Y/N (xfdl ds_cboUseYn) — label 포함. */
const USE_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];

/** S-004 검색 — Combo 정적 옵션 "전체" + Y/N (As-Is xfdl displaynulltext="전체" 가정). */
const USE_TP_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];

/** G-011 / D-014 — LV-002 정적 Y/N (xfdl ds_menuViewYn) — label 포함. */
const MENU_VIEW_YN_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "표시" },
  { value: "N", label: "미표시" },
];

/** D-011 — LV-003 cbo_menu_tp 내부 hardcoded WEB/MOBIL — label 포함. */
const MENU_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "WEB", label: "WEB" },
  { value: "MOBIL", label: "MOBIL" },
];

// 2026-06-02 W5 패턴 D — LABEL_MAP 통일 (Object.fromEntries 대신 명시 Record).
const USE_TP_LABEL_MAP: Record<string, string> = { Y: "사용", N: "미사용" };
const MENU_VIEW_YN_LABEL_MAP: Record<string, string> = { Y: "표시", N: "미표시" };

/**
 * MENU_VIEW_YN 값 정규화 — 'N'(대소문자 무관) 만 미표시, 그 외(NULL / 빈 문자열 / 이상값)는 모두 'Y'(표시).
 *
 * 2026-08-13 — "메뉴 필드 관리" 팝업(폴더 = TB_MCM_SEC_MENU_FLD) 에 표시/미표시 컬럼을 추가하며 신설.
 * NULL 을 'Y' 로 읽는 것은 현 동작 정합 — BE SecUserService 사이드바 필터는 값이 'N' 일 때만 숨긴다
 * (mcm 계열 폴더 5개가 NULL 인 상태에서 정상 노출 중). 그리드에 빈칸으로 보여 운영자가
 * "미설정 = 숨김?" 으로 오해하지 않도록 표시·저장 양쪽에서 'Y' 로 승격한다. DB 직접 UPDATE 는 ✗ (시드 담당).
 * 빈 문자열 차단 목적도 겸한다 — VARCHAR(1) 코드 컬럼의 '' 는 Hibernate CoercionException 유발 전례.
 */
function normalizeViewYn(v: unknown): "Y" | "N" {
  return String(v ?? "").trim().toUpperCase() === "N" ? "N" : "Y";
}

/**
 * 메뉴 리스트 그리드 컬럼 — 분석 §3.3 G-001~G-012 / 디자인 §4.1 (12 컬럼).
 * 2026-06-02 iter#5 W5 패턴 D — 그리드 인라인 편집 비활성화 (모두 editable: false).
 * 사유: 본 화면은 "행 클릭 → Detail 폼에서 수정" 패턴 (AsIs xfdl div_main_grd_M0F0_oncellclick + BindItem).
 * AsIs xfdl 도 ds_menuList 가 Detail 폼과 BindItem 양방향 bind 되어 그리드 셀 직접 편집은 의도 ✗.
 */
const MENU_LIST_COLUMNS: GridColumn[] = [
  { key: "MENU_SEQ", header: "메뉴순서", width: 80, editable: false, align: "center" },
  { key: "MENU_ID", header: "메뉴 ID *", width: 80, editable: false, align: "left" },
  { key: "MENU_NM", header: "메뉴명 *", width: 140, editable: false, align: "left" },
  { key: "OBJECT_ID", header: "OBJECT ID *", width: 140, editable: false, align: "left" },
  { key: "FULL_SEQ", header: "FULL SEQ", width: 80, editable: false, align: "center" },
  {
    key: "USE_TP",
    header: "사용구분",
    width: 76,
    editable: false,
    align: "center",
    render: (v) => USE_TP_LABEL_MAP[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "MENU_TP",
    header: "메뉴타입",
    width: 80,
    editable: false,
    align: "center",
  },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => toDateInputValue(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효기한일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => toDateInputValue(v),
  },
  {
    key: "MENU_VIEW_YN",
    header: "표시 여부",
    width: 80,
    editable: false,
    align: "center",
    render: (v) => MENU_VIEW_YN_LABEL_MAP[String(v ?? "")] ?? String(v ?? ""),
  },
  { key: "MENU_DESC", header: "메뉴설명", width: 140, editable: false, align: "left" },
];

/**
 * 메뉴 트리 — 평면 LEV/PARENT_MENU_ID 데이터를 nested TreeNode 구조로 변환.
 *
 * AsIs xfdl:87 `grd_M0F1 binddataset="ds_menuTreeList" treeinitstatus="expand,all"
 *  treelevel="bind:LEV" edittype="tree"` → 실제 트리 위젯 (expand/collapse 가능).
 *
 * 변환 규칙:
 *  - PARENT_MENU_ID = null/blank → root 노드 (LEV=0)
 *  - PARENT_MENU_ID = parent.MENU_ID → 자식 노드
 *  - 정렬 (2026-06-04 사용자 지시): MENU_SEQ asc (numeric) 1차 + FULL_SEQ asc (string) tiebreak.
 *    FLD owner row 는 FULL_SEQ 미보유 → MENU_SEQ 단독 정렬 (FLD 의 MENU_SEQ 는 unique 시드).
 *    leaf MENU 행 (SEC_MENU) 이 트리에 합류할 경우 FULL_SEQ tiebreak 적용.
 *
 * AsIs `treeinitstatus="expand,all"` → ToBe 는 expanded set 에 모든 노드 ID 자동 포함 (사용자 결정 시 collapse 가능).
 */
function buildMenuTree(rows: CommMenuMngTreeRow[]): {
  nodes: TreeNode[];
  allIds: string[];
} {
  if (!rows || rows.length === 0) return { nodes: [], allIds: [] };
  const nodeMap = new Map<string, TreeNode & { children: TreeNode[] }>();
  const allIds: string[] = [];
  // raw row 보관 — 정렬 시 MENU_SEQ / FULL_SEQ 액세스용.
  const rawMap = new Map<string, CommMenuMngTreeRow>();

  // 1차 패스: 모든 노드 생성 (MENU_ID 기준)
  for (const r of rows) {
    const id = String(r.MENU_ID ?? "");
    if (!id) continue;
    nodeMap.set(id, {
      id,
      label: String(r.MENU_NM ?? ""),
      children: [],
      // 검색 / 클릭 시 전달용 원본 row 보존
      __raw: r,
    });
    rawMap.set(id, r);
    allIds.push(id);
  }

  // 2차 패스: parent.children 에 push (입력 순서 보존)
  const roots: TreeNode[] = [];
  for (const r of rows) {
    const id = String(r.MENU_ID ?? "");
    const node = id ? nodeMap.get(id) : undefined;
    if (!node) continue;
    const parentId = String(r.PARENT_MENU_ID ?? "").trim();
    if (!parentId || parentId === "null") {
      roots.push(node);
    } else {
      const parent = nodeMap.get(parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // parent 미존재 (lineage 끊김) — root 로 폴백
        roots.push(node);
      }
    }
  }

  // 3차 패스: 각 노드의 children 을 MENU_SEQ asc (numeric) + FULL_SEQ tiebreak 으로 정렬.
  // (2026-06-04 사용자 지시 — buildMenuTree 정렬 보장).
  const cmp = (aId: string | number, bId: string | number): number => {
    const ra = rawMap.get(String(aId));
    const rb = rawMap.get(String(bId));
    const sa = Number(String(ra?.MENU_SEQ ?? "").trim() || NaN);
    const sb = Number(String(rb?.MENU_SEQ ?? "").trim() || NaN);
    const an = Number.isFinite(sa);
    const bn = Number.isFinite(sb);
    if (an && bn && sa !== sb) return sa - sb;
    if (!an && bn) return 1;
    if (an && !bn) return -1;
    if (!an && !bn) {
      const cs = String(ra?.MENU_SEQ ?? "").localeCompare(String(rb?.MENU_SEQ ?? ""));
      if (cs !== 0) return cs;
    }
    // tie-break — FULL_SEQ string asc
    return String(ra?.FULL_SEQ ?? "").localeCompare(String(rb?.FULL_SEQ ?? ""));
  };
  const sortRec = (list: TreeNode[]): void => {
    list.sort((a, b) => cmp(a.id, b.id));
    for (const n of list) {
      if (n.children && n.children.length > 1) sortRec(n.children as TreeNode[]);
    }
  };
  sortRec(roots);

  return { nodes: roots, allIds };
}

/** OBJECT 그리드 컬럼 — GO-001~GO-009 (To-Be 8 컬럼, GO-008 BIZ_SYSTEM_CODE 폐기). 디자인 §4.3. */
const OBJ_COLUMNS: GridColumn[] = [
  { key: "FORM_URL", header: "FORM URL", width: 160, editable: false, align: "left" },
  { key: "SERVICE", header: "SERVICE", width: 120, editable: false, align: "left" },
  { key: "PARAM", header: "PARAM", width: 120, editable: false, align: "left" },
  {
    key: "USE_TP",
    header: "사용 유무",
    width: 70,
    editable: false,
    align: "center",
    render: (v) => USE_TP_LABEL_MAP[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "START_ACTIVE_DATE",
    header: "유효 개시일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => toDateInputValue(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효 기한일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => toDateInputValue(v),
  },
  { key: "SYSTEM_CODE", header: "SYSTEM", width: 80, editable: false, align: "center" },
  { key: "OBJECT_TYPE", header: "OBJECT TYPE", width: 92, editable: false, align: "center" },
];

/**
 * 행추가 default — As-Is V-A01~V-A07 (xfdl:679~696 fn_rowAdd + xfdl:711~731 fn_rowInsert):
 *  - MENU_ID = ds_menuTreeList.MENU_ID (선택된 트리 노드)
 *  - MENU_TP = 'WEB'
 *  - USE_TP  = 'Y'
 *  - START_ACTIVE_DATE = gfn_today() 8자
 *  - END_ACTIVE_DATE   = "99991231" (To-Be BE 정정 9999-12-31 00:00:00)
 *  - MENU_VIEW_YN = 'Y'
 */
function emptyRow(menuIdFromTree: string): CommMenuMngRow {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    // 2026-09-04 (TE-006) — MENU_ID 를 트리 노드로 채우지 않는다.
    //   주석은 "PK 사용자 입력 강제" 라면서 값을 미리 넣어 두어 서로 모순이었고,
    //   MENU_ID 와 PARENT_MENU_ID 가 같은 값으로 시작하는 탓에 사용자가 MENU_ID 만 고치면
    //   그대로 자기참조가 됐다. 트리 노드는 상위 폴더(PARENT_MENU_ID)에만 쓴다.
    MENU_ID: "",
    MENU_SEQ: "",
    FULL_SEQ: "",
    MENU_NM: "",
    MENU_DESC: "",
    MENU_TP: "WEB", // V-A02
    OBJECT_ID: "",
    USE_TP: "Y", // V-A03
    START_ACTIVE_DATE: today, // V-A04
    END_ACTIVE_DATE: "99991231", // V-A05 — BE 가 9999-12-31 00:00:00 정정
    MENU_VIEW_YN: "Y", // V-A06
    PARENT_MENU_ID: menuIdFromTree,
    MENU_PARAM1: "",
    MENU_PARAM2: "",
    MENU_PARAM3: "",
  };
}

export default function CommMenuMngPage() {
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<CommMenuMngFilters>(DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<(CommMenuMngRow & GridRow)[]>([]);
  // ds_menuTreeList — 평면 LEV/PARENT_MENU_ID. nested TreeNode 변환은 useMemo.
  const [treeRows, setTreeRows] = useState<CommMenuMngTreeRow[]>([]);
  const [objRows, setObjRows] = useState<CommMenuMngObjRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // shared Tree 의 expandedItems / selectedItems 는 string|number array (controlled).
  // AsIs treeinitstatus="expand,all" → 트리 로드 직후 모든 노드 ID 를 expanded 에 적재.
  const [expandedTreeIds, setExpandedTreeIds] = useState<(string | number)[]>([]);
  const [selectedTreeMenuId, setSelectedTreeMenuId] = useState<string>("");

  // OBJECT_ID LoV 팝업 state (AsIs div_object_id / commonDynamic.xfdl 등가).
  // AsIs: D-007 Detail OBJECT_ID 필드 옆 검색 버튼 → 팝업 → 그리드 클릭 → fn_callBack commonList → ds_menuList OBJECT_ID 세트.
  // 2026-06-04 — 사용자 지시: 폼 형식을 commUserMng 의 부서 검색 (shared LookupModal) 패턴으로 변경.
  //   keyword input + 조회 버튼 + 그리드 + 취소/확인 (확인은 row 선택 후 확정).
  //   OBJECT 는 3 컬럼 (OBJECT_ID/OBJECT_NM/FORM_URL) + PARENT_MENU_ID 동기 필요 → 외부 LookupModal {code,name} 미충족 →
  //   동일 layout 을 inline 으로 직접 구성 (Modal + Input + Button + AgDataGrid).
  const [lovOpen, setLovOpen] = useState(false);
  const [lovQuery, setLovQuery] = useState("");
  const [lovRows, setLovRows] = useState<CommMenuMngObjLovRow[]>([]);
  const [lovLoading, setLovLoading] = useState(false);
  const [lovSelectedKey, setLovSelectedKey] = useState<string | null>(null);

  // 2026-06-04 사용자 지시 — "메뉴 필드 관리" 팝업 (그리드 batch).
  //   기존 단건 form → 그리드 + 행추가/복사/삭제 + 일괄 저장 패턴 (saveCmMenu 정합).
  //   PK 충돌 false-positive 회피: NOT EXISTS 가드 제거 → PK 충돌 시 BE 가 RuntimeException → FE 메시지 노출.
  const [fldOpen, setFldOpen] = useState(false);
  const [fldSaving, setFldSaving] = useState(false);
  const [fldLoading, setFldLoading] = useState(false);
  const [fldRows, setFldRows] = useState<(CommMenuMngFldRow & GridRow)[]>([]);
  const [fldSelectedKey, setFldSelectedKey] = useState<string | null>(null);

  // 평면 treeRows → nested TreeNode (memoized).
  const tree = useMemo(() => buildMenuTree(treeRows), [treeRows]);

  /**
   * 상세 폼 "상위 폴더" Select 옵션 (2026-09-04 TE-006).
   *
   * 좌측 트리와 같은 원천(treeRows = TB_MCM_SEC_MENU_FLD)을 쓰므로 트리에 보이는 폴더와
   * 목록이 어긋날 수 없다. 라벨은 `{MENU_NM} ({MENU_ID})` — 폴더명만 보여주면 같은 이름의
   * 폴더를 구분할 수 없고, ID 만 보여주면 어느 폴더인지 알기 어렵다.
   */
  const parentFolderOptions = useMemo(
    () =>
      treeRows
        .map((r) => ({
          value: String(r.MENU_ID ?? ""),
          label: `${String(r.MENU_NM ?? r.MENU_ID ?? "")} (${String(r.MENU_ID ?? "")})`,
        }))
        .filter((o) => o.value.length > 0)
        .sort((a, b) => a.value.localeCompare(b.value)),
    [treeRows],
  );

  const selected = useMemo<(CommMenuMngRow & GridRow) | null>(() => {
    if (!selectedKey) return null;
    return rows.find((r) => getRowKey(r) === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const hasAnyChanges = useMemo(
    () => rows.some((r) => r.nativeeditor_status),
    [rows],
  );

  const visibleCount = rows.filter((r) => r.nativeeditor_status !== "deleted").length;

  /**
   * action=searchCmMenu (B-001 / GT-001 트리 click → fn_search 또는 트리 click).
   * 트리 click 시 pMenuId 전달 (정확 일치 검색).
   */
  const loadList = useCallback(
    async (f: CommMenuMngFilters, pMenuId?: string) => {
      setIsSearching(true);
      setError(null);
      try {
        const payload = await apiSearchCmMenu(f, pMenuId);
        const list = (payload.ds_menuList ?? []).map((r, i) => ({
          ...withSyntheticId(r, i),
          nativeeditor_status: "" as RowStatus,
        }));
        setRows(list);
        if (payload.ds_menuTreeList && payload.ds_menuTreeList.length > 0) {
          setTreeRows(payload.ds_menuTreeList);
          // AsIs treeinitstatus="expand,all" — 신규 트리 로드 직후 모든 노드 expand.
          const { allIds } = buildMenuTree(payload.ds_menuTreeList);
          setExpandedTreeIds(allIds);
        }
        if (list.length > 0) {
          setSelectedKey(getRowKey(list[0]));
          // OBJECT 그리드 자동 갱신 (As-Is fn_callBack searchCmMenu 의 fn_searchObj 호출 정합)
          const firstObjId = list[0].OBJECT_ID;
          if (firstObjId) {
            try {
              const objRes = await apiSearchObj(String(firstObjId));
              setObjRows(objRes.ds_objMng ?? []);
            } catch {
              setObjRows([]);
            }
          } else {
            setObjRows([]);
          }
        } else {
          setSelectedKey(null);
          setObjRows([]);
        }
        // M-007 — "{N}건 조회 되었습니다." (xfdl:535)
        showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
        setObjRows([]);
      } finally {
        setIsSearching(false);
      }
    },
    [showMessage],
  );

  // ── load ──
  /** Form onload — searchMenuGrp 사전 호출 (As-Is fn_formAfterOnload, xfdl:429).
   *  2026-06-02 iter#5 W5 패턴 F — 트리 로드 + 메인 그리드 자동 조회 동시 (csa 자동조회 정책 J-017).
   *  AsIs xfdl:403 gfn_formOnLoad(obj) 등가 (S-004 cbo_USE_TP default "Y" 이지만 ToBe DEFAULT_FILTERS 전체 조회). */
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiSearchMenuGrp();
        const list = res.ds_menuTreeList ?? [];
        setTreeRows(list);
        // AsIs treeinitstatus="expand,all" — 초기 로드 시 전체 expand.
        const { allIds } = buildMenuTree(list);
        setExpandedTreeIds(allIds);
      } catch (e) {
        setError(e instanceof Error ? e.message : "메뉴 트리 조회 실패");
      }
    })();
    // 메인 그리드 자동 조회 — 트리 미선택 상태로 DEFAULT_FILTERS 기준 전체 조회
    void loadList(DEFAULT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (k: keyof CommMenuMngFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadList(filters);

  // 참고 — 포털 알림(STOMP push) 스택은 본 표준 템플릿에 포함하지 않는다.
  // 도입 시 shared 의 useNotifyListener 로 이 화면이 활성일 때의 콜백을 붙인다:
  //   REFRESH → 조회 버튼과 동일하게 자동 재조회 / CUSTOM → linkParam 의 command 를 화면이 자율 해석.
  // 둘 다 handled 반환으로 기본 알림 토스트를 억제하는 것이 계약이다.

  /** B-002 초기화 (fn_reset / xfdl:449). */
  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
  };

  /**
   * 트리 노드 click — UX-001 / V-702 (xfdl:770 div_main_grd_M0F1_oncellclick) —
   * searchCmMenu 트랜잭션 (p_MENU_ID 전달) → ds_menuList 갱신.
   * AsIs: e.clickitem=="treeitembutton" (expand/collapse 버튼) → return → 셀 클릭만 트랜잭션.
   * ToBe: shared Tree 가 onSelect (라벨 클릭) 와 onToggle (▶/▼ 클릭) 을 분리해서 호출.
   */
  const handleTreeSelect = useCallback(
    (_evt: null, nodeIdStr: string) => {
      const menuId = String(nodeIdStr);
      setSelectedTreeMenuId(menuId);
      void loadList(filters, menuId);
    },
    [filters, loadList],
  );

  const handleTreeExpand = useCallback(
    (_evt: null, newExpanded: (string | number)[]) => {
      setExpandedTreeIds(newExpanded);
    },
    [],
  );

  /** 메뉴 리스트 행 click — UX-004 (xfdl:865) — OBJECT 그리드 자동 갱신. */
  const handleListRowClick = useCallback(
    async (row: GridRow) => {
      const key = getRowKey(row);
      setSelectedKey(key);
      const objId = (row as { OBJECT_ID?: unknown }).OBJECT_ID;
      if (objId && String(objId).length > 0) {
        try {
          const res = await apiSearchObj(String(objId));
          setObjRows(res.ds_objMng ?? []);
        } catch {
          setObjRows([]);
        }
      } else {
        setObjRows([]);
      }
    },
    [],
  );

  /**
   * B-012 행취소 — UX 일관성 (W1 commObjMng 패턴).
   * inserted → row 제거 / updated/deleted → status reset.
   */
  const handleRowCancel = useCallback(() => {
    if (!selectedKey) {
      setError("취소할 행을 선택하세요.");
      return;
    }
    setRows((prev) => {
      const target = prev.find((r) => getRowKey(r) === selectedKey);
      if (!target?.nativeeditor_status) {
        setError("변경된 행이 아닙니다.");
        return prev;
      }
      if (target.nativeeditor_status === "inserted") {
        return prev.filter((r) => getRowKey(r) !== selectedKey);
      }
      return prev.map((r) =>
        getRowKey(r) === selectedKey
          ? { ...r, nativeeditor_status: "" as RowStatus }
          : r,
      );
    });
    setSelectedKey(null);
  }, [selectedKey]);

  /**
   * 행추가 / 행복사 / 행삭제 통합 핸들러 (W1 commObjMng 패턴).
   * addedRowKey 있음 → 신규 (emptyRow default).
   * 없음 → 행삭제 → newData 비교 → 사라진 행은 deleted 마킹.
   * V-101 (OBJECT_ID 존재 시 확인) 은 question 다이얼로그 대신 즉시 deleted 마킹 (저장 시 BE 가 처리).
   */
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        // V-A01 — MENU_ID 신규 행 default = 선택된 트리 노드 MENU_ID
        const sourceRow = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey,
        ) as Partial<CommMenuMngRow> | undefined;
        setRows((prev) => {
          const base = sourceRow ?? {};
          // 행복사 시 sourceRow 가 PK 들고 있을 수 있으나 PK 충돌 방지 위해 항상 빈 값 (W1 패턴)
          const newRow: CommMenuMngRow & GridRow = {
            ...emptyRow(selectedTreeMenuId),
            ...base,
            // 2026-09-04 (TE-006) — base(GridPanel 빈 행)가 emptyRow 값을 덮어쓰므로 필수 2개는 뒤에서 재확정.
            //   MENU_ID 는 사용자 입력 강제(빈 값), PARENT_MENU_ID 는 선택된 트리 폴더.
            //   트리 미선택이면 빈 값으로 남고, 상세 폼의 "상위 폴더" Select 로 직접 고를 수 있다.
            MENU_ID: "",
            PARENT_MENU_ID: selectedTreeMenuId,
            MENU_SEQ: "", // PK#2 사용자 입력 강제
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        // 행삭제
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const removed = prev.filter((r) => !newKeys.has(getRowKey(r)));
          const kept = newData as (CommMenuMngRow & GridRow)[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    [selectedTreeMenuId],
  );

  /** 셀 변경 핸들러 — D-004 onkillfocus 의 MENU_SEQ 자동 조합 (V-302) 등 As-Is 룰. */
  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (getRowKey(r) !== String(p.rowKey)) return r;
          const fieldName = String(p.field);
          // PK 변경은 신규 행만 (W5 정합 — Detail readonly 룰)
          if (fieldName === "MENU_ID" && r.nativeeditor_status !== "inserted") {
            return r;
          }
          const updated: CommMenuMngRow & GridRow = {
            ...r,
            [fieldName]: p.newValue,
          };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        }),
      );
    },
    [],
  );

  /**
   * B-003 저장 (fn_save / xfdl:476).
   * V-001 — gfn_isDatasetChanged(ds_menuList) false 차단
   * V-002 — gfn_cpRequired "MENU_ID MENU_SEQ MENU_NM OBJECT_ID" 4 필수 컬럼 검증
   * V-003 — confirm "저장하시겠습니까?" (To-Be 등가: 즉시 저장, M-009 info 후속)
   */
  const handleSave = useCallback(async () => {
    // V-001
    if (!hasAnyChanges) {
      setError("저장할 데이터가 없습니다.");
      return;
    }
    // V-002 — 4 필수 컬럼 (MENU_ID / MENU_SEQ / MENU_NM / OBJECT_ID)
    for (const r of rows) {
      if (!r.nativeeditor_status) continue;
      if (r.nativeeditor_status === "deleted") continue;
      if (!r.MENU_ID || String(r.MENU_ID).trim().length === 0) {
        setError("MENU_ID 는 필수 입력입니다.");
        return;
      }
      if (!r.MENU_SEQ || String(r.MENU_SEQ).trim().length === 0) {
        setError("MENU_SEQ 는 필수 입력입니다.");
        return;
      }
      if (!r.MENU_NM || String(r.MENU_NM).trim().length === 0) {
        setError("MENU_NM 는 필수 입력입니다.");
        return;
      }
      if (!r.OBJECT_ID || String(r.OBJECT_ID).trim().length === 0) {
        setError("OBJECT_ID 는 필수 입력입니다.");
        return;
      }
      // V-005 (2026-09-04, TE-006) — 상위 폴더 필수.
      //   행추가는 PARENT_MENU_ID 를 선택된 트리 노드에서 가져온다(selectedTreeMenuId ?? ""). 트리에서
      //   아무것도 고르지 않은 채 추가하면 빈 값으로 전송되고, 예전 BE 는 그걸 자기참조(MENU_ID)로 저장해
      //   트리에도 안 잡히고 화면도 안 열리는 행을 만들었다. 지금은 BE 가 거부하지만, 저장 버튼을 누르기
      //   전에 여기서 막아야 사용자가 원인(트리 미선택)을 바로 안다.
      if (!r.PARENT_MENU_ID || String(r.PARENT_MENU_ID).trim().length === 0) {
        setError(
          `상위 폴더가 지정되지 않았습니다 (MENU_ID=${String(r.MENU_ID)}). ` +
            "좌측 메뉴 구조 트리에서 그룹 폴더를 먼저 선택한 뒤 행을 추가하세요.",
        );
        return;
      }
      // 자기참조 방어 — 과거 데이터나 수기 입력으로 들어올 수 있다. 화면 leaf 의 부모는 항상 그룹 폴더다.
      if (String(r.PARENT_MENU_ID).trim() === String(r.MENU_ID).trim()) {
        setError(
          `상위 폴더가 자기 자신을 가리킵니다 (MENU_ID=${String(r.MENU_ID)}). ` +
            "좌측 트리에서 그룹 폴더를 선택한 뒤 다시 시도하세요.",
        );
        return;
      }
    }

    if (typeof window !== "undefined" && !window.confirm("저장하시겠습니까?")) return;

    setIsSaving(true);
    setError(null);
    try {
      const payload = rows
        .filter((r) => r.nativeeditor_status)
        .map((r) => ({
          ...stripInternal(r),
          rowStatus: r.nativeeditor_status,
        })) as unknown as CommMenuMngRow[];
      const res = await apiSaveCmMenu(payload);
      // M-008 + M-009 (As-Is "{cnt}건 조회 되었습니다." 문구 보존 → 본 UI 는 "저장" 단어 명시)
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      const refreshed = (res.ds_menuList ?? []).map((r, i) => ({
        ...withSyntheticId(r, i),
        nativeeditor_status: "" as RowStatus,
      }));
      setRows(refreshed);
      setSelectedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패 하였습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [rows, hasAnyChanges, showMessage]);

  /** Detail 필드 변경 — handleCellChange 위임. */
  const updateDetailField = (field: keyof CommMenuMngRow, value: string) => {
    if (!selected) return;
    handleCellChange({ rowKey: getRowKey(selected), field: String(field), newValue: value });
  };

  const isNewRow = selected?.nativeeditor_status === "inserted";

  // ── OBJECT_ID LoV (AsIs commonDynamic.xfdl / div_object_id) ──
  // AsIs CommMenuMng_onload (xfdl:385~399):
  //   commonDynamic_onload(this, "S", "commonList", "csa::CommMenuMng", "ds_menuObjLst",
  //                        "OBJECT_ID, OBJECT_NM, FORM_URL", "OBJECTID, OBJECT명, FORM URL",
  //                        "OBJECT 조회", "OBJECT_ID", "OBJECT_NM", "edt_OBJECT_ID",
  //                        "fn_callBack", "1")
  // ToBe 등가: Detail OBJECT_ID 옆 "검색" 버튼 → 팝업 (검색 input + 결과 list 3 컬럼: OBJECT_ID/OBJECT_NM/FORM_URL).
  // 클릭 시 ds_menuList OBJECT_ID 세트 (AsIs fn_callBack case "commonList" xfdl:636).
  const openObjectLov = useCallback(() => {
    if (!selected) {
      setError("OBJECT 를 적용할 행을 먼저 선택하세요.");
      return;
    }
    setLovQuery("");
    setLovRows([]);
    setLovSelectedKey(null);
    setLovOpen(true);
  }, [selected]);

  const handleLovSearch = useCallback(async () => {
    setLovLoading(true);
    try {
      const res = await apiCommonList(lovQuery);
      setLovRows(res.ds_menuObjLst ?? []);
      setLovSelectedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OBJECT 조회 실패");
      setLovRows([]);
    } finally {
      setLovLoading(false);
    }
  }, [lovQuery]);

  /**
   * OBJECT LoV 선택 — 2026-06-04 round 5 (사용자 결정):
   *  - OBJECT_ID 세트 + 상위 폴더 (PARENT_MENU_ID) 자동 동기 세트.
   *  - BE selectMenuObjPop SQL 이 row.PARENT_MENU_ID 동봉 (TB_MCM_SEC_MENU 매핑 1행). NULL → 빈 문자열.
   *  - AsIs commonDynamic fn_callBack "commonList" 경로에서는 OBJECT_ID 만 세트했으나, 사용자 결정에 의해
   *    상위 폴더 매핑까지 같은 모달 클릭으로 끝내기 위한 ToBe 확장 (Detail D-008 PARENT_MENU_ID 도 동기).
   */
  const handleLovPick = useCallback(
    (row: CommMenuMngObjLovRow) => {
      if (selected) {
        updateDetailField("OBJECT_ID", String(row.OBJECT_ID ?? ""));
        updateDetailField("PARENT_MENU_ID", String(row.PARENT_MENU_ID ?? ""));
      }
      setLovOpen(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  // ── 2026-06-04 사용자 지시 — "메뉴 필드 관리" 팝업 핸들러 (그리드 batch) ──
  const getFldRowKey = useCallback((r: CommMenuMngFldRow & GridRow): string => {
    return (r.__gridTempId as string) || (r.__rowId as string) || String(r.MENU_ID ?? "");
  }, []);

  const openFldMng = useCallback(async () => {
    setFldOpen(true);
    setFldLoading(true);
    setFldSelectedKey(null);
    try {
      const res = await apiSearchCmMenuFld();
      const list = (res.ds_menuFldList ?? []).map((r, i) => ({
        ...r,
        // NULL(구 시드 폴더) → 'Y' 승격. BE 도 동일 정규화를 하지만 stale BE 대비 방어.
        MENU_VIEW_YN: normalizeViewYn(r.MENU_VIEW_YN),
        __rowId: `fld-${i}-${String(r.MENU_ID ?? "")}`,
        nativeeditor_status: "" as const,
      }));
      setFldRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "메뉴 필드 조회 실패");
      setFldRows([]);
    } finally {
      setFldLoading(false);
    }
  }, []);

  /** 그리드 행추가 / 행복사 / 행삭제 통합 핸들러 (GridPanel onDataChange 시그니처). */
  const handleFldDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        const source = newData.find((r) => (r as GridRow).__gridTempId === addedRowKey) as
          | Partial<CommMenuMngFldRow>
          | undefined;
        setFldRows((prev) => {
          const base = source ?? {};
          const newRow: CommMenuMngFldRow & GridRow = {
            MENU_SEQ: "",
            MENU_NM: "",
            PARENT_MENU_ID: selectedTreeMenuId ?? "",
            ...base,
            // 표시 여부 default = 'Y'(표시). 빈 값으로 저장되면 NULL 이 들어가 다른 그룹과 결이 달라진다.
            // 행복사 source 가 'N' 이면 그대로 승계 (복사 의미 보존).
            MENU_VIEW_YN: normalizeViewYn(base.MENU_VIEW_YN),
            // 행복사 source 가 PK 들고 있어도 충돌 방지 위해 빈 값 강제
            MENU_ID: "",
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as const,
          };
          return [...prev, newRow];
        });
        setFldSelectedKey(addedRowKey);
      } else {
        setFldRows((prev) => {
          const newKeys = new Set(newData.map((r) => getFldRowKey(r as CommMenuMngFldRow & GridRow)));
          const removed = prev.filter((r) => !newKeys.has(getFldRowKey(r)));
          const kept = newData as (CommMenuMngFldRow & GridRow)[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as const }));
          return [...kept, ...deleted];
        });
      }
    },
    [selectedTreeMenuId, getFldRowKey],
  );

  /** 인라인 셀 편집. PK MENU_ID 는 신규 행만 편집 (정합 정책). */
  const handleFldCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setFldRows((prev) =>
        prev.map((r) => {
          if (getFldRowKey(r) !== String(p.rowKey)) return r;
          const fieldName = String(p.field);
          if (fieldName === "MENU_ID" && r.nativeeditor_status !== "inserted") return r;
          // MENU_SEQ — 2026-06-05 사용자 지시: 숫자만 허용 (저장 시 BE 가 '0' LPAD 8자리).
          const nextValue =
            fieldName === "MENU_SEQ"
              ? String(p.newValue ?? "").replace(/[^0-9]/g, "").slice(0, 8)
              : p.newValue;
          const updated: CommMenuMngFldRow & GridRow = { ...r, [fieldName]: nextValue };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        }),
      );
    },
    [getFldRowKey],
  );

  /** 행취소 — 단일 선택 행 변경 취소 (inserted → 제거 / updated/deleted → status reset). */
  const handleFldRowCancel = useCallback(() => {
    if (!fldSelectedKey) { setError("취소할 행을 선택하세요."); return; }
    setFldRows((prev) => {
      const target = prev.find((r) => getFldRowKey(r) === fldSelectedKey);
      if (!target?.nativeeditor_status) { setError("변경된 행이 아닙니다."); return prev; }
      if (target.nativeeditor_status === "inserted") {
        return prev.filter((r) => getFldRowKey(r) !== fldSelectedKey);
      }
      return prev.map((r) => (getFldRowKey(r) === fldSelectedKey ? { ...r, nativeeditor_status: "" as const } : r));
    });
    setFldSelectedKey(null);
  }, [fldSelectedKey, getFldRowKey]);

  const handleFldSave = useCallback(async () => {
    if (!fldRows.some((r) => r.nativeeditor_status)) { setError("저장할 변경이 없습니다."); return; }
    // FE 필수 검증
    for (const r of fldRows) {
      const st = r.nativeeditor_status;
      if (st === "deleted") continue;
      if (!st) continue;
      if (!String(r.MENU_ID ?? "").trim()) { setError("MENU_ID 는 필수입니다."); return; }
      if (!String(r.MENU_SEQ ?? "").trim()) { setError(`MENU_SEQ 는 필수입니다 (MENU_ID=${r.MENU_ID}).`); return; }
      if (!String(r.MENU_NM ?? "").trim()) { setError(`MENU_NM 은 필수입니다 (MENU_ID=${r.MENU_ID}).`); return; }
    }
    setFldSaving(true);
    try {
      const payload = fldRows.map((r) => ({
        MENU_ID: String(r.MENU_ID ?? ""),
        MENU_SEQ: String(r.MENU_SEQ ?? ""),
        MENU_NM: String(r.MENU_NM ?? ""),
        PARENT_MENU_ID: r.PARENT_MENU_ID == null ? "" : String(r.PARENT_MENU_ID),
        // 표시 여부 — 'Y'/'N' 로 정규화해서 송신 (빈 문자열이 VARCHAR(1) 에 들어가는 것을 차단).
        MENU_VIEW_YN: normalizeViewYn(r.MENU_VIEW_YN),
        nativeeditor_status: r.nativeeditor_status ?? "",
      })) as CommMenuMngFldRow[];
      const res = await apiSaveCmMenuFld(payload);
      // 응답 ds_menuFldList 로 그리드 즉시 갱신
      const list = (res.ds_menuFldList ?? []).map((r, i) => ({
        ...r,
        MENU_VIEW_YN: normalizeViewYn(r.MENU_VIEW_YN),
        __rowId: `fld-${i}-${String(r.MENU_ID ?? "")}`,
        nativeeditor_status: "" as const,
      }));
      setFldRows(list);
      setFldSelectedKey(null);
      // 외부 트리도 갱신 (좌측 메뉴 구조)
      const grp = await apiSearchMenuGrp();
      if (grp.ds_menuTreeList) {
        setTreeRows(grp.ds_menuTreeList);
        const { allIds } = buildMenuTree(grp.ds_menuTreeList);
        setExpandedTreeIds(allIds);
      }
      showMessage({ message: `저장 완료 (insert=${res.cnt_insert ?? 0} / update=${res.cnt_update ?? 0} / delete=${res.cnt_delete ?? 0})`, alertType: "info" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "메뉴 필드 저장 실패");
    } finally {
      setFldSaving(false);
    }
  }, [fldRows, showMessage]);

  return (
    <PageLayout
      title="메뉴 관리"
      breadcrumb="공통관리 > 시스템관리 > 메뉴 관리"
      objId="commMenuMng"
      // 2026-06-02 iter#5 W5 패턴 E — AsIs xfdl:362 commonTop 4 버튼 정합 (조회/초기화/저장/닫기).
      // - 권한 기반 활성화는 PageLayout 의 objId+action RBAC 가 결정.
      // - !hasAnyChanges 사전 disabled 제거 — 핸들러가 V-001 검증 후 ErrorModal 로 차단 (AsIs onclick 정합).
      // - isSaving/isSearching 만 유지 (double-click 방지).
      buttons={[
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
          disabled: isSaving,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="메뉴 ID"
          value={filters.edt_MENU_ID}
          onChange={(v) => handleFilterChange("edt_MENU_ID", v)}
        />
        <SearchField
          label="메뉴 명"
          value={filters.edt_MENU_NM}
          onChange={(v) => handleFilterChange("edt_MENU_NM", v)}
        />
        <SearchField
          label="사용 유무"
          type="select"
          options={USE_TP_SEARCH_OPTIONS}
          value={filters.cbo_USE_TP}
          onChange={(v) => handleFilterChange("cbo_USE_TP", v)}
        />
      </SearchArea>

      {/* 2026-06-02 iter#5 W5 패턴 A — 3 panel:
            좌(트리 width=260 고정) / 중(메인 그리드 + OBJECT, flex:1 wider) / 우(Detail width=420 narrow). */}
      <ContentBody root>
        {/* 좌: 메뉴 트리 (A-MAIN-TREE / GT-NNN) — AsIs xfdl:87 grd_M0F1 binddataset="ds_menuTreeList"
              treeinitstatus="expand,all" edittype="tree" 등가.
              ToBe: shared Tree (TreeNode nested + expand/collapse + 키보드 ArrowDown/Up/Left/Right). */}
        <ContentPanel width={260}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              border: "1px solid #d4dae0",
              background: "#fff",
              height: "100%",
              overflow: "hidden",
            }}
          >
            {/* 트리 패널 헤더 — GridPanel 동등 표시 + 2026-06-04 사용자 지시 "필드 추가" 버튼 */}
            <div
              style={{
                height: 32,
                background: "#f4f6f8",
                borderBottom: "1px solid #d4dae0",
                padding: "0 8px 0 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontWeight: 600,
                fontSize: 13,
                color: "#333",
                flexShrink: 0,
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>메뉴 구조</span>
                <span style={{ fontWeight: 400, color: "#666" }}>{treeRows.length}건</span>
              </div>
              <button
                type="button"
                onClick={() => void openFldMng()}
                style={{
                  border: "1px solid var(--color-primary, #337ab7)",
                  background: "var(--color-primary, #337ab7)",
                  color: "#fff",
                  padding: "2px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  borderRadius: 2,
                }}
              >
                필드 관리
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
              {tree.nodes.length > 0 ? (
                <Tree
                  items={tree.nodes}
                  expandedItems={expandedTreeIds}
                  selectedItems={selectedTreeMenuId ? [selectedTreeMenuId] : []}
                  onExpandedItemsChange={handleTreeExpand}
                  onSelectedItemsChange={handleTreeSelect}
                />
              ) : (
                <div style={{ padding: 16, color: "#888", fontSize: 12 }}>메뉴 트리가 없습니다.</div>
              )}
            </div>
          </div>
        </ContentPanel>

        {/* 중앙: 메뉴 리스트 + OBJECT 그리드 (A-MAIN-LIST + A-MAIN-OBJECT) — flex:1 wider */}
        <ContentPanel>
          <GridPanel
            title="메뉴 목록"
            count={visibleCount}
            showAddButton
            showCopyButton
            showDeleteButton
            buttons={[
              {
                id: "btn_rowCancel",
                label: "행취소",
                onClick: handleRowCancel,
                disabled: isSearching || isSaving,
              },
            ]}
            data={rows}
            rowKey="__rowId"
            columns={MENU_LIST_COLUMNS}
            selectedRowKey={selectedKey}
            onDataChange={handleDataChange}
            loading={isSaving}
          >
            <AgDataGrid
              columnSizing="fit"
              columns={MENU_LIST_COLUMNS}
              data={rows}
              rowKey="__rowId"
              sortable
              highlightedRowKey={selectedKey}
              onRowClick={(row) => void handleListRowClick(row as GridRow)}
              onCellValueChanged={handleCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage="조회된 메뉴가 없습니다."
            />
          </GridPanel>

          <div style={{ marginTop: 8 }}>
            <GridPanel
              title="OBJECT 정보"
              count={objRows.length}
              data={objRows}
              rowKey="__objRowId"
              columns={OBJ_COLUMNS}
            >
              <AgDataGrid
                columnSizing="fit"
                columns={OBJ_COLUMNS}
                data={objRows.map((r, i) => ({ ...r, __objRowId: `obj-${i}` }))}
                rowKey="__objRowId"
                sortable={false}
                emptyMessage="OBJECT 정보가 없습니다."
              />
            </GridPanel>
          </div>
        </ContentPanel>

        {/* 우: 상세 폼 (A-MAIN-DETAIL / D-001~D-018) — 2026-06-02 iter#5 W5 패턴 A/B:
              - Detail narrow (width=420 — W5 commUserMng width=480 보다 좁게: commMenuMng 은 메인 그리드 + OBJECT 가 중앙에 더 많은 공간 필요).
              - B Detail wrapper: marginTop:32 (panel-header 자리 비움) + height:auto + border #d4dae0 + bg #fff
              - 28px 회색 헤더 "상세 정보" — 양 그리드의 column-header (메뉴순서|...) 라인과 정렬.
              - 폼 본문 padding:0 + height:auto — 내용물 크기에 맞춤. */}
        <ContentPanel width={420}>
          {selected ? (
            <div style={{
              marginTop: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid #d4dae0",
              background: "#fff",
            }}>
              <div style={{
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
              }}>
                상세 정보
              </div>
              <div style={{ padding: 0, background: "#fff" }}>
                <MenuDetailForm
                  selected={selected}
                  isNewRow={!!isNewRow}
                  updateDetailField={updateDetailField}
                  onObjectLovOpen={openObjectLov}
                  parentFolderOptions={parentFolderOptions}
                />
              </div>
            </div>
          ) : (
            <div style={{
              marginTop: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid #d4dae0",
              background: "#fff",
            }}>
              <div style={{
                height: 28,
                background: "#f4f6f8",
                borderBottom: "1px solid #d4dae0",
                padding: "0 10px",
                display: "flex",
                alignItems: "center",
                fontWeight: 600,
                fontSize: 13,
                color: "#333",
              }}>
                상세 정보
              </div>
              <div style={{ padding: 16, color: "#888", background: "#fff" }}>
                행을 선택하거나 행을 추가하세요.
              </div>
            </div>
          )}
        </ContentPanel>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />

      {/* OBJECT_ID LoV 팝업 — AsIs commonDynamic.xfdl "OBJECT 조회" 등가.
            2026-06-04 — 사용자 지시: commUserMng 부서 검색 (shared LookupModal) 폼 형식과 통일.
            shared Modal + Input + Button + AgDataGrid (LookupModal 본체 구조 mirror). */}
      <Modal open={lovOpen} title="OBJECT 검색" onClose={() => setLovOpen(false)} size="md">
        <style>{`
          .cm-objlov-grid .cm-data-grid,
          .cm-objlov-grid .ag-root-wrapper,
          .cm-objlov-grid .ag-root,
          .cm-objlov-grid .ag-header,
          .cm-objlov-grid .ag-header-cell {
            border-radius: 0 !important;
          }
        `}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 420 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={lovQuery}
              onChange={setLovQuery}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleLovSearch();
                }
              }}
              placeholder="OBJECT ID 또는 OBJECT 명 입력"
              style={{ flex: 1 }}
            />
            <Button onClick={() => void handleLovSearch()} disabled={lovLoading} variant="primary">
              {lovLoading ? "조회중..." : "조회"}
            </Button>
          </div>
          <div className="cm-objlov-grid" style={{ height: 360 }}>
            <AgDataGrid
              columns={[
                { key: "OBJECT_ID", header: "OBJECT ID", width: 160 },
                { key: "OBJECT_NM", header: "OBJECT 명", width: 200 },
                { key: "FORM_URL", header: "FORM URL", width: 220 },
              ]}
              data={lovRows.map((r, i) => ({ ...r, __k: `${r.OBJECT_ID ?? ""}-${i}` })) as unknown as Record<string, unknown>[]}
              rowKey="__k"
              height={360}
              highlightedRowKey={lovSelectedKey}
              onRowClick={(row) => setLovSelectedKey(String((row as { __k?: unknown }).__k ?? ""))}
              onRowDoubleClick={(row) => handleLovPick(row as unknown as CommMenuMngObjLovRow)}
              sizeToFit
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setLovOpen(false)}>취소</Button>
            <Button
              onClick={() => {
                const found = lovRows.find((r, i) => `${r.OBJECT_ID ?? ""}-${i}` === lovSelectedKey);
                if (found) handleLovPick(found);
              }}
              disabled={!lovSelectedKey}
              variant="primary"
            >
              확인
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2026-06-04 사용자 지시 — "메뉴 필드 관리" 팝업 (그리드 batch CRUD).
            TB_MCM_SEC_MENU_FLD 4 컬럼 + 표시 여부(2026-08-13) inline 편집 + 행추가/복사/삭제/취소 + 일괄 저장.
            PK 충돌 시 BE 가 IllegalStateException → FE setError 메시지 노출 (false-positive 회피). */}
      <Modal open={fldOpen} title="메뉴 필드 관리" onClose={() => setFldOpen(false)} size="xl">
        <style>{`
          .cm-fldmng-grid .cm-data-grid,
          .cm-fldmng-grid .ag-root-wrapper,
          .cm-fldmng-grid .ag-root,
          .cm-fldmng-grid .ag-header,
          .cm-fldmng-grid .ag-header-cell { border-radius: 0 !important; }
        `}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", minHeight: 480 }}>
          <GridPanel
            title="메뉴 필드 목록"
            // 모달 내부는 명시 높이 부모가 없어 .grid-panel(height:100% + contain:strict)이 0 으로
            // 붕괴한다 — 인라인 height 로 크기를 확정한다 (헤더 32 + 그리드 360 + 테두리 여유).
            style={{ height: 430, flex: "0 0 auto" }}
            count={fldRows.filter((r) => r.nativeeditor_status !== "deleted").length}
            showAddButton
            showCopyButton
            showDeleteButton
            buttons={[
              { id: "fld_rowCancel", label: "행취소", onClick: handleFldRowCancel, disabled: fldSaving || fldLoading },
            ]}
            data={fldRows}
            rowKey="__rowId"
            // ※ 아래 columns 는 내부 AgDataGrid 의 columns 와 동일해야 한다 (GridPanel = 버튼/카운트 셸,
            //    실제 렌더는 children 의 AgDataGrid). 컬럼 추가·변경 시 두 곳을 반드시 함께 고칠 것.
            columns={[
              { key: "MENU_ID", header: "MENU_ID *", width: 160, editable: true, align: "left" },
              { key: "MENU_SEQ", header: "MENU_SEQ *", width: 140, editable: true, align: "left" },
              { key: "MENU_NM", header: "MENU_NM *", width: 220, editable: true, align: "left" },
              { key: "PARENT_MENU_ID", header: "PARENT_MENU_ID", width: 180, editable: true, align: "left" },
              // FULL SEQ — 2026-06-04 사용자 지시: 자동 부여 (모듈 백만 / 그룹 만). 보기 전용(editable:false).
              { key: "FULL_SEQ", header: "FULL SEQ", width: 110, editable: false, align: "center" },
              // 표시 여부 — 2026-08-13 신설. leaf 화면 D-014 (MENU_LIST_COLUMNS / Detail Radio) 와 동일
              // 라벨·값 도메인(Y=표시 / N=미표시). 폴더를 사이드바에서 숨기려면 여기서 'N' 으로 바꾼다.
              {
                key: "MENU_VIEW_YN",
                header: "표시 여부",
                width: 90,
                editable: true,
                align: "center",
                cellEditor: "select",
                cellEditorValues: ["Y", "N"],
                cellEditorValueLabels: MENU_VIEW_YN_LABEL_MAP,
                render: (v) => MENU_VIEW_YN_LABEL_MAP[normalizeViewYn(v)],
              },
            ]}
            selectedRowKey={fldSelectedKey}
            onDataChange={handleFldDataChange}
            loading={fldSaving || fldLoading}
          >
            <div className="cm-fldmng-grid" style={{ height: 360 }}>
              <AgDataGrid
                // ※ 위 GridPanel 의 columns 와 동일해야 한다 — 컬럼 추가·변경 시 두 곳을 함께 고칠 것.
                columns={[
                  { key: "MENU_ID", header: "MENU_ID *", width: 160, editable: true, align: "left" },
                  { key: "MENU_SEQ", header: "MENU_SEQ *", width: 140, editable: true, align: "left" },
                  { key: "MENU_NM", header: "MENU_NM *", width: 220, editable: true, align: "left" },
                  { key: "PARENT_MENU_ID", header: "PARENT_MENU_ID", width: 180, editable: true, align: "left" },
                  // FULL SEQ — 자동 부여 (BE recomputeMenuFullSeq). 보기 전용(editable:false).
                  { key: "FULL_SEQ", header: "FULL SEQ", width: 110, editable: false, align: "center" },
                  // 표시 여부 — 2026-08-13 신설. leaf 화면 D-014 와 동일 라벨·값 도메인(Y=표시 / N=미표시).
                  // 편집 위젯은 select (자유 텍스트 입력 시 'Y'/'N' 외 값이 들어가는 것을 원천 차단).
                  {
                    key: "MENU_VIEW_YN",
                    header: "표시 여부",
                    width: 90,
                    editable: true,
                    align: "center",
                    cellEditor: "select",
                    cellEditorValues: ["Y", "N"],
                    cellEditorValueLabels: MENU_VIEW_YN_LABEL_MAP,
                    render: (v) => MENU_VIEW_YN_LABEL_MAP[normalizeViewYn(v)],
                  },
                ]}
                data={fldRows.filter((r) => r.nativeeditor_status !== "deleted") as unknown as Record<string, unknown>[]}
                rowKey="__rowId"
                height={360}
                highlightedRowKey={fldSelectedKey}
                onRowClick={(row) => setFldSelectedKey(getFldRowKey(row as CommMenuMngFldRow & GridRow))}
                onCellValueChanged={handleFldCellChange}
                sizeToFit
              />
            </div>
          </GridPanel>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setFldOpen(false)} disabled={fldSaving}>닫기</Button>
            <Button onClick={() => void handleFldSave()} disabled={fldSaving || fldLoading} variant="primary">
              {fldSaving ? "저장중..." : "저장"}
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}

/**
 * 메뉴 관리 상세 폼 — As-Is 스크린샷 정합 + shared 컴포넌트.
 *
 * shared 컴포넌트 적용:
 *   - Input    : 메뉴 ID / 메뉴 순서 / 메뉴명 / OBJECT ID / 상위 폴더 / FULL SEQ / PARAM1~3
 *   - Select   : 메뉴 타입 (D-011 cbo_menu_tp — WEB/MOBIL)
 *   - Radio    : 사용 구분 / 표시 여부 (D-010 / D-014)
 *   - DatePicker: 유효개시일 / 유효기한일 (D-012 / D-013)
 *   - Textarea : 메뉴 설명 (D-015)
 *
 * 2026-06-02 iter#5 W5 패턴 B — DETAIL_TABLE_STYLE / DETAIL_LABEL_CELL / DETAIL_VALUE_CELL = shared layout 정본.
 *   - 메뉴 ID 는 신규 행에서만 편집 (PK readonly 룰).
 */
function MenuDetailForm({
  selected,
  isNewRow,
  updateDetailField,
  onObjectLovOpen,
  parentFolderOptions,
}: {
  selected: CommMenuMngRow & GridRow;
  isNewRow: boolean;
  updateDetailField: (field: keyof CommMenuMngRow, value: string) => void;
  onObjectLovOpen: () => void;
  /** 상위 폴더 Select 옵션 — 좌측 트리와 동일 원천(TB_MCM_SEC_MENU_FLD). */
  parentFolderOptions: { value: string; label: string }[];
}) {
  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        {/* D-002 메뉴 ID (Essential, 신규 행에서만 편집 — AsIs xfdl D-002 PK readonly 룰) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>메뉴 ID *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.MENU_ID ?? "")}
              maxLength={30}
              readOnly={!isNewRow}
              onChange={(v: string) => updateDetailField("MENU_ID", v)}
            />
          </td>
        </tr>
        {/* D-004 메뉴 순서 (Essential, PK#2) — 2026-06-05 사용자 지시:
              숫자만 입력 + 저장 시 BE 가 '0' LPAD 8자리 ("12" → "00000012"). 신규 행만 LPAD (PK 안정성). */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>메뉴 순서 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.MENU_SEQ ?? "")}
              maxLength={8}
              placeholder="숫자만 입력 (저장 시 8자리 0 채움)"
              onChange={(v: string) => updateDetailField("MENU_SEQ", v.replace(/[^0-9]/g, "").slice(0, 8))}
            />
          </td>
        </tr>
        {/* D-006 메뉴명 (Essential) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>메뉴명 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.MENU_NM ?? "")}
              maxLength={300}
              onChange={(v: string) => updateDetailField("MENU_NM", v)}
            />
          </td>
        </tr>
        {/* D-007 OBJECT ID (Essential, AsIs commonDynamic LoV 팝업 — ToBe div_object_id 등가.
              검색 버튼 → OBJECT 조회 모달 → 행 클릭 시 fn_callBack commonList 등가로 OBJECT_ID 세트.
              2026-06-04 round 5 (사용자 결정): readOnly=true 강제 — 직접 타이핑 금지, 검색 버튼으로만 채움.
              OBJECT LoV 선택 시 OBJECT_ID + PARENT_MENU_ID (상위 폴더) 동시 자동 세트. */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>OBJECT ID *</th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <Input
                  value={String(selected.OBJECT_ID ?? "")}
                  maxLength={50}
                  readOnly
                  onChange={(v: string) => updateDetailField("OBJECT_ID", v)}
                />
              </div>
              <button
                type="button"
                onClick={onObjectLovOpen}
                style={{
                  border: "1px solid var(--color-primary, #337ab7)",
                  background: "#fff",
                  color: "var(--color-primary, #337ab7)",
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                검색
              </button>
            </div>
          </td>
        </tr>
        {/* D-008 상위 폴더 — 2026-09-04 (TE-006): readOnly Input → 폴더 Select.
              화면 leaf 는 반드시 그룹 폴더에 매달려야 하는데(R3 트리 분리), 예전에는 이 값을 정하는
              입력란이 화면 어디에도 없었다. 트리 노드 선택에만 의존해 행추가 시점에 암묵적으로 채워졌고,
              비어 있으면 BE 가 자기참조로 저장해 복구 불가능한 행이 됐다.
              옵션은 좌측 트리와 같은 원천(treeRows = TB_MCM_SEC_MENU_FLD)이라 목록이 어긋나지 않는다. */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>상위 폴더 *</th>
          <td style={DETAIL_VALUE_CELL}>
            <Select
              value={String(selected.PARENT_MENU_ID ?? "")}
              options={parentFolderOptions}
              placeholder="(선택)"
              onChange={(v: string) => updateDetailField("PARENT_MENU_ID", v)}
            />
          </td>
        </tr>
        {/* D-009 FULL SEQ — 2026-06-04 사용자 지시: 자동 부여 (모듈 백만 / 그룹 만 / 화면 100+10 인코딩)
              → 보기 전용(readOnly). 저장 시 BE recomputeMenuFullSeq() 가 트리 위치 기준으로 자동 산출. */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>FULL SEQ</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.FULL_SEQ ?? "")}
              readOnly
              placeholder="저장 시 자동 부여"
            />
          </td>
        </tr>
        {/* D-010 사용 구분 (Radio Y/N) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>사용 구분</th>
          <td style={DETAIL_VALUE_CELL}>
            <Radio
              name="USE_TP"
              value={String(selected.USE_TP ?? "Y")}
              options={USE_TP_OPTIONS}
              onChange={(v: string) => updateDetailField("USE_TP", v)}
            />
          </td>
        </tr>
        {/* D-011 메뉴 타입 (Select WEB/MOBIL) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>메뉴 타입</th>
          <td style={DETAIL_VALUE_CELL}>
            <Select
              value={String(selected.MENU_TP ?? "")}
              options={MENU_TP_OPTIONS}
              placeholder="(선택)"
              onChange={(v: string) => updateDetailField("MENU_TP", v)}
            />
          </td>
        </tr>
        {/* D-012 유효개시일 (DatePicker yyyy-MM-dd) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>유효개시일</th>
          <td style={DETAIL_VALUE_CELL}>
            <DatePicker
              value={toDateInputValue(selected.START_ACTIVE_DATE)}
              onChange={(iso: string) => updateDetailField("START_ACTIVE_DATE", fromIsoDate(iso))}
            />
          </td>
        </tr>
        {/* D-013 유효기한일 (DatePicker yyyy-MM-dd) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>유효기한일</th>
          <td style={DETAIL_VALUE_CELL}>
            <DatePicker
              value={toDateInputValue(selected.END_ACTIVE_DATE)}
              onChange={(iso: string) => updateDetailField("END_ACTIVE_DATE", fromIsoDate(iso))}
            />
          </td>
        </tr>
        {/* D-014 표시 여부 (Radio Y/N) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>표시 여부</th>
          <td style={DETAIL_VALUE_CELL}>
            <Radio
              name="MENU_VIEW_YN"
              value={String(selected.MENU_VIEW_YN ?? "Y")}
              options={MENU_VIEW_YN_OPTIONS}
              onChange={(v: string) => updateDetailField("MENU_VIEW_YN", v)}
            />
          </td>
        </tr>
        {/* D-015 메뉴 설명 (Textarea) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>메뉴 설명</th>
          <td style={DETAIL_VALUE_CELL}>
            <Textarea
              value={String(selected.MENU_DESC ?? "")}
              rows={2}
              maxLength={1000}
              onChange={(v: string) => updateDetailField("MENU_DESC", v)}
            />
          </td>
        </tr>
        {/* D-016 PARAM1 */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>PARAM1</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.MENU_PARAM1 ?? "")}
              maxLength={300}
              onChange={(v: string) => updateDetailField("MENU_PARAM1", v)}
            />
          </td>
        </tr>
        {/* D-017 PARAM2 */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>PARAM2</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.MENU_PARAM2 ?? "")}
              maxLength={300}
              onChange={(v: string) => updateDetailField("MENU_PARAM2", v)}
            />
          </td>
        </tr>
        {/* D-018 PARAM3 */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>PARAM3</th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.MENU_PARAM3 ?? "")}
              maxLength={300}
              onChange={(v: string) => updateDetailField("MENU_PARAM3", v)}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
