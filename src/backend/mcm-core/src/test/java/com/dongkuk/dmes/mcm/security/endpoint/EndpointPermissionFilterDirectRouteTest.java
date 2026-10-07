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
 * cactus 직접 실행 경로({@code /service}·{@code /query/service}·{@code /lov/service}·{@code /query/{id}}·{@code /lov/query/{id}})
 * 거부(2026-10-07 보안 지적, notice-fill2 route-guard).
 *
 * <p>예전에는 이 경로에서 PermKey 를 뽑지 못해 "RBAC 대상 아님" 으로 통과했다 — 로그인만 한 사용자가
 * {@code POST /service/codeEdit} 로 아무 BPMN 을 action=execute 로 실행할 수 있었다. cactus-core 는 이 컨트롤러들을
 * 기본으로 끄고, 이 필터는 켜진 경우에도 권한·브레이크글라스와 무관하게 403 으로 막는다(권한 키 판정은 경로를 켜는 회차에서).
 * {@code /oasis/{serviceId}/{action}}·{@code /lov/master} 는 그대로다.
 */
class EndpointPermissionFilterDirectRouteTest {

    private final UserPermCache userPermCache = mock(UserPermCache.class);
    private final SecurityIdentity securityIdentity = mock(SecurityIdentity.class);

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
    private static boolean passes(EndpointPermissionFilter filter, String method, String uri) throws Exception {
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

    private EndpointPermissionFilter filter(boolean sysadminFreepass) {
        return new EndpointPermissionFilter(userPermCache, securityIdentity, "mcm", sysadminFreepass);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "/service/codeEdit",
            "/query/service/codeEdit",
            "/lov/service/codeEdit",
            "/query/masterCodeSelPop.search",
            "/lov/query/plantLov.list",
            "/mcm/service/codeEdit",            // 운영 게이트웨이 접두
            "/mdm/query/service/codeEdit",
            "/mcm/query/DmomMapper.insertTcError",
            "/mcm/lov/query/plantLov.list",
            "/mcm/lov/service/codeEdit",
            "/service/codeEdit/extra",
            "/query",
            "/%73ervice/codeEdit",              // Spring MVC 는 조각을 디코드해 매핑한다
            "/mcm/lov/%71uery/plantLov.list",
            "/service/code%ZZ"})                // 디코드할 수 없는 경로 — fail-closed
    @DisplayName("직접 실행 경로 — 같은 화면의 OASIS 권한키를 모두 가져도 403")
    void directRoutesDenied(String uri) throws Exception {
        loginWith(oasis("mcm", "codeEdit", "execute"), oasis("mcm", "codeEdit", "query"),
                oasis("mcm", "codeEdit", "lov"), oasis("mcm", "codeEdit", "save"));
        assertThat(passes(filter(false), "POST", uri)).isFalse();
    }

    @Test
    @DisplayName("직접 실행 경로 — SYSADMIN 브레이크글라스(freepass)여도 403")
    void directRoutesDeniedEvenWithFreepass() throws Exception {
        loginWith();
        when(securityIdentity.hasAuthority("ROLE_SYSADMIN")).thenReturn(true);
        EndpointPermissionFilter freepass = filter(true);

        assertThat(passes(freepass, "POST", "/service/codeEdit")).isFalse();
        assertThat(passes(freepass, "POST", "/query/a.b")).isFalse();
        assertThat(passes(freepass, "POST", "/oasis/codeEdit/save")).isTrue(); // 브레이크글라스 자체는 그대로
    }

    @Test
    @DisplayName("/lov/master 는 인증만 — 권한키 없이 통과")
    void lovMasterStillPasses() throws Exception {
        loginWith();
        assertThat(passes(filter(false), "GET", "/lov/master/USE_YN")).isTrue();
        assertThat(passes(filter(false), "GET", "/mcm/lov/master/USE_YN/ROOT")).isTrue();
    }

    @Test
    @DisplayName("/oasis/{serviceId}/{action} 판정은 그대로 — 권한키가 있으면 통과, 없으면 403")
    void oasisUnchanged() throws Exception {
        loginWith(oasis("mcm", "codeEdit", "save"));
        assertThat(passes(filter(false), "POST", "/oasis/codeEdit/save")).isTrue();
        assertThat(passes(filter(false), "POST", "/mcm/oasis/codeEdit/save")).isTrue();
        assertThat(passes(filter(false), "POST", "/oasis/codeEdit/delete")).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"/oasis/query/search", "/oasis/service/save", "/oasis/lov/search"})
    @DisplayName("serviceId 가 query·service·lov 인 OASIS 경로는 직접 실행 경로로 오인하지 않는다")
    void oasisServiceNamedLikeDirectRoute(String uri) throws Exception {
        String[] seg = uri.split("/");
        loginWith(oasis("mcm", seg[2], seg[3]));
        assertThat(passes(filter(false), "POST", uri)).isTrue();
    }
}
