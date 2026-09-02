package com.dongkuk.dmes.cactus.web.filter;

import com.dongkuk.oasis.TraceConstants;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class TxIdFilterTest {

    private final TxIdFilter filter = new TxIdFilter();

    @Test
    void 필터_통과_시_service_tag가_MDC에_설정된다() throws ServletException, IOException {
        AtomicReference<String> captured = new AtomicReference<>();

        FilterChain chain = (req, res) ->
                captured.set(MDC.get(TraceConstants.SERVICE_TAG));

        filter.doFilter(
                new MockHttpServletRequest(),
                new MockHttpServletResponse(),
                chain);

        assertThat(captured.get()).isNotNull();
        assertThat(captured.get()).hasSize(4);
    }

    @Test
    void 필터_통과_시_txId가_MDC에_설정된다() throws ServletException, IOException {
        AtomicReference<String> captured = new AtomicReference<>();

        FilterChain chain = (req, res) ->
                captured.set(MDC.get(TxIdFilter.TX_ID_KEY));

        filter.doFilter(
                new MockHttpServletRequest(),
                new MockHttpServletResponse(),
                chain);

        assertThat(captured.get()).isNotNull();
        assertThat(captured.get()).hasSize(8);
    }

    @Test
    void 필터_완료_후_MDC가_클리어된다() throws ServletException, IOException {
        FilterChain chain = (req, res) -> {
            // 체인 내부에서는 값이 있어야 함
            assertThat(MDC.get(TraceConstants.SERVICE_TAG)).isNotNull();
            assertThat(MDC.get(TxIdFilter.TX_ID_KEY)).isNotNull();
        };

        filter.doFilter(
                new MockHttpServletRequest(),
                new MockHttpServletResponse(),
                chain);

        // 필터 완료 후 MDC 비어있어야 함
        assertThat(MDC.get(TraceConstants.SERVICE_TAG)).isNull();
        assertThat(MDC.get(TxIdFilter.TX_ID_KEY)).isNull();
    }

    @Test
    void 매_요청마다_다른_service_tag가_생성된다() throws ServletException, IOException {
        AtomicReference<String> first = new AtomicReference<>();
        AtomicReference<String> second = new AtomicReference<>();

        filter.doFilter(
                new MockHttpServletRequest(),
                new MockHttpServletResponse(),
                (req, res) -> first.set(MDC.get(TraceConstants.SERVICE_TAG)));

        filter.doFilter(
                new MockHttpServletRequest(),
                new MockHttpServletResponse(),
                (req, res) -> second.set(MDC.get(TraceConstants.SERVICE_TAG)));

        // 극히 드물게 같을 수 있으나 10회 중 1회라도 다르면 통과
        boolean allSame = true;
        for (int i = 0; i < 10; i++) {
            AtomicReference<String> a = new AtomicReference<>();
            AtomicReference<String> b = new AtomicReference<>();
            filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(),
                    (req, res) -> a.set(MDC.get(TraceConstants.SERVICE_TAG)));
            filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(),
                    (req, res) -> b.set(MDC.get(TraceConstants.SERVICE_TAG)));
            if (!a.get().equals(b.get())) {
                allSame = false;
                break;
            }
        }
        assertThat(allSame).isFalse();
    }
}
