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
  ],
  // m-mcm proxy.ts 와 같은 값 — MDM 메타 캐시(2026-10-02). 모듈 이름과 무관한 한 규칙이다.
  authOnlyPatterns: [/^\/api\/[^/]+\/mdmMeta\//],
  lovPattern: /^\/api\/[^/]+\/lov\//,
  unmatchedDeny: false,
};
const DENY: RbacPolicyConfig = { ...CFG, unmatchedDeny: true };

// 방식 C — perms 는 토큰이 아니라 로더로 주입 (RBAC 2패턴 단계에서만 호출).
const VIEWER_PERMS = ["mcm/tcerrorlist/search", "mpn/plant/search"];
const loadViewer: PermsLoader = () => VIEWER_PERMS;
const loadEmpty: PermsLoader = () => [];
const loadThrow: PermsLoader = () => {
  throw new Error("loadPerms 가 호출되면 안 되는 경로(lazy 위반)");
};

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
  it("T4 LoV(master/query/service) → pass (loader 미호출)", async () => {
    expect(await evaluateApiPolicy("/api/mpn/lov/service/foo", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mcm/lov/master/B029", viewer, CFG, loadThrow)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mpn/lov/query/q1", viewer, CFG, loadThrow)).toBe("pass");
  });
  it("T5 REST 신경로 — 권한 보유 pass / 미보유(구 통과형 오인 키 포함) forbidden-perm (2026-07-28)", async () => {
    expect(await evaluateApiPolicy("/api/mpn/rest/plant/search/api/plants", viewer, CFG, loadViewer)).toBe("pass");
    expect(await evaluateApiPolicy("/api/mpn/rest/api/items", viewer, CFG, loadViewer)).toBe("forbidden-perm");
  });
  it("T6 mpn/query(예약어 3-seg) → pass (오검사 금지, loader 미호출)", async () => {
    expect(await evaluateApiPolicy("/api/mpn/query/qX", viewer, CFG, loadThrow)).toBe("pass");
  });
  it("T7 미매칭(비-rest 4-seg 예약어) → pass (loader 미호출 유지)", async () => {
    expect(await evaluateApiPolicy("/api/mpn/query/qX/extra", viewer, CFG, loadThrow)).toBe("pass");
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
    expect(await evaluateApiPolicy("/api/mpn/query/qX/extra", viewer, DENY, loadThrow)).toBe("forbidden-unmatched");
    expect(await evaluateApiPolicy("/api/mpn/query/qX/extra", sysadmin, DENY, loadThrow)).toBe("forbidden-unmatched");
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
