import { describe, expect, it } from "vitest";
import {
  evaluateApiPolicy,
  hasAnyRole,
  parseRbacKey,
  type PermsLoader,
  type RbacPolicyConfig,
} from "../../src/auth/rbac-policy";

const CFG: RbacPolicyConfig = {
  publicPrefixes: ["/api/auth/", "/api/mcm/auth/"],
  authOnlyPrefixes: [
    "/api/mcm/oasis/secUser/myMenus",
    "/api/mcm/oasis/secUser/myButtonEndpoints",
    "/api/mcm/oasis/secFavorite/search",
    "/api/mls/oasis/noticeBoard/search", // m-mcm proxy.ts 와 같은 값 — 포털 홈 공지 목록(2026-10-02)
    "/api/mcm/oasis/secWidget/", // m-mcm proxy.ts 와 같은 값 — 사용자 위젯 탭·배치(본인 데이터, 2026-10-02)
    // m-mcm proxy.ts 와 같은 값 — 위젯 B·C·D 사용자용(스펙 2026-10-02-widget-admin-generic §5.1)
    "/api/mcm/oasis/widgetDef/list",
    "/api/mcm/oasis/widgetData/run",
    "/api/mcm/oasis/widgetExt/",
    "/api/mcm/oasis/widgetChat/",
    "/api/mcm/oasis/widgetMemo/",
    // m-mcm proxy.ts 와 같은 값 — 조업 계산기 위젯(MDM ruleCalc, 2026-10-06)
    "/api/mdm/oasis/ruleCalc/view",
    "/api/mdm/oasis/ruleCalc/execute",
    "/api/mdm/oasis/ruleCalc/search",
  ],
  // m-mcm proxy.ts 와 같은 값 — MDM 메타 캐시(2026-10-02). 모듈 이름과 무관한 한 규칙이다.
  authOnlyPatterns: [/^\/api\/[^/]+\/mdmMeta\//],
  // m-mcm proxy.ts 와 같은 값 — 미디어 위젯 파일 내려받기(2026-10-03). GET·HEAD 이고 경로 전체가 맞을 때만.
  authOnlyReadPatterns: [/^\/api\/mcm\/rest\/widgetMedia\/file\/api\/mcm\/widgetMedia\/file\/[0-9a-f]{32}$/],
  // m-mcm proxy.ts 와 같은 값 — cactus 직접 실행 경로는 늘 거부(2026-10-07 보안 지적).
  denyPatterns: [/^\/api\/[^/]+\/(?:service|query|lov\/(?:query|service))(?:\/|$)/],
  lovPattern: /^\/api\/[^/]+\/lov\/master\//,
  unmatchedDeny: false,
};
const DENY: RbacPolicyConfig = { ...CFG, unmatchedDeny: true };
/** 2026-10-07 수정 전 proxy.ts 값 — 재현 기록용(denyPatterns 없음, LoV 접두가 lov/query·lov/service 까지 열었다). */
const BEFORE_FIX: RbacPolicyConfig = { ...CFG, denyPatterns: undefined, lovPattern: /^\/api\/[^/]+\/lov\// };

// 방식 C — perms 는 토큰이 아니라 로더로 주입 (RBAC 2패턴 단계에서만 호출).
const VIEWER_PERMS = ["mcm/tcerrorlist/search", "mpn/plant/search"];
const loadViewer: PermsLoader = () => VIEWER_PERMS;
const loadEmpty: PermsLoader = () => [];
const loadThrow: PermsLoader = () => {
  throw new Error("loadPerms 가 호출되면 안 되는 경로(lazy 위반)");
};

/** 미디어 위젯 내려받기 — m-mcm widget-types/media/media.ts 의 MEDIA_FILE_URL_PREFIX 와 같은 값. */
const MEDIA_FILE = "/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/";
const FILE_ID = "0123456789abcdef0123456789abcdef";

const viewer = { sub: "test3", roles: ["MCM_VIEWER"] };
const sysadmin = { sub: "admin", roles: ["SYSADMIN"] };

describe("parseRbacKey", () => {
  it("OASIS 4-seg → module/objId/action (oasis 드롭·소문자)", () => {
    expect(parseRbacKey("/api/mcm/oasis/secUser/search")).toBe("mcm/secuser/search");
    expect(parseRbacKey("/api/mcm/oasis/tcErrorList/searchDetail")).toBe("mcm/tcerrorlist/searchdetail");
  });
  it("컨벤션 3-seg → module/objId/action", () => {
    expect(parseRbacKey("/api/mpn/plant/search")).toBe("mpn/plant/search");
  });
  it("쿼리스트링 제거", () => {
    expect(parseRbacKey("/api/mcm/oasis/tcErrorList/search?x=1&y=2")).toBe("mcm/tcerrorlist/search");
  });
  it("예약어 2번째 세그먼트(3-seg)는 null — mpn/query·service 오검사 방지", () => {
    expect(parseRbacKey("/api/mpn/query/someQuery")).toBeNull();
    expect(parseRbacKey("/api/mpn/service/s1")).toBeNull();
    expect(parseRbacKey("/api/mcm/lov/master")).toBeNull();
  });
  it("REST 신경로(rest 4-seg+) → module/objId/action — objId/action 명시 규약 (2026-07-28)", () => {
    expect(parseRbacKey("/api/mpn/rest/plannedOrderMng/search/api/planned-orders")).toBe(
      "mpn/plannedordermng/search",
    );
    expect(parseRbacKey("/api/analog/rest/logViewer/search/log/range/time")).toBe(
      "analog/logviewer/search",
    );
    expect(parseRbacKey("/api/mpn/rest/plannedOrderMng/split/api/planned-orders/1/split?x=1")).toBe(
      "mpn/plannedordermng/split",
    );
  });
  it("구 rest 통과형(4+seg)은 오인 키로 파싱 — 권한 미보유로 403 차단됨을 명세화", () => {
    expect(parseRbacKey("/api/mpn/rest/api/items")).toBe("mpn/api/items");
    expect(parseRbacKey("/api/mcm/rest/kmc/topics")).toBe("mcm/kmc/topics");
  });
  it("rest 3-seg(기형)·세그먼트부족·비-api 는 null", () => {
    expect(parseRbacKey("/api/mpn/rest/x")).toBeNull();
    expect(parseRbacKey("/api/mcm/oasis")).toBeNull();
    expect(parseRbacKey("/portal/x")).toBeNull();
  });
  it("MDM 실제 OASIS 경로도 소문자화 (TSK-09-03 B1 (ii) — BE 키 생성 ↔ FE 키 파싱 이음매)", () => {
    expect(parseRbacKey("/api/mdm/oasis/domainMng/save")).toBe("mdm/domainmng/save");
  });
});

describe("hasAnyRole", () => {
  it("ROLE_ 접두사와 대소문자를 정규화해 ADMIN/PLANNER를 허용한다", () => {
    expect(hasAnyRole(["ROLE_ADMIN"], ["ADMIN", "PLANNER"])).toBe(true);
    expect(hasAnyRole(["planner"], ["ADMIN", "PLANNER"])).toBe(true);
  });

  it("VIEWER와 잘못된 roles payload는 거부한다", () => {
    expect(hasAnyRole(["ROLE_VIEWER"], ["ADMIN", "PLANNER"])).toBe(false);
    expect(hasAnyRole("ROLE_ADMIN", ["ADMIN", "PLANNER"])).toBe(false);
  });
});

describe("evaluateApiPolicy 매트릭스 (방식 C — perms 는 로더로 lazy load)", () => {
  it("T1 권한 보유 OASIS → pass", async () => {
    expect(await evaluateApiPolicy("/api/mcm/oasis/tcErrorList/search", viewer, CFG, loadViewer)).toBe("pass");
  });
  it("T2 권한 미보유 → forbidden-perm", async () => {
    expect(await evaluateApiPolicy("/api/mcm/oasis/tcErrorList/save", viewer, CFG, loadViewer)).toBe("forbidden-perm");
    expect(await evaluateApiPolicy("/api/mcm/oasis/commUserMng/search", viewer, CFG, loadViewer)).toBe("forbidden-perm");
  });
  it("T3 AUTH_ONLY(myMenusTree) → pass (loader 미호출=lazy)", async () => {
    expect(await evaluateApiPolicy("/api/mcm/oasis/secUser/myMenusTree", viewer, CFG, loadThrow)).toBe("pass");
  });
  it("T4 LoV master → pass (loader 미호출) / lov/query·lov/service → forbidden-route (2026-10-07)", async () => {
    expect(await evaluateApiPolicy("/api/mcm/lov/master/B029", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mcm/lov/master/UNIT/KG", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mpn/lov/service/foo", viewer, CFG, loadThrow)).toBe("forbidden-route");
    expect(await evaluateApiPolicy("/api/mpn/lov/query/q1", viewer, CFG, loadThrow)).toBe("forbidden-route");
  });
  it("T5 REST 신경로 — 권한 보유 pass / 미보유(구 통과형 오인 키 포함) forbidden-perm (2026-07-28)", async () => {
    expect(await evaluateApiPolicy("/api/mpn/rest/plant/search/api/plants", viewer, CFG, loadViewer)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mpn/rest/api/items", viewer, CFG, loadViewer)).toBe("forbidden-perm");
  });
  it("T6 mpn/query(예약어 3-seg) → forbidden-route (권한키 오검사 없이 거부, loader 미호출, 2026-10-07)", async () => {
    expect(await evaluateApiPolicy("/api/mpn/query/qX", viewer, CFG, loadThrow)).toBe("forbidden-route");
  });
  it("T7 미매칭(비-rest 5-seg) → pass (loader 미호출 유지)", async () => {
    expect(await evaluateApiPolicy("/api/mpn/foo/bar/baz/qux", viewer, CFG, loadThrow)).toBe("pass");
  });
  it("T8 SYSADMIN 롤 토큰도 멤버십 판정 — 프리패스 제거 (2026-07-30)", async () => {
    const loadAdmin: PermsLoader = () => ["mcm/commusermng/delete"];
    expect(await evaluateApiPolicy("/api/mcm/oasis/commUserMng/delete", sysadmin, CFG, loadAdmin)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mcm/oasis/commUserMng/delete", sysadmin, CFG, loadEmpty)).toBe("forbidden-perm");
  });
  it("T9 미로그인/세션무효 → unauthorized (loader 미호출)", async () => {
    expect(await evaluateApiPolicy("/api/mcm/oasis/tcErrorList/search", null, CFG, loadThrow)).toBe("unauthorized");
    expect(await evaluateApiPolicy("/api/mcm/oasis/tcErrorList/search", { roles: [] }, CFG, loadThrow)).toBe("unauthorized");
  });
  it("T10 컨벤션 3-seg 권한 보유 → pass", async () => {
    expect(await evaluateApiPolicy("/api/mpn/plant/search", viewer, CFG, loadViewer)).toBe("pass");
  });
  it("T11 미매칭 DENY=true → 롤 무관 forbidden-unmatched (SYSADMIN 포함 — 프리패스 제거)", async () => {
    expect(await evaluateApiPolicy("/api/mpn/foo/bar/baz/qux", viewer, DENY, loadThrow)).toBe("forbidden-unmatched");
    expect(await evaluateApiPolicy("/api/mpn/foo/bar/baz/qux", sysadmin, DENY, loadThrow)).toBe("forbidden-unmatched");
  });
  it('T12 perms "*" 와일드카드 → 임의 RBAC 키 pass (BE 브레이크글라스 통로)', async () => {
    const loadWildcard: PermsLoader = () => ["*"];
    expect(await evaluateApiPolicy("/api/mcm/oasis/commUserMng/delete", sysadmin, CFG, loadWildcard)).toBe("pass");
    expect(await evaluateApiPolicy("/api/analog/rest/logViewer/search/log/x", viewer, CFG, loadWildcard)).toBe("pass");
  });
  it("PUBLIC 은 token 없어도 pass (loader 미호출)", async () => {
    expect(await evaluateApiPolicy("/api/auth/login", null, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mcm/auth/refresh", null, CFG, loadThrow)).toBe("pass");
  });
  it("AUTH_ONLY(mls noticeBoard.search) — 권한키 없는 사용자도 pass(loader 미호출), 같은 서비스의 다른 action 은 RBAC", async () => {
    // 홈 공지는 로그인한 모든 사용자 몫이고 게시 대상은 서비스가 사용자 역할로 거른다 — 역할 매핑 없이 열려야 한다.
    expect(await evaluateApiPolicy("/api/mls/oasis/noticeBoard/search", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mls/oasis/noticeBoard/search", null, CFG, loadThrow)).toBe("unauthorized");
    expect(await evaluateApiPolicy("/api/mls/oasis/noticeBoard/save", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
    expect(await evaluateApiPolicy("/api/mls/oasis/noticeMgmt/search", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
  });
  it("AUTH_ONLY(mcm secWidget) — 다섯 action 모두 권한키 없는 사용자도 pass, 미로그인은 unauthorized", async () => {
    for (const action of ["search", "saveTab", "deleteTab", "reorderTabs", "resetHome"]) {
      expect(await evaluateApiPolicy(`/api/mcm/oasis/secWidget/${action}`, viewer, CFG, loadThrow)).toBe("pass");
    }
    expect(await evaluateApiPolicy("/api/mcm/oasis/secWidget/search", null, CFG, loadThrow)).toBe("unauthorized");
    expect(await evaluateApiPolicy("/api/mcm/oasis/secWidgetAdmin/search", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
  });
  it("AUTH_ONLY(mdm ruleCalc 조업 계산기) — view·execute·search 만 권한키 없이 pass, 미로그인은 unauthorized, 다른 action 은 권한키 필요", async () => {
    for (const action of ["view", "execute", "search"]) {
      expect(await evaluateApiPolicy(`/api/mdm/oasis/ruleCalc/${action}`, viewer, CFG, loadThrow)).toBe("pass");
      expect(await evaluateApiPolicy(`/api/mdm/oasis/ruleCalc/${action}`, null, CFG, loadThrow)).toBe("unauthorized");
    }
    for (const action of ["save", "delete", "confirm"]) {
      expect(await evaluateApiPolicy(`/api/mdm/oasis/ruleCalc/${action}`, viewer, CFG, loadEmpty)).toBe("forbidden-perm");
    }
  });
  it("AUTH_ONLY(위젯 B·C·D 사용자용) — 열린 action 만 pass, 관리자용·다른 action 은 권한키 필요", async () => {
    for (const url of [
      "/api/mcm/oasis/widgetDef/list",
      "/api/mcm/oasis/widgetData/run",
      "/api/mcm/oasis/widgetExt/exchange",
      "/api/mcm/oasis/widgetExt/weather",
      "/api/mcm/oasis/widgetChat/history",
      "/api/mcm/oasis/widgetChat/send",
      "/api/mcm/oasis/widgetChat/reset",
      "/api/mcm/oasis/widgetMemo/load",
      "/api/mcm/oasis/widgetMemo/save",
    ]) {
      expect(await evaluateApiPolicy(url, viewer, CFG, loadThrow)).toBe("pass");
    }
    expect(await evaluateApiPolicy(`${MEDIA_FILE}${FILE_ID}`, viewer, CFG, loadThrow, "GET")).toBe("pass");
    expect(await evaluateApiPolicy("/api/mcm/oasis/widgetDef/list", null, CFG, loadThrow)).toBe("unauthorized");
    // 정의 저장·SQL 미리보기·기본 배치·미디어 올리기는 위젯관리 화면 RBAC(W-D22)
    expect(await evaluateApiPolicy("/api/mcm/oasis/widgetDef/save", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
    expect(await evaluateApiPolicy("/api/mcm/oasis/commWidgetMng/previewQuery", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
    expect(await evaluateApiPolicy("/api/mcm/oasis/commWidgetMng/saveLayout", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
    expect(
      await evaluateApiPolicy("/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload", viewer, CFG, loadEmpty)
    ).toBe("forbidden-perm");
    const loadAdmin: PermsLoader = () => ["mcm/commwidgetmng/previewquery", "mcm/commwidgetmng/upload"];
    expect(await evaluateApiPolicy("/api/mcm/oasis/commWidgetMng/previewQuery", viewer, CFG, loadAdmin)).toBe("pass");
    expect(
      await evaluateApiPolicy("/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload", viewer, CFG, loadAdmin)
    ).toBe("pass");
  });
  describe("미디어 파일 내려받기 — 읽기 전용 AUTH_ONLY 는 GET·HEAD + 경로 전체 일치만 (2026-10-03)", () => {
    const url = `${MEDIA_FILE}${FILE_ID}`;

    it("GET·HEAD(대소문자 무관)·쿼리 문자열 → pass, loader 미호출", async () => {
      for (const method of ["GET", "HEAD", "get"]) {
        expect(await evaluateApiPolicy(url, viewer, CFG, loadThrow, method)).toBe("pass");
      }
      expect(await evaluateApiPolicy(`${url}?v=1`, viewer, CFG, loadThrow, "GET")).toBe("pass");
      expect(await evaluateApiPolicy(url, null, CFG, loadThrow, "GET")).toBe("unauthorized");
    });

    it("쓰기 메서드·메서드 모름은 RBAC 로 넘어가 forbidden-perm (mcm/widgetmedia/file 권한키는 누구에게도 없다)", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        expect(await evaluateApiPolicy(url, viewer, CFG, loadEmpty, method)).toBe("forbidden-perm");
      }
      expect(await evaluateApiPolicy(url, viewer, CFG, loadEmpty)).toBe("forbidden-perm");
    });

    it("접두만 같고 backendPath 가 다른 BE 엔드포인트 → forbidden-perm (GET 이어도)", async () => {
      for (const other of [
        "/api/mcm/rest/widgetMedia/file/api/mcm/sample-notices",
        "/api/mcm/rest/widgetMedia/file/api/mcm/master-codes/groups/B029/items",
        "/api/mcm/rest/widgetMedia/file/api/mcm/commWidgetMng/upload",
        `/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/${FILE_ID}/extra`,
        "/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/",
        "/api/mcm/rest/widgetMedia/x/api/mcm/widgetMedia/file/" + FILE_ID,
        "/api/mpn/rest/widgetMedia/file/api/mcm/widgetMedia/file/" + FILE_ID,
      ]) {
        expect(await evaluateApiPolicy(other, viewer, CFG, loadEmpty, "GET")).toBe("forbidden-perm");
        expect(await evaluateApiPolicy(other, viewer, CFG, loadEmpty, "POST")).toBe("forbidden-perm");
      }
    });

    it("경로 조작(.. · %2e%2e · %2f · // · 대문자·길이 다른 fileId)으로 접두를 맞춰도 forbidden-perm", async () => {
      for (const tricked of [
        `${MEDIA_FILE}../../sample-notices`,
        `${MEDIA_FILE}${FILE_ID}/../../../sample-notices`,
        `${MEDIA_FILE}%2e%2e/%2e%2e/sample-notices`,
        `${MEDIA_FILE}%2E%2E%2F%2E%2E%2Fsample-notices`,
        `${MEDIA_FILE}..%2f..%2fsample-notices`,
        `${MEDIA_FILE}${FILE_ID}%2f..%2f..%2fsample-notices`,
        `${MEDIA_FILE}/${FILE_ID}`,
        `/api/mcm/rest/widgetMedia/file//api/mcm/widgetMedia/file/${FILE_ID}`,
        `${MEDIA_FILE}${FILE_ID.toUpperCase()}`,
        `${MEDIA_FILE}${FILE_ID.slice(1)}`,
        `${MEDIA_FILE}${FILE_ID}0`,
      ]) {
        expect(await evaluateApiPolicy(tricked, viewer, CFG, loadEmpty, "GET"), tricked).toBe("forbidden-perm");
      }
    });

    it("브레이크글라스(*)는 예전처럼 RBAC 단계에서 통과한다", async () => {
      expect(await evaluateApiPolicy(url, sysadmin, CFG, () => ["*"], "POST")).toBe("pass");
    });
  });
  it("T12 업무 모듈 mdmMeta(MDM 메타 캐시) → AUTH_ONLY pass, loader 미호출 (2026-10-02)", async () => {
    expect(await evaluateApiPolicy("/api/mls/mdmMeta/columns", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mls/mdmMeta/entries?type=COLUMN", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mls/mdmMeta/status", null, CFG, loadThrow)).toBe("unauthorized");
  });
  it("T12 mdmMeta 규칙은 모듈 이름과 무관 — 아직 없는 모듈(mmm)도 proxy 수정 없이 AUTH_ONLY pass", async () => {
    expect(await evaluateApiPolicy("/api/mmm/mdmMeta/columns", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mmm/mdmMeta/status", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mmm/mdmMeta/columns", null, CFG, loadThrow)).toBe("unauthorized");
    // 패턴은 두 번째 세그먼트가 정확히 mdmMeta 일 때만 — 비슷한 이름·더 깊은 위치는 RBAC 로 간다.
    expect(await evaluateApiPolicy("/api/mmm/mdmMetaX/columns", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
    expect(await evaluateApiPolicy("/api/mmm/oasis/mdmMeta/columns", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
    // 패턴을 두지 않은 설정(다른 포털)은 예전처럼 RBAC 판정이다.
    const { authOnlyPatterns: _omit, ...noPatterns } = CFG;
    expect(await evaluateApiPolicy("/api/mmm/mdmMeta/columns", viewer, noPatterns, loadEmpty)).toBe("forbidden-perm");
  });
  it("AUTH_ONLY 라도 미로그인이면 unauthorized", async () => {
    expect(await evaluateApiPolicy("/api/mcm/oasis/secUser/myMenus", null, CFG, loadThrow)).toBe("unauthorized");
  });
  it("로더가 빈 권한 반환 → 보유했던 화면도 forbidden-perm (fail-closed)", async () => {
    expect(await evaluateApiPolicy("/api/mcm/oasis/tcErrorList/search", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
  });
  it("MDM 실제 경로(domainMng.save) — 권한 보유 pass / 미보유 forbidden-perm (TSK-09-03 B1 (iii))", async () => {
    const loadMdm: PermsLoader = () => ["mdm/domainmng/save"];
    expect(await evaluateApiPolicy("/api/mdm/oasis/domainMng/save", viewer, CFG, loadMdm)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mdm/oasis/domainMng/save", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
  });
});

describe("cactus 직접 실행 경로 거부 (2026-10-07 보안 지적, notice-fill2 route-guard)", () => {
  const DIRECT = [
    "/api/mdm/service/codeEdit", // codeEdit execute = 마루 코드 폐기
    "/api/mdm/query/service/domainMng",
    "/api/mdm/lov/service/termMng",
    "/api/mcm/query/DmomMapper.insertTcError",
    "/api/mcm/query/masterCodeSelPop.search",
    "/api/mcm/lov/query/plantLov.list",
    "/api/mdm/service",
    "/api/mdm/service/codeEdit?x=1",
  ];

  it.each(DIRECT)("재현 — 수정 전 설정에서는 로그인만으로 pass: %s", async (path) => {
    expect(await evaluateApiPolicy(path, viewer, BEFORE_FIX, loadEmpty)).toBe("pass");
  });

  it.each(DIRECT)("수정 뒤 — forbidden-route, 권한키 로더도 부르지 않는다: %s", async (path) => {
    expect(await evaluateApiPolicy(path, viewer, CFG, loadThrow)).toBe("forbidden-route");
  });

  it("브레이크글라스 와일드카드(*)·SYSADMIN 롤이어도 거부", async () => {
    const loadWildcard: PermsLoader = () => ["*"];
    expect(await evaluateApiPolicy("/api/mdm/service/codeEdit", sysadmin, CFG, loadWildcard)).toBe("forbidden-route");
  });

  it("조각을 인코딩해도 거부 — Next 라우트는 디코드한 조각으로 service/[serviceId] 에 간다", async () => {
    expect(await evaluateApiPolicy("/api/mdm/%73ervice/codeEdit", viewer, CFG, loadThrow)).toBe("forbidden-route");
    expect(await evaluateApiPolicy("/api/mcm/lov/%71uery/a.b", viewer, CFG, loadThrow)).toBe("forbidden-route");
  });

  it("미로그인은 거부 패턴보다 먼저 unauthorized", async () => {
    expect(await evaluateApiPolicy("/api/mdm/service/codeEdit", null, CFG, loadThrow)).toBe("unauthorized");
  });

  it("기존 경로는 그대로 — OASIS·컨벤션·rest·mdmMeta·serviceId 가 query 인 OASIS", async () => {
    const load: PermsLoader = () => ["mdm/codeedit/save", "mdm/query/search", "mpn/plant/search"];
    expect(await evaluateApiPolicy("/api/mdm/oasis/codeEdit/save", viewer, CFG, load)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mdm/oasis/query/search", viewer, CFG, load)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mpn/plant/search", viewer, CFG, load)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mpn/rest/plant/search/api/plants", viewer, CFG, load)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mls/mdmMeta/columns", viewer, CFG, loadThrow)).toBe("pass");
  });
});
