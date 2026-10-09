package com.dongkuk.dmes.analog.web;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.analog.db.DbViewerException;
import com.dongkuk.dmes.analog.db.DbViewerProperties;
import com.dongkuk.dmes.analog.db.DbViewerService;
import com.dongkuk.dmes.analog.db.DbViewerValidator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 거절된 조회 기록 — 사용자 id·사유 코드·SQL 앞부분을 WARN 으로 남기고, 기록이 실패해도 거절은 그대로다. */
class DbViewerRejectAuditTest {

    private static final Set<String> ALLOWED = Set.of("MCMAPUSER");

    private DbViewerService service;
    private ListAppender<ILoggingEvent> appender;
    private Logger auditLogger;
    private Level previousLevel;

    @BeforeEach
    void setUp() {
        service = new DbViewerService(mock(JdbcTemplate.class), new DbViewerProperties());
        auditLogger = (Logger) LoggerFactory.getLogger("dbViewerAudit");
        previousLevel = auditLogger.getLevel();
        auditLogger.setLevel(Level.INFO);
        appender = new ListAppender<>();
        appender.start();
        auditLogger.addAppender(appender);
    }

    @AfterEach
    void tearDown() {
        auditLogger.detachAppender(appender);
        auditLogger.setLevel(previousLevel);
    }

    private String lastMessage() {
        assertThat(appender.list).hasSize(1);
        ILoggingEvent event = appender.list.get(0);
        assertThat(event.getLevel()).isEqualTo(Level.WARN);
        return event.getFormattedMessage();
    }

    /** 검사기가 실제로 던지는 거절을 받아 온다 — 사유 문구가 바뀌면 코드 구분 시험이 먼저 깨진다. */
    private static DbViewerException rejectedBy(String sql) {
        try {
            DbViewerValidator.parseSelect(sql, ALLOWED);
        } catch (DbViewerException e) {
            return e;
        }
        throw new AssertionError("거절돼야 하는 SQL 이 통과했다: " + sql);
    }

    @Test
    void 쓰기_DDL_복문_주석_괄호는_각자_고정_코드로_남는다() {
        String[][] cases = {
                {"DELETE FROM MCMAPUSER.TB_X", "NOT_SELECT"},
                {"UPDATE MCMAPUSER.TB_X SET A = 1", "NOT_SELECT"},
                {"DROP TABLE MCMAPUSER.TB_X", "NOT_SELECT"},
                {"SELECT A FROM MCMAPUSER.TB_X; SELECT B FROM MCMAPUSER.TB_Y", "MULTI_STATEMENT"},
                {"SELECT A FROM MCMAPUSER.TB_X -- 주석", "COMMENT"},
                {"SELECT A FROM MCMAPUSER.TB_X WHERE A IN (SELECT 1 FROM DUAL)", "PAREN"},
                {"SELECT A FROM OTHERUSER.TB_X", "SCHEMA"},
                {"SELECT * FROM TB_X", "FROM_FORMAT"},
                {"SELECT A FROM MCMAPUSER.TB_X FROM MCMAPUSER.TB_Y", "MULTI_TABLE"},
                {"SELECT USER_PASS FROM MCMAPUSER.TB_X", "SENSITIVE"},
                {"SELECT A FROM MCMAPUSER.TB_X WHERE A = 1 UNION SELECT 1 FROM DUAL", "FORBIDDEN_KEYWORD"},
                {"SELECT " + "A, ".repeat(300) + "B FROM MCMAPUSER.TB_X", "TOO_LONG"},
        };
        for (String[] c : cases) {
            appender.list.clear();
            service.auditRejectedQuery("u1", c[0], rejectedBy(c[0]));
            assertThat(lastMessage()).as(c[0]).contains("code=" + c[1]);
        }
    }

    @Test
    void 사용자_id_사유_상태_SQL을_한_줄에_남긴다() {
        String sql = "DELETE FROM MCMAPUSER.TB_X";
        service.auditRejectedQuery("41000132", sql, rejectedBy(sql));
        assertThat(lastMessage()).startsWith("query-rejected user=41000132 code=NOT_SELECT status=400 reason=")
                .endsWith(" sql=" + sql);
    }

    @Test
    void SQL은_줄바꿈을_없애고_500자까지만_남긴다() {
        String sql = "DELETE\nFROM\r\n  MCMAPUSER.TB_X\tWHERE A = '" + "x".repeat(2000) + "'";
        service.auditRejectedQuery("u1", sql, rejectedBy(sql));
        String message = lastMessage();
        String logged = message.substring(message.indexOf(" sql=") + 5);
        assertThat(logged).startsWith("DELETE FROM MCMAPUSER.TB_X WHERE A = '");
        assertThat(logged).hasSize(500 + 1).endsWith("…");
        assertThat(message).doesNotContain("\n").doesNotContain("\r");
    }

    @Test
    void 사용자_id가_없으면_하이픈이고_길고_위조된_값은_이스케이프해_자른다() {
        String sql = "DELETE FROM MCMAPUSER.TB_X";
        service.auditRejectedQuery(null, sql, rejectedBy(sql));
        assertThat(lastMessage()).contains("user=- ");

        appender.list.clear();
        service.auditRejectedQuery("u1\nquery-rejected user=admin" + "z".repeat(200), sql, rejectedBy(sql));
        String message = lastMessage();
        assertThat(message).doesNotContain("\n");
        assertThat(message).contains("user=u1_query-rejected_user=admin");
        assertThat(message.substring(message.indexOf("user="), message.indexOf(" code="))).hasSizeLessThan(64 + 40);
    }

    @Test
    void 기록_인자가_비어도_예외를_내지_않는다() {
        assertThatCode(() -> service.auditRejectedQuery(null, null, null)).doesNotThrowAnyException();
        assertThat(lastMessage()).contains("code=UNKNOWN");
    }

    // ------------------------------------------------------------ 컨트롤러 연결

    private MockMvc mvc(DbViewerService mockService) {
        @SuppressWarnings("unchecked")
        ObjectProvider<DbViewerService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(mockService);
        return MockMvcBuilders.standaloneSetup(new DbViewerController(provider))
                .setControllerAdvice(new DbViewerExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
    }

    @Test
    void 컨트롤러는_거절을_기록한_뒤_같은_400을_돌려준다() throws Exception {
        DbViewerService mocked = mock(DbViewerService.class);
        DbViewerException rejected = new DbViewerException(400, "SELECT 문만 실행할 수 있습니다.");
        when(mocked.query(anyString())).thenThrow(rejected);
        mvc(mocked).perform(post("/db/query")
                        .header("X-Authenticated-User", "41000132")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sql\":\"DELETE FROM MCMAPUSER.TB_X\"}"))
                .andExpect(status().isBadRequest());
        verify(mocked).auditRejectedQuery("41000132", "DELETE FROM MCMAPUSER.TB_X", rejected);
    }

    @Test
    void 더보기_요청의_거절도_기록하고_헤더가_없으면_사용자는_null이다() throws Exception {
        DbViewerService mocked = mock(DbViewerService.class);
        DbViewerException rejected = new DbViewerException(400, "정렬 기준이 없어 이어 볼 수 없습니다.");
        when(mocked.queryMore(anyString(), any(), any())).thenThrow(rejected);
        mvc(mocked).perform(post("/db/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sql\":\"SELECT A FROM MCMAPUSER.TB_X\",\"offset\":200}"))
                .andExpect(status().isBadRequest());
        verify(mocked).auditRejectedQuery(eq(null), eq("SELECT A FROM MCMAPUSER.TB_X"), eq(rejected));
    }

    @Test
    void 서비스가_없으면_본문이_비어도_예전처럼_400이고_기록은_없다() throws Exception {
        @SuppressWarnings("unchecked")
        ObjectProvider<DbViewerService> none = mock(ObjectProvider.class);
        when(none.getIfAvailable()).thenReturn(null);
        MockMvc noService = MockMvcBuilders.standaloneSetup(new DbViewerController(none))
                .setControllerAdvice(new DbViewerExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter())
                .build();
        noService.perform(post("/db/query").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        noService.perform(post("/db/query").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sql\":\"SELECT A FROM MCMAPUSER.TB_X\"}"))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void 성공한_조회는_거절_기록을_남기지_않는다() throws Exception {
        DbViewerService mocked = mock(DbViewerService.class);
        when(mocked.query(anyString())).thenReturn(new DbViewerService.QueryResult(List.of("A"), List.of(), 0, 1,
                "SELECT ...", "MCMAPUSER", "TB_X", null, java.util.Map.of()));
        mvc(mocked).perform(post("/db/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sql\":\"SELECT A FROM MCMAPUSER.TB_X\"}"))
                .andExpect(status().isOk());
        verify(mocked, never()).auditRejectedQuery(any(), any(), any());
    }
}
