package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRate;
import com.dongkuk.dmes.mcm.widget.ext.repository.ExchangeRateRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link ExchangeService} — 빈 구간만 요청, (통화, 날짜) 단위 시도 기록, 실패 시 stale·10분 뒤 재시도, 사용자별 속도 제한,
 * 날짜마다 부르는 제공자는 빈 날 구간만, 동시 요청 한 번만, diff 계산, 입력 검사, enabled=false, 제공자 고르기.
 * 허용 목록은 여기서는 mock(늘 통과) — 실제 판정은 {@link ExchangeAllowListTest}.
 */
@ExtendWith(MockitoExtension.class)
class ExchangeServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String USER = "userA";

    @Mock ExchangeRateRepository repository;
    @Mock ExchangeRateWriter writer;
    @Mock ExchangeRateProvider frankfurter;
    @Mock ExchangeRateProvider koreaExim;
    @Mock ExchangeAllowList allowList;

    private WidgetExtProperties props;
    private MutableClock clock;
    private ExchangeService service;
    private final List<ExchangeRate> dbRows = new ArrayList<>();

    /** 날짜를 넘길 수 있는 시계. */
    static final class MutableClock extends Clock {
        Instant now;
        MutableClock(Instant now) { this.now = now; }
        @Override public ZoneId getZone() { return SEOUL; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @BeforeEach
    void setUp() {
        props = new WidgetExtProperties();
        // 2026-10-05(월) 10:00 서울
        clock = new MutableClock(ZonedDateTime.of(2026, 10, 5, 10, 0, 0, 0, SEOUL).toInstant());
        service = new ExchangeService(props, repository, writer, frankfurter, koreaExim, allowList, clock);
        lenient().when(frankfurter.id()).thenReturn("frankfurter");
        lenient().when(koreaExim.id()).thenReturn("koreaexim");
        lenient().when(repository.findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
                anyString(), anyCollection(), anyString(), anyString())).thenAnswer(inv -> List.copyOf(dbRows));
    }

    private static LocalDate d(int month, int day) {
        return LocalDate.of(2026, month, day);
    }

    private void db(String yyyymmdd, String cur, String rate) {
        ExchangeRate r = new ExchangeRate();
        r.setRateDate(yyyymmdd);
        r.setBaseCur("KRW");
        r.setQuoteCur(cur);
        r.setRate(new BigDecimal(rate));
        r.setSource("frankfurter");
        dbRows.add(r);
    }

    /** 2026-09-28(월)~10-02(금) 다섯 영업일에 USD·EUR 를 모두 채운다. */
    private void fullWeekBefore() {
        for (String day : List.of("20260928", "20260929", "20260930", "20261001", "20261002")) {
            db(day, "USD", "1380");
            db(day, "EUR", "1600");
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    @Test
    @DisplayName("빠진 영업일 구간(첫 빈 날 ~ 마지막 빈 날)만 제공자에 묻고, 받은 값을 upsert 해 결과에 합친다")
    void fetchesOnlyMissingSpan() {
        for (String day : List.of("20260928", "20260929", "20260930", "20261001")) {
            db(day, "USD", "1380");
            db(day, "EUR", "1600");
        }
        db("20261002", "USD", "1381"); // 10-02 EUR 빠짐, 10-05(오늘) 둘 다 빠짐
        List<ExchangeRatePoint> fetched = List.of(
                new ExchangeRatePoint(d(10, 2), "EUR", new BigDecimal("1601")),
                new ExchangeRatePoint(d(10, 5), "USD", new BigDecimal("1382")),
                new ExchangeRatePoint(d(10, 5), "EUR", new BigDecimal("1602")));
        when(frankfurter.fetch("KRW", List.of("USD", "EUR"), d(10, 2), d(10, 5))).thenReturn(fetched);

        Map<String, Object> result = service.exchange("KRW", "USD,EUR", 7, USER);

        verify(repository).findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
                "KRW", List.of("USD", "EUR"), "20260928", "20261005");
        verify(frankfurter).fetch("KRW", List.of("USD", "EUR"), d(10, 2), d(10, 5));
        verify(writer).upsert("KRW", "frankfurter", fetched);
        assertThat(result).doesNotContainKey("stale");
        assertThat(list(result, "history")).hasSize(12);
        assertThat(list(result, "latest")).extracting(m -> m.get("cur"), m -> m.get("date"), m -> m.get("rate"))
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("USD", "2026-10-05", 1382.0),
                        org.assertj.core.groups.Tuple.tuple("EUR", "2026-10-05", 1602.0));
    }

    @Test
    @DisplayName("영업일이 모두 있으면(주말은 빈 날이 아니다) 제공자를 부르지 않는다")
    void noFetchWhenComplete() {
        fullWeekBefore();
        clock.now = ZonedDateTime.of(2026, 10, 4, 10, 0, 0, 0, SEOUL).toInstant(); // 일요일

        Map<String, Object> result = service.exchange("KRW", "USD,EUR", 6, USER); // 09-28 ~ 10-04

        verify(frankfurter, never()).fetch(anyString(), anyList(), any(), any());
        verify(writer, never()).upsert(anyString(), anyString(), anyList());
        assertThat(result).doesNotContainKey("stale");
        assertThat(list(result, "history")).hasSize(10);
    }

    @Test
    @DisplayName("오늘 값이 없으면(고시 전) 같은 통화·날짜는 10분 동안 다시 묻지 않는다 — 묶음 순서가 달라도 같고, 다음 날에는 다시 시도")
    void triesOncePerDay() {
        fullWeekBefore(); // 10-05(오늘)만 빠짐
        when(frankfurter.fetch(anyString(), anyList(), any(), any())).thenReturn(List.of());

        service.exchange("KRW", "USD,EUR", 7, USER);
        service.exchange("KRW", "EUR,USD", 7, USER); // 순서만 다른 같은 묶음
        verify(frankfurter, times(1)).fetch("KRW", List.of("USD", "EUR"), d(10, 5), d(10, 5));

        clock.now = ZonedDateTime.of(2026, 10, 6, 10, 0, 0, 0, SEOUL).toInstant();
        service.exchange("KRW", "USD,EUR", 7, USER);
        verify(frankfurter).fetch("KRW", List.of("USD", "EUR"), d(10, 5), d(10, 6));
    }

    @Test
    @DisplayName("제공자 실패 → DB 값만 + stale:true, 10분 안에 다시 불러도 다시 시도하지 않고 stale 유지")
    void providerFailureReturnsStaleDbValues() {
        fullWeekBefore();
        when(frankfurter.fetch(anyString(), anyList(), any(), any()))
                .thenThrow(new WidgetExtException("환율(Frankfurter) 요청 실패: HTTP 503"));

        Map<String, Object> first = service.exchange("KRW", "USD,EUR", 7, USER);
        Map<String, Object> second = service.exchange("KRW", "USD,EUR", 7, USER);

        assertThat(first).containsEntry("stale", true);
        assertThat(list(first, "history")).hasSize(10);
        assertThat(second).containsEntry("stale", true);
        verify(frankfurter, times(1)).fetch(anyString(), anyList(), any(), any());
        verify(writer, never()).upsert(anyString(), anyString(), anyList());
    }

    @Test
    @DisplayName("제공자가 일부만 받고 멈추면 받은 값은 저장·합치고 stale:true, 10분 안에는 다시 시도하지 않는다")
    void partialFetchIsStaleButKeepsReceivedValues() {
        fullWeekBefore(); // 10-05(오늘)만 빠짐
        List<ExchangeRatePoint> received = List.of(new ExchangeRatePoint(d(10, 5), "USD", new BigDecimal("1382")));
        when(frankfurter.fetch(anyString(), anyList(), any(), any()))
                .thenThrow(new WidgetExtPartialException("일부만 받음", received));

        Map<String, Object> first = service.exchange("KRW", "USD,EUR", 7, USER);
        Map<String, Object> second = service.exchange("KRW", "USD,EUR", 7, USER);

        assertThat(first).containsEntry("stale", true);
        assertThat(list(first, "history")).anySatisfy(h -> {
            assertThat(h.get("date")).isEqualTo("2026-10-05");
            assertThat(h.get("cur")).isEqualTo("USD");
        });
        assertThat(second).containsEntry("stale", true);
        verify(frankfurter, times(1)).fetch(anyString(), anyList(), any(), any());
        verify(writer).upsert("KRW", "frankfurter", received);
    }

    @Test
    @DisplayName("upsert 가 실패해도 받은 값은 이번 응답에 쓰고(stale 아님), 같은 날 다음 호출에서 다시 받는다")
    void writerFailureRetriesNextCall() {
        fullWeekBefore(); // 10-05(오늘)만 빠짐
        List<ExchangeRatePoint> fetched = List.of(
                new ExchangeRatePoint(d(10, 5), "USD", new BigDecimal("1382")),
                new ExchangeRatePoint(d(10, 5), "EUR", new BigDecimal("1602")));
        when(frankfurter.fetch("KRW", List.of("USD", "EUR"), d(10, 5), d(10, 5))).thenReturn(fetched);
        when(writer.upsert(anyString(), anyString(), anyList())).thenThrow(new IllegalStateException("PK 충돌"));

        Map<String, Object> first = service.exchange("KRW", "USD,EUR", 7, USER);
        service.exchange("KRW", "USD,EUR", 7, USER);

        assertThat(first).doesNotContainKey("stale");
        assertThat(list(first, "latest")).extracting(m -> m.get("date")).containsOnly("2026-10-05");
        verify(frankfurter, times(2)).fetch("KRW", List.of("USD", "EUR"), d(10, 5), d(10, 5));
    }

    @Test
    @DisplayName("제공자가 내주지 않는 통화(받은 값에 한 번도 없음)는 빈 날 판정에서 빼 — 날마다 기간 전체를 다시 받지 않는다")
    void unsupportedCurrencyIsNotCountedAsMissing() {
        for (String day : List.of("20260928", "20260929", "20260930", "20261001", "20261002")) {
            db(day, "USD", "1380");
        }
        when(frankfurter.fetch(anyString(), anyList(), any(), any())).thenAnswer(inv -> {
            LocalDate to = inv.getArgument(3);
            return List.of(new ExchangeRatePoint(to, "USD", new BigDecimal("1382"))); // VND 는 늘 빠진다(ECB 목록 밖)
        });

        Map<String, Object> first = service.exchange("KRW", "USD,VND", 7, USER); // 10-05: VND 가 모든 날 비어 기간 전체
        verify(frankfurter).fetch("KRW", List.of("USD", "VND"), d(9, 28), d(10, 5));
        assertThat(list(first, "latest")).extracting(m -> m.get("cur")).containsExactly("USD");

        clock.now = ZonedDateTime.of(2026, 10, 6, 10, 0, 0, 0, SEOUL).toInstant();
        service.exchange("KRW", "USD,VND", 7, USER); // VND 는 빼고 판정 → USD 가 빈 10-05·10-06 만
        verify(frankfurter).fetch("KRW", List.of("USD", "VND"), d(10, 5), d(10, 6));
    }

    @Test
    @DisplayName("시도 기록은 (제공자|통화) 1000개까지만 둔다 — 아무 통화로 메모리를 채우지 못하게")
    void attemptsAreCapped() {
        props.getExchange().setUserFetchLimit(100_000); // 이 시험은 메모리 상한만 본다
        for (int i = 0; i < ExchangeService.MAX_ATTEMPTS + 5; i++) { // 빈 DB → 묶음마다 한 번 시도
            String cur = "" + (char) ('A' + i / 676 % 26) + (char) ('A' + i / 26 % 26) + (char) ('A' + i % 26);
            service.exchange("KRW", cur, 1 + i % 90, USER);
        }
        assertThat(service.attemptsSize()).isEqualTo(ExchangeService.MAX_ATTEMPTS);
    }

    @Test
    @DisplayName("latest = 통화별 가장 최근 값, diff = 그 전 값과의 차(전 값이 없으면 null), history 는 날짜 오름차순")
    void latestAndDiff() {
        props.setEnabled(false); // 외부 호출 없이 DB 값만으로 계산을 본다
        db("20260930", "USD", "1380.00000000");
        db("20261001", "USD", "1385.50000000");
        db("20261002", "EUR", "1600.25000000");

        Map<String, Object> result = service.exchange("KRW", "EUR,USD", 7, USER);

        List<Map<String, Object>> latest = list(result, "latest");
        assertThat(latest).hasSize(2);
        assertThat(latest.get(0)).containsEntry("cur", "EUR").containsEntry("rate", 1600.25)
                .containsEntry("date", "2026-10-02").containsEntry("diff", null);
        assertThat(latest.get(1)).containsEntry("cur", "USD").containsEntry("rate", 1385.5)
                .containsEntry("date", "2026-10-01").containsEntry("diff", 5.5);
        assertThat(list(result, "history")).extracting(m -> m.get("date"))
                .containsExactly("2026-09-30", "2026-10-01", "2026-10-02");
        assertThat(result).doesNotContainKey("disabled");
    }

    @Test
    @DisplayName("입력 검사 — base 는 KRW 만, 통화 3자리 영문 1~10개(기준 통화 제외), days 1~90(기본 30)")
    void validatesInput() {
        assertThatThrownBy(() -> service.exchange("USD", "EUR", 7, USER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.exchange("KRW", null, 7, USER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.exchange("KRW", " , ", 7, USER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.exchange("KRW", "US", 7, USER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.exchange("KRW", "USD1", 7, USER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.exchange("KRW", "USD,KRW", 7, USER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.exchange("KRW",
                "USD,EUR,JPY,CNY,GBP,AUD,CAD,CHF,HKD,SGD,VND", 7, USER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.exchange("KRW", "USD", 0, USER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.exchange("KRW", "USD", 91, USER)).isInstanceOf(BusinessException.class);
        verify(repository, never()).findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
                anyString(), anyCollection(), anyString(), anyString());

        props.setEnabled(false);
        service.exchange(null, "usd, eur ,usd", null, USER); // base 기본 KRW, 소문자·공백·중복 정리, days 기본 30
        verify(repository).findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
                "KRW", List.of("USD", "EUR"), "20260905", "20261005");
    }

    @Test
    @DisplayName("symbols 는 grids 모양(행 목록 [{cur}])도 받는다")
    void acceptsGridRows() {
        props.setEnabled(false);
        service.exchange("KRW", List.of(Map.of("cur", "JPY"), Map.of("cur", "CNY")), 7, USER);
        verify(repository).findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
                eq("KRW"), eq(List.of("JPY", "CNY")), eq("20260928"), eq("20261005"));
    }

    @Test
    @DisplayName("enabled=false — 외부 호출 없음, DB 값이 없으면 빈 결과 + disabled:true")
    void disabledReturnsDbOnly() {
        props.setEnabled(false);

        Map<String, Object> result = service.exchange("KRW", "USD", 30, USER);

        verify(frankfurter, never()).fetch(anyString(), anyList(), any(), any());
        assertThat(result).containsEntry("disabled", true);
        assertThat(list(result, "latest")).isEmpty();
        assertThat(list(result, "history")).isEmpty();
    }

    @Test
    @DisplayName("provider=koreaexim 은 키가 있을 때만 쓰고, 키가 없으면 frankfurter 로 받는다")
    void choosesProvider() {
        fullWeekBefore();
        when(koreaExim.fetch(anyString(), anyList(), any(), any())).thenReturn(List.of());
        when(frankfurter.fetch(anyString(), anyList(), any(), any())).thenReturn(List.of());
        props.getExchange().setProvider("koreaexim");
        props.getExchange().setKoreaeximKey("KEY");

        service.exchange("KRW", "USD,EUR", 7, USER);
        verify(koreaExim).fetch("KRW", List.of("USD", "EUR"), d(10, 5), d(10, 5));
        verify(frankfurter, never()).fetch(anyString(), anyList(), any(), any());

        props.getExchange().setKoreaeximKey("");
        service.exchange("KRW", "USD", 7, USER); // 다른 제공자의 시도 기록 → 이번엔 시도
        verify(frankfurter).fetch("KRW", List.of("USD"), d(10, 5), d(10, 5));
    }

    // ── 남용 막기(허용 목록·시도 기록·속도 제한·동시 요청) ─────────────────────

    private static ExchangeRatePoint p(int month, int day, String cur, String rate) {
        return new ExchangeRatePoint(d(month, day), cur, new BigDecimal(rate));
    }

    @Test
    @DisplayName("실패 뒤 10분 동안은 통화 조합·기간을 바꿔도 같은 날짜를 다시 묻지 않고(stale), 10분이 지나면 다시 묻는다")
    void retriesOnlyAfterCooldownEvenWithOtherCombinations() {
        fullWeekBefore(); // 10-05(오늘)만 빠짐
        when(frankfurter.fetch(anyString(), anyList(), any(), any()))
                .thenThrow(new WidgetExtException("환율(Frankfurter) 요청 실패: HTTP 503"))
                .thenReturn(List.of(p(10, 5, "USD", "1382"), p(10, 5, "EUR", "1602")));

        assertThat(service.exchange("KRW", "USD,EUR", 7, USER)).containsEntry("stale", true);
        clock.now = clock.now.plus(Duration.ofMinutes(9));
        assertThat(service.exchange("KRW", "USD", 3, USER)).containsEntry("stale", true);
        assertThat(service.exchange("KRW", "EUR", 1, "userB")).containsEntry("stale", true);
        verify(frankfurter, times(1)).fetch(anyString(), anyList(), any(), any());

        clock.now = clock.now.plus(Duration.ofMinutes(2)); // 실패 뒤 11분
        Map<String, Object> retried = service.exchange("KRW", "USD,EUR", 7, USER);
        assertThat(retried).doesNotContainKey("stale");
        verify(frankfurter, times(2)).fetch(anyString(), anyList(), any(), any());
        verify(frankfurter, times(2)).fetch("KRW", List.of("USD", "EUR"), d(10, 5), d(10, 5));
    }

    @Test
    @DisplayName("통화 조합·기간을 바꿔 불러도 이미 물어본 (통화, 날짜)는 다시 묻지 않는다 — 지난 빈 날(휴일)은 그날 끝까지, 오늘은 10분")
    void variedCombinationsDoNotMultiplyExternalCalls() {
        for (String day : List.of("20260928", "20260929", "20260930", "20261002")) { // 10-01 은 휴일처럼 비어 있다
            db(day, "USD", "1380");
            db(day, "EUR", "1600");
            db(day, "JPY", "9.3");
        }
        when(frankfurter.fetch(anyString(), anyList(), any(), any())).thenReturn(List.of());

        service.exchange("KRW", "USD,EUR,JPY", 7, USER);
        verify(frankfurter).fetch("KRW", List.of("USD", "EUR", "JPY"), d(10, 1), d(10, 5));
        for (String syms : List.of("USD", "EUR", "JPY", "USD,EUR", "EUR,JPY", "JPY,USD", "USD,EUR,JPY")) {
            for (int days : new int[] {4, 5, 6, 7}) {
                service.exchange("KRW", syms, days, "user-" + syms + days);
            }
        }
        verify(frankfurter, times(1)).fetch(anyString(), anyList(), any(), any());

        clock.now = clock.now.plus(Duration.ofMinutes(11)); // 오늘 값만 다시 묻는다(10-01 은 오늘 끝까지 묻지 않는다)
        service.exchange("KRW", "USD,EUR,JPY", 7, USER);
        verify(frankfurter).fetch("KRW", List.of("USD", "EUR", "JPY"), d(10, 5), d(10, 5));
        verify(frankfurter, times(2)).fetch(anyString(), anyList(), any(), any());
    }

    @Test
    @DisplayName("외부 호출을 일으키는 요청은 사용자별로 구간마다 상한까지 — 넘으면 거절, 다른 사용자·DB 로 답하는 요청·다음 구간은 그대로")
    void rateLimitsFetchingRequestsPerUser() {
        props.getExchange().setUserFetchLimit(3);
        props.getExchange().setUserFetchWindowSec(600);
        when(frankfurter.fetch(anyString(), anyList(), any(), any())).thenReturn(List.of());

        service.exchange("KRW", "USD", 7, USER);
        service.exchange("KRW", "EUR", 7, USER);
        service.exchange("KRW", "JPY", 7, USER);
        assertThatThrownBy(() -> service.exchange("KRW", "CNY", 7, USER))
                .isInstanceOf(BusinessException.class).hasMessage(ExchangeService.MSG_TOO_MANY);
        verify(frankfurter, never()).fetch(eq("KRW"), eq(List.of("CNY")), any(), any());

        service.exchange("KRW", "USD,EUR", 7, USER); // 이미 물어본 날짜뿐 — 외부 호출이 없어 세지 않는다
        service.exchange("KRW", "CNY", 7, "userB"); // 다른 사용자
        verify(frankfurter).fetch(eq("KRW"), eq(List.of("CNY")), any(), any());

        clock.now = clock.now.plus(Duration.ofSeconds(601)); // 다음 구간
        service.exchange("KRW", "GBP", 7, USER);
        verify(frankfurter).fetch(eq("KRW"), eq(List.of("GBP")), any(), any());
    }

    @Test
    @DisplayName("날짜마다 부르는 제공자(한국수출입은행)는 첫 빈 날~마지막 빈 날이 아니라 빈 날의 이어진 구간만 부른다 — DB 에 있는 날은 묻지 않는다")
    void perDayProviderFetchesOnlyMissingRuns() {
        props.getExchange().setProvider("koreaexim");
        props.getExchange().setKoreaeximKey("KEY");
        when(koreaExim.callsPerDay()).thenReturn(true);
        when(koreaExim.fetch(anyString(), anyList(), any(), any())).thenReturn(List.of());
        for (String day : List.of("20260929", "20260930", "20261001", "20261002")) db(day, "USD", "1380"); // 09-28(월)·10-05(월) 빠짐

        service.exchange("KRW", "USD", 7, USER);

        verify(koreaExim).fetch("KRW", List.of("USD"), d(9, 28), d(9, 28));
        verify(koreaExim).fetch("KRW", List.of("USD"), d(10, 5), d(10, 5));
        verify(koreaExim, times(2)).fetch(anyString(), anyList(), any(), any());

        // 사이의 주말은 이어진 것으로 본다(10-02 금 ~ 10-05 월은 한 구간)
        List<LocalDate[]> runs = ExchangeService.runs(new TreeSet<>(List.of(d(9, 28), d(10, 2), d(10, 5))));
        assertThat(runs).hasSize(2);
        assertThat(runs.get(0)).containsExactly(d(9, 28), d(9, 28));
        assertThat(runs.get(1)).containsExactly(d(10, 2), d(10, 5));
    }

    @Test
    @DisplayName("같은 날짜를 묻는 동시 요청은 하나만 외부를 부른다 — 나머지는 진행 중 기록을 보고 DB 값으로 답한다")
    void concurrentRequestsFetchOnce() throws Exception {
        fullWeekBefore(); // 10-05(오늘)만 빠짐
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(frankfurter.fetch(anyString(), anyList(), any(), any())).thenAnswer(inv -> {
            entered.countDown();
            release.await(5, TimeUnit.SECONDS);
            return List.of(p(10, 5, "USD", "1382"), p(10, 5, "EUR", "1602"));
        });
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<Map<String, Object>> first = pool.submit(() -> service.exchange("KRW", "USD,EUR", 7, USER));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();

            Map<String, Object> second = service.exchange("KRW", "EUR,USD", 5, "userB");
            assertThat(second).doesNotContainKey("stale");
            assertThat(list(second, "latest")).extracting(m -> m.get("date")).containsOnly("2026-10-02");

            release.countDown();
            assertThat(list(first.get(5, TimeUnit.SECONDS), "latest")).extracting(m -> m.get("date")).containsOnly("2026-10-05");
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
        verify(frankfurter, times(1)).fetch(anyString(), anyList(), any(), any());
    }

    @Test
    @DisplayName("허용 목록(실제) — 사용 중인 환율 정의 하나의 통화·기간 안만 조회하고, 그 밖은 외부·DB 를 부르기 전에 거절한다")
    void rejectsRequestsOutsideExchangeDefinitions() {
        WidgetDefRepository defs = mock(WidgetDefRepository.class);
        WidgetDef fx = new WidgetDef();
        fx.setWidgetId("def.fx000001");
        fx.setSrcTp(WidgetDef.SRC_DEF);
        fx.setTypeId("exchange");
        fx.setUseYn("Y");
        fx.setConfigJson("{\"base\":\"KRW\",\"currencies\":[\"USD\",\"EUR\"],\"days\":30}");
        when(defs.findBySrcTpAndTypeIdOrderByWidgetIdAsc(WidgetDef.SRC_DEF, "exchange")).thenReturn(List.of(fx));
        ExchangeService strict = new ExchangeService(props, repository, writer, frankfurter, koreaExim,
                new ExchangeAllowList(defs, clock), clock);
        props.setEnabled(false);

        strict.exchange("KRW", " usd , Eur ", 30, USER); // 대소문자·공백은 정리한 뒤 판정
        strict.exchange("KRW", "EUR", 7, USER);
        assertThatThrownBy(() -> strict.exchange("KRW", "USD,GBP", 30, USER))
                .isInstanceOf(BusinessException.class).hasMessage(ExchangeAllowList.MSG_NOT_ALLOWED);
        assertThatThrownBy(() -> strict.exchange("KRW", "USD", 31, USER))
                .isInstanceOf(BusinessException.class).hasMessage(ExchangeAllowList.MSG_NOT_ALLOWED);
        verify(repository, times(2)).findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
                anyString(), anyCollection(), anyString(), anyString());
        verify(frankfurter, never()).fetch(anyString(), anyList(), any(), any());
    }
}
