/**
 * BFF API 경로 모양 검사 — 서버 전용(proxy.ts·be-proxy.ts).
 *
 * <p>proxy 는 권한을 원래 경로의 접두로 판정하는데, 라우트는 경로 조각을 디코드해 BE URL 을 만든다. 그래서 인코딩된 구분자가
 * 섞이면 둘이 보는 경로가 갈라진다(2026-10-03 보안 지적):
 * <ul>
 *   <li>`/api/mcm/oasis/noticeBoard/search%2F..%2F..%2FnoticeMgmt%2Fsave` — proxy 는 로그인만 보는 noticeBoard/search 로 보고,
 *       라우트는 action=`search/../../noticeMgmt/save` 를 붙여 fetch 가 `/oasis/noticeMgmt/save` 로 정리했다.</li>
 *   <li>`%5C`(역슬래시)도 같다 — fetch 는 http URL 의 `\` 를 `/` 로 바꾼다.</li>
 *   <li>`/…/search/..;/..;/…` — `..;` 는 WHATWG 기준 점 조각이 아니라 proxy 를 그대로 지나 BE 까지 가는데,
 *       Tomcat 은 조각의 `;…`(경로 매개변수)를 떼고 `..` 로 정리한다.</li>
 * </ul>
 *
 * <p>그래서 `/api/` 경로에 인코딩된 `/`·`\`·`.`·`;`(대소문자 무관, `%252F` 같은 이중·다중 인코딩 포함), 날 `\`·`;`,
 * 경로 조각 `.`·`..` 가 있으면 권한 판정 전에 400 으로 거절한다.
 * 정상 호출부는 이런 글자를 쓰지 않는다 — 경로 조각은 영문·숫자 이름이고 `encodeURIComponent` 는 `.` 를 인코딩하지 않으며,
 * 파일 이름의 점(`report.v2.xlsx`)·한글 인코딩(`%ED%95%9C`)·조회 문자열(`?a=1;b`)은 걸리지 않는다.
 *
 * <p>날 `.`·`..` 조각은 Next 가 proxy 에 넘기기 전에 정리해서(NextURL = WHATWG URL) proxy 에서는 보이지 않는다. 라우트 매처는 정리 전
 * 경로로 조각을 나누므로, 같은 검사를 BE URL 을 만드는 be-proxy.ts 의 forwardToBackend 에서 한 번 더 한다.
 * OASIS 라우트는 shared oasis-proxy 가 module·serviceId·action 이름 규칙(영문·숫자·밑줄)으로 따로 막는다.
 */

/** 인코딩된 `/`(2F)·`\`(5C)·`.`(2E)·`;`(3B). `%25` 반복은 이중·다중 인코딩(`%252F`, `%25252e`). */
const ENCODED_PATH_META = /%(?:25)*(?:2f|5c|2e|3b)/i;

/**
 * 경로(조회 문자열 제외)가 BFF 와 BE 가 서로 다르게 읽을 수 있는 모양이면 참.
 * @param pathname 인코딩된 그대로의 경로 — `req.nextUrl.pathname` 이나 BE 로 보낼 경로
 */
export function isUnsafeApiPath(pathname: string): boolean {
  if (ENCODED_PATH_META.test(pathname)) return true;
  if (pathname.includes("\\") || pathname.includes(";")) return true;
  return pathname.split("/").some((segment) => segment === "." || segment === "..");
}

/**
 * BFF 가 BE 로 보내면 안 되는 경로 — forwardToBackend 가 BE 로 보낼 경로(backendPath)를 본다(2026-10-07 보안 지적).
 * <ul>
 *   <li>cactus 직접 실행 경로 `/service`·`/query/service`·`/lov/service`(요청이 고른 BPMN 을 고정 action 으로 실행),
 *       `/query/{id}`·`/lov/query/{id}`(매퍼 statement 실행) — 권한키를 만들 수 없어 늘 막는다.
 *       mcm EndpointPermissionFilter.isDirectRoute 와 동기화.</li>
 *   <li>OASIS 실행 경로 `/oasis/…`·`/{m}/oasis/…`·`/api/{m}/oasis/…`(cactus OasisController) — OASIS 는 전용 라우트
 *       (`/api/{m}/oasis/{svc}/{act}`, 권한키 `{m}/{svc}/{act}`)로만 간다.</li>
 * </ul>
 * proxy.ts 는 브라우저 경로로 권한을 보는데, REST 신경로는 `/api/{m}/rest/{objId}/{action}/` 뒤 꼬리를 그대로 BE 경로로 보내
 * `/api/mdm/rest/codeEdit/save/service/codeEdit`·`…/save/oasis/termMng/save` 처럼 한 화면 권한으로 다른 BPMN 에 닿을 수 있었다.
 * 빈 조각(`//`)은 Tomcat 이 합쳐 읽으므로 합친 뒤 판정하고, 조각마다 디코드한 경로도 본다(디코드 실패는 막는다).
 */
const BLOCKED_BACKEND_PATH =
  /^\/(?:service|query|lov\/(?:query|service)|(?:api\/[^/]+\/|[^/]+\/)?oasis)(?:\/|$)/;

/** BE 로 보낼 경로(조회 문자열 제외)가 BFF 가 보내면 안 되는 경로면 참. */
export function isBlockedBackendPath(backendPath: string): boolean {
  const path = backendPath.split("?")[0].replace(/\/{2,}/g, "/");
  if (BLOCKED_BACKEND_PATH.test(path)) return true;
  if (!path.includes("%")) return false;
  try {
    const decoded = path
      .split("/")
      .map((s) => decodeURIComponent(s))
      .join("/")
      .replace(/\/{2,}/g, "/");
    return BLOCKED_BACKEND_PATH.test(decoded);
  } catch {
    return true;
  }
}
