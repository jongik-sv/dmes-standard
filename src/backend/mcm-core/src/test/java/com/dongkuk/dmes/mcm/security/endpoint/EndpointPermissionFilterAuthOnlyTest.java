package com.dongkuk.dmes.mcm.security.endpoint;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
}
