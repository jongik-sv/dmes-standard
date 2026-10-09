package com.dongkuk.dmes.mdm.job;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMaruData;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint;
import com.dongkuk.dmes.mcm.widget.ext.ExchangeRateProvider;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtException;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtPartialException;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 예약 작업 {@code mdm.exchangeRateSync} 를 가짜 제공자로 돌려 마루 데이터 FX_RATE 에 쓰는 결과를 본다(설계 D3·R2·R7·R10).
 * 정의·통화 행은 시험 안에서 직접 넣는다: 공유 시험 DB 하니스는 클래스마다 V1 초기 행만 복원하므로 V3 시드를 읽지 않는다(R3).
 * 실제 외부 HTTP 는 부르지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class ExchangeRateSyncOraTest extends AbstractMdmSharedDbTest {

    /** 시계가 가리키는 날(T0 = 2026-09-01 09:00). */
    private static final LocalDate TODAY = T0.toLocalDate();
    private static final String FX_PATTERN = "^[0-9]{8}$";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    DataItemSaveCore saveCore;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    MutableClock clock;

    private WidgetExtProperties properties;
    private FakeProvider frankfurter;
    private FakeProvider koreaExim;
    private ExchangeRateSyncService service;

    /** 호출 인자를 기록하고 준비한 점(또는 예외)을 돌려주는 가짜 제공자. */
    static final class FakeProvider implements ExchangeRateProvider {
        private final String id;
        List<ExchangeRatePoint> points = new ArrayList<>();
        RuntimeException failure;
        int calls;
        String lastBase;
        List<String> lastSymbols;
        LocalDate lastFrom;
        LocalDate lastTo;

        FakeProvider(String id) {
            this.id = id;
        }

        @Override
        public String id() {
            return id;
        }

        @Override
        public List<ExchangeRatePoint> fetch(String base, List<String> symbols, LocalDate from, LocalDate to) {
            calls++;
            lastBase = base;
            lastSymbols = List.copyOf(symbols);
            lastFrom = from;
            lastTo = to;
            if (failure != null) {
                throw failure;
            }
            return points;
        }
    }

    @BeforeEach
    void seed() {
        // 로그인 사용자·감사 문맥이 없는 예약 작업 실행과 같은 조건으로 돌린다.
        AuditHolder.remove();
        UserContextHolder.clear();
        DmdSegmentTestSupport.clear(jdbc);
        clock.setLocal(T0);

        insertMaruData(jdbc, "CUR", "MDM", null, "INUSE", "^[A-Z]{3}$", 0, "지역", "고시 단위", "소수 자릿수", "환율 수집");
        currency("KRW", 1, "LOCAL", "N");
        currency("USD", 2, "AMERICAS", "Y");
        currency("JPY", 3, "ASIA", "Y");
        currency("EUR", 4, "EUROPE", "Y");
        currency("GBP", 5, "EUROPE", "N");
        insertMaruData(jdbc, "FX_RATE", "EXTERNAL", "MDM", "INUSE", FX_PATTERN, 0, "USD", "EUR", "JPY");

        properties = new WidgetExtProperties();
        frankfurter = new FakeProvider("frankfurter");
        koreaExim = new FakeProvider("koreaexim");
        service = new ExchangeRateSyncService(jdbc, saveCore, transactionManager, clock, properties, frankfurter, koreaExim);
    }

    private void currency(String code, int seq, String region, String collect) {
        insertItemRow(jdbc, "CUR", code, code + " 이름", T0.minusDays(30), OPEN, 0, null, List.of(region, "1", "2", collect));
        jdbc.update("UPDATE TB_MDM_DATA_ITEM SET SEQ = ? WHERE MARU_DATA_ID = 'CUR' AND CODE = ?", seq, code);
    }

    private static ExchangeRatePoint point(String date, String cur, String rate) {
        return new ExchangeRatePoint(LocalDate.parse(date), cur, new BigDecimal(rate));
    }

    private static JobContext ctx(Object lookbackDays, String provider) {
        Map<String, Object> vars = new HashMap<>();
        vars.put("lookbackDays", lookbackDays);
        vars.put("provider", provider);
        return new JobContext("mdm.exchangeRateSync", "run-1", vars, LocalDateTime.of(2026, 9, 1, 11, 10), false);
    }

    private int fxCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'FX_RATE'", Integer.class);
    }

    private Map<String, Object> openFx(String code) {
        return jdbc.queryForMap("SELECT * FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'FX_RATE' AND CODE = ? "
                + "AND VALID_TO = TIMESTAMP '9999-12-31 00:00:00'", code);
    }

    @Test
    void 처음에는_90일을_수집_대상_통화만_KRW_기준으로_묻고_모두_넣는다() {
        frankfurter.points = List.of(point("2026-08-31", "USD", "1384.5"), point("2026-09-01", "USD", "1390"),
                point("2026-09-01", "JPY", "9.31"), point("2026-09-01", "EUR", "1500.123456789"));

        int written = service.run(ctx(new BigDecimal("5"), ""));

        assertEquals(2, written);
        assertEquals(1, frankfurter.calls);
        assertEquals(0, koreaExim.calls);
        assertEquals("KRW", frankfurter.lastBase);
        // KRW(기준통화)와 수집 N(GBP)은 빠지고 SEQ 순이다.
        assertEquals(List.of("USD", "JPY", "EUR"), frankfurter.lastSymbols);
        assertEquals(TODAY.minusDays(90), frankfurter.lastFrom);
        assertEquals(TODAY, frankfurter.lastTo);

        // 날짜 한 행에 통화는 칼럼(USD=ATTR01, EUR=ATTR02, JPY=ATTR03)이다.
        assertEquals(2, fxCount());
        Map<String, Object> day = openFx("20260901");
        assertEquals("2026-09-01", day.get("NAME"));
        assertEquals("1390.00000000", day.get("ATTR01"));
        assertEquals("1500.12345679", day.get("ATTR02"));
        assertEquals("9.31000000", day.get("ATTR03"));
        assertNull(day.get("ATTR04"));
        assertEquals("기준통화 KRW · 출처 frankfurter", day.get("DESCRIPTION"));
        assertEquals("1384.50000000", openFx("20260831").get("ATTR01"));
    }

    @Test
    void 같은_값으로_다시_돌리면_0건이고_행은_그대로다() {
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"), point("2026-09-01", "JPY", "9.31"));
        assertEquals(1, service.run(ctx(5, "")));
        Object validFrom = openFx("20260901").get("VALID_FROM");
        clock.setLocal(T0.plusHours(1));

        assertEquals(0, service.run(ctx(5, "")));

        assertEquals(1, fxCount());
        assertEquals(validFrom, openFx("20260901").get("VALID_FROM"));
        // 이력이 생겼으니 이번에는 lookbackDays 로 묻는다.
        assertEquals(TODAY.minusDays(5), frankfurter.lastFrom);
    }

    @Test
    void 값이_바뀌면_UPDATE_로_닫고_새_행을_연다() {
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"), point("2026-09-01", "JPY", "9.31"));
        service.run(ctx(5, ""));
        clock.setLocal(T0.plusHours(1));
        frankfurter.points = List.of(point("2026-09-01", "USD", "1391.25"), point("2026-09-01", "JPY", "9.31"));

        int written = service.run(ctx(2, ""));

        assertEquals(1, written);
        assertEquals(TODAY.minusDays(2), frankfurter.lastFrom);
        assertEquals("1391.25000000", openFx("20260901").get("ATTR01"));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'FX_RATE' AND CODE = '20260901'",
                Integer.class));
        assertEquals("9.31000000", openFx("20260901").get("ATTR03"));
    }

    @Test
    void 같은_날_일부_통화만_받으면_받은_칼럼만_갱신하고_나머지는_보존한다() {
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"), point("2026-09-01", "JPY", "9.31"));
        service.run(ctx(5, ""));
        clock.setLocal(T0.plusHours(1));
        frankfurter.points = List.of(point("2026-09-01", "EUR", "1500"), point("2026-09-01", "USD", "1395"));

        assertEquals(1, service.run(ctx(5, "")));

        Map<String, Object> day = openFx("20260901");
        assertEquals("1395.00000000", day.get("ATTR01"));
        assertEquals("1500.00000000", day.get("ATTR02"));
        assertEquals("9.31000000", day.get("ATTR03"));
    }

    @Test
    void 환율_칼럼_라벨이_없는_통화는_수집_대상에서_빠진다() {
        jdbc.update("UPDATE TB_MDM_DATA_ITEM SET ATTR04 = 'Y' WHERE MARU_DATA_ID = 'CUR' AND CODE = 'GBP'");
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"));

        service.run(ctx(5, ""));

        assertEquals(List.of("USD", "JPY", "EUR"), frankfurter.lastSymbols);
    }

    @Test
    void 통화_라벨을_바꾸면_칼럼_대응이_따라간다() {
        jdbc.update("UPDATE TB_MDM_DATA SET ATTR01_NAME = 'EUR', ATTR02_NAME = 'USD' WHERE MARU_DATA_ID = 'FX_RATE'");
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"));

        service.run(ctx(5, ""));

        assertEquals("1390.00000000", openFx("20260901").get("ATTR02"));
        assertNull(openFx("20260901").get("ATTR01"));
    }

    @Test
    void 닫힌_키는_다시_열어_건수에_센다() {
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"));
        service.run(ctx(5, ""));
        jdbc.update("UPDATE TB_MDM_DATA_ITEM SET VALID_TO = ? WHERE MARU_DATA_ID = 'FX_RATE' AND CODE = '20260901'",
                java.sql.Timestamp.valueOf(T0.plusMinutes(5)));
        clock.setLocal(T0.plusHours(1));

        assertEquals(1, service.run(ctx(5, "")));

        assertEquals("1390.00000000", openFx("20260901").get("ATTR01"));
    }

    @Test
    void 제공자_변수가_koreaexim_이고_키가_있을_때만_수출입은행을_쓴다() {
        koreaExim.points = List.of(point("2026-09-01", "USD", "1388"));
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"));

        service.run(ctx(5, "koreaexim"));
        assertEquals(0, koreaExim.calls, "키가 없으면 koreaexim 을 고를 수 없다");
        assertTrue(((String) openFx("20260901").get("DESCRIPTION")).contains("frankfurter"));

        properties.getExchange().setKoreaeximKey("test-key");
        clock.setLocal(T0.plusHours(1));
        assertEquals(1, service.run(ctx(5, "koreaexim")));
        assertEquals(1, koreaExim.calls);
        // 제공자가 바뀌면 같은 날 키는 UPDATE 로 덮어쓰고 출처가 따라 바뀐다(R11).
        assertEquals("1388.00000000", openFx("20260901").get("ATTR01"));
        assertTrue(((String) openFx("20260901").get("DESCRIPTION")).contains("koreaexim"));

        // provider 변수가 비면 설정 규칙(provider=frankfurter)을 따른다.
        clock.setLocal(T0.plusHours(2));
        assertEquals(1, service.run(ctx(5, "")));
        assertTrue(((String) openFx("20260901").get("DESCRIPTION")).contains("frankfurter"));
    }

    @Test
    void 제공자가_일부만_주면_받은_값은_커밋하고_예외로_끝난다() {
        frankfurter.points = List.of(point("2026-08-31", "USD", "1384"), point("2026-09-01", "JPY", "9.31"));
        frankfurter.failure = new WidgetExtPartialException("환율(Frankfurter) 2026-09-02 부터 받지 못했습니다", frankfurter.points);

        IllegalStateException e = assertThrows(IllegalStateException.class, () -> service.run(ctx(5, "")));

        assertTrue(e.getMessage().contains("일부만 응답"), e.getMessage());
        assertTrue(e.getMessage().contains("2일 중 2일 반영"), e.getMessage());
        assertEquals(2, fxCount());
        assertEquals("1384.00000000", openFx("20260831").get("ATTR01"));
    }

    @Test
    void 제공자가_통째로_실패하면_아무것도_쓰지_않고_메시지에_원인을_싣지_않는다() {
        frankfurter.failure = new WidgetExtException("환율(Frankfurter) 요청 실패: HTTP 503");

        IllegalStateException e = assertThrows(IllegalStateException.class, () -> service.run(ctx(5, "")));

        assertTrue(e.getMessage().contains("HTTP 503"), e.getMessage());
        assertNull(e.getCause());
        assertEquals(0, fxCount());

        // 예상 밖 예외는 종류만 싣는다(요청 주소·인증키가 메시지에 들어 있을 수 있다).
        frankfurter.failure = new IllegalArgumentException("https://x.example/?authkey=SECRET");
        IllegalStateException other = assertThrows(IllegalStateException.class, () -> service.run(ctx(5, "")));
        assertFalse(other.getMessage().contains("SECRET"), other.getMessage());
        assertTrue(other.getMessage().contains("IllegalArgumentException"), other.getMessage());
    }

    @Test
    void 외부_호출이_꺼져_있으면_제공자를_부르지_않고_0건이다() {
        properties.setEnabled(false);

        assertEquals(0, service.run(ctx(5, "")));

        assertEquals(0, frankfurter.calls);
        assertEquals(0, fxCount());
    }

    @Test
    void 수집_대상_통화가_없거나_환율_마스터가_없으면_예외다() {
        jdbc.update("UPDATE TB_MDM_DATA_ITEM SET ATTR04 = 'N' WHERE MARU_DATA_ID = 'CUR'");
        assertThrows(IllegalStateException.class, () -> service.run(ctx(5, "")));

        jdbc.update("UPDATE TB_MDM_DATA_ITEM SET ATTR04 = 'Y' WHERE MARU_DATA_ID = 'CUR' AND CODE = 'USD'");
        jdbc.update("DELETE FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'FX_RATE'");
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> service.run(ctx(5, "")));
        assertTrue(e.getMessage().contains("FX_RATE"), e.getMessage());
        assertEquals(0, frankfurter.calls);
    }

    @Test
    void 닫힌_통화는_수집_대상에서_빠진다() {
        jdbc.update("UPDATE TB_MDM_DATA_ITEM SET VALID_TO = ? WHERE MARU_DATA_ID = 'CUR' AND CODE = 'JPY'",
                java.sql.Timestamp.valueOf(T0.minusDays(1)));
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"));

        service.run(ctx(5, ""));

        assertEquals(List.of("USD", "EUR"), frankfurter.lastSymbols);
    }

    @Test
    void 환율_마스터가_폐기_상태면_저장이_거절되어_예외다() {
        jdbc.update("UPDATE TB_MDM_DATA SET STATUS = 'DEPRECATED' WHERE MARU_DATA_ID = 'FX_RATE'");
        frankfurter.points = List.of(point("2026-09-01", "USD", "1390"));

        assertThrows(RuntimeException.class, () -> service.run(ctx(5, "")));

        assertEquals(0, fxCount());
    }
}
