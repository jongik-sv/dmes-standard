package com.dongkuk.dmes.cactus.web.filter;

import com.dongkuk.oasis.logger.MDCTemplate;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * 요청 진입 시 OASIS MDCTemplate으로 service_tag와 임시 txId를 MDC에 설정한다.
 *
 * <p>OASIS MDCTemplate이 설정하는 값:
 * <ul>
 *   <li>{@code service_tag}: 랜덤 4자리 — OASIS 서브서비스 호출 시 자동 체이닝
 *       (예: "a7f3" → "a7f3:x2b1" → "a7f3:x2b1:k9m2")</li>
 * </ul>
 *
 * <p>이 필터가 추가로 설정하는 값:
 * <ul>
 *   <li>{@code txId}: 임시 UUID 8자리 — OasisServiceExecutor에서 정식 txId로 교체됨</li>
 * </ul>
 *
 * <p>요청 완료 시 MDCTemplate.finally에서 MDC 전체를 클리어한다.
 *
 * <p>등록 위치: cactus {@code CactusWebSecurityAutoConfiguration} 와 각 모듈 SecurityConfig 가
 * SecurityFilterChain 최상단(RequestIdFilter/ClientKeyFilter 앞)에 명시적으로 등록.
 * SecurityFilterChain 명시 등록 시 servlet 표준 {@code @Order} 는 무의미하므로 제거.
 */
public class TxIdFilter extends OncePerRequestFilter {

    /** MDC에 저장할 트랜잭션 ID 키 */
    static final String TX_ID_KEY = "txId";

    /**
     * OASIS MDCTemplate으로 전체 요청을 감싸서 service_tag를 설정하고,
     * 내부에서 임시 txId를 MDC에 추가한다.
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        new MDCTemplate() {
            @Override
            public void process() {
                MDC.put(TX_ID_KEY, UUID.randomUUID().toString().substring(0, 8));
                try {
                    filterChain.doFilter(request, response);
                } catch (ServletException | IOException e) {
                    throw new RuntimeException(e);
                }
            }
        }.mdc(null);
    }
}
