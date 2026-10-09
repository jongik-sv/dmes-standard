package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link ExchangeService} — MDM 환율 마스터({@link FxMasterReader})에서 읽은 값으로 latest/diff/history 조립, 빈 상태(empty)·
 * 낡음(stale)·enabled=false, 입력 검사, 읽는 구간. 허용 목록은 여기서는 mock(늘 통과) — 실제 판정은 {@link ExchangeAllowListTest},
 * 마스터 읽기는 {@link FxMasterReaderTest}·{@link FxMasterReaderOraTest}.
 */
@ExtendWith(MockitoExtension.class)
class ExchangeServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String USER = "userA";

    @Mock FxMasterReader reader;
    @Mock ExchangeAllowList allowList;

    private WidgetExtProperties props;
    private ExchangeService service;
    /** 마스터에서 읽혀 오는 값(시험이 채운다). */
    private final List<ExchangeRatePoint> master = new ArrayList<>();

    /** 날짜를 넘길 수 있는 시계 — WeatherServiceTest 도 쓴다. */
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
        Clock clock = new MutableClock(ZonedDateTime.of(2026, 10, 5, 10, 0, 0, 0, SEOUL).toInstant());
        service = new ExchangeService(props, reader, allowList, clock);
        lenient().when(reader.read(anyString(), anyCollection(), any(), any())).thenAnswer(inv -> List.copyOf(master));
    }

    private static LocalDate d(int month, int day) {
        return LocalDate.of(2026, month, day);
    }

    private void fx(int month, int day, String cur, String rate) {
        master.add(new ExchangeRatePoint(d(month, day), cur, new BigDecimal(rate)));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    @Test
    @DisplayName("[오늘-days, 오늘] 구간을 기준 통화·정리된 대상 통화로 마스터에서 읽는다")
    void readsRangeFromMaster() {
        service.exchange(null, "usd, eur ,usd", null, USER); // base 기본 KRW, 소문자·공백·중복 정리, days 기본 30

        verify(reader).read("KRW", List.of("USD", "EUR"), d(9, 5), d(10, 5));
    }

    @Test
    @DisplayName("latest = 통화별 가장 최근 값, diff = 그 전 값과의 차(전 값이 없으면 null), history 는 날짜 오름차순")
    void latestAndDiff() {
        fx(9, 30, "USD", "1380.00000000");
        fx(10, 1, "USD", "1385.50000000");
        fx(10, 2, "EUR", "1600.25000000");

        Map<String, Object> result = service.exchange("KRW", "EUR,USD", 7, USER);

        List<Map<String, Object>> latest = list(result, "latest");
        assertThat(latest).hasSize(2);
        assertThat(latest.get(0)).containsEntry("cur", "EUR").containsEntry("rate", 1600.25)
                .containsEntry("date", "2026-10-02").containsEntry("diff", null);
        assertThat(latest.get(1)).containsEntry("cur", "USD").containsEntry("rate", 1385.5)
                .containsEntry("date", "2026-10-01").containsEntry("diff", 5.5);
        assertThat(list(result, "history")).extracting(m -> m.get("date"))
                .containsExactly("2026-09-30", "2026-10-01", "2026-10-02");
        assertThat(result).doesNotContainKeys("stale", "empty", "disabled");
    }

    @Test
    @DisplayName("history 는 날짜 오름차순·같은 날은 요청 통화 순서이고, 음수 diff 도 계산한다")
    void historyOrderAndNegativeDiff() {
        fx(10, 5, "USD", "1379");
        fx(10, 5, "EUR", "1601");
        fx(10, 2, "USD", "1381");
        fx(10, 2, "EUR", "1600");

        Map<String, Object> result = service.exchange("KRW", "EUR,USD", 7, USER);

        assertThat(list(result, "history")).extracting(m -> m.get("date") + " " + m.get("cur"))
                .containsExactly("2026-10-02 EUR", "2026-10-02 USD", "2026-10-05 EUR", "2026-10-05 USD");
        assertThat(list(result, "latest").get(1)).containsEntry("cur", "USD").containsEntry("diff", -2.0);
    }

    @Test
    @DisplayName("마스터에 값이 하나도 없으면 빈 배열 + empty:true(disabled·stale 아님)")
    void emptyMaster() {
        Map<String, Object> result = service.exchange("KRW", "USD", 30, USER);

        assertThat(result).containsEntry("empty", true).doesNotContainKeys("disabled", "stale");
        assertThat(list(result, "latest")).isEmpty();
        assertThat(list(result, "history")).isEmpty();
    }

    @Test
    @DisplayName("가장 최근 기준일이 오늘 기준 10일을 넘게 지났으면 stale:true, 10일 이내(연휴)면 아니다")
    void staleAfterTenDays() {
        fx(9, 25, "USD", "1380"); // 오늘 10-05 기준 10일 전 — 아직 낡지 않음
        assertThat(service.exchange("KRW", "USD", 30, USER)).doesNotContainKeys("stale", "empty");

        master.clear();
        fx(9, 24, "USD", "1380"); // 11일 전
        Map<String, Object> stale = service.exchange("KRW", "USD", 30, USER);
        assertThat(stale).containsEntry("stale", true).doesNotContainKey("empty");
        assertThat(list(stale, "latest")).extracting(m -> m.get("date")).containsExactly("2026-09-24"); // 값은 그대로 보인다
    }

    @Test
    @DisplayName("낡음은 요청한 통화 전체의 가장 최근 기준일로 판정한다 — 한 통화만 오래돼도 다른 통화가 최신이면 낡지 않다")
    void staleUsesNewestAmongCurrencies() {
        fx(9, 1, "EUR", "1600");
        fx(10, 2, "USD", "1380");

        assertThat(service.exchange("KRW", "USD,EUR", 60, USER)).doesNotContainKey("stale");
    }

    @Test
    @DisplayName("enabled=false — 값이 없으면 빈 결과 + disabled:true(empty 아님), 값이 있으면 그대로 돌려준다")
    void disabledReturnsMasterOnly() {
        props.setEnabled(false);

        Map<String, Object> none = service.exchange("KRW", "USD", 30, USER);
        assertThat(none).containsEntry("disabled", true).doesNotContainKey("empty");
        assertThat(list(none, "latest")).isEmpty();
        assertThat(list(none, "history")).isEmpty();

        fx(10, 2, "USD", "1380");
        Map<String, Object> some = service.exchange("KRW", "USD", 30, USER);
        assertThat(some).doesNotContainKeys("disabled", "empty");
        assertThat(list(some, "latest")).hasSize(1);
    }

    @Test
    @DisplayName("입력 검사 — base 는 KRW 만, 통화 3자리 영문 1~10개(기준 통화 제외), days 1~90(기본 30). 거절하면 마스터를 읽지 않는다")
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
        verify(reader, never()).read(anyString(), anyCollection(), any(), any());
    }

    @Test
    @DisplayName("symbols 는 grids 모양(행 목록 [{cur}])도 받는다")
    void acceptsGridRows() {
        service.exchange("KRW", List.of(Map.of("cur", "JPY"), Map.of("cur", "CNY")), 7, USER);

        verify(reader).read("KRW", List.of("JPY", "CNY"), d(9, 28), d(10, 5));
    }

    @Test
    @DisplayName("허용 목록(실제) — 사용 중인 환율 정의 하나의 통화·기간 안만 조회하고, 그 밖은 마스터를 읽기 전에 거절한다")
    void rejectsRequestsOutsideExchangeDefinitions() {
        WidgetDefRepository defs = mock(WidgetDefRepository.class);
        WidgetDef fx = new WidgetDef();
        fx.setWidgetId("def.fx000001");
        fx.setSrcTp(WidgetDef.SRC_DEF);
        fx.setTypeId("exchange");
        fx.setUseYn("Y");
        fx.setConfigJson("{\"base\":\"KRW\",\"currencies\":[\"USD\",\"EUR\"],\"days\":30}");
        when(defs.findBySrcTpAndTypeIdOrderByWidgetIdAsc(WidgetDef.SRC_DEF, "exchange")).thenReturn(List.of(fx));
        Clock clock = new MutableClock(ZonedDateTime.of(2026, 10, 5, 10, 0, 0, 0, SEOUL).toInstant());
        ExchangeService strict = new ExchangeService(props, reader, new ExchangeAllowList(defs, clock), clock);

        strict.exchange("KRW", " usd , Eur ", 30, USER); // 대소문자·공백은 정리한 뒤 판정
        strict.exchange("KRW", "EUR", 7, USER);
        assertThatThrownBy(() -> strict.exchange("KRW", "USD,GBP", 30, USER))
                .isInstanceOf(BusinessException.class).hasMessage(ExchangeAllowList.MSG_NOT_ALLOWED);
        assertThatThrownBy(() -> strict.exchange("KRW", "USD", 31, USER))
                .isInstanceOf(BusinessException.class).hasMessage(ExchangeAllowList.MSG_NOT_ALLOWED);
        verify(reader, times(2)).read(anyString(), anyCollection(), any(), any());
    }
}
