package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.ResponseMeta;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@link OasisController} 매핑 회귀 테스트.
 *
 * <p>BFF/게이트웨이 prefix 가 붙어도 OASIS 실행 계약은
 * {@code serviceId}/{action} 만 executor 로 전달되어야 한다.
 */
class OasisControllerTest {

    @Test
    @DisplayName("OASIS URL 세 형태 모두 executor 로 라우팅")
    void handle_acceptsCanonicalGatewayAndPublicBffPaths() throws Exception {
        OasisServiceExecutor executor = mock(OasisServiceExecutor.class);
        CactusResponse response = new CactusResponse.Builder(
                ResponseMeta.success("tx-test"))
                .build();
        when(executor.execute(eq("secFavorite"), eq("search"), any(CactusRequest.class)))
                .thenReturn(response);

        MockMvc mockMvc = MockMvcBuilders
                .standaloneSetup(new OasisController(executor))
                .setCustomHandlerMapping(CactusRequestMappingHandlerMapping::new)
                .build();

        String body = """
                {"meta":{"userId":"admin","menuId":"HOME"},"params":{"userId":"admin"}}
                """;

        mockMvc.perform(post("/oasis/secFavorite/search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
        mockMvc.perform(post("/mcm/oasis/secFavorite/search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/mcm/oasis/secFavorite/search")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());

        ArgumentCaptor<CactusRequest> requestCaptor = ArgumentCaptor.forClass(CactusRequest.class);
        verify(executor, times(3)).execute(eq("secFavorite"), eq("search"), requestCaptor.capture());
        assertThat(requestCaptor.getAllValues())
                .allSatisfy(request -> assertThat(request.getMeta().userId()).isEqualTo("admin"));
    }
}
