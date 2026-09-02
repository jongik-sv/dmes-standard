package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link ServiceController} 단위 테스트.
 *
 * <p>핵심 회귀 케이스: {@code /service} 와 {@code /query/service} 가 각각 다른 action 으로
 * {@link OasisServiceExecutor#execute} 를 호출.
 */
class ServiceControllerTest {

    @Test
    @DisplayName("/service/{serviceId} 는 action='execute' 로 호출")
    void service_executesWithExecuteAction() {
        OasisServiceExecutor executor = mock(OasisServiceExecutor.class);
        CactusResponse expected = mock(CactusResponse.class);
        when(executor.execute(eq("svc-1"), eq("execute"), any())).thenReturn(expected);

        ServiceController controller = new ServiceController(executor);
        CactusRequest request = new CactusRequest();
        CactusResponse actual = controller.service("svc-1", request);

        assertThat(actual).isSameAs(expected);
        verify(executor).execute("svc-1", "execute", request);
    }

    @Test
    @DisplayName("/query/service/{serviceId} 는 action='query' 로 호출 (read-only 인텐트)")
    void queryService_executesWithQueryAction() {
        OasisServiceExecutor executor = mock(OasisServiceExecutor.class);
        CactusResponse expected = mock(CactusResponse.class);
        when(executor.execute(eq("svc-q"), eq("query"), any())).thenReturn(expected);

        ServiceController controller = new ServiceController(executor);
        CactusRequest request = new CactusRequest();
        CactusResponse actual = controller.queryService("svc-q", request);

        assertThat(actual).isSameAs(expected);
        verify(executor).execute("svc-q", "query", request);
    }
}
