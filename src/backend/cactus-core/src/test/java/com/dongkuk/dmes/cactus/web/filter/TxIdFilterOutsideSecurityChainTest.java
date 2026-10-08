package com.dongkuk.dmes.cactus.web.filter;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.cactus.security.filter.ClientKeyFilter;
import com.dongkuk.oasis.TraceConstants;
import jakarta.servlet.http.HttpServlet;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.DefaultSecurityFilterChain;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.util.matcher.AnyRequestMatcher;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link TxIdFilter} 를 보안 필터 체인(FilterChainProxy) 바깥에 두면, FilterChainProxy 가 체인을
 * 시작하기 전에 남기는 "Securing ..." 로그에도 MDC {@code service_tag} 가 이미 있는지 확인한다.
 * 보안 단계에서 거절(401)되는 요청도 같은 방식으로 확인한다.
 */
class TxIdFilterOutsideSecurityChainTest {

    private static final String CLIENT_KEY = "test-client-key";

    private Logger chainProxyLogger;
    private Level originalLevel;
    private ListAppender<ILoggingEvent> appender;

    @BeforeEach
    void attachAppender() {
        chainProxyLogger = (Logger) LoggerFactory.getLogger(FilterChainProxy.class);
        originalLevel = chainProxyLogger.getLevel();
        chainProxyLogger.setLevel(Level.DEBUG);
        appender = new ListAppender<>();
        appender.start();
        chainProxyLogger.addAppender(appender);
    }

    @AfterEach
    void detachAppender() {
        chainProxyLogger.detachAppender(appender);
        chainProxyLogger.setLevel(originalLevel);
    }

    private FilterChainProxy securityChainWithClientKey() {
        ClientKeyFilter clientKeyFilter = new ClientKeyFilter(CLIENT_KEY, List.of());
        return new FilterChainProxy(
                new DefaultSecurityFilterChain(AnyRequestMatcher.INSTANCE, clientKeyFilter));
    }

    private ILoggingEvent securingEvent() {
        return appender.list.stream()
                .filter(e -> e.getFormattedMessage().startsWith("Securing "))
                .findFirst()
                .orElseThrow(() -> new AssertionError("FilterChainProxy 의 Securing 로그가 없다: " + appender.list));
    }

    @Test
    void Securing_로그가_찍힐_때_service_tag가_이미_MDC에_있다() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/oasis/sample");
        request.addHeader("X-Client-Key", CLIENT_KEY);
        MockHttpServletResponse response = new MockHttpServletResponse();

        // servlet 필터 순서: TxIdFilter(바깥) → FilterChainProxy(보안 체인)
        new TxIdFilter().doFilter(request, response,
                new MockFilterChain(new HttpServlet() { }, securityChainWithClientKey()));

        String tag = securingEvent().getMDCPropertyMap().get(TraceConstants.SERVICE_TAG);
        assertThat(tag).isNotNull().hasSize(4);
    }

    @Test
    void 보안_단계에서_401로_거절되는_요청에도_Securing_로그에_태그가_붙는다() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/oasis/sample");
        // X-Client-Key 헤더 없음 → ClientKeyFilter 가 401 로 short-circuit
        MockHttpServletResponse response = new MockHttpServletResponse();

        new TxIdFilter().doFilter(request, response,
                new MockFilterChain(new HttpServlet() { }, securityChainWithClientKey()));

        assertThat(response.getStatus()).isEqualTo(401);
        String tag = securingEvent().getMDCPropertyMap().get(TraceConstants.SERVICE_TAG);
        assertThat(tag).isNotNull().hasSize(4);
    }

    @Test
    void 대조_TxIdFilter_가_체인_안쪽이면_Securing_로그에_태그가_없다() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/oasis/sample");
        MockHttpServletResponse response = new MockHttpServletResponse();

        // 예전 배치: TxIdFilter 가 SecurityFilterChain 안에 있다 → Securing 줄은 태그가 없다.
        FilterChainProxy inner = new FilterChainProxy(
                new DefaultSecurityFilterChain(AnyRequestMatcher.INSTANCE, new TxIdFilter()));
        inner.doFilter(request, response, new MockFilterChain(new HttpServlet() { }));

        assertThat(securingEvent().getMDCPropertyMap()).doesNotContainKey(TraceConstants.SERVICE_TAG);
    }
}
