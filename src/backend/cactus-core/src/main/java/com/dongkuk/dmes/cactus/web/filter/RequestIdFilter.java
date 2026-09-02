package com.dongkuk.dmes.cactus.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * 요청 단위 추적용 {@code requestId} 를 MDC 에 적재하고 응답 헤더로 노출하는 필터.
 *
 * <p>동작:
 * <ol>
 *     <li>요청 진입 시 헤더 {@code X-Request-Id} 가 있으면 그 값을, 없으면 UUID(앞 8자리) 를 사용</li>
 *     <li>{@link MDC} 의 {@code requestId} 키에 set</li>
 *     <li>응답 헤더 {@code X-Request-Id} 에 동일 값을 set</li>
 *     <li>finally 절에서 {@link MDC#clear()} 로 정리</li>
 * </ol>
 *
 * <p>cactus 가 제공하는 표준 필터로, 별도 조건 없이 항상 활성된다.
 */
public class RequestIdFilter extends OncePerRequestFilter {

    /** 요청 ID 헤더명 */
    public static final String HEADER_REQUEST_ID = "X-Request-Id";

    /** MDC 키 */
    public static final String MDC_KEY = "requestId";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String requestId = request.getHeader(HEADER_REQUEST_ID);
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString().substring(0, 8);
        }

        MDC.put(MDC_KEY, requestId);
        response.setHeader(HEADER_REQUEST_ID, requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
