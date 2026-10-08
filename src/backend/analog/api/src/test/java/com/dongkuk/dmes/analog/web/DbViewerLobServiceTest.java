package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerException;
import com.dongkuk.dmes.analog.db.DbViewerProperties;
import com.dongkuk.dmes.analog.db.DbViewerService;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.mockito.InOrder;
import org.slf4j.LoggerFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;

import java.io.StringReader;
import java.sql.Clob;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 서비스 시험 — JdbcTemplate 목. /db/lob 거부 경로와 ROWID 추가 조건. */
class DbViewerLobServiceTest {

    private static final String ROWID = "AAAS3aAAKAAAAEjAAA";

    private JdbcTemplate jdbc;
    private DbViewerProperties properties;
    private DbViewerService service;
    private ListAppender<ILoggingEvent> auditLog;
    private final Logger auditLogger = (Logger) LoggerFactory.getLogger("dbViewerAudit");

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        properties = new DbViewerProperties();
        service = new DbViewerService(jdbc, properties);
        auditLog = new ListAppender<>();
        auditLog.start();
        auditLogger.setLevel(Level.INFO);
        auditLogger.addAppender(auditLog);
    }

    @AfterEach
    void tearDown() {
        auditLogger.detachAppender(auditLog);
    }

    private List<String> auditMessages() {
        return auditLog.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
    }

    private void dictionary(String dataType) {
        when(jdbc.queryForList(anyString(), eq(String.class), eq("MCMAPUSER"), eq("TB_NOTICE"), eq("CONTENT")))
                .thenReturn(dataType == null ? List.of() : List.of(dataType));
        objectKind("MCMAPUSER", "TB_NOTICE", "TABLE");
    }

    /** 대상 종류 사전 조회(ALL_TABLES·ALL_VIEWS) — kind 가 null 이면 사전에 없음(동의어 포함). */
    private void objectKind(String owner, String table, String kind) {
        when(jdbc.queryForList(anyString(), eq(String.class), eq(owner), eq(table), eq(owner), eq(table)))
                .thenReturn(kind == null ? List.of() : List.of(kind));
    }

    /** 칸 이름·형식 사전 조회 — 이름, 형식 순서의 쌍. */
    private void columns(String owner, String table, String... nameAndType) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < nameAndType.length; i += 2) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("COLUMN_NAME", nameAndType[i]);
            row.put("DATA_TYPE", nameAndType[i + 1]);
            rows.add(row);
        }
        when(jdbc.queryForList(anyString(), eq(owner), eq(table))).thenReturn(rows);
    }

    private void assertRejected(Runnable call, int status, String messagePart) {
        assertThatThrownBy(call::run)
                .isInstanceOfSatisfying(DbViewerException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(status);
                    assertThat(e.getReason()).contains(messagePart);
                });
    }

    // ------------------------------------------------------------ /db/lob 거부 경로

    @Test
    void 허용_밖_스키마를_거부한다() {
        assertRejected(() -> service.readLob("SCOTT", "EMP", "CONTENT", ROWID), 400, "허용되지 않은 스키마");
        verify(jdbc, never()).queryForList(anyString(), eq(String.class), any(Object[].class));
    }

    @Test
    void 잘못된_식별자를_거부한다() {
        assertRejected(() -> service.readLob("MCMAPUSER", "T; DROP TABLE X", "CONTENT", ROWID), 400, "형식");
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "A\"B", ROWID), 400, "형식");
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", null, ROWID), 400, "형식");
    }

    @Test
    void 민감_칸을_거부한다() {
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "USER_PASSWORD", ROWID), 400, "민감");
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "api_token", ROWID), 400, "민감");
    }

    @Test
    void 사전에_없는_칸은_404다() {
        dictionary(null);
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", ROWID), 404, "찾을 수 없습니다");
    }

    @Test
    void LOB가_아닌_칸은_400이다() {
        dictionary("VARCHAR2");
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", ROWID), 400,
                "LOB·RAW 칸이 아닙니다");
        dictionary("BFILE");
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", ROWID), 400,
                "LOB·RAW 칸이 아닙니다");
    }

    @Test
    void 잘못된_rowid_형식을_거부하고_SQL을_실행하지_않는다() {
        dictionary("CLOB");
        for (String bad : new String[]{null, "", "short", "AAAS3aAAKAAAAEjAAA1", "AAAS3aAAKAAAAEjAA'",
                "AAAS3aAAKAAAAEjAA ", "AAAS3aAAKAAAAEjAA-", "' OR 1=1 --xxxxxxx"}) {
            assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", bad), 400, "rowid");
        }
        verify(jdbc, never()).query(anyString(), any(ResultSetExtractor.class), any(Object[].class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void 행이_없으면_404다() {
        dictionary("CLOB");
        when(jdbc.query(anyString(), any(ResultSetExtractor.class), eq(ROWID))).thenReturn(null);
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", ROWID), 404,
                "행을 찾을 수 없습니다. 다시 조회해 주세요");
    }

    @Test
    @SuppressWarnings("unchecked")
    void ORA_01410은_행_없음으로_본다() {
        dictionary("BLOB");
        DataAccessException ora = new UncategorizedSQLException("x", "sql", new SQLException("ORA-01410", "42000", 1410));
        when(jdbc.query(anyString(), any(ResultSetExtractor.class), eq(ROWID))).thenThrow(ora);
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", ROWID), 404,
                "행을 찾을 수 없습니다");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 확인된_식별자만_따옴표로_감싸고_rowid는_바인드로_넘긴다() {
        dictionary("clob".toUpperCase());
        when(jdbc.query(anyString(), any(ResultSetExtractor.class), eq(ROWID))).thenReturn(null);
        assertThatThrownBy(() -> service.readLob(" mcmapuser ", "tb_notice", " content ", ROWID))
                .isInstanceOf(DbViewerException.class);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(ResultSetExtractor.class), eq(ROWID));
        assertThat(sql.getValue()).isEqualTo(
                "SELECT \"CONTENT\" FROM \"MCMAPUSER\".\"TB_NOTICE\" WHERE ROWID = CHARTOROWID(?)");
        assertThat(sql.getValue()).doesNotContain(ROWID);
    }



    // ------------------------------------------------------------ /db/lob 실제 표·차단·감사

    @Test
    void 뷰나_IOT_외부표_같은_실제_표가_아닌_대상은_lob을_400으로_거부한다() {
        dictionary("CLOB");
        objectKind("MCMAPUSER", "TB_NOTICE", "OTHER");
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", ROWID), 400, "실제 표가 아닙니다");
        verify(jdbc, never()).query(anyString(), any(ResultSetExtractor.class), any(Object[].class));
    }

    @Test
    void 동의어_등_사전에_없는_대상은_lob을_거부한다() {
        dictionary("CLOB");
        objectKind("MCMAPUSER", "TB_NOTICE", null);
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", ROWID), 400, "실제 표가 아닙니다");
    }

    @Test
    void 차단_표는_lob도_400으로_거부하고_사전을_읽지_않는다() {
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_SEC_AUDIT_LOG", "DETAIL", ROWID), 400,
                "조회할 수 없는 표입니다: TB_SEC_AUDIT_LOG");
        assertRejected(() -> service.readLob("MCM_SOURCE", "tb_sec_key_store", "DETAIL", ROWID), 400,
                "조회할 수 없는 표입니다: TB_SEC_KEY_STORE");
        verifyNoInteractions(jdbc);
    }

    @Test
    void 거부된_lob도_상태코드와_사유를_감사_로그에_남기고_값의_줄바꿈을_이스케이프한다() {
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_SEC_KEY_STORE", "X", "AAA\nFAKE audit line"),
                400, "조회할 수 없는 표입니다");
        assertThat(auditMessages()).hasSize(1);
        String line = auditMessages().get(0);
        assertThat(line).startsWith("lob-rejected status=400 reason=조회할 수 없는 표입니다: TB_SEC_KEY_STORE");
        assertThat(line).contains("rowid=AAA\\nFAKE audit line").doesNotContain("\n");
    }

    @Test
    void 사전_404도_감사_로그에_남는다() {
        dictionary(null);
        assertRejected(() -> service.readLob("MCMAPUSER", "TB_NOTICE", "CONTENT", ROWID), 404, "찾을 수 없습니다");
        assertThat(auditMessages()).anyMatch(m -> m.startsWith("lob-rejected status=404"));
    }

    // ------------------------------------------------------------ 차단 표

    @Test
    void 기본_차단_4개는_모든_허용_스키마에서_목록에서_빠진다() {
        when(jdbc.queryForList(anyString(), eq(String.class), eq("MCM_SOURCE")))
                .thenReturn(List.of("TB_A", "TB_SEC_KEY_STORE", "TB_SEC_AUDIT_LOG", "TB_MCM_SEC_USER_WIDGET_CHAT",
                        "TB_MCM_SEC_USER_WIDGET_MEMO", "TB_B"));
        assertThat(service.listTables("MCM_SOURCE")).containsExactly("TB_A", "TB_B");
    }

    @Test
    void 차단_표는_컬럼_조회와_구조화_조회를_400으로_거부한다() {
        assertRejected(() -> service.listColumns("MCMAPUSER", "TB_SEC_KEY_STORE"), 400,
                "조회할 수 없는 표입니다: TB_SEC_KEY_STORE");
        assertRejected(() -> service.queryStructured("MCMAPUSER", "TB_SEC_KEY_STORE", null, null), 400,
                "조회할 수 없는 표입니다: TB_SEC_KEY_STORE");
        assertRejected(() -> service.queryStructured("MDMAPUSER", "tb_mcm_sec_user_widget_memo", List.of("A"), 5),
                400, "조회할 수 없는 표입니다: TB_MCM_SEC_USER_WIDGET_MEMO");
        verifyNoInteractions(jdbc);
    }

    @Test
    void 자유_SQL도_대소문자_따옴표를_바꿔도_차단_표를_거부한다() {
        for (String sql : new String[]{
                "SELECT * FROM MCMAPUSER.TB_SEC_AUDIT_LOG",
                "select * from mcmapuser.tb_sec_audit_log",
                "SELECT A FROM \"MCMAPUSER\".\"TB_SEC_AUDIT_LOG\"",
                "SELECT A FROM \"mcmapuser\".\"tb_sec_audit_log\" WHERE A = 'x'",
                "SELECT A FROM MCM_BACKUP.Tb_Mcm_Sec_User_Widget_Chat"}) {
            assertRejected(() -> service.query(sql), 400, "조회할 수 없는 표입니다");
        }
        verifyNoInteractions(jdbc);
    }

    @Test
    void JOIN_서브쿼리_쉼표로는_차단_표를_끼워_넣지_못한다() {
        for (String sql : new String[]{
                "SELECT A FROM MCMAPUSER.TB_NOTICE JOIN MCMAPUSER.TB_SEC_KEY_STORE ON 1=1",
                "SELECT A FROM MCMAPUSER.TB_NOTICE WHERE A IN (SELECT A FROM MCMAPUSER.TB_SEC_KEY_STORE)",
                "SELECT A FROM (SELECT * FROM MCMAPUSER.TB_SEC_KEY_STORE)"}) {
            assertThatThrownBy(() -> service.query(sql)).isInstanceOf(DbViewerException.class);
        }
        // 쉼표 조인은 첫 표만 남는다 — 실행 SQL 에 차단 표가 들어가지 않는다.
        objectKind("MCMAPUSER", "TB_NOTICE", "TABLE");
        columns("MCMAPUSER", "TB_NOTICE", "A", "VARCHAR2");
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenReturn(List.of());
        DbViewerService.QueryResult result =
                service.query("SELECT A FROM MCMAPUSER.TB_NOTICE, MCMAPUSER.TB_SEC_KEY_STORE");
        assertThat(result.executedSql()).doesNotContain("TB_SEC_KEY_STORE");
    }

    @Test
    void 설정의_차단_표는_기본_4개에_더해지고_기본을_줄일_수_없다() {
        properties.setDeniedTables(List.of(" tb_extra ", "TB_MCM_CODE_MASTER"));
        DbViewerService custom = new DbViewerService(jdbc, properties);
        assertRejected(() -> custom.queryStructured("MCMAPUSER", "TB_EXTRA", null, null), 400, "TB_EXTRA");
        assertRejected(() -> custom.queryStructured("MCMAPUSER", "TB_SEC_KEY_STORE", null, null), 400,
                "TB_SEC_KEY_STORE");

        properties.setDeniedTables(List.of());
        DbViewerService empty = new DbViewerService(jdbc, properties);
        assertRejected(() -> empty.queryStructured("MCMAPUSER", "TB_SEC_AUDIT_LOG", null, null), 400,
                "TB_SEC_AUDIT_LOG");

        properties.setDeniedTables(null);
        DbViewerService nullList = new DbViewerService(jdbc, properties);
        assertRejected(() -> nullList.queryStructured("MCMAPUSER", "TB_SEC_KEY_STORE", null, null), 400, "조회할 수 없는 표입니다");
    }

    @Test
    void 차단_표_이름만_비교하므로_비슷한_이름은_막지_않는다() {
        objectKind("MCMAPUSER", "TB_SEC_KEY_STORE_X", "TABLE");
        columns("MCMAPUSER", "TB_SEC_KEY_STORE_X", "A", "VARCHAR2");
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenReturn(List.of());
        assertThat(service.queryStructured("MCMAPUSER", "TB_SEC_KEY_STORE_X", null, null).rowCount()).isZero();
    }

    // ------------------------------------------------------------ 사전 확인 · 동의어 거부

    @Test
    void 동의어나_사전에_없는_이름은_명시_칸_경로도_404로_거부하고_SQL을_실행하지_않는다() {
        objectKind("MCMAPUSER", "SYN_OTHER", null);
        assertRejected(() -> service.queryStructured("MCMAPUSER", "SYN_OTHER", List.of("A"), 5), 404,
                "테이블 또는 컬럼을 찾을 수 없습니다");
        assertRejected(() -> service.query("SELECT A FROM MCMAPUSER.SYN_OTHER"), 404,
                "테이블 또는 컬럼을 찾을 수 없습니다");
        assertRejected(() -> service.query("SELECT * FROM MCMAPUSER.SYN_OTHER"), 404,
                "테이블 또는 컬럼을 찾을 수 없습니다");
        verify(jdbc, never()).query(anyString(), any(ResultSetExtractor.class));
    }

    @Test
    void 사전_조회_SQL은_해당_OWNER의_표와_뷰만_본다() {
        objectKind("MCMAPUSER", "TB_NOTICE", "TABLE");
        columns("MCMAPUSER", "TB_NOTICE", "A", "VARCHAR2");
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenReturn(List.of());
        service.query("SELECT A FROM MCMAPUSER.TB_NOTICE");
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).queryForList(sql.capture(), eq(String.class), eq("MCMAPUSER"), eq("TB_NOTICE"),
                eq("MCMAPUSER"), eq("TB_NOTICE"));
        assertThat(sql.getValue()).contains("ALL_TABLES").contains("ALL_VIEWS").contains("IOT_TYPE IS NULL")
                .contains("EXTERNAL = 'NO'").doesNotContain("SYNONYM");
    }

    // ------------------------------------------------------------ 민감 칸 필터 한 곳

    private String capturedSql() {
        ArgumentCaptor<String> captured = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(captured.capture(), any(ResultSetExtractor.class));
        return captured.getValue();
    }

    @Test
    void 구조화_조회의_빈_칸_목록도_민감_칸을_뺀다() {
        objectKind("MCMAPUSER", "TB_USER", "TABLE");
        columns("MCMAPUSER", "TB_USER", "USER_ID", "VARCHAR2", "USER_PASS", "VARCHAR2", "API_TOKEN", "VARCHAR2",
                "SECRET_NOTE", "VARCHAR2", "USER_NM", "VARCHAR2");
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenReturn(List.of());
        DbViewerService.QueryResult byNull = service.queryStructured("MCMAPUSER", "TB_USER", null, null);
        assertThat(byNull.columns()).containsExactly("USER_ID", "USER_NM");
        assertThat(capturedSql()).isEqualTo(
                "SELECT \"USER_ID\", \"USER_NM\" FROM \"MCMAPUSER\".\"TB_USER\" FETCH FIRST 201 ROWS ONLY");
    }

    @Test
    void 구조화_조회의_빈_목록_리스트와_별표_확장도_같은_결과다() {
        objectKind("MCMAPUSER", "TB_USER", "TABLE");
        columns("MCMAPUSER", "TB_USER", "USER_ID", "VARCHAR2", "PWD_HASH", "VARCHAR2");
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenReturn(List.of());
        assertThat(service.queryStructured("MCMAPUSER", "TB_USER", List.of(), 10).columns())
                .containsExactly("USER_ID");
        assertThat(service.query("SELECT * FROM MCMAPUSER.TB_USER").columns()).containsExactly("USER_ID");
    }

    @Test
    void 명시_칸에_민감_칸이_있으면_거부한다() {
        assertRejected(() -> service.queryStructured("MCMAPUSER", "TB_USER", List.of("USER_ID", "USER_PASS"), 5),
                400, "민감");
        assertRejected(() -> service.query("SELECT USER_ID, API_TOKEN FROM MCMAPUSER.TB_USER"), 400, "민감");
    }

    @Test
    void 모든_칸이_민감하면_조회_가능한_칸이_없다고_거부한다() {
        objectKind("MCMAPUSER", "TB_USER", "TABLE");
        columns("MCMAPUSER", "TB_USER", "USER_PASS", "VARCHAR2", "API_TOKEN", "VARCHAR2");
        assertRejected(() -> service.queryStructured("MCMAPUSER", "TB_USER", null, null), 400,
                "조회 가능한 컬럼이 없습니다");
        assertRejected(() -> service.query("SELECT * FROM MCMAPUSER.TB_USER"), 400, "조회 가능한 컬럼이 없습니다");
    }

    // ------------------------------------------------------------ ROWID 추가 조건

    @SuppressWarnings("unchecked")
    private DbViewerService.QueryResult runQuery(String kind, String sql, String... nameAndType) {
        objectKind("MCMAPUSER", "TB_NOTICE", kind);
        columns("MCMAPUSER", "TB_NOTICE", nameAndType);
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenReturn(List.of());
        return service.query(sql);
    }

    @Test
    void LOB_칸이_있는_실제_표_조회에는_ROWID_칸을_맨_앞에_더한다() {
        DbViewerService.QueryResult result = runQuery("TABLE", "SELECT NOTICE_ID, CONTENT FROM MCMAPUSER.TB_NOTICE",
                "NOTICE_ID", "NUMBER", "CONTENT", "CLOB");
        assertThat(result.executedSql()).isEqualTo("SELECT ROWIDTOCHAR(ROWID) \"_ROWID\", \"NOTICE_ID\", \"CONTENT\" "
                + "FROM \"MCMAPUSER\".\"TB_NOTICE\" FETCH FIRST 201 ROWS ONLY");
        assertThat(result.rowIdKey()).isEqualTo("_ROWID");
        assertThat(result.columns()).containsExactly("NOTICE_ID", "CONTENT");
        assertThat(capturedSql()).isEqualTo(result.executedSql());
    }

    @Test
    void LOB_칸이_조회_칸에_없으면_표에_LOB이_있어도_ROWID를_더하지_않는다() {
        DbViewerService.QueryResult result = runQuery("TABLE", "SELECT NOTICE_ID FROM MCMAPUSER.TB_NOTICE",
                "NOTICE_ID", "NUMBER", "CONTENT", "CLOB");
        assertThat(result.executedSql()).isEqualTo(
                "SELECT \"NOTICE_ID\" FROM \"MCMAPUSER\".\"TB_NOTICE\" FETCH FIRST 201 ROWS ONLY");
        assertThat(result.rowIdKey()).isNull();
    }

    @Test
    void 별표_확장에_LOB이_섞이면_ROWID를_더하고_RAW_LONG_RAW_BLOB_NCLOB도_LOB으로_본다() {
        for (String type : new String[]{"CLOB", "NCLOB", "BLOB", "RAW", "LONG RAW"}) {
            jdbc = mock(JdbcTemplate.class);
            service = new DbViewerService(jdbc, properties);
            DbViewerService.QueryResult result = runQuery("TABLE", "SELECT * FROM MCMAPUSER.TB_NOTICE",
                    "NOTICE_ID", "NUMBER", "DATA", type);
            assertThat(result.rowIdKey()).as(type).isEqualTo("_ROWID");
        }
        for (String type : new String[]{"LONG", "VARCHAR2", "DATE", "BFILE"}) {
            jdbc = mock(JdbcTemplate.class);
            service = new DbViewerService(jdbc, properties);
            DbViewerService.QueryResult result = runQuery("TABLE", "SELECT * FROM MCMAPUSER.TB_NOTICE",
                    "NOTICE_ID", "NUMBER", "DATA", type);
            assertThat(result.rowIdKey()).as(type).isNull();
        }
    }

    @Test
    void 뷰_등_실제_표가_아닌_대상은_LOB이_있어도_ROWID를_더하지_않는다() {
        DbViewerService.QueryResult result = runQuery("OTHER", "SELECT CONTENT FROM MCMAPUSER.TB_NOTICE",
                "CONTENT", "CLOB");
        assertThat(result.executedSql()).doesNotContain("ROWID");
        assertThat(result.rowIdKey()).isNull();
    }

    @Test
    void LOB_없는_조회의_SQL은_변경_전과_같다() {
        DbViewerService.QueryResult result = runQuery("TABLE",
                "SELECT CODE_ID, CODE_NM FROM MCMAPUSER.TB_NOTICE WHERE CODE_ID = 'A'",
                "CODE_ID", "VARCHAR2", "CODE_NM", "VARCHAR2");
        assertThat(result.executedSql()).isEqualTo("SELECT \"CODE_ID\", \"CODE_NM\" FROM \"MCMAPUSER\".\"TB_NOTICE\" "
                + "WHERE CODE_ID = 'A' FETCH FIRST 201 ROWS ONLY");
        assertThat(auditMessages().get(0)).isEqualTo("query MCMAPUSER.TB_NOTICE cols=2 rows=0 lobs=0 ms="
                + auditMessages().get(0).replaceAll(".* ms=(\\d+) .*", "$1")
                + " sql=" + result.executedSql());
    }

    // ------------------------------------------------------------ 감사 로그 이스케이프

    @Test
    void 사용자_WHERE의_줄바꿈과_제어문자가_감사_로그에서_이스케이프된다() {
        runQuery("TABLE", "SELECT CODE_ID FROM MCMAPUSER.TB_NOTICE WHERE CODE_NM = 'x\nINFO FAKE query line\r\t\u001b[31m'",
                "CODE_ID", "VARCHAR2");
        String line = auditMessages().get(0);
        assertThat(line).doesNotContain("\n").doesNotContain("\r").doesNotContain("\t").doesNotContain("\u001b");
        assertThat(line).contains("x\\nINFO FAKE query line\\r\\t\\u001b[31m");
    }

    @Test
    void escapeLog는_제어문자만_바꾸고_평범한_글은_그대로_둔다() {
        assertThat(DbViewerService.escapeLog("평범한 글 'a' = \"b\"")).isEqualTo("평범한 글 'a' = \"b\"");
        assertThat(DbViewerService.escapeLog("a\nb\rc\td\u0000e\u007ff g"))
                .isEqualTo("a\\nb\\rc\\td\\u0000e\\u007ff\\u2028g");
        assertThat(DbViewerService.escapeLog(null)).isEqualTo("null");
    }

    // ------------------------------------------------------------ 추출기(ResultSetExtractor) 직접 실행

    private ResultSetMetaData meta(String[] labels, int[] types, String[] typeNames) throws SQLException {
        ResultSetMetaData meta = mock(ResultSetMetaData.class);
        when(meta.getColumnCount()).thenReturn(labels.length);
        for (int i = 0; i < labels.length; i++) {
            when(meta.getColumnLabel(i + 1)).thenReturn(labels[i]);
            when(meta.getColumnType(i + 1)).thenReturn(types[i]);
            when(meta.getColumnTypeName(i + 1)).thenReturn(typeNames[i]);
        }
        return meta;
    }

    private ResultSet resultSet(ResultSetMetaData meta, int rowCount) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getMetaData()).thenReturn(meta);
        AtomicInteger next = new AtomicInteger();
        when(rs.next()).thenAnswer(inv -> next.getAndIncrement() < rowCount);
        return rs;
    }

    private Clob clobOf(String text) throws SQLException {
        Clob clob = mock(Clob.class);
        when(clob.getCharacterStream()).thenAnswer(inv -> new StringReader(text));
        when(clob.length()).thenReturn((long) text.length());
        return clob;
    }

    /** 서비스가 만든 추출기를 목 ResultSet 에 실제로 실행하게 한다. */
    @SuppressWarnings("unchecked")
    private DbViewerService.QueryResult runWith(ResultSet rs, String kind, String sql, String... nameAndType) {
        objectKind("MCMAPUSER", "TB_NOTICE", kind);
        columns("MCMAPUSER", "TB_NOTICE", nameAndType);
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenAnswer(inv -> {
            ResultSetExtractor<?> extractor = inv.getArgument(1);
            return extractor.extractData(rs);
        });
        return service.query(sql);
    }

    @Test
    void 추출기는_LONG_글_칸을_행마다_가장_먼저_읽고_행_순서는_select_순서다() throws Exception {
        ResultSetMetaData meta = meta(new String[]{"_ROWID", "NOTICE_ID", "BODY", "OLD_TEXT", "NAME"},
                new int[]{Types.VARCHAR, Types.NUMERIC, Types.CLOB, Types.LONGVARCHAR, Types.VARCHAR},
                new String[]{"VARCHAR2", "NUMBER", "CLOB", "LONG", "VARCHAR2"});
        ResultSet rs = resultSet(meta, 2);
        when(rs.getObject(1)).thenReturn("AAAS3aAAKAAAAEjAAA", "AAAS3aAAKAAAAEjAAB");
        when(rs.getObject(2)).thenReturn(1, 2);
        Clob body1 = clobOf("본문1");
        Clob body2 = clobOf("본문2");
        when(rs.getClob(3)).thenReturn(body1, body2);
        when(rs.getString(4)).thenReturn("옛 글1", "옛 글2");
        when(rs.getObject(5)).thenReturn("이름1", "이름2");

        DbViewerService.QueryResult result = runWith(rs, "TABLE",
                "SELECT NOTICE_ID, BODY, OLD_TEXT, NAME FROM MCMAPUSER.TB_NOTICE",
                "NOTICE_ID", "NUMBER", "BODY", "CLOB", "OLD_TEXT", "LONG", "NAME", "VARCHAR2");

        InOrder order = inOrder(rs);
        order.verify(rs).next();
        order.verify(rs).getString(4);
        order.verify(rs).getObject(1);
        order.verify(rs).getObject(2);
        order.verify(rs).getClob(3);
        order.verify(rs).getObject(5);
        order.verify(rs).next();
        order.verify(rs).getString(4);
        order.verify(rs).getObject(1);

        assertThat(result.rows()).hasSize(2);
        assertThat(result.rows().get(0).keySet()).containsExactly("_ROWID", "NOTICE_ID", "BODY", "OLD_TEXT", "NAME");
        assertThat(result.rows().get(0)).containsEntry("OLD_TEXT", "옛 글1").containsEntry("BODY", "본문1")
                .containsEntry("NOTICE_ID", "1");
        assertThat(result.rows().get(1)).containsEntry("OLD_TEXT", "옛 글2").containsEntry("_ROWID", "AAAS3aAAKAAAAEjAAB");
        assertThat(result.lobColumns()).containsOnlyKeys("BODY").containsEntry("BODY", "CLOB");
    }

    @Test
    void ROWID는_rows에는_있고_columns에는_없다() throws Exception {
        ResultSetMetaData meta = meta(new String[]{"_ROWID", "BODY"}, new int[]{Types.VARCHAR, Types.CLOB},
                new String[]{"VARCHAR2", "CLOB"});
        ResultSet rs = resultSet(meta, 1);
        when(rs.getObject(1)).thenReturn("AAAS3aAAKAAAAEjAAA");
        Clob body = clobOf("글");
        when(rs.getClob(2)).thenReturn(body);
        DbViewerService.QueryResult result = runWith(rs, "TABLE", "SELECT BODY FROM MCMAPUSER.TB_NOTICE",
                "BODY", "CLOB");
        assertThat(result.columns()).containsExactly("BODY");
        assertThat(result.rows().get(0)).containsKey("_ROWID").containsEntry("BODY", "글");
        assertThat(result.rowIdKey()).isEqualTo("_ROWID");
        assertThat(result.lobColumns()).doesNotContainKey("_ROWID");
    }

    @Test
    void 빈_결과에서도_lobColumns가_채워진다() throws Exception {
        ResultSetMetaData meta = meta(new String[]{"_ROWID", "BODY", "IMG", "RAW_COL", "OLD_BIN"},
                new int[]{Types.VARCHAR, Types.CLOB, Types.BLOB, Types.VARBINARY, Types.LONGVARBINARY},
                new String[]{"VARCHAR2", "CLOB", "BLOB", "RAW", "LONG RAW"});
        ResultSet rs = resultSet(meta, 0);
        DbViewerService.QueryResult result = runWith(rs, "TABLE", "SELECT * FROM MCMAPUSER.TB_NOTICE",
                "BODY", "CLOB", "IMG", "BLOB", "RAW_COL", "RAW", "OLD_BIN", "LONG RAW");
        assertThat(result.rows()).isEmpty();
        assertThat(result.lobColumns()).containsExactly(Map.entry("BODY", "CLOB"), Map.entry("IMG", "BLOB"),
                Map.entry("RAW_COL", "RAW"), Map.entry("OLD_BIN", "LONG RAW"));
    }

    @Test
    void 모든_칸이_NULL인_행도_읽는다() throws Exception {
        ResultSetMetaData meta = meta(new String[]{"_ROWID", "BODY", "IMG", "OLD_TEXT", "NAME"},
                new int[]{Types.VARCHAR, Types.CLOB, Types.BLOB, Types.LONGVARCHAR, Types.VARCHAR},
                new String[]{"VARCHAR2", "CLOB", "BLOB", "LONG", "VARCHAR2"});
        ResultSet rs = resultSet(meta, 1);
        DbViewerService.QueryResult result = runWith(rs, "TABLE", "SELECT * FROM MCMAPUSER.TB_NOTICE",
                "BODY", "CLOB", "IMG", "BLOB", "OLD_TEXT", "LONG", "NAME", "VARCHAR2");
        Map<String, Object> row = result.rows().get(0);
        assertThat(row).containsOnlyKeys("_ROWID", "BODY", "IMG", "OLD_TEXT", "NAME");
        assertThat(row.values()).containsOnlyNulls();
    }

    @Test
    void LONG_RAW는_읽지_않고_종류_이름만_싣는다() throws Exception {
        ResultSetMetaData meta = meta(new String[]{"_ROWID", "IMG", "OLD_BIN", "NAME"},
                new int[]{Types.VARCHAR, Types.BLOB, Types.LONGVARBINARY, Types.VARCHAR},
                new String[]{"VARCHAR2", "BLOB", "LONG RAW", "VARCHAR2"});
        ResultSet rs = resultSet(meta, 1);
        when(rs.getObject(1)).thenReturn("AAAS3aAAKAAAAEjAAA");
        when(rs.getBlob(2)).thenReturn(null);
        when(rs.getObject(4)).thenReturn("이름");
        DbViewerService.QueryResult result = runWith(rs, "TABLE", "SELECT * FROM MCMAPUSER.TB_NOTICE",
                "IMG", "BLOB", "OLD_BIN", "LONG RAW", "NAME", "VARCHAR2");
        assertThat(result.rows().get(0)).containsEntry("OLD_BIN", "LONG RAW").containsEntry("NAME", "이름");
        verify(rs, never()).getBinaryStream(anyInt());
        verify(rs, never()).getBytes(anyInt());
        verify(rs, never()).getObject(3);
        verify(rs, never()).getString(3);
    }

    @Test
    void 뷰_대상이면_rowIdKey가_null이고_ROWID_칸이_없다() throws Exception {
        ResultSetMetaData meta = meta(new String[]{"BODY"}, new int[]{Types.CLOB}, new String[]{"CLOB"});
        ResultSet rs = resultSet(meta, 1);
        Clob body = clobOf("글");
        when(rs.getClob(1)).thenReturn(body);
        DbViewerService.QueryResult result = runWith(rs, "OTHER", "SELECT BODY FROM MCMAPUSER.TB_NOTICE",
                "BODY", "CLOB");
        assertThat(result.rowIdKey()).isNull();
        assertThat(result.executedSql()).doesNotContain("ROWID");
        assertThat(result.rows().get(0)).containsOnlyKeys("BODY");
        assertThat(result.lobColumns()).containsEntry("BODY", "CLOB");
    }

    @Test
    void 글자_예산은_행_중간에서_바닥나고_이후_칸은_100자만_싣는다() throws Exception {
        // 한 행에 CLOB 3칸 — 4,000자씩 250번 읽으면 예산 1,000,000자가 0 이 된다.
        // 250번째 읽기는 84번째 행의 첫 칸이므로 그 행의 둘째·셋째 칸부터 100자다.
        properties.setMaxRows(300);
        service = new DbViewerService(jdbc, properties);
        ResultSetMetaData meta = meta(new String[]{"_ROWID", "C1", "C2", "C3"},
                new int[]{Types.VARCHAR, Types.CLOB, Types.CLOB, Types.CLOB},
                new String[]{"VARCHAR2", "CLOB", "CLOB", "CLOB"});
        ResultSet rs = resultSet(meta, 85);
        when(rs.getObject(1)).thenReturn("AAAS3aAAKAAAAEjAAA");
        Clob big = clobOf("가".repeat(5000));
        when(rs.getClob(anyInt())).thenReturn(big);
        DbViewerService.QueryResult result = runWith(rs, "TABLE", "SELECT C1, C2, C3 FROM MCMAPUSER.TB_NOTICE",
                "C1", "CLOB", "C2", "CLOB", "C3", "CLOB");

        String full = "가".repeat(4000) + "…(전체 5,000자)";
        String cut = "가".repeat(100) + "…(전체 5,000자)";
        assertThat(result.rows()).hasSize(85);
        assertThat(result.rows().get(82)).containsEntry("C1", full).containsEntry("C2", full)
                .containsEntry("C3", full);
        assertThat(result.rows().get(83)).containsEntry("C1", full).containsEntry("C2", cut)
                .containsEntry("C3", cut);
        assertThat(result.rows().get(84)).containsEntry("C1", cut).containsEntry("C2", cut)
                .containsEntry("C3", cut);
    }
}
