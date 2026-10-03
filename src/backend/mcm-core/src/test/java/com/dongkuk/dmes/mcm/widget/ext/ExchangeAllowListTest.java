package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link ExchangeAllowList} — 정의 설정 해석이 화면(readExchangeConfig → exchangeRequest)과 같은지, 요청이 정의 하나의 범위 안일 때만
 * 통과하는지(두 정의를 섞은 묶음은 거절), 사용 중지 정의 제외, 60초 캐시·정의 저장 이벤트로 비우기.
 */
class ExchangeAllowListTest {

    private WidgetDefRepository repository;
    private final List<WidgetDef> defs = new ArrayList<>();
    private MutableClock clock;
    private ExchangeAllowList allowList;

    @BeforeEach
    void setUp() {
        repository = mock(WidgetDefRepository.class);
        when(repository.findBySrcTpAndTypeIdOrderByWidgetIdAsc(WidgetDef.SRC_DEF, "exchange")).thenAnswer(inv -> List.copyOf(defs));
        clock = new MutableClock(Instant.parse("2026-10-05T01:00:00Z"));
        allowList = new ExchangeAllowList(repository, clock);
    }

    private void def(String id, String useYn, String configJson) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(id);
        d.setSrcTp(WidgetDef.SRC_DEF);
        d.setTypeId("exchange");
        d.setUseYn(useYn);
        d.setConfigJson(configJson);
        defs.add(d);
    }

    private void allowed(List<String> symbols, int days) {
        assertThatCode(() -> allowList.require(symbols, days)).doesNotThrowAnyException();
    }

    private void rejected(List<String> symbols, int days) {
        assertThatThrownBy(() -> allowList.require(symbols, days))
                .isInstanceOf(BusinessException.class).hasMessage(ExchangeAllowList.MSG_NOT_ALLOWED);
    }

    @Test
    @DisplayName("요청은 정의 하나의 통화 부분집합·기간 이하만 — 두 정의를 섞은 묶음, 더 긴 기간, 정의에 없는 통화는 거절")
    void requiresSubsetOfOneDefinition() {
        def("def.fx000001", "Y", "{\"base\":\"KRW\",\"currencies\":[\"USD\",\"EUR\"],\"days\":30}");
        def("def.fx000002", "Y", "{\"base\":\"KRW\",\"currencies\":[\"JPY\",\"CNY\"],\"days\":90}");

        allowed(List.of("USD", "EUR"), 30);
        allowed(List.of("EUR"), 1);
        allowed(List.of("JPY"), 90);
        rejected(List.of("USD", "JPY"), 30); // 두 정의를 섞었다
        rejected(List.of("USD"), 31);        // 그 정의의 기간을 넘었다
        rejected(List.of("GBP"), 7);         // 어느 정의에도 없다
    }

    @Test
    @DisplayName("사용 중지된 정의는 허용하지 않고, 정의가 하나도 없으면 모두 거절한다")
    void ignoresDisabledDefinitions() {
        rejected(List.of("USD"), 7);
        allowList.onDefSaved(new WidgetDefSavedEvent("def.fx000001"));
        def("def.fx000001", "N", "{\"currencies\":[\"USD\"],\"days\":30}");
        rejected(List.of("USD"), 7);
    }

    @Test
    @DisplayName("설정 해석은 화면과 같다 — 통화·기간이 없으면 초기값(USD·EUR·JPY·CNY, 30일), 공백·소문자·중복·KRW·잘못된 코드 정리, 앞 10개, 기간 반올림·1~90")
    void parsesConfigLikeTheRenderer() {
        assertThat(ExchangeAllowList.grantOf("a", null).symbols()).containsExactly("USD", "EUR", "JPY", "CNY");
        assertThat(ExchangeAllowList.grantOf("a", null).days()).isEqualTo(30);
        assertThat(ExchangeAllowList.grantOf("a", "깨진 JSON").symbols()).containsExactly("USD", "EUR", "JPY", "CNY");
        assertThat(ExchangeAllowList.grantOf("a", "{}").symbols()).containsExactly("USD", "EUR", "JPY", "CNY");
        assertThat(ExchangeAllowList.grantOf("a", "{\"currencies\":\"USD\"}").symbols()).containsExactly("USD", "EUR", "JPY", "CNY");

        ExchangeAllowList.Grant g = ExchangeAllowList.grantOf("a",
                "{\"currencies\":[\" usd \",\"USD\",\"krw\",\"US1\",7,\"eur\"],\"days\":\" 45.5 \"}");
        assertThat(g.symbols()).containsExactly("USD", "EUR");
        assertThat(g.days()).isEqualTo(46);

        assertThat(ExchangeAllowList.grantOf("a", "{\"currencies\":[],\"days\":7}").symbols()).isEmpty();
        assertThat(ExchangeAllowList.grantOf("a", "{\"days\":500}").days()).isEqualTo(90);
        assertThat(ExchangeAllowList.grantOf("a", "{\"days\":-3}").days()).isEqualTo(1);
        assertThat(ExchangeAllowList.grantOf("a", "{\"days\":\"abc\"}").days()).isEqualTo(30);
        assertThat(ExchangeAllowList.grantOf("a", "{\"days\":true}").days()).isEqualTo(30);

        ExchangeAllowList.Grant many = ExchangeAllowList.grantOf("a",
                "{\"currencies\":[\"USD\",\"EUR\",\"JPY\",\"CNY\",\"GBP\",\"AUD\",\"CAD\",\"CHF\",\"HKD\",\"SGD\",\"THB\"]}");
        assertThat(many.symbols()).hasSize(10).doesNotContain("THB");
    }

    @Test
    @DisplayName("통화가 빈 정의는 아무것도 허용하지 않는다")
    void emptyCurrenciesGrantNothing() {
        def("def.fx000001", "Y", "{\"currencies\":[],\"days\":30}");
        rejected(List.of("USD"), 7);
    }

    @Test
    @DisplayName("목록은 60초 캐시하고, 정의 저장 이벤트가 오면 다음 요청이 다시 읽는다")
    void cachesAndEvictsOnSave() {
        def("def.fx000001", "Y", "{\"currencies\":[\"USD\"],\"days\":30}");
        allowed(List.of("USD"), 7);
        def("def.fx000002", "Y", "{\"currencies\":[\"GBP\"],\"days\":30}");
        rejected(List.of("GBP"), 7); // 캐시
        verify(repository, times(1)).findBySrcTpAndTypeIdOrderByWidgetIdAsc(WidgetDef.SRC_DEF, "exchange");

        allowList.onDefSaved(new WidgetDefSavedEvent("def.fx000002"));
        allowed(List.of("GBP"), 7);

        defs.clear();
        clock.now = clock.now.plus(Duration.ofSeconds(61)); // 만료
        rejected(List.of("USD"), 7);
        verify(repository, times(3)).findBySrcTpAndTypeIdOrderByWidgetIdAsc(WidgetDef.SRC_DEF, "exchange");
    }

    static final class MutableClock extends Clock {
        Instant now;
        MutableClock(Instant now) { this.now = now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
