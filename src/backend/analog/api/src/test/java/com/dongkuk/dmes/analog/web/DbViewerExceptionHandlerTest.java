package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 사용자 SQL 탓 오라클 오류는 400 + 짧은 안내, 서버 쪽 오류는 지금처럼 500 으로 둔다. */
class DbViewerExceptionHandlerTest {

    private static final String SERVER_SQL =
            "SELECT NOTICE_ID FROM \"MCMAPUSER\".\"TB_MCM_NOTICE\" WHERE TITLE = FETCH FIRST 200 ROWS ONLY";

    private MockMvc mockMvc;
    private DbViewerService service;

    @BeforeEach
    void setUp() {
        service = mock(DbViewerService.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<DbViewerService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(service);
        mockMvc = MockMvcBuilders.standaloneSetup(new DbViewerController(provider))
                .setControllerAdvice(new DbViewerExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
    }

    private org.springframework.test.web.servlet.ResultActions query() throws Exception {
        return mockMvc.perform(post("/db/query")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sql\":\"SELECT NOTICE_ID FROM MCMAPUSER.TB_MCM_NOTICE WHERE TITLE =\"}"));
    }

    @Test
    void ORA_03049는_400과_짧은_안내이고_FETCH_절과_내부_SQL을_싣지_않는다() throws Exception {
        when(service.query(anyString())).thenThrow(new BadSqlGrammarException("StatementCallback", SERVER_SQL,
                new SQLException("ORA-03049: SQL keyword 'FETCH' is not properly used", "42000", 3049)));
        query().andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DB_VIEWER_SQL_ERROR"))
                .andExpect(jsonPath("$.message").value(
                        "SQL 문법 오류: ORA-03049 SQL 끝부분(WHERE 조건 등)이 완성되었는지 확인해 주세요."));
    }

    @Test
    void ORA_00904는_400이고_첫_줄만_쓴다() throws Exception {
        when(service.query(anyString())).thenThrow(new BadSqlGrammarException("StatementCallback", SERVER_SQL,
                new SQLException("ORA-00904: \"PIN\": invalid identifier\n\nHelp: https://docs.oracle.com/error-help/db/ora-00904/",
                        "42000", 904)));
        query().andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("SQL 문법 오류: ORA-00904: \"PIN\": invalid identifier"));
    }

    @Test
    void 분류되지_않은_예외라도_오류_번호가_사용자_SQL_탓이면_400이다() throws Exception {
        when(service.query(anyString())).thenThrow(new UncategorizedSQLException("StatementCallback", SERVER_SQL,
                new SQLException("ORA-01722: invalid number", "42000", 1722)));
        query().andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("SQL 문법 오류: ORA-01722: invalid number"));
    }

    @Test
    void 닫는_따옴표가_빠진_ORA_01756은_400이다() throws Exception {
        when(service.query(anyString())).thenThrow(new BadSqlGrammarException("StatementCallback", SERVER_SQL,
                new SQLException("ORA-01756: quoted string not properly terminated", "42000", 1756)));
        query().andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("SQL 문법 오류: ORA-01756: quoted string not properly terminated"));
    }

    @Test
    void 사용자_식별자에_FETCH가_들어_있어도_원래_안내를_유지한다() throws Exception {
        when(service.query(anyString())).thenThrow(new BadSqlGrammarException("StatementCallback", SERVER_SQL,
                new SQLException("ORA-00904: \"FETCH_DT\": invalid identifier", "42000", 904)));
        query().andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("SQL 문법 오류: ORA-00904: \"FETCH_DT\": invalid identifier"));
    }

    @Test
    void 연결_권한_시간_초과_같은_서버_쪽_오류는_400으로_바꾸지_않는다() {
        when(service.query(anyString())).thenThrow(new UncategorizedSQLException("StatementCallback", SERVER_SQL,
                new SQLException("ORA-01017: invalid credential or not authorized", "72000", 1017)));
        assertThatThrownBy(this::query).hasRootCauseInstanceOf(SQLException.class);

        doThrow(new QueryTimeoutException("ORA-01013: user requested cancel")).when(service).query(anyString());
        assertThatThrownBy(this::query).hasRootCauseInstanceOf(QueryTimeoutException.class);
    }

    @Test
    void 사용자_SQL_오류_번호_판정() {
        assertThat(DbViewerExceptionHandler.isUserSqlError(933)).isTrue();
        assertThat(DbViewerExceptionHandler.isUserSqlError(942)).isTrue();
        assertThat(DbViewerExceptionHandler.isUserSqlError(1861)).isTrue();
        assertThat(DbViewerExceptionHandler.isUserSqlError(1756)).isTrue();
        assertThat(DbViewerExceptionHandler.isUserSqlError(1742)).isTrue();
        assertThat(DbViewerExceptionHandler.isUserSqlError(6550)).isTrue();
        assertThat(DbViewerExceptionHandler.isUserSqlError(1017)).isFalse();
        assertThat(DbViewerExceptionHandler.isUserSqlError(1013)).isFalse();
        assertThat(DbViewerExceptionHandler.isUserSqlError(12541)).isFalse();
        assertThat(DbViewerExceptionHandler.isUserSqlError(0)).isFalse();
    }
}
