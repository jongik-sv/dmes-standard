package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** {@link KoreaEximProvider} — 쉼표 숫자, JPY(100) 단위, 빈 배열(휴일), 주말 건너뛰기, 오류 → 예외. 가짜 HTTP 만 쓴다. */
class KoreaEximProviderTest {

    private WidgetExtProperties props;
    private MockRestServiceServer server;
    private KoreaEximProvider provider;

    @BeforeEach
    void setUp() {
        props = new WidgetExtProperties();
        props.getExchange().setKoreaeximKey("SECRETKEY");
        props.getExchange().setKoreaeximBaseUrl("https://exim.test/json");
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        provider = new KoreaEximProvider(props, builder);
    }

    private static LocalDate d(int month, int day) {
        return LocalDate.of(2026, month, day);
    }

    @Test
    @DisplayName("날짜마다 하루씩 부르고(토·일 건너뜀) 쉼표를 지우고 JPY(100) 은 100 으로 나눈다, 빈 배열은 값 없음")
    void parsesCommaAndHundredUnitAndEmptyDay() {
        server.expect(requestTo("https://exim.test/json?authkey=SECRETKEY&searchdate=20261002&data=AP01"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        [{"result":1,"cur_unit":"USD","deal_bas_r":"1,380.5","cur_nm":"미국 달러"},
                         {"result":1,"cur_unit":"JPY(100)","deal_bas_r":"912.34","cur_nm":"일본 옌"},
                         {"result":1,"cur_unit":"EUR","deal_bas_r":"1,600.1","cur_nm":"유로"}]
                        """, MediaType.APPLICATION_JSON));
        // 10-03(토)·10-04(일)는 부르지 않는다
        server.expect(requestTo("https://exim.test/json?authkey=SECRETKEY&searchdate=20261005&data=AP01"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        List<ExchangeRatePoint> points = provider.fetch("KRW", List.of("USD", "JPY"), d(10, 2), d(10, 5));

        server.verify();
        assertThat(points).containsExactlyInAnyOrder(
                new ExchangeRatePoint(d(10, 2), "USD", new BigDecimal("1380.50000000")),
                new ExchangeRatePoint(d(10, 2), "JPY", new BigDecimal("9.12340000")));
    }

    @Test
    @DisplayName("result 가 1 이 아니면(인증키 오류 등) 예외 — 인증키는 메시지에 넣지 않는다")
    void errorResultThrowsWithoutKey() {
        server.expect(requestTo("https://exim.test/json?authkey=SECRETKEY&searchdate=20261002&data=AP01"))
                .andRespond(withSuccess("[{\"result\":3}]", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class)
                .hasMessageNotContaining("SECRETKEY");
    }

    @Test
    @DisplayName("HTTP 오류 → 예외(주소·키를 메시지에 넣지 않는다)")
    void httpErrorThrows() {
        server.expect(requestTo("https://exim.test/json?authkey=SECRETKEY&searchdate=20261002&data=AP01"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class)
                .hasMessageContaining("500")
                .hasMessageNotContaining("SECRETKEY");
    }

    @Test
    @DisplayName("앞 날짜는 받고 뒤 날짜에서 실패하면 받은 값까지 돌려주고 남은 날은 부르지 않는다")
    void laterDayFailureKeepsEarlierDays() {
        server.expect(requestTo("https://exim.test/json?authkey=SECRETKEY&searchdate=20261001&data=AP01"))
                .andRespond(withSuccess("[{\"result\":1,\"cur_unit\":\"USD\",\"deal_bas_r\":\"1,361.2\"}]",
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://exim.test/json?authkey=SECRETKEY&searchdate=20261002&data=AP01"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        // 10-05 는 부르지 않는다(기대 요청 없음)

        List<ExchangeRatePoint> points = provider.fetch("KRW", List.of("USD"), d(10, 1), d(10, 5));

        server.verify();
        assertThat(points).containsExactly(new ExchangeRatePoint(d(10, 1), "USD", new BigDecimal("1361.20000000")));
    }

    @Test
    @DisplayName("받은 값이 하나도 없이 실패하면(앞 날은 휴일) 예외")
    void failureWithNothingFetchedThrows() {
        server.expect(requestTo("https://exim.test/json?authkey=SECRETKEY&searchdate=20261001&data=AP01"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://exim.test/json?authkey=SECRETKEY&searchdate=20261002&data=AP01"))
                .andRespond(withSuccess("[{\"result\":4}]", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 1), d(10, 2)))
                .isInstanceOf(WidgetExtException.class)
                .hasMessageNotContaining("SECRETKEY");
    }

    @Test
    @DisplayName("키가 없거나 기준 통화가 KRW 가 아니면 부르지 않고 예외")
    void noKeyOrNonKrwThrowsWithoutCall() {
        assertThatThrownBy(() -> provider.fetch("USD", List.of("EUR"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class);
        props.getExchange().setKoreaeximKey(" ");
        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class);
        server.verify(); // 기대한 요청 없음 = 부르지 않았다
    }
}
