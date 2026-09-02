/**
 * commMenuMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: POST /api/mcm/oasis/commMenuMng/{action} (BPMN action 5 enum — To-Be 정책 #1 적용)
 *   - searchCmMenu  — 메뉴 리스트 + 메뉴 트리 chain 동시 조회 (ds_menuList + ds_menuTreeList)
 *   - searchMenuGrp — 메뉴 폴더 트리 단독 조회 (ds_menuTreeList)
 *   - saveCmMenu   — 메뉴 일괄 저장 (status 분기) + 후속 재조회
 *   - searchObj    — 선택 메뉴의 OBJECT 정보 조회 (ds_objMng)
 *   - commonList   — OBJECT 팝업 LoV (ds_menuObjLst)
 *
 * 분석리포트 §6 (SQL ID) / §8 (BPMN) / BPMN설계서 §1.1 + §2 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 * W1 commObjMng 정본 패턴 동일.
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  CommMenuMngFilters,
  CommMenuMngObjLovRow,
  CommMenuMngObjRow,
  CommMenuMngRow,
  CommMenuMngTreeRow,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commMenuMng";

interface SearchCmMenuPayload {
  ds_menuList?: CommMenuMngRow[];
  ds_menuTreeList?: CommMenuMngTreeRow[];
}

interface SearchMenuGrpPayload {
  ds_menuTreeList?: CommMenuMngTreeRow[];
}

interface SaveCmMenuPayload {
  cnt_merge?: number;
  ds_menuList?: CommMenuMngRow[];
}

interface SearchObjPayload {
  ds_objMng?: CommMenuMngObjRow[];
}

interface CommonListPayload {
  ds_menuObjLst?: CommMenuMngObjLovRow[];
}

/**
 * Cactus 표준 응답 envelope — CactusResponseConverter 가 Service Map<String,Object> 반환을
 * 다음과 같이 분리:
 *  - 단일 값 (cnt_merge 같은 Number/String) → data.{key}
 *  - List 값 (ds_menuList 같은) → grids.{key}.rows
 *
 * BPMN output="result" + Service Map 반환 패턴: cactus 가 data.result = Map 으로 적재.
 * Map 내부의 List 는 cactus 가 자동 분리 안 함 → FE 가 result 안의 key 들을 그대로 flat 전개
 * (W1 commObjMng / cma masterCodeMng 정본 패턴 그대로).
 */
interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

function unwrapPayload<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  // ★비즈니스 거부 판정 (2026-08-07) — OASIS 실행기는 GlobalExceptionHandler 를 우회해
  //   HTTP 200 + meta.success=false + meta.message 로 실패를 돌려준다. 이 판정이 없으면
  //   저장/조회 실패가 조용히 성공으로 처리돼 "버튼을 눌러도 아무 일이 없는" 증상이 된다
  //   (commMenuMng 저장 미동작의 실제 정체 — BE CoercionException 이 여기서 삼켜지고 있었다).
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  if (env?.grids) {
    for (const [key, val] of Object.entries(env.grids)) {
      out[key] = val?.rows ?? [];
    }
  }
  return out as T;
}

async function callAction<T>(
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Record<string, unknown>[] }>,
): Promise<T> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: {
      meta: { userId: "admin", menuId: "commMenuMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/**
 * action=searchCmMenu — 메뉴 리스트 + 메뉴 트리 chain 동시 조회.
 * BE: searchCmMenuTask → CommMenuMngService.searchCmMenu(CommMenuMngSearchRequest) → ds_menuList + ds_menuTreeList.
 *
 * @param pMenuId 트리 click 시 전달 (정확 일치 검색). 일반 fn_search 시 undefined.
 */
export async function searchCmMenu(
  filters: CommMenuMngFilters,
  pMenuId?: string,
): Promise<SearchCmMenuPayload> {
  return callAction<SearchCmMenuPayload>("search", {
    edtMENUID: filters.edt_MENU_ID,
    edtMENUNM: filters.edt_MENU_NM,
    cboUSETP: filters.cbo_USE_TP,
    pMENUID: pMenuId ?? "",
  });
}

/**
 * action=searchMenuGrp — 메뉴 폴더 트리 단독 조회 (As-Is fn_formAfterOnload).
 * BE: searchMenuGrpTask → CommMenuMngService.searchMenuGrp() → ds_menuTreeList.
 */
export async function searchMenuGrp(): Promise<SearchMenuGrpPayload> {
  return callAction<SearchMenuGrpPayload>("searchMenuGrp", {});
}

/**
 * action=saveCmMenu — 메뉴 일괄 저장 (CactusRequest 표준: grids.master.rows).
 * BE Service.saveCmMenu(List<Map> master) parameter 이름 = grid key `master` 와 일치 (가이드 §6-E-3).
 * 응답: cnt_merge + ds_menuList (재조회 결과 — As-Is fn_callBack saveCmMenu 의 fn_search 자동 재호출 정합).
 */
export async function saveCmMenu(rows: CommMenuMngRow[]): Promise<SaveCmMenuPayload> {
  return callAction<SaveCmMenuPayload>(
    "save",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/**
 * action=searchObj — 선택 메뉴의 OBJECT 정보 조회 (GO-NNN 그리드 갱신).
 * BE: searchObjTask → CommMenuMngService.searchObj(CommMenuMngSearchObjRequest) → ds_objMng.
 */
export async function searchObj(objectId: string): Promise<SearchObjPayload> {
  return callAction<SearchObjPayload>("searchObj", {
    OBJECT_ID: objectId,
  });
}

/**
 * action=commonList — OBJECT 팝업 LoV (P-001 commonDynamic.xfdl 등가).
 * BE: commonListTask → CommMenuMngService.commonList(CommMenuMngCommonListRequest) → ds_menuObjLst.
 */
export async function commonList(edtObjectId: string): Promise<CommonListPayload> {
  return callAction<CommonListPayload>("commonList", {
    edtOBJECTID: edtObjectId,
  });
}

/** 메뉴 필드 row — TB_MCM_SEC_MENU_FLD. */
export interface CommMenuMngFldRow extends Record<string, unknown> {
  MENU_ID: string;
  MENU_SEQ?: string;
  MENU_NM?: string;
  PARENT_MENU_ID?: string | null;
  /**
   * FULL_SEQ — 2026-06-04 사용자 지시: 자동 부여 (모듈 백만 / 그룹 만 인코딩).
   * 저장 시 BE recomputeMenuFullSeq() 가 산출 → 그리드에 read-only 표시. FE 입력 ✗.
   * NUMERIC(10,0) 이라 응답이 number 일 수 있음.
   */
  FULL_SEQ?: string | number | null;
  /**
   * MENU_VIEW_YN — 2026-08-13: 폴더(그룹) 표시/미표시. leaf 화면의 D-014 와 동일한 Y/N 도메인.
   * 'N' 이면 BE SecUserService 가 hiddenYn='Y' 로 변환 → 포털 사이드바 트리에서 제외된다.
   * NULL(구 시드) 은 "표시" 로 동작하므로 BE 응답 시점에 'Y' 로 승격되어 내려온다.
   */
  MENU_VIEW_YN?: string;
  nativeeditor_status?: "" | "inserted" | "updated" | "deleted";
}

interface SearchCmMenuFldPayload {
  ds_menuFldList?: CommMenuMngFldRow[];
}

interface SaveCmMenuFldPayload {
  cnt_insert?: number;
  cnt_update?: number;
  cnt_delete?: number;
  ds_menuFldList?: CommMenuMngFldRow[];
}

/**
 * action=searchCmMenuFld — 2026-06-04 메뉴 필드 관리 팝업 SEARCH.
 * BE: searchCmMenuFldTask → CommMenuMngService.searchCmMenuFld() → ds_menuFldList.
 */
export async function searchCmMenuFld(): Promise<SearchCmMenuFldPayload> {
  return callAction<SearchCmMenuFldPayload>("searchCmMenuFld", {});
}

/**
 * action=saveCmMenuFld — 2026-06-04 메뉴 필드 일괄 저장 (rowStatus 분기).
 * BE: saveCmMenuFldTask → CommMenuMngService.saveCmMenuFld(List<Map> master) → cnt_insert/update/delete + ds_menuFldList.
 */
export async function saveCmMenuFld(rows: CommMenuMngFldRow[]): Promise<SaveCmMenuFldPayload> {
  return callAction<SaveCmMenuFldPayload>(
    "saveCmMenuFld",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

export type {
  SearchCmMenuPayload,
  SearchMenuGrpPayload,
  SaveCmMenuPayload,
  SearchObjPayload,
  CommonListPayload,
  SearchCmMenuFldPayload,
  SaveCmMenuFldPayload,
};
