package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerException;
import com.dongkuk.dmes.analog.db.DbViewerLobSupport;
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
                        List.of(Map.of("CODE_ID", "A")), 1, 3, "SELECT ...", "MCMAPUSER", "T", null, Map.of()));
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

    @Test
    void LOB_상세_재조회를_위임한다() throws Exception {
        when(service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", "AAAS3aAAKAAAAEjAAA"))
                .thenReturn(new DbViewerLobSupport.LobResult("CONTENT", "CLOB", "text", 3, false,
                        "본문입니다", null, null, null, true, null));
        mockMvc.perform(post("/db/lob")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"schema\":\"MCMAPUSER\",\"table\":\"TB_NOTICE\",\"column\":\"CONTENT\","
                                + "\"rowid\":\"AAAS3aAAKAAAAEjAAA\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.column").value("CONTENT"))
                .andExpect(jsonPath("$.dataType").value("CLOB"))
                .andExpect(jsonPath("$.kind").value("text"))
                .andExpect(jsonPath("$.truncated").value(false))
                .andExpect(jsonPath("$.text").value("본문입니다"))
                .andExpect(jsonPath("$.base64").isEmpty())
                .andExpect(jsonPath("$.hex").isEmpty())
                .andExpect(jsonPath("$.lengthKnown").value(true))
                .andExpect(jsonPath("$.note").isEmpty());
    }

    @Test
    void 조회_결과는_스키마_테이블_rowIdKey_lobColumns를_담는다() throws Exception {
        when(service.queryStructured(anyString(), anyString(), anyList(), any()))
                .thenReturn(new DbViewerService.QueryResult(List.of("CONTENT"),
                        List.of(Map.of("CONTENT", "글")), 1, 3, "SELECT ...", "MCMAPUSER", "TB_NOTICE",
                        "_ROWID", Map.of("CONTENT", "CLOB")));
        mockMvc.perform(post("/db/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"schema\":\"MCMAPUSER\",\"table\":\"TB_NOTICE\",\"columns\":[\"CONTENT\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schema").value("MCMAPUSER"))
                .andExpect(jsonPath("$.table").value("TB_NOTICE"))
                .andExpect(jsonPath("$.rowIdKey").value("_ROWID"))
                .andExpect(jsonPath("$.lobColumns.CONTENT").value("CLOB"))
                .andExpect(jsonPath("$.columns[0]").value("CONTENT"));
    }

    @Test
    void LOB_거부는_상태코드와_사유를_본문에_싣는다() throws Exception {
        when(service.readLob(anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new DbViewerException(400, "LOB·RAW 칸이 아닙니다"));
        MockMvc withAdvice = MockMvcBuilders.standaloneSetup(new DbViewerController(providerOf(service)))
                .setControllerAdvice(new DbViewerExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
        withAdvice.perform(post("/db/lob")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"schema\":\"A\",\"table\":\"B\",\"column\":\"C\",\"rowid\":\"D\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("LOB·RAW 칸이 아닙니다"));
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<DbViewerService> providerOf(DbViewerService service) {
        ObjectProvider<DbViewerService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(service);
        return provider;
    }
}
