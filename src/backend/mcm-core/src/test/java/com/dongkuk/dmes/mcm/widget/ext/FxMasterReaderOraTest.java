package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link FxMasterReader} — 실제 Oracle 시험 PDB. MDM 항목 표와 같은 모양의 시험 표({@link FxMasterTestTable})를 앱 사용자 스키마에
 * 만들어 설정 {@code mdm-schema} 로 읽는다. 열린 행·마스터 ID·기준 통화·통화별 키 범위·숫자 아닌 환율 건너뛰기, 그리고 표를 못 읽는 스키마에서
 * ORA-00942 가 「데이터 없음」이 되는지 본다.
 */
class FxMasterReaderOraTest {

    private static final LocalDate FROM = LocalDate.of(2026, 9, 5);
    private static final LocalDate TO = LocalDate.of(2026, 10, 5);

    private static HikariDataSource ds;

    private WidgetExtProperties props;
    private FxMasterReader reader;

    @BeforeAll
    static void createTable() {
        ds = McmCoreOraTestDb.appDataSource("fx-master-reader-ora");
        FxMasterTestTable.createOrClear(ds);
    }

    @AfterAll
    static void dropTable() {
        try {
            FxMasterTestTable.drop(ds);
        } finally {
            ds.close();
        }
    }

    @BeforeEach
    void setUp() {
        FxMasterTestTable.createOrClear(ds);
        props = new WidgetExtProperties();
        props.getExchange().setMdmSchema(FxMasterTestTable.SCHEMA);
        reader = new FxMasterReader(ds, props);
    }

    @Test
    @DisplayName("열린 FX_RATE 행만, 요청한 통화·기간·기준 통화에 맞는 것만 읽는다")
    void readsOnlyOpenMatchingRows() {
        FxMasterTestTable.fxRate(ds, "USD", "20260930", "1380.10000000");
        FxMasterTestTable.fxRate(ds, "USD", "20261001", "1385.51000000");
        FxMasterTestTable.fxRate(ds, "EUR", "20261001", "1600.25000000");
        FxMasterTestTable.fxRate(ds, "JPY", "20261001", "9.30000000");                 // 요청 안 한 통화
        FxMasterTestTable.fxRate(ds, "USD", "20260801", "1300.00000000");              // 기간 앞
        FxMasterTestTable.fxRate(ds, "USD", "20261006", "1390.00000000");              // 기간 뒤
        FxMasterTestTable.fxRate(ds, "EUR", "20260929", "xyz");                         // 숫자 아님 → 건너뜀
        FxMasterTestTable.insert(ds, "FX_RATE", "USD20260929", Timestamp.valueOf("2026-10-02 00:00:00"),
                "USD", "20260929", "1111.00000000", "KRW");                             // 닫힌 행
        FxMasterTestTable.insert(ds, "FX_RATE", "USD20260928", FxMasterTestTable.OPEN_END,
                "USD", "20260928", "1.00000000", "EUR");                                // 다른 기준 통화
        FxMasterTestTable.insert(ds, "CUR", "USD20260927", FxMasterTestTable.OPEN_END,
                "USD", "20260927", "2222.00000000", "KRW");                             // 다른 마스터

        List<ExchangeRatePoint> points = reader.read("KRW", List.of("USD", "EUR"), FROM, TO);

        assertThat(points).containsExactlyInAnyOrder(
                new ExchangeRatePoint(LocalDate.of(2026, 9, 30), "USD", new BigDecimal("1380.10000000")),
                new ExchangeRatePoint(LocalDate.of(2026, 10, 1), "USD", new BigDecimal("1385.51000000")),
                new ExchangeRatePoint(LocalDate.of(2026, 10, 1), "EUR", new BigDecimal("1600.25000000")));
    }

    @Test
    @DisplayName("값이 없으면 빈 목록")
    void emptyTable() {
        assertThat(reader.read("KRW", List.of("USD"), FROM, TO)).isEmpty();
    }

    @Test
    @DisplayName("통화 열 개 범위 조건도 한 번에 읽는다")
    void readsTenCurrencies() {
        List<String> curs = List.of("USD", "EUR", "JPY", "CNY", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD");
        for (String cur : curs) FxMasterTestTable.fxRate(ds, cur, "20261002", "100.00000000");

        assertThat(reader.read("KRW", curs, FROM, TO)).hasSize(10);
    }

    @Test
    @DisplayName("표를 못 읽는 스키마(없는 스키마·표 없는 스키마)는 예외 없이 데이터 없음, 다시 읽을 수 있게 되면 읽는다")
    void unreadableSchemaIsEmpty() {
        FxMasterTestTable.fxRate(ds, "USD", "20261001", "1385.51000000");

        props.getExchange().setMdmSchema("NO_SUCH_OWNER");
        assertThat(reader.read("KRW", List.of("USD"), FROM, TO)).isEmpty();
        props.getExchange().setMdmSchema("MCM_SOURCE"); // 있는 스키마지만 이 표도, 권한도 없다
        assertThat(reader.read("KRW", List.of("USD"), FROM, TO)).isEmpty();

        props.getExchange().setMdmSchema(FxMasterTestTable.SCHEMA);
        assertThat(reader.read("KRW", List.of("USD"), FROM, TO)).hasSize(1);
    }
}
