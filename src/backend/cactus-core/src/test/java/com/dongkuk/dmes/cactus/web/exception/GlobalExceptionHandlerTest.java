package com.dongkuk.dmes.cactus.web.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    /**
     * 없는 경로는 404 다 — 화면 메타 공급자는 엔드포인트가 없는 모듈(mdm·analog)의 404 를 "메타 없음" 으로 보고 끄는데,
     * 500 으로 바뀌면 화면마다 다시 부르고 e2e 감시(5xx 금지)에 걸린다(spec 2026-10-03-mdm-screen-meta-validation-design.md B5).
     */
    @Test
    void 없는_경로는_404_로_답한다() {
        ResponseEntity<CactusResponse> res = handler.handleException(
                new NoResourceFoundException(HttpMethod.POST, "/api/mdm/mdmMeta/columns", "api/mdm/mdmMeta/columns"));

        assertThat(res.getStatusCode().value()).isEqualTo(404);
        assertThat(res.getBody().getMeta().code()).isEqualTo("E404");
    }

    /** 프레임워크가 상태를 정한 다른 요청 오류(4xx)도 그 상태를 지킨다. */
    @Test
    void 프레임워크_요청_오류는_그_상태를_지킨다() {
        ResponseEntity<CactusResponse> res = handler.handleException(new HttpRequestMethodNotSupportedException("DELETE"));

        assertThat(res.getStatusCode().value()).isEqualTo(405);
    }

    /** 예상하지 못한 예외는 지금처럼 500·S999 다. */
    @Test
    void 예상하지_못한_예외는_500_이다() {
        ResponseEntity<CactusResponse> res = handler.handleException(new IllegalStateException("boom"));

        assertThat(res.getStatusCode().value()).isEqualTo(500);
        assertThat(res.getBody().getMeta().code()).isEqualTo("S999");
    }
}
