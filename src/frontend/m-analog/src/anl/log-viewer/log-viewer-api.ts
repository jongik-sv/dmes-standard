/**
 * 로그 분석 (anl/logViewer) — BE 호출 계층.
 * BFF 경유 base = /api/analog/rest/logViewer/search — REST 신경로 규약(2026-07-28):
 * permKey `analog/logviewer/search` 로 RBAC 검사 후, BFF 가 objId/action 을 제외한 backendPath 만 analog WAS 로 전달.
 *
 * 엔드포인트 5종 (원본 AnlaogMainPage.js bindUrl/extractCond 이식):
 *  - GET api/meta                     : 모듈 콤보/스테이지 타이틀 메타
 *  - GET log/range/time               : 로그 텍스트 + 서비스 목록
 *  - GET log/range/time/tree          : 구조화(JSON) 로그
 *  - GET log/range/time/download      : 파일 다운로드 (URL 만 조립 — window.open 용)
 *  - GET log/refresh                  : 실시간 로그 다시 가져오기 (응답 = 텍스트)
 */

import { apiRequest } from "@dk-oasis/shared/http";
import { base64EncodeUnicode } from "./string-util";
import type {
  AnalogMeta,
  LogSearchParams,
  LogSearchResult,
  ServiceItem,
} from "./types";

const BASE = "/api/analog/rest/logViewer/search";

/** BE 원시 서비스 행 — 오류 필드가 error(원본 BE) / isError({CLIENT} BE 초안) 두 형태 관측. */
interface RawServiceItem {
  serviceName?: string;
  serviceTag?: string;
  startTime?: string;
  endTime?: string;
  runTime?: number;
  action?: string;
  error?: boolean;
  isError?: boolean;
}

interface RawLogSearchResult {
  log?: string;
  serviceList?: RawServiceItem[];
}

function normalizeServiceItem(raw: RawServiceItem): ServiceItem {
  return {
    serviceName: raw.serviceName ?? "",
    serviceTag: raw.serviceTag ?? "",
    startTime: raw.startTime ?? "",
    endTime: raw.endTime ?? "",
    runTime: raw.runTime,
    action: raw.action,
    error: raw.error ?? raw.isError ?? false,
  };
}

/** 공통 쿼리스트링 — keyword 는 UTF-8 안전 base64 인코딩(원본 정책 유지). */
function buildQuery(params: LogSearchParams): string {
  const q = new URLSearchParams({
    from: params.from,
    to: params.to,
    keyword: base64EncodeUnicode(params.keyword),
    serverType: params.serverType,
    module: params.module,
    ignoreCase: String(params.ignoreCase),
    byThread: String(params.byThread),
    clientType: params.clientType,
  });
  return q.toString();
}

/** GET api/meta — 모듈 목록/스테이지 타이틀. */
export async function fetchAnalogMeta(): Promise<AnalogMeta> {
  return apiRequest<AnalogMeta>(`${BASE}/api/meta`);
}

/** GET log/range/time — 로그 텍스트 + 서비스 목록. */
export async function searchLogRangeTime(
  params: LogSearchParams,
): Promise<LogSearchResult> {
  const raw = await apiRequest<RawLogSearchResult>(
    `${BASE}/log/range/time?${buildQuery(params)}`,
  );
  return {
    log: raw.log ?? "",
    serviceList: (raw.serviceList ?? []).map(normalizeServiceItem),
  };
}

/** GET log/range/time/tree — 구조화(JSON) 로그. 응답 구조는 BE 정의 그대로 트리 뷰에 전달. */
export async function fetchLogRangeTimeTree(
  params: LogSearchParams,
): Promise<unknown> {
  return apiRequest<unknown>(
    `${BASE}/log/range/time/tree?${buildQuery(params)}`,
  );
}

/** 다운로드 URL 조립 — 인증이 세션 쿠키 기반(BFF proxy)이라 window.open(url) 으로 받는다. */
export function buildDownloadUrl(params: LogSearchParams): string {
  return `${BASE}/log/range/time/download?${buildQuery(params)}`;
}

/**
 * GET log/refresh — 실시간 로그 다시 가져오기.
 * 응답이 JSON 이 아닌 평문 텍스트라 apiRequest(JSON 전용)를 쓰지 못하는 예외 지점이다.
 * BFF 인증은 세션 쿠키(same-origin 기본 포함)로 처리되므로 순수 fetch 로 충분하다.
 * (원본의 `log/refresh?&module=` 오타는 `?module=` 로 고침)
 */
export async function refreshRealtimeLog(module: string): Promise<string> {
  const q = new URLSearchParams({ module, clientType: "app" });
  let res: Response;
  try {
    res = await fetch(`${BASE}/log/refresh?${q.toString()}`);
  } catch {
    throw new Error(
      "서버와 연결할 수 없습니다. 네트워크 또는 서버 상태를 확인해 주세요.",
    );
  }
  if (!res.ok) {
    throw new Error(
      `실시간 로그 갱신 요청이 실패했습니다. (HTTP ${res.status})`,
    );
  }
  return res.text();
}
