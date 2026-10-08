package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerException;
import com.dongkuk.dmes.analog.db.DbViewerProperties;
import com.dongkuk.dmes.analog.db.DbViewerService;
import com.dongkuk.dmes.analog.db.DbViewerValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 「더보기」(offset 묶음) — 검사기의 SQL 조립·우회 거부와 서비스의 정렬 기준·상한·hasMore 판정. */
class DbViewerMoreTest {

    private static final Set<String> ALLOWED = Set.of("MCMAPUSER", "MCM_SOURCE");

    private JdbcTemplate jdbc;
    private DbViewerProperties properties;
    private DbViewerService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        properties = new DbViewerProperties();
        service = new DbViewerService(jdbc, properties);
    }

    // ------------------------------------------------------------ 검사기

    private static DbViewerValidator.ParsedQuery parsed() {
        return DbViewerValidator.parseSelect("SELECT CODE_ID, CODE_NM FROM MCMAPUSER.TB_MCM_CODE_MASTER", ALLOWED);
    }

    @Test
    void 이어_보기_SQL은_정렬을_고정하고_OFFSET_FETCH로_자른다() {
        String sql = DbViewerValidator.buildPagedSql(parsed(), List.of("CODE_ID", "CODE_NM"), false,
                List.of("ROWID"), 200, 5001);
        assertThat(sql).isEqualTo("SELECT \"CODE_ID\", \"CODE_NM\" FROM \"MCMAPUSER\".\"TB_MCM_CODE_MASTER\" "
                + "ORDER BY ROWID OFFSET 200 ROWS FETCH NEXT 5001 ROWS ONLY");
    }

    @Test
    void 이어_보기_SQL은_WHERE_와_숨은_ROWID_칸을_첫_조회와_같게_싣는다() {
        DbViewerValidator.ParsedQuery withWhere = DbViewerValidator.parseSelect(
                "SELECT CODE_ID FROM MCMAPUSER.TB_MCM_CODE_MASTER WHERE CODE_ID = 'A'", ALLOWED);
        assertThat(DbViewerValidator.buildPagedSql(withWhere, List.of("CODE_ID"), true, List.of("ROWID"), 0, 10))
                .isEqualTo("SELECT ROWIDTOCHAR(ROWID) \"_ROWID\", \"CODE_ID\" FROM \"MCMAPUSER\".\"TB_MCM_CODE_MASTER\" "
                        + "WHERE CODE_ID = 'A' ORDER BY ROWID OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY");
    }

    @Test
    void 기본키_정렬은_인용부호로_감싼다() {
        assertThat(DbViewerValidator.buildPagedSql(parsed(), List.of("CODE_ID"), false,
                List.of("CODE_ID", "SEQ_NO"), 5, 6))
                .endsWith("ORDER BY \"CODE_ID\", \"SEQ_NO\" OFFSET 5 ROWS FETCH NEXT 6 ROWS ONLY");
    }

    @Test
    void 정렬_기준에_이상한_이름이나_민감_칸은_못_쓴다() {
        for (String bad : List.of("CODE_ID; DROP TABLE X", "code_id", "A\" , \"B", "USER_PASS", "", "1=1")) {
            assertThatThrownBy(() -> DbViewerValidator.buildPagedSql(parsed(), List.of("CODE_ID"), false,
                    List.of(bad), 0, 10)).as(bad).isInstanceOf(DbViewerException.class);
        }
    }

    @Test
    void 음수_offset_0건_정렬기준_없음은_거부한다() {
        assertThatThrownBy(() -> DbViewerValidator.buildPagedSql(parsed(), List.of("CODE_ID"), false,
                List.of("ROWID"), -1, 10)).isInstanceOf(DbViewerException.class);
        assertThatThrownBy(() -> DbViewerValidator.buildPagedSql(parsed(), List.of("CODE_ID"), false,
                List.of("ROWID"), 0, 0)).isInstanceOf(DbViewerException.class);
        assertThatThrownBy(() -> DbViewerValidator.buildPagedSql(parsed(), List.of("CODE_ID"), false,
                List.of(), 0, 10)).isInstanceOf(DbViewerException.class);
        assertThatThrownBy(() -> DbViewerValidator.buildPagedSql(parsed(), List.of("CODE_ID"), false,
                null, 0, 10)).isInstanceOf(DbViewerException.class);
    }

    @Test
    void 사용자_SQL의_정렬_건수_우회는_여전히_거부한다() {
        for (String tail : List.of(
                "ORDER BY CODE_ID",
                "WHERE 1 = 1 ORDER BY CODE_ID",
                "OFFSET 10 ROWS",
                "FETCH FIRST 999999 ROWS ONLY",
                "WHERE CODE_ID = 'A' FETCH NEXT 5 ROWS ONLY",
                "WHERE ROWNUM < 1000000")) {
            assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                    "SELECT CODE_ID FROM MCMAPUSER.TB_MCM_CODE_MASTER " + tail, ALLOWED))
                    .as(tail).isInstanceOf(DbViewerException.class);
        }
    }

    // ------------------------------------------------------------ 서비스

    private void objectKind(String owner, String table, String kind) {
        when(jdbc.queryForList(anyString(), eq(String.class), eq(owner), eq(table), eq(owner), eq(table)))
                .thenReturn(kind == null ? List.of() : List.of(kind));
    }

    private void columns(String owner, String table, String... names) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String name : names) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("COLUMN_NAME", name);
            row.put("DATA_TYPE", "VARCHAR2");
            rows.add(row);
        }
        when(jdbc.queryForList(anyString(), eq(owner), eq(table))).thenReturn(rows);
    }

    private void primaryKey(String owner, String table, String... pk) {
        when(jdbc.queryForList(anyString(), eq(String.class), eq(owner), eq(table))).thenReturn(List.of(pk));
    }

    private void returnRows(int count) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("A", String.valueOf(i));
            rows.add(row);
        }
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenAnswer(inv -> rows);
    }

    private String executedSql() {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(ResultSetExtractor.class));
        return sql.getValue();
    }

    private void assertRejected(Runnable call, int status, String messagePart) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(DbViewerException.class, e -> {
            assertThat(e.getStatusCode().value()).isEqualTo(status);
            assertThat(e.getReason()).contains(messagePart);
        });
    }

    @Test
    void 첫_조회는_한_건_더_읽어_hasMore를_알리고_화면에는_상한만_준다() {
        objectKind("MCMAPUSER", "TB_T", "TABLE");
        columns("MCMAPUSER", "TB_T", "A");
        returnRows(201);
        DbViewerService.QueryResult result = service.query("SELECT A FROM MCMAPUSER.TB_T");
        assertThat(executedSql()).endsWith("FETCH FIRST 201 ROWS ONLY");
        assertThat(result.rows()).hasSize(200);
        assertThat(result.rowCount()).isEqualTo(200);
        assertThat(result.hasMore()).isTrue();
        assertThat(result.moreBlocked()).isNull();
    }

    @Test
    void 정확히_상한만큼이면_더_없다() {
        objectKind("MCMAPUSER", "TB_T", "TABLE");
        columns("MCMAPUSER", "TB_T", "A");
        returnRows(200);
        DbViewerService.QueryResult result = service.query("SELECT A FROM MCMAPUSER.TB_T");
        assertThat(result.rows()).hasSize(200);
        assertThat(result.hasMore()).isFalse();
        assertThat(result.moreBlocked()).isNull();
    }

    @Test
    void 뷰는_기본키가_없으면_더보기_불가_사유를_알린다() {
        objectKind("MCMAPUSER", "V_T", "OTHER");
        columns("MCMAPUSER", "V_T", "A");
        primaryKey("MCMAPUSER", "V_T");
        returnRows(201);
        DbViewerService.QueryResult result = service.query("SELECT A FROM MCMAPUSER.V_T");
        assertThat(result.hasMore()).isTrue();
        assertThat(result.moreBlocked()).contains("이어 볼 수 없습니다");
    }

    @Test
    void 이어_보기는_ROWID로_정렬해_offset부터_한_묶음을_읽는다() {
        objectKind("MCMAPUSER", "TB_T", "TABLE");
        columns("MCMAPUSER", "TB_T", "A");
        returnRows(5001);
        DbViewerService.QueryResult result = service.queryMore("SELECT A FROM MCMAPUSER.TB_T", 0, null);
        assertThat(executedSql()).isEqualTo("SELECT \"A\" FROM \"MCMAPUSER\".\"TB_T\" "
                + "ORDER BY ROWID OFFSET 0 ROWS FETCH NEXT 5001 ROWS ONLY");
        assertThat(result.rows()).hasSize(5000);
        assertThat(result.hasMore()).isTrue();
        assertThat(result.capReached()).isFalse();
    }

    @Test
    void 이어_보기_마지막_묶음은_hasMore가_거짓이다() {
        objectKind("MCMAPUSER", "TB_T", "TABLE");
        columns("MCMAPUSER", "TB_T", "A");
        returnRows(1200);
        DbViewerService.QueryResult result = service.queryMore("SELECT A FROM MCMAPUSER.TB_T", 5000, 5000);
        assertThat(result.rows()).hasSize(1200);
        assertThat(result.hasMore()).isFalse();
    }

    @Test
    void 뷰는_기본키로_정렬한다() {
        objectKind("MCMAPUSER", "V_T", "OTHER");
        columns("MCMAPUSER", "V_T", "A");
        primaryKey("MCMAPUSER", "V_T", "A");
        returnRows(3);
        service.queryMore("SELECT A FROM MCMAPUSER.V_T", 10, 100);
        assertThat(executedSql()).endsWith("ORDER BY \"A\" OFFSET 10 ROWS FETCH NEXT 101 ROWS ONLY");
    }

    @Test
    void 뷰에_기본키가_없거나_민감_칸이면_이어_보기를_거부한다() {
        objectKind("MCMAPUSER", "V_T", "OTHER");
        columns("MCMAPUSER", "V_T", "A");
        primaryKey("MCMAPUSER", "V_T");
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.V_T", 0, null), 400, "이어 볼 수 없습니다");
        primaryKey("MCMAPUSER", "V_T", "USER_PASS");
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.V_T", 0, null), 400, "이어 볼 수 없습니다");
        verify(jdbc, never()).query(anyString(), any(ResultSetExtractor.class));
    }

    @Test
    void 전체_상한에_닿으면_멈추고_capReached를_알린다() {
        objectKind("MCMAPUSER", "TB_T", "TABLE");
        columns("MCMAPUSER", "TB_T", "A");
        returnRows(5001);
        DbViewerService.QueryResult result = service.queryMore("SELECT A FROM MCMAPUSER.TB_T", 25000, 5000);
        assertThat(executedSql()).endsWith("OFFSET 25000 ROWS FETCH NEXT 5001 ROWS ONLY");
        assertThat(result.rows()).hasSize(5000);
        assertThat(result.hasMore()).isFalse();
        assertThat(result.capReached()).isTrue();
    }

    @Test
    void 전체_상한을_넘는_묶음은_상한까지만_읽는다() {
        objectKind("MCMAPUSER", "TB_T", "TABLE");
        columns("MCMAPUSER", "TB_T", "A");
        returnRows(10);
        service.queryMore("SELECT A FROM MCMAPUSER.TB_T", 29000, 5000);
        assertThat(executedSql()).endsWith("OFFSET 29000 ROWS FETCH NEXT 1001 ROWS ONLY");
    }

    @Test
    void 묶음_크기는_서버_설정을_넘지_못한다() {
        objectKind("MCMAPUSER", "TB_T", "TABLE");
        columns("MCMAPUSER", "TB_T", "A");
        returnRows(1);
        service.queryMore("SELECT A FROM MCMAPUSER.TB_T", 0, Integer.MAX_VALUE);
        assertThat(executedSql()).endsWith("FETCH NEXT 5001 ROWS ONLY");
    }

    @Test
    void offset_범위_밖은_400이다() {
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.TB_T", -1, null), 400, "offset");
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.TB_T", 30000, null), 400, "offset");
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.TB_T", Integer.MAX_VALUE, null), 400,
                "offset");
        verify(jdbc, never()).query(anyString(), any(ResultSetExtractor.class));
    }

    @Test
    void 이어_보기도_스키마_차단표_민감칸_검사를_똑같이_받는다() {
        assertRejected(() -> service.queryMore("SELECT A FROM SYS.USER$", 0, null), 400, "스키마");
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.TB_SEC_KEY_STORE", 0, null), 400,
                "조회할 수 없는 표입니다");
        assertRejected(() -> service.queryMore("SELECT USER_PASS FROM MCMAPUSER.TB_T", 0, null), 400, "민감");
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.TB_T ORDER BY A", 0, null), 400, "키워드");
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.TB_T; DELETE FROM X", 0, null), 400, "복문");
        objectKind("MCMAPUSER", "SYN_T", null);
        assertRejected(() -> service.queryMore("SELECT A FROM MCMAPUSER.SYN_T", 0, null), 404, "찾을 수 없");
        verify(jdbc, never()).query(anyString(), any(ResultSetExtractor.class));
    }

    @Test
    void 전체_상한과_묶음_크기_기본값() {
        assertThat(properties.getMaxRowsAll()).isEqualTo(30000);
        assertThat(properties.getMoreChunk()).isEqualTo(5000);
        assertThat(properties.getMaxRows()).isEqualTo(200);
    }
}
