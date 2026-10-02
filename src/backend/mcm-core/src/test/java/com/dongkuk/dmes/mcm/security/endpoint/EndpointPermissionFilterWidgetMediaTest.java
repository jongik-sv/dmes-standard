package com.dongkuk.dmes.mcm.security.endpoint;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 미디어 위젯 REST(스펙 2026-10-02-widget-admin-generic §5.1·§5.2)의 BE 권한 판정과 기존 판정 고정(2026-10-03 통합 지적).
 * <ul>
 *   <li>올리기 {@code POST /api/mcm/commWidgetMng/upload} — 3-segment(serviceId "")라 예전엔 캐시의 "oasis" 키와 맞지 않아
 *       SYSADMIN 도 403 이었다. 이제 같은 OASIS 권한키 {@code (mcm, oasis, commwidgetmng, upload)} 멤버십으로 판정한다
 *       (AUTH_ONLY 로 열지 않는다 — BFF 우회 시 백스톱).</li>
 *   <li>내려받기 {@code GET /api/mcm/widgetMedia/file/{fileId}} — 4-segment 라 AUTH_ONLY 목록에 걸리지 않아 403 이었다.
 *       이제 GET·HEAD 이고 fileId 가 32자 소문자 16진수일 때만 인증만 본다.</li>
 * </ul>
 */
class EndpointPermissionFilterWidgetMediaTest {

    private static final String UPLOAD = "/api/mcm/commWidgetMng/upload";
    private static final String FILE = "/api/mcm/widgetMedia/file/";
    private static final String FILE_ID = "0123456789abcdef0123456789abcdef";

    private final UserPermCache userPermCache = mock(UserPermCache.class);
    private final SecurityIdentity securityIdentity = mock(SecurityIdentity.class);
    private final EndpointPermissionFilter filter =
            new EndpointPermissionFilter(userPermCache, securityIdentity, "mcm", false);

    private void loginWith(PermKey... perms) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("u1", null, List.of()));
        when(securityIdentity.currentUserId()).thenReturn("u1");
        when(userPermCache.getPermissions("u1")).thenReturn(Set.of(perms));
    }

    @AfterEach
    void logout() {
        SecurityContextHolder.clearContext();
    }

    /** 필터를 지나 다음 체인으로 갔으면 true, 403 으로 막혔으면 false. */
    private boolean passes(String method, String uri) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(request, response, chain);
        boolean passed = chain.getRequest() == request;
        assertThat(response.getStatus()).as(method + " " + uri).isEqualTo(passed ? 200 : 403);
        return passed;
    }

    private static PermKey oasis(String module, String objId, String action) {
        return new PermKey(module, "oasis", objId, action);
    }

    // ── 올리기 ──

    @Test
    @DisplayName("올리기 — 위젯관리 upload 권한키(OASIS 키)가 있으면 통과")
    void uploadPassesWithOasisUploadKey() throws Exception {
        loginWith(oasis("mcm", "commWidgetMng", "upload"));
        assertThat(passes("POST", UPLOAD)).isTrue();
    }

    @Test
    @DisplayName("올리기 — 권한키가 없거나 다른 action·다른 화면 키뿐이면 403 (AUTH_ONLY 아님)")
    void uploadDeniedWithoutUploadKey() throws Exception {
        loginWith();
        assertThat(passes("POST", UPLOAD)).isFalse();

        loginWith(oasis("mcm", "commWidgetMng", "save"), oasis("mcm", "secUser", "upload"));
        assertThat(passes("POST", UPLOAD)).isFalse();
    }

    // ── 내려받기 ──

    @ParameterizedTest
    @ValueSource(strings = {"GET", "HEAD"})
    @DisplayName("내려받기 — GET·HEAD 는 권한키가 없어도 통과(로그인 사용자 누구나)")
    void downloadIsAuthOnlyForReads(String method) throws Exception {
        loginWith();
        assertThat(passes(method, FILE + FILE_ID)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT", "PATCH", "DELETE"})
    @DisplayName("내려받기 경로라도 쓰기 메서드는 RBAC 판정 → 권한키 없으면 403")
    void downloadPathWriteMethodsAreRbac(String method) throws Exception {
        loginWith();
        assertThat(passes(method, FILE + FILE_ID)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            FILE + "..",
            FILE + "0123456789ABCDEF0123456789ABCDEF",     // 대문자
            FILE + "0123456789abcdef0123456789abcde",      // 31자
            FILE + "0123456789abcdef0123456789abcdef0",    // 33자
            FILE + "x%2F..%2F..%2FcommUserMng%2Fdelete",   // 인코딩한 / 로 한 세그먼트
            FILE + "0123456789abcdef0123456789abcdef;jsessionid=1"
    })
    @DisplayName("내려받기 모양이 아닌 fileId 는 AUTH_ONLY 가 아니다 → 권한키 없으면 403")
    void malformedFileIdIsNotAuthOnly(String uri) throws Exception {
        loginWith();
        assertThat(passes("GET", uri)).isFalse();
    }

    @Test
    @DisplayName("isAuthOnlyMediaFile — 메서드·URI 전체 일치만")
    void isAuthOnlyMediaFileUnit() {
        assertThat(EndpointPermissionFilter.isAuthOnlyMediaFile("GET", FILE + FILE_ID)).isTrue();
        assertThat(EndpointPermissionFilter.isAuthOnlyMediaFile("HEAD", FILE + FILE_ID)).isTrue();
        assertThat(EndpointPermissionFilter.isAuthOnlyMediaFile("POST", FILE + FILE_ID)).isFalse();
        assertThat(EndpointPermissionFilter.isAuthOnlyMediaFile("GET", FILE + FILE_ID + "/x")).isFalse();
        assertThat(EndpointPermissionFilter.isAuthOnlyMediaFile("GET", "/mcm" + FILE + FILE_ID)).isFalse();
        assertThat(EndpointPermissionFilter.isAuthOnlyMediaFile("GET", null)).isFalse();
        assertThat(EndpointPermissionFilter.isAuthOnlyMediaFile(null, FILE + FILE_ID)).isFalse();
    }

    @Test
    @DisplayName("예전 AUTH_ONLY 항목 widgetmedia/file 은 없앴다 — OASIS 모양 widgetMedia/file 은 RBAC")
    void oldWidgetMediaPrefixRemoved() throws Exception {
        assertThat(EndpointPermissionFilter.isAuthOnly(new PermKey("mcm", "oasis", "widgetmedia", "file"))).isFalse();
        loginWith();
        assertThat(passes("POST", "/oasis/widgetMedia/file")).isFalse();
    }

    // ── 기존 판정 고정 ──

    @Test
    @DisplayName("3-segment 컨벤션 — 권한키 없으면 403, OASIS 키가 있으면 통과(BFF parseRbacKey 와 같은 키 공간)")
    void conventionThreeSegmentUsesOasisKey() throws Exception {
        loginWith();
        assertThat(passes("GET", "/api/mpn/plant/search")).isFalse();

        loginWith(oasis("mpn", "plant", "search"));
        assertThat(passes("GET", "/api/mpn/plant/search")).isTrue();
        assertThat(passes("GET", "/api/mpn/plant/save")).isFalse();
        assertThat(passes("GET", "/api/mcm/plant/search")).isFalse(); // 모듈이 다르면 다른 키
    }

    @Test
    @DisplayName("4-segment(실제 serviceId)는 OASIS 키로 바꿔 찾지 않는다")
    void fourSegmentWithServiceIdDoesNotFallBack() throws Exception {
        loginWith(oasis("mpn", "plant", "search"));
        assertThat(passes("GET", "/api/mpn/b0000004-0000-4000-8000-000000000002/plant/search")).isFalse();

        loginWith(new PermKey("mpn", "b0000004-0000-4000-8000-000000000002", "plant", "search"));
        assertThat(passes("GET", "/api/mpn/b0000004-0000-4000-8000-000000000002/plant/search")).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/oasis/commUserMng/search", "/mcm/oasis/commUserMng/search", "/api/mcm/oasis/commUserMng/search"})
    @DisplayName("OASIS 3형태 — 권한키 있으면 통과, 없으면 403 (변화 없음)")
    void oasisShapesUnchanged(String uri) throws Exception {
        loginWith(oasis("mcm", "commUserMng", "search"));
        assertThat(passes("POST", uri)).isTrue();
        loginWith();
        assertThat(passes("POST", uri)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/oasis/secWidget/search",
            "/oasis/widgetDef/list",
            "/oasis/widgetData/run",
            "/oasis/widgetExt/exchange",
            "/oasis/widgetChat/send",
            "/oasis/widgetMemo/load",
            "/oasis/widgetMemo/save",
            "/oasis/secUser/myMenusTree",
            "/api/mcm/mdmMeta/columns"
    })
    @DisplayName("기존 AUTH_ONLY 는 권한키 없이 통과 (변화 없음)")
    void existingAuthOnlyUnchanged(String uri) throws Exception {
        loginWith();
        assertThat(passes("POST", uri)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/mcm/sample-notices", "/api/mcm/master-codes/groups/B029/items", "/actuator/health"})
    @DisplayName("PermKey 로 읽을 수 없는 URL 은 예전처럼 통과 (RBAC 대상 아님)")
    void unparseableUrlsStillPass(String uri) throws Exception {
        loginWith();
        assertThat(passes("GET", uri)).isTrue();
    }
}
