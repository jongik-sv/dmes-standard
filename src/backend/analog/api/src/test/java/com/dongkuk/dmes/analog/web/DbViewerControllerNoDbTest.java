package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** DB 미설정 시 503 + 안내 (ADR-0002 D5). 서비스 빈 없이 컨트롤러만 올린다. */
class DbViewerControllerNoDbTest {

    @Test
    void DB_미설정시_503이다() throws Exception {
        @SuppressWarnings("unchecked")
        ObjectProvider<DbViewerService> empty = mock(ObjectProvider.class);
        when(empty.getIfAvailable()).thenReturn(null);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new DbViewerController(empty))
                .setControllerAdvice(new DbViewerExceptionHandler())
                .build();
        mockMvc.perform(get("/db/tables").param("schema", "MCMAPUSER"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("DB 뷰어가 설정되지 않았습니다. analog.db.url을 확인해 주세요."));
    }
}
