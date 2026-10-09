package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/**
 * {@link FxMasterReader} — JDBC 를 가짜로 둔 단위 시험. 쿼리 모양(스키마 접두·통화별 키 범위·열린 행·기준 통화)·행 해석(숫자 아닌 환율 건너뜀)·
 * 표를 못 읽을 때 「데이터 없음」·스키마 이름 검사. 실제 Oracle 에서의 동작은 {@link FxMasterReaderOraTest}.
 */
class FxMasterReaderTest {

    private static final LocalDate FROM = LocalDate.of(2026, 9, 5);
    private static final LocalDate TO = LocalDate.of(2026, 10, 5);

    private NamedParameterJdbcTemplate jdbc;
    private WidgetExtProperties props;
    private FxMasterReader reader;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        props = new WidgetExtProperties();
        reader = new FxMasterReader(jdbc, props);
    }

    private static final java.util.List<String> LABELS =
            java.util.Arrays.asList("USD", "EUR", null, null, null, null, null, null, null, null);

    private static ResultSet labelRow(java.util.List<String> labels) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        for (int i = 0; i < labels.size(); i++) org.mockito.Mockito.when(rs.getString(i + 1)).thenReturn(labels.get(i));
        return rs;
    }

    /** 날짜 행: 조회 칼럼 순서(요청 통화 순서에 따른 칼럼)대로 값을 준다. */
    private static ResultSet row(String code, String... values) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        org.mockito.Mockito.when(rs.getString(1)).thenReturn(code);
        for (int i = 0; i < values.length; i++) org.mockito.Mockito.when(rs.getString(i + 2)).thenReturn(values[i]);
        return rs;
    }

    /** 라벨 조회에는 라벨 행을, 항목 조회에는 날짜 행들을 준다. */
    private void rows(ResultSet... rows) throws SQLException {
        rowsWithLabels(LABELS, rows);
    }

    private void rowsWithLabels(java.util.List<String> labels, ResultSet... rows) throws SQLException {
        ResultSet label = labelRow(labels);
        doAnswer(inv -> {
            String sql = inv.getArgument(0);
            RowCallbackHandler handler = inv.getArgument(2);
            if (sql.contains("ATTR01_NAME")) {
                handler.processRow(label);
            } else {
                for (ResultSet rs : rows) handler.processRow(rs);
            }
            return null;
        }).when(jdbc).query(anyString(), any(SqlParameterSource.class), any(RowCallbackHandler.class));
    }

    @Test
    @DisplayName("라벨 조회 한 번과 기준일 키 범위 조회 한 번 — 스키마 접두·열린 행, 요청 통화의 칼럼만 고르고 함수를 쓰지 않는다")
    void queryShape() throws Exception {
        rows();

        reader.read("KRW", List.of("EUR", "USD"), FROM, TO);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc, times(2)).query(sql.capture(), params.capture(), any(RowCallbackHandler.class));
        assertThat(sql.getAllValues().get(0))
                .contains("FROM   MDMAPUSER.TB_MDM_DATA A")
                .contains("A.MARU_DATA_ID = :md")
                .contains("A.ATTR10_NAME");
        assertThat(sql.getAllValues().get(1))
                .contains("FROM   MDMAPUSER.TB_MDM_DATA_ITEM A")
                .contains("A.MARU_DATA_ID = :md")
                .contains("A.VALID_TO = :openEnd")
                .contains("A.CODE BETWEEN :lo AND :hi")
                .contains("A.ATTR02")   // EUR (요청 순서 첫째)
                .contains("A.ATTR01")   // USD
                .doesNotContain("A.ATTR03")
                .doesNotContainIgnoringCase("SYSDATE")
                .doesNotContainIgnoringCase("SYSTIMESTAMP")
                .doesNotContain("TO_CHAR")
                .doesNotContain("UPPER(");
        SqlParameterSource p = params.getAllValues().get(1);
        assertThat(p.getValue("md")).isEqualTo("FX_RATE");
        assertThat(p.getValue("openEnd")).isEqualTo(java.sql.Timestamp.valueOf("9999-12-31 00:00:00"));
        assertThat(p.getValue("lo")).isEqualTo("20260905");
        assertThat(p.getValue("hi")).isEqualTo("20261005");
    }

    @Test
    @DisplayName("설정한 스키마 이름을 접두로 쓴다")
    void usesConfiguredSchema() throws Exception {
        rows();
        props.getExchange().setMdmSchema("MDM_X1");

        reader.read("KRW", List.of("USD"), FROM, TO);

        verify(jdbc).query(contains("MDM_X1.TB_MDM_DATA A"), any(SqlParameterSource.class), any(RowCallbackHandler.class));
        verify(jdbc).query(contains("MDM_X1.TB_MDM_DATA_ITEM"), any(SqlParameterSource.class), any(RowCallbackHandler.class));
    }

    @Test
    @DisplayName("날짜 행을 통화별 점으로 바꾼다 — 라벨에 없는 통화·숫자 아닌 환율·0 이하·빈 칸·날짜가 아닌 키·구간 밖 날짜는 건너뛴다")
    void parsesRowsAndSkipsBadOnes() throws Exception {
        rows(
                row("20260930", "1380.12345678"),
                row("20260929", "abc"),                 // 숫자 아님
                row("20260928", "0.00000000"),          // 0 이하
                row("2026-09-27", "1370"),              // 키가 기준일 모양이 아님
                row("20260801", "1360"),                // 구간 밖
                row("20261001", (String) null));        // 환율 없음

        List<ExchangeRatePoint> points = reader.read("KRW", List.of("USD", "GBP"), FROM, TO);

        assertThat(points).containsExactly(new ExchangeRatePoint(LocalDate.of(2026, 9, 30), "USD", new BigDecimal("1380.12345678")));
    }

    @Test
    @DisplayName("한 날짜 행에서 여러 통화를 요청 순서대로 읽는다")
    void readsSeveralCurrenciesFromOneRow() throws Exception {
        rows(row("20260930", "1600.5", "1380.1"));

        List<ExchangeRatePoint> points = reader.read("KRW", List.of("EUR", "USD"), FROM, TO);

        assertThat(points).containsExactlyInAnyOrder(
                new ExchangeRatePoint(LocalDate.of(2026, 9, 30), "EUR", new BigDecimal("1600.5")),
                new ExchangeRatePoint(LocalDate.of(2026, 9, 30), "USD", new BigDecimal("1380.1")));
    }

    @Test
    @DisplayName("요청 통화가 모두 라벨에 없으면 항목 조회를 하지 않고 빈 목록")
    void noMatchingLabelNoItemQuery() throws Exception {
        rows();

        assertThat(reader.read("KRW", List.of("GBP"), FROM, TO)).isEmpty();

        verify(jdbc, times(1)).query(anyString(), any(SqlParameterSource.class), any(RowCallbackHandler.class));
    }

    @Test
    @DisplayName("통화가 없으면 DB 를 부르지 않고 빈 목록")
    void noCurrenciesNoQuery() {
        assertThat(reader.read("KRW", List.of(), FROM, TO)).isEmpty();
        org.mockito.Mockito.verifyNoInteractions(jdbc);
    }

    @Test
    @DisplayName("표·스키마·권한이 없을 때(ORA-00942·01031·00980·01435) 예외 없이 빈 목록, 그 밖의 DB 오류는 그대로 올린다")
    void unreadableTableIsEmptyButOtherErrorsPropagate() {
        for (int code : new int[] {942, 1031, 980, 1435}) {
            doThrow(new BadSqlGrammarException("query", "SQL", new SQLException("ORA-" + code, "42000", code)))
                    .when(jdbc).query(anyString(), any(SqlParameterSource.class), any(RowCallbackHandler.class));
            assertThat(reader.read("KRW", List.of("USD"), FROM, TO)).as("ORA-" + code).isEmpty();
        }

        doThrow(new CannotGetJdbcConnectionException("연결 실패", new SQLException("ORA-12541", "08006", 12541)))
                .when(jdbc).query(anyString(), any(SqlParameterSource.class), any(RowCallbackHandler.class));
        assertThatThrownBy(() -> reader.read("KRW", List.of("USD"), FROM, TO))
                .isInstanceOf(CannotGetJdbcConnectionException.class);
    }

    @Test
    @DisplayName("스키마 이름이 규칙(영문 대문자로 시작·대문자/숫자/밑줄·30자 이내)에 안 맞으면 DB 를 부르지 않고 명확한 예외")
    void rejectsInvalidSchemaName() throws Exception {
        for (String bad : new String[] {"mdmapuser", "MDM.APUSER", "MDM APUSER", "1MDM", "MDM;DROP", "", "A".repeat(31)}) {
            props.getExchange().setMdmSchema(bad);
            assertThatThrownBy(() -> reader.read("KRW", List.of("USD"), FROM, TO))
                    .as(bad).isInstanceOf(IllegalStateException.class).hasMessageContaining("mdm-schema");
        }
        props.getExchange().setMdmSchema(null);
        assertThatThrownBy(() -> reader.read("KRW", List.of("USD"), FROM, TO)).isInstanceOf(IllegalStateException.class);
        org.mockito.Mockito.verifyNoInteractions(jdbc);

        props.getExchange().setMdmSchema("A".repeat(30)); // 30자는 허용
        rows();
        assertThat(reader.read("KRW", List.of("USD"), FROM, TO)).isEmpty();
    }
}
