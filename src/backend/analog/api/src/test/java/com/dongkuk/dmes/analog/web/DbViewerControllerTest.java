package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 컨트롤러 계약 시험 — 서비스 목 주입 standalone MockMvc. */
class DbViewerControllerTest {

    private MockMvc mockMvc;
    private DbViewerService service;

    @BeforeEach
    void setUp() {
        service = mock(DbViewerService.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<DbViewerService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(service);
        DbViewerController controller = new DbViewerController(provider);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
    }

    @Test
    void 테이블_목록을_반환한다() throws Exception {
        when(service.listTables(anyString())).thenReturn(List.of("TB_MCM_CODE_MASTER"));
        mockMvc.perform(get("/db/tables").param("schema", "MCMAPUSER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0]").value("TB_MCM_CODE_MASTER"));
    }

    @Test
    void 구조화_조회를_위임한다() throws Exception {
        when(service.queryStructured(anyString(), anyString(), anyList(), any()))
                .thenReturn(new DbViewerService.QueryResult(List.of("CODE_ID"),
                        List.of(Map.of("CODE_ID", "A")), 1, 3, "SELECT ..."));
        mockMvc.perform(post("/db/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"schema\":\"MCMAPUSER\",\"table\":\"T\",\"columns\":[\"CODE_ID\"],\"limit\":50}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rowCount").value(1));
    }

    @Test
    void 빈_요청은_400이다() throws Exception {
        mockMvc.perform(post("/db/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }
}
