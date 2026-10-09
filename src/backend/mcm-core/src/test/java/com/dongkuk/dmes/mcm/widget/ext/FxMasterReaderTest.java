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

    private static ResultSet row(String code, String cur, String ymd, String rate) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        org.mockito.Mockito.when(rs.getString(1)).thenReturn(code);
        org.mockito.Mockito.when(rs.getString(2)).thenReturn(cur);
        org.mockito.Mockito.when(rs.getString(3)).thenReturn(ymd);
        org.mockito.Mockito.when(rs.getString(4)).thenReturn(rate);
        return rs;
    }

    private void rows(ResultSet... rows) {
        doAnswer(inv -> {
            RowCallbackHandler handler = inv.getArgument(2);
            for (ResultSet rs : rows) handler.processRow(rs);
            return null;
        }).when(jdbc).query(anyString(), any(SqlParameterSource.class), any(RowCallbackHandler.class));
    }

    @Test
    @DisplayName("스키마 접두·열린 행·기준 통화·통화마다 키 범위로 한 번 조회하고, 칼럼에 함수를 쓰지 않는다")
    void queryShape() {
        rows();

        reader.read("KRW", List.of("USD", "EUR"), FROM, TO);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc, times(1)).query(sql.capture(), params.capture(), any(RowCallbackHandler.class));
        assertThat(sql.getValue())
                .contains("FROM   MDMAPUSER.TB_MDM_DATA_ITEM A")
                .contains("A.MARU_DATA_ID = :md")
                .contains("A.VALID_TO = :openEnd")
                .contains("A.ATTR04 = :base")
                .contains("A.CODE BETWEEN :lo0 AND :hi0")
                .contains("OR     A.CODE BETWEEN :lo1 AND :hi1")
                .doesNotContainIgnoringCase("SYSDATE")
                .doesNotContainIgnoringCase("SYSTIMESTAMP")
                .doesNotContain("TO_CHAR")
                .doesNotContain("UPPER(");
        SqlParameterSource p = params.getValue();
        assertThat(p.getValue("md")).isEqualTo("FX_RATE");
        assertThat(p.getValue("openEnd")).isEqualTo(java.sql.Timestamp.valueOf("9999-12-31 00:00:00"));
        assertThat(p.getValue("base")).isEqualTo("KRW");
        assertThat(p.getValue("lo0")).isEqualTo("USD20260905");
        assertThat(p.getValue("hi0")).isEqualTo("USD20261005");
        assertThat(p.getValue("lo1")).isEqualTo("EUR20260905");
        assertThat(p.getValue("hi1")).isEqualTo("EUR20261005");
    }

    @Test
    @DisplayName("설정한 스키마 이름을 접두로 쓴다")
    void usesConfiguredSchema() {
        rows();
        props.getExchange().setMdmSchema("MDM_X1");

        reader.read("KRW", List.of("USD"), FROM, TO);

        verify(jdbc).query(contains("MDM_X1.TB_MDM_DATA_ITEM"), any(SqlParameterSource.class), any(RowCallbackHandler.class));
    }

    @Test
    @DisplayName("행을 점으로 바꾼다 — 요청하지 않은 통화·숫자 아닌 환율·0 이하 환율·읽을 수 없는 기준일·구간 밖 날짜는 건너뛴다")
    void parsesRowsAndSkipsBadOnes() throws Exception {
        rows(
                row("USD20260930", "USD", "20260930", "1380.12345678"),
                row("EUR20260930", "EUR", "20260930", "1600.50000000"),      // 요청 안 한 통화
                row("USD20260929", "USD", "20260929", "abc"),                // 숫자 아님
                row("USD20260928", "USD", "20260928", "0.00000000"),         // 0 이하
                row("USD20260927", "USD", "2026-09-27", "1370"),             // 기준일 모양이 다름
                row("USD20260801", "USD", "20260801", "1360"),               // 구간 밖
                row("USD20261001", "USD", "20261001", null));                // 환율 없음

        List<ExchangeRatePoint> points = reader.read("KRW", List.of("USD"), FROM, TO);

        assertThat(points).containsExactly(new ExchangeRatePoint(LocalDate.of(2026, 9, 30), "USD", new BigDecimal("1380.12345678")));
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
    void rejectsInvalidSchemaName() {
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
