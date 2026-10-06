package com.dongkuk.dmes.mcm.security.endpoint;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
 * Review Focus 1 — 메뉴 권한이 하나도 없는 일반 사용자도 화면 사용 구간 기록은 403 없이 통과한다.
 * sender 가 오류를 삼키므로 403 이면 조용히 0건이 된다. 통계 조회는 그대로 메뉴 권한 대상이다.
 *
 * <p>spec 2026-10-02-mdm-meta-cache-design §5.5 — 업무 모듈 cactus 엔드포인트 /api/{module}/mdmMeta/* 는 3-segment 라 PermKey 의 serviceId 가 ""
 * 이고(PermKey.java:62-66) UserPermCache 키는 "oasis" 라(UserPermCache.java:219) 권한 데이터로 맞출 수 없다. 인증만 보는 AUTH_ONLY 로 두고,
 * 관리 action(status·entries·load)은 cactus MdmMetaController 가 SYSADMIN 을 다시 본다.
 */
class EndpointPermissionFilterAuthOnlyTest {

    private final UserPermCache userPermCache = mock(UserPermCache.class);
    private final SecurityIdentity securityIdentity = mock(SecurityIdentity.class);
    private final EndpointPermissionFilter filter =
            new EndpointPermissionFilter(userPermCache, securityIdentity, "mcm", false);

    @BeforeEach
    void loginWithoutAnyPermission() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("plainUser", null, List.of()));
        when(securityIdentity.currentUserId()).thenReturn("plainUser");
        when(userPermCache.getPermissions("plainUser")).thenReturn(Set.of());
    }

    @AfterEach
    void logout() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/oasis/screenUsage/record",          // BFF→BE 개발
            "/mcm/oasis/screenUsage/record",      // 운영 게이트웨이 prefix
            "/api/mcm/oasis/screenUsage/record"   // FE 컨벤션
    })
    void 메뉴_권한이_없어도_화면_사용_기록은_통과한다(String uri) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isSameAs(request);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/oasis/screenUsageStat/overview",
            "/oasis/screenUsageStat/history",
            "/oasis/screenUsage/purge"            // record 외 action 은 면제 대상이 아니다
    })
    void 통계_조회와_record_외_action_은_권한이_없으면_403(String uri) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void ruleCalc_view_execute_는_AUTH_ONLY_이고_다른_action_은_아니다() {
        for (String action : new String[] {"view", "execute"}) {
            PermKey k = PermKey.parseUrl("/api/mdm/oasis/ruleCalc/" + action);
            assertThat(k).as(action).isNotNull();
            assertThat(EndpointPermissionFilter.isAuthOnly(k)).as(action).isTrue();
        }
        for (String action : new String[] {"save", "delete", "confirm"}) {
            PermKey k = PermKey.parseUrl("/api/mdm/oasis/ruleCalc/" + action);
            assertThat(k).as(action).isNotNull();
            assertThat(EndpointPermissionFilter.isAuthOnly(k)).as(action).isFalse();
        }
    }

    @Test
    void mdmMeta_는_AUTH_ONLY_다() {
        for (String action : new String[] {"columns", "domains", "status", "entries", "load"}) {
            PermKey k = PermKey.parseUrl("/api/mcm/mdmMeta/" + action);
            assertThat(k).as(action).isNotNull();
            assertThat(EndpointPermissionFilter.isAuthOnly(k)).as(action).isTrue();
        }
        assertThat(EndpointPermissionFilter.isAuthOnly(PermKey.parseUrl("/api/mcm/oasis/commUserMng/search"))).isFalse();
    }
}
