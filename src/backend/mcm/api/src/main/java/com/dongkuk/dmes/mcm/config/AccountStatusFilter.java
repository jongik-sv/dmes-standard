package com.dongkuk.dmes.mcm.config;

import com.dongkuk.dmes.mcm.security.account.AccountStatusCache;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 계정 상태 필터(2026-11-28, 시안 「사용자 비활성화·퇴직 처리」 D2) — JWT 가 살아 있어도 계정이 비활성·퇴직·기한 밖이면
 * SecurityContext 를 비우고 401 로 끊는다. 잠금은 끊지 않는다(들어와 있던 세션은 그대로 둔다).
 *
 * <p>상태는 {@link AccountStatusCache}(사람별 10분)에서 읽는다. 상태를 바꾸는 저장이 그 사람 캐시를 비우므로
 * 같은 서버의 다음 요청부터 끊긴다. 등록 위치 = {@link RevokedTokenFilter} 뒤, 권한 필터 앞.
 */
@Component
public class AccountStatusFilter extends OncePerRequestFilter {

    /** 끊을 때 본문 — 회수 토큰 응답과 같은 모양. 코드 A006(ACCOUNT_DISABLED). */
    static final String BODY = "{\"meta\":{\"success\":false,\"code\":\"A006\",\"message\":\"계정 상태가 바뀌어 로그아웃되었습니다\"}}";

    private final AccountStatusCache accountStatusCache;

    public AccountStatusFilter(AccountStatusCache accountStatusCache) {
        this.accountStatusCache = accountStatusCache;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String userId = auth != null && auth.isAuthenticated() ? auth.getName() : null;
        if (userId != null && !"anonymousUser".equals(userId) && accountStatusCache.shouldCut(userId)) {
            SecurityContextHolder.clearContext();
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(BODY);
            return;
        }
        chain.doFilter(request, response);
    }
}
