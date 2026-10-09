package com.dongkuk.dmes.mdm.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint;
import com.dongkuk.dmes.mdm.common.segment.UpsertRow;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 환율 동기화 작업의 순수 함수: 키 만들기·정규화·중복 제거·제공자 선택·기간 해석(DB·외부 호출 없음). */
class ExchangeRateSyncServiceTest {

    private static final LocalDate D = LocalDate.of(2026, 10, 9);
    private static final List<String> SYMBOLS = List.of("USD", "JPY", "EUR");

    private static ExchangeRatePoint point(LocalDate date, String cur, String rate) {
        return new ExchangeRatePoint(date, cur, rate == null ? null : new BigDecimal(rate));
    }

    @Test
    void 키는_통화_더하기_기준일_8자리이고_값은_소수_8자리_문자열이다() {
        List<UpsertRow> rows = ExchangeRateSyncService.toRows(List.of(point(D, "USD", "1384.51")), SYMBOLS, "koreaexim");

        assertEquals(1, rows.size());
        UpsertRow row = rows.get(0);
        assertEquals("USD20261009", row.code());
        assertEquals("USD 2026-10-09", row.value().name());
        assertEquals("USD", row.value().attr(1));
        assertEquals("20261009", row.value().attr(2));
        assertEquals("1384.51000000", row.value().attr(3));
        assertEquals("KRW", row.value().attr(4));
        assertEquals("koreaexim", row.value().attr(5));
        assertNull(row.value().attr(6));
    }

    @Test
    void 값은_소수_8자리로_반올림하고_지수_표기를_쓰지_않는다() {
        List<UpsertRow> rows = ExchangeRateSyncService.toRows(
                List.of(point(D, "USD", "0.123456785"), point(D, "JPY", "9.1E+2")), SYMBOLS, "frankfurter");

        assertEquals("910.00000000", rows.stream().filter(r -> r.code().startsWith("JPY")).findFirst().orElseThrow().value().attr(3));
        assertEquals("0.12345679", rows.stream().filter(r -> r.code().startsWith("USD")).findFirst().orElseThrow().value().attr(3));
    }

    @Test
    void 같은_키는_뒤의_값_하나만_남기고_키_순서로_정렬한다() {
        List<UpsertRow> rows = ExchangeRateSyncService.toRows(List.of(
                point(D, "USD", "1380"), point(D.minusDays(1), "USD", "1370"), point(D, "EUR", "1500"), point(D, "USD", "1390")),
                SYMBOLS, "frankfurter");

        assertEquals(List.of("EUR20261009", "USD20261008", "USD20261009"), rows.stream().map(UpsertRow::code).toList());
        assertEquals("1390.00000000", rows.get(2).value().attr(3));
    }

    @Test
    void 요청하지_않은_통화와_쓸_수_없는_값은_버린다() {
        List<UpsertRow> rows = ExchangeRateSyncService.toRows(java.util.Arrays.asList(
                point(D, "GBP", "1700"), point(D, "USD", null), point(D, "USD", "0"), point(D, "USD", "-1"),
                point(D, "USD", "0.000000001"), new ExchangeRatePoint(null, "USD", BigDecimal.ONE),
                new ExchangeRatePoint(D, null, BigDecimal.ONE), null, point(D, " jpy ", "9.5")), SYMBOLS, "frankfurter");

        assertEquals(List.of("JPY20261009"), rows.stream().map(UpsertRow::code).toList());
    }

    @Test
    void 제공자_선택은_수출입은행을_원하고_키가_있을_때만_수출입은행이다() {
        assertEquals("koreaexim", ExchangeRateSyncService.chooseProviderId("koreaexim", "KEY"));
        assertEquals("koreaexim", ExchangeRateSyncService.chooseProviderId(" KoreaExim ", " KEY "));
        assertEquals("frankfurter", ExchangeRateSyncService.chooseProviderId("koreaexim", ""));
        assertEquals("frankfurter", ExchangeRateSyncService.chooseProviderId("koreaexim", null));
        assertEquals("frankfurter", ExchangeRateSyncService.chooseProviderId("frankfurter", "KEY"));
        assertEquals("frankfurter", ExchangeRateSyncService.chooseProviderId(null, "KEY"));
        assertEquals("frankfurter", ExchangeRateSyncService.chooseProviderId("모르는값", "KEY"));
    }

    @Test
    void 조회_기간은_숫자와_숫자_문자열을_받고_잘못된_값은_기본값_큰_값은_상한이다() {
        assertEquals(5, ExchangeRateSyncService.lookbackDays(Map.of()));
        assertEquals(7, ExchangeRateSyncService.lookbackDays(Map.of("lookbackDays", new BigDecimal("7"))));
        assertEquals(7, ExchangeRateSyncService.lookbackDays(Map.of("lookbackDays", 7)));
        assertEquals(12, ExchangeRateSyncService.lookbackDays(Map.of("lookbackDays", " 12 ")));
        assertEquals(5, ExchangeRateSyncService.lookbackDays(Map.of("lookbackDays", "")));
        assertEquals(5, ExchangeRateSyncService.lookbackDays(Map.of("lookbackDays", "abc")));
        assertEquals(5, ExchangeRateSyncService.lookbackDays(Map.of("lookbackDays", 0)));
        assertEquals(5, ExchangeRateSyncService.lookbackDays(Map.of("lookbackDays", -3)));
        assertEquals(90, ExchangeRateSyncService.lookbackDays(Map.of("lookbackDays", 100000)));
        Map<String, Object> withNull = new HashMap<>();
        withNull.put("lookbackDays", null);
        assertEquals(5, ExchangeRateSyncService.lookbackDays(withNull));
    }

    @Test
    void 작업_정의는_설계_값이다() {
        ExchangeRateSyncJob job = new ExchangeRateSyncJob(null);

        assertEquals("mdm.exchangeRateSync", job.id());
        assertEquals(com.dongkuk.dmes.mcm.job.JobModule.MDM, job.module());
        assertEquals("환율 마스터 동기화", job.name());
        assertEquals("10 11 * * 1-5", job.defaultCron());
        assertEquals(java.time.Duration.ofMinutes(10), job.defaultTimeout());
        assertEquals(List.of("lookbackDays", "provider"), job.defaultVars().stream().map(v -> v.name()).toList());
        assertEquals("5", job.defaultVars().get(0).value());
        assertEquals("", job.defaultVars().get(1).value());
        assertTrue(com.dongkuk.dmes.mcm.job.def.JobVars.validate(job.defaultVars()).isEmpty());
        // 기본 일정이 등록기의 CronSpec 으로 읽힌다.
        com.dongkuk.dmes.mcm.job.def.CronSpec.parse(job.defaultCron());
    }
}
