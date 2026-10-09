package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerProperties;
import com.dongkuk.dmes.analog.db.DbViewerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;

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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 응답 바이트 상한 — 상한에서 끊고 「더 있음」으로 돌려주는지, 긴 칸을 자르는지, 설정 값을 닫는 쪽으로 맞추는지. */
class DbViewerResponseBudgetTest {

    private static final String OWNER = "MCMAPUSER";
    private static final String TABLE = "TB_BUDGET";

    private JdbcTemplate jdbc;
    private DbViewerProperties properties;
    private DbViewerService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        properties = new DbViewerProperties();
        service = new DbViewerService(jdbc, properties);
    }

    private void table(String... names) {
        when(jdbc.queryForList(anyString(), eq(String.class), eq(OWNER), eq(TABLE), eq(OWNER), eq(TABLE)))
                .thenReturn(List.of("TABLE"));
        List<Map<String, Object>> cols = new ArrayList<>();
        for (String name : names) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("COLUMN_NAME", name);
            row.put("DATA_TYPE", "VARCHAR2");
            cols.add(row);
        }
        when(jdbc.queryForList(anyString(), eq(OWNER), eq(TABLE))).thenReturn(cols);
    }

    /** 모든 칸이 같은 문자열인 행을 rowCount 건 내놓는 목 ResultSet 을 서비스 추출기로 읽게 한다. */
    @SuppressWarnings("unchecked")
    private void rows(int rowCount, String cell, String... labels) throws SQLException {
        ResultSetMetaData meta = mock(ResultSetMetaData.class);
        when(meta.getColumnCount()).thenReturn(labels.length);
        for (int i = 0; i < labels.length; i++) {
            when(meta.getColumnLabel(i + 1)).thenReturn(labels[i]);
            when(meta.getColumnType(i + 1)).thenReturn(Types.VARCHAR);
            when(meta.getColumnTypeName(i + 1)).thenReturn("VARCHAR2");
        }
        ResultSet rs = mock(ResultSet.class);
        when(rs.getMetaData()).thenReturn(meta);
        AtomicInteger next = new AtomicInteger();
        when(rs.next()).thenAnswer(inv -> next.getAndIncrement() < rowCount);
        when(rs.getObject(any(Integer.class))).thenReturn(cell);
        when(jdbc.query(anyString(), any(ResultSetExtractor.class))).thenAnswer(inv -> {
            ResultSetExtractor<?> extractor = inv.getArgument(1);
            return extractor.extractData(rs);
        });
    }

    private static String chars(int n) {
        return "a".repeat(n);
    }

    @Test
    void 상한_안이면_건수_판정_그대로다() throws Exception {
        table("A");
        rows(50, "작은 값", "A");
        DbViewerService.QueryResult result = service.query("SELECT A FROM MCMAPUSER.TB_BUDGET");
        assertThat(result.rows()).hasSize(50);
        assertThat(result.hasMore()).isFalse();
    }

    @Test
    void 응답_바이트_상한에서_끊고_더_있음으로_돌려준다() throws Exception {
        table("A");
        properties.setMaxResponseBytes(1024 * 1024);
        properties.setMaxCellChars(100_000);
        // 상한 1MiB — 값 100,000자짜리 행이 10건(약 1,000,000바이트)까지 들어가고 11번째에서 끊긴다.
        rows(201, chars(100_000), "A");
        DbViewerService.QueryResult result = service.query("SELECT A FROM MCMAPUSER.TB_BUDGET");
        assertThat(result.rows()).hasSize(10);
        assertThat(result.rowCount()).isEqualTo(10);
        assertThat(result.hasMore()).isTrue();
        assertThat(result.moreBlocked()).isNull();
    }

    private static final String[] TWELVE = {"A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12"};

    @Test
    void 첫_행은_상한을_넘어도_반드시_담는다() throws Exception {
        table(TWELVE);
        properties.setMaxResponseBytes(1024 * 1024);
        properties.setMaxCellChars(100_000);
        // 행 하나가 12 × 100,000 = 1.2MB 로 상한(1MiB)보다 크다.
        rows(5, chars(100_000), TWELVE);
        DbViewerService.QueryResult result = service.query("SELECT * FROM MCMAPUSER.TB_BUDGET");
        assertThat(result.rows()).hasSize(1);
        assertThat(result.hasMore()).isTrue();
    }

    @Test
    void 더보기도_상한에서_끊고_이어_받을_수_있게_더_있음으로_돌려준다() throws Exception {
        table("A");
        properties.setMaxResponseBytes(1024 * 1024);
        properties.setMaxCellChars(100_000);
        rows(5001, chars(100_000), "A");
        DbViewerService.QueryResult result = service.queryMore("SELECT A FROM MCMAPUSER.TB_BUDGET", 200, 5000);
        assertThat(result.rows()).hasSize(10);
        assertThat(result.hasMore()).isTrue();
        assertThat(result.capReached()).isFalse();
    }

    @Test
    void 전체_행_상한_앞에서_바이트로_끊기면_상한_도달이_아니라_더_있음이다() throws Exception {
        table(TWELVE);
        properties.setMaxResponseBytes(1024 * 1024);
        properties.setMaxCellChars(100_000);
        // 29,997번째 행부터 3건을 읽는다(4건째는 판정용). 행이 1.2MB 라 1건만 담기고, 전체 상한(30,000)에는 못 미친다.
        rows(10, chars(100_000), TWELVE);
        DbViewerService.QueryResult result = service.queryMore("SELECT * FROM MCMAPUSER.TB_BUDGET", 29_997, 5000);
        assertThat(result.rows()).hasSize(1);
        assertThat(result.capReached()).isFalse();
        assertThat(result.hasMore()).isTrue();
    }

    @Test
    void 남은_자리가_한_건일_때_더_있으면_전체_행_상한_도달이다() throws Exception {
        table("A");
        rows(5, chars(1000), "A");
        DbViewerService.QueryResult result = service.queryMore("SELECT A FROM MCMAPUSER.TB_BUDGET", 29_999, 5000);
        assertThat(result.rows()).hasSize(1);
        assertThat(result.capReached()).isTrue();
        assertThat(result.hasMore()).isFalse();
    }

    @Test
    void 긴_일반_칸은_자르고_전체_글자_수를_붙인다() throws Exception {
        table("A");
        rows(1, chars(10_000), "A");
        DbViewerService.QueryResult result = service.query("SELECT A FROM MCMAPUSER.TB_BUDGET");
        assertThat(result.rows().get(0).get("A")).isEqualTo(chars(4000) + "…(전체 10,000자)");
    }

    @Test
    void 칸_길이_경계의_이모지는_반으로_자르지_않는다() throws Exception {
        table("A");
        properties.setMaxCellChars(100);
        // 99자 뒤에 서로게이트 쌍이 오면 100번째 위치가 쌍의 가운데다.
        rows(1, chars(99) + "😀".repeat(20), "A");
        String value = (String) service.query("SELECT A FROM MCMAPUSER.TB_BUDGET").rows().get(0).get("A");
        assertThat(value).startsWith(chars(99)).endsWith("…(전체 139자)");
        assertThat(value.substring(0, value.indexOf('…'))).isEqualTo(chars(99));
    }

    @Test
    void 상한_이하의_칸은_그대로다() throws Exception {
        table("A");
        rows(1, chars(4000), "A");
        assertThat(service.query("SELECT A FROM MCMAPUSER.TB_BUDGET").rows().get(0).get("A"))
                .isEqualTo(chars(4000));
    }

    @Test
    void 설정이_잘못되면_작은_쪽으로_맞춘다() {
        DbViewerProperties p = new DbViewerProperties();
        assertThat(p.effectiveMaxResponseBytes()).isEqualTo(8 * 1024 * 1024);
        p.setMaxResponseBytes(0);
        assertThat(p.effectiveMaxResponseBytes()).isEqualTo(1024 * 1024);
        p.setMaxResponseBytes(-5);
        assertThat(p.effectiveMaxResponseBytes()).isEqualTo(1024 * 1024);
        p.setMaxResponseBytes(100);
        assertThat(p.effectiveMaxResponseBytes()).isEqualTo(1024 * 1024);
        p.setMaxResponseBytes(Integer.MAX_VALUE);
        assertThat(p.effectiveMaxResponseBytes()).isEqualTo(64 * 1024 * 1024);

        assertThat(p.effectiveMaxCellChars()).isEqualTo(4000);
        p.setMaxCellChars(0);
        assertThat(p.effectiveMaxCellChars()).isEqualTo(100);
        p.setMaxCellChars(5);
        assertThat(p.effectiveMaxCellChars()).isEqualTo(100);
        p.setMaxCellChars(Integer.MAX_VALUE);
        assertThat(p.effectiveMaxCellChars()).isEqualTo(100_000);
    }
}
