/**
 * noticeMgmt 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: `POST /api/mls/oasis/noticeMgmt/{action}` (기능설계서 §1.2)
 *   - search       — 목록 조회 (§3)
 *   - save         — 일괄 저장 C/U/D (§5.1 B-003 / B-004)
 *   - changeStatus — 게시상태 변경 (§5.1 B-005)
 * 역할 선택 목록: `POST /api/mcm/oasis/commRoleMng/search` (§12.5)
 *
 * BFF(`m-mcm/app/api/[module]/oasis/[serviceId]/[action]`)가 모듈 WAS 로 프록시하며
 * 인증 헤더 3종(`X-Client-Key` / `X-Authenticated-User` / `X-Authenticated-Role`)을 주입한다.
 * 화면 코드는 그 헤더를 직접 다루지 않는다.
 */
import {
  HttpError,
  apiRequest,
  labelsFrom,
  unwrapOasis,
  type CactusErrorDetail,
  type OasisUnwrapOptions,
} from "@dk-oasis/shared/http";

import {
  SCREEN_ID,
  type NoticeMgmtFilters,
  type NoticeRow,
  type NoticeSaveRow,
  type RoleOption,
} from "./types";

const OASIS_BASE = "/api/mls/oasis/noticeMgmt";
const ROLE_SEARCH_URL = "/api/mcm/oasis/commRoleMng/search";

/** 서버 오류 상세 한 건 — `toFieldErrors`(@dk-oasis/shared/http)가 읽는 cactus `ErrorDetail` 모양. */
export type NoticeErrorDetail = CactusErrorDetail & {
  message: string;
};

export interface NoticeMgmtPayload {
  list?: NoticeRow[];
  cntMerge?: number;
  /** save 응답 — 저장한 NOTICE_ID(입력 행 순서). 백엔드가 아직 주지 않으면 없다. */
  savedIds?: string[];
}

/**
 * 서버 오류 필드 코드 → 화면 항목명. 사용자에게 컬럼 코드를 보이지 않는다(Local-Rules §13). `labelsFrom` 이 field 를
 * 원문 → 대문자 → camel→대문자 snake 순으로 찾으므로 키는 대문자 물리명 하나다. 맵에 없는 field 는 메시지만 보인다.
 */
const FIELD_LABEL: Record<string, string> = {
  NOTICE_ID: "공지번호",
  TITLE: "제목",
  CONTENT: "본문",
  NOTICE_STATUS: "게시상태",
  POST_START_DT: "게시시작일",
  POST_END_DT: "게시종료일",
  CONTENT_FORMAT: "본문 형식",
  NOTICE_CATEGORY: "분류",
  PIN_YN: "상단 고정",
  TARGET_SCOPE: "게시 대상",
  TARGET_ROLES: "대상 역할",
};

/** 예외·SQL 원문처럼 보이는 글은 사용자 문장으로 쓰지 않는다(Local-Rules §13). */
const TECHNICAL_TEXT =
  /exception|java\.|\bat [\w.$]+\(|sqlite_|ora-\d|sqlstate|stack ?trace|null ?pointer/i;

function isUserSentence(text: string | undefined): text is string {
  return !!text && !!text.trim() && !TECHNICAL_TEXT.test(text);
}

/**
 * 서버가 업무 규칙으로 거부한 요청 — `message` 는 사용자에게 그대로 보여도 되는 문장이다.
 * `field` 는 첫 오류 필드 코드(있으면).
 */
export class NoticeApiError extends Error {
  readonly field?: string;
  /**
   * 서버가 준 칸·행 오류 상세(사용자 문장인 것만). 화면이 `toFieldErrors(e, "master")` 로 입력 칸 오류로 바꿔 보인다.
   * `message` 는 이 상세를 항목명과 함께 한 문장으로 이은 것이라 칸 표시와 겹쳐도 된다.
   */
  readonly errors: NoticeErrorDetail[];

  constructor(
    message: string,
    field?: string,
    errors: NoticeErrorDetail[] = [],
  ) {
    super(message);
    this.name = "NoticeApiError";
    this.field = field;
    this.errors = errors;
  }
}

/**
 * 응답 봉투 해제 + **비즈니스 거부 판정** — `@dk-oasis/shared/http` 공통 계약(unwrapOasis)에 이 화면의 옵션을 준다.
 *
 * ★ OASIS 실행기는 `BusinessException` 을 잡아 HTTP 200 + `meta.success=false` 로 되돌려준다.
 *   `apiRequest` 는 `!res.ok` 일 때만 throw 하므로, 이 판정이 없으면 저장 실패가 조용히 성공으로
 *   처리돼 "버튼을 눌러도 아무 일이 없는" 증상이 된다.
 *
 * - 성공: BE 가 `Map<String,Object>` 를 반환하고 BPMN 이 `output="result"` 이므로 결과는 `data.result` 안에 통째로
 *   들어온다(cactus 는 Map 내부 List 를 자동 분리하지 않는다, BackEnd 표준 §6-D-2). data 전체 위에 `result` 를 덮어
 *   펴고, 응답 `grids.<이름>.rows` 도 `<이름>` 으로 올린다.
 * - 거부: 문구는 m-mdm 과 같은 통일 형식 `기본 문구 + "\n- 항목명: 메시지"` 다. 행·필드 단위 상세(`errors[]`)가 오면
 *   항목명을 붙여 덧붙이고(항목명을 모르면 메시지만), 기본 문구에 이미 든 메시지는 뺀다. 원문처럼 보이는 글은 버린다.
 *   오류는 {@link NoticeApiError} — `errors` 는 사용자 문장인 상세 원본(field 코드 포함)이라 칸 오류 표시에 그대로 쓴다.
 */
const UNWRAP: OasisUnwrapOptions = {
  merge: "data+result",
  includeGrids: true,
  isUserSentence,
  fieldLabel: labelsFrom(FIELD_LABEL),
  errorFactory: (message, _code, errors, field) =>
    new NoticeApiError(message, field, errors as NoticeErrorDetail[]),
};

/**
 * POST — 본문 `{ meta:{ menuId: SCREEN_ID }, params, grids? }`. params 는 거르지 않는다(null 도 싣는다).
 * 다른 서비스(역할 목록)를 불러도 menuId 는 이 화면 ID 다(화면 메뉴 권한으로 부른다).
 */
async function post(
  url: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: unknown[] }>,
): Promise<Record<string, unknown>> {
  const res = await apiRequest<unknown>(url, {
    method: "POST",
    body: JSON.stringify({
      meta: { menuId: SCREEN_ID },
      params,
      ...(grids ? { grids } : {}),
    }),
  });
  return unwrapOasis(res, UNWRAP);
}

async function callAction(
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: unknown[] }>,
): Promise<NoticeMgmtPayload> {
  return (await post(
    `${OASIS_BASE}/${action}`,
    params,
    grids,
  )) as NoticeMgmtPayload;
}

/** action=search — §3 조회조건 S-001~S-006 으로 목록 조회 (B-001). 빈 값 = 전체. */
export async function searchNotices(
  filters: NoticeMgmtFilters,
): Promise<NoticeMgmtPayload> {
  return callAction("search", {
    title: filters.title,
    noticeStatus: filters.noticeStatus,
    postStartDt: filters.postStartDt,
    postEndDt: filters.postEndDt,
    noticeCategory: filters.noticeCategory,
    contentFormat: filters.contentFormat,
  });
}

/**
 * action=save — 변경 행 저장 (B-003 / B-004). 응답 `list` 는 조회조건과 무관한 전체 목록이다.
 *
 * ★ 최상위 grid 키 `master` 는 BE 메서드 파라미터명(`List<Map> master`)과 **글자 단위로 같아야** 한다.
 * ★ 배열을 `params` 에 실으면 안 된다 — `CactusRequestConverter` 가 TypeReference 없이 감싸 죽는다. 반드시 `grids`.
 *   `TARGET_ROLES` 도 행 안의 배열로 보낸다(서버가 JSON 배열·콤마 문자열을 모두 받는다).
 */
export async function saveNotices(
  rows: NoticeSaveRow[],
): Promise<NoticeMgmtPayload> {
  return callAction("save", {}, { master: { rows } });
}

/** 삭제 — save 에 rowStatus=deleted 한 행. */
export async function deleteNotice(
  noticeId: string,
): Promise<NoticeMgmtPayload> {
  return callAction(
    "save",
    {},
    { master: { rows: [{ NOTICE_ID: noticeId, rowStatus: "deleted" }] } },
  );
}

/** action=changeStatus — 게시상태 변경 (B-005 게시중지). */
export async function changeNoticeStatus(
  noticeId: string,
  noticeStatus: string,
): Promise<NoticeMgmtPayload> {
  return callAction("changeStatus", { noticeId, noticeStatus });
}

/** 역할 선택 목록 — 사용 중(`cboUSETP=Y`) 역할만. 응답 `data.result.ds_main[]`. */
export async function searchRoles(): Promise<RoleOption[]> {
  const out = await post(ROLE_SEARCH_URL, { cboUSETP: "Y" });
  const list = Array.isArray(out.ds_main)
    ? (out.ds_main as Record<string, unknown>[])
    : [];
  return list
    .map((r) => ({
      ROLE_ID: String(r.ROLE_ID ?? "").trim(),
      ROLE_NM: String(r.ROLE_NM ?? "").trim(),
      ROLE_DESC: r.ROLE_DESC == null ? null : String(r.ROLE_DESC),
    }))
    .filter((r) => r.ROLE_ID);
}

/**
 * 오류를 사용자 문장으로 바꾼다(Local-Rules §13 — 예외 원문을 싣지 않는다).
 * 업무 거부는 서버 문장, 권한·인증은 정해진 문장, 그 밖에는 `fallback`.
 */
export function toUserMessage(e: unknown, fallback: string): string {
  if (e instanceof NoticeApiError) return e.message;
  if (e instanceof HttpError) {
    if (e.status === 401) return "인증이 만료되었습니다. 다시 로그인하세요.";
    if (e.status === 403) return "이 작업을 할 권한이 없습니다.";
  }
  return fallback;
}
