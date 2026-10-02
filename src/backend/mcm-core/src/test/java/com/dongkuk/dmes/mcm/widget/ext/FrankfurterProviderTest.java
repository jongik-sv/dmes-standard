package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
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

/**
 * {@link FrankfurterProvider} — 유럽중앙은행 기준(EUR, base 생략) 응답을 교차 계산해 「1 외화 = n KRW」(KRW ÷ 외화,
 * 소수 8자리 HALF_UP)로 돌려준다. 응답 숫자는 2026-10-01·02 실제 응답 값이다. 가짜 HTTP 만 쓴다.
 * <p>base=KRW 로 물으면 값이 소수 5자리(유효숫자 2~3개)로 잘려 역수가 최대 0.6% 어긋났다 — 그래서 EUR 기준으로 묻는다.
 */
class FrankfurterProviderTest {

    private MockRestServiceServer server;
    private FrankfurterProvider provider;

    @BeforeEach
    void setUp() {
        WidgetExtProperties props = new WidgetExtProperties();
        props.getExchange().setFrankfurterBaseUrl("https://fx.test/v1/");
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        provider = new FrankfurterProvider(props, builder);
    }

    private static LocalDate d(int month, int day) {
        return LocalDate.of(2026, month, day);
    }

    @Test
    @DisplayName("구간 응답 — KRW 를 먼저 묻고(EUR 은 기준이라 빼고) 날짜마다 KRW÷외화, EUR 은 KRW 값 그대로, 묻지 않은 통화는 버린다")
    void rangeResponseIsCrossRatedFromEur() {
        server.expect(requestTo("https://fx.test/v1/2026-10-01..2026-10-02?symbols=KRW,USD,JPY"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"amount":1.0,"base":"EUR","start_date":"2026-10-01","end_date":"2026-10-02",
                         "rates":{"2026-10-01":{"GBP":0.85373,"JPY":178.49,"KRW":1537.96,"USD":1.1298},
                                  "2026-10-02":{"GBP":0.85033,"JPY":176.99,"KRW":1513.44,"USD":1.1225}}}
                        """, MediaType.APPLICATION_JSON));

        List<ExchangeRatePoint> points = provider.fetch("KRW", List.of("USD", "EUR", "JPY"), d(10, 1), d(10, 2));

        server.verify();
        assertThat(points).containsExactlyInAnyOrder(
                new ExchangeRatePoint(d(10, 1), "USD", new BigDecimal("1361.26748097")),
                new ExchangeRatePoint(d(10, 1), "EUR", new BigDecimal("1537.96000000")),
                new ExchangeRatePoint(d(10, 1), "JPY", new BigDecimal("8.61650513")),
                new ExchangeRatePoint(d(10, 2), "USD", new BigDecimal("1348.27616927")),
                new ExchangeRatePoint(d(10, 2), "EUR", new BigDecimal("1513.44000000")),
                new ExchangeRatePoint(d(10, 2), "JPY", new BigDecimal("8.55099158")));
        // 하루 변동이 살아 있다(base=KRW 역수로는 -18.51 로 보였다)
        assertThat(points.stream().filter(p -> p.cur().equals("USD")).map(ExchangeRatePoint::rate).toList())
                .satisfies(r -> assertThat(r.get(1).subtract(r.get(0))).isEqualByComparingTo("-12.99131170"));
    }

    @Test
    @DisplayName("하루 요청 — /{date} 를 부르고 응답의 date(직전 영업일일 수 있다)로 적는다")
    void singleDayResponseUsesResponseDate() {
        server.expect(requestTo("https://fx.test/v1/2026-10-03?symbols=KRW,USD"))
                .andRespond(withSuccess("""
                        {"amount":1.0,"base":"EUR","date":"2026-10-02","rates":{"KRW":1513.44,"USD":1.1225}}
                        """, MediaType.APPLICATION_JSON));

        List<ExchangeRatePoint> points = provider.fetch("KRW", List.of("USD"), d(10, 3), d(10, 3));

        server.verify();
        assertThat(points).containsExactly(new ExchangeRatePoint(d(10, 2), "USD", new BigDecimal("1348.27616927")));
    }

    @Test
    @DisplayName("EUR 만 고르면 symbols=KRW 만 묻고 KRW 값을 그대로 쓴다")
    void eurOnlyAsksKrwOnly() {
        server.expect(requestTo("https://fx.test/v1/2026-10-02?symbols=KRW"))
                .andRespond(withSuccess("""
                        {"amount":1.0,"base":"EUR","date":"2026-10-02","rates":{"KRW":1513.44}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(provider.fetch("KRW", List.of("EUR"), d(10, 2), d(10, 2)))
                .containsExactly(new ExchangeRatePoint(d(10, 2), "EUR", new BigDecimal("1513.44000000")));
        server.verify();
    }

    @Test
    @DisplayName("응답 날짜에 KRW 값이 없으면 교차 계산을 할 수 없어 예외")
    void missingKrwThrows() {
        server.expect(requestTo("https://fx.test/v1/2026-10-01..2026-10-02?symbols=KRW,USD"))
                .andRespond(withSuccess("""
                        {"base":"EUR","start_date":"2026-10-01","end_date":"2026-10-02",
                         "rates":{"2026-10-01":{"KRW":1537.96,"USD":1.1298},"2026-10-02":{"USD":1.1225}}}
                        """, MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 1), d(10, 2)))
                .isInstanceOf(WidgetExtException.class)
                .hasMessageContaining("KRW");

        server.reset();
        server.expect(requestTo("https://fx.test/v1/2026-10-02?symbols=KRW,USD"))
                .andRespond(withSuccess("""
                        {"base":"EUR","date":"2026-10-02","rates":{"USD":1.1225}}
                        """, MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class)
                .hasMessageContaining("KRW");
    }

    @Test
    @DisplayName("HTTP 오류 → WidgetExtException(주소는 메시지에 넣지 않는다)")
    void httpErrorThrows() {
        server.expect(requestTo("https://fx.test/v1/2026-10-02?symbols=KRW,USD"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).body("{\"message\":\"not found\"}")
                        .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class)
                .hasMessageContaining("404")
                .hasMessageNotContaining("fx.test");
    }

    @Test
    @DisplayName("연결 실패·rates 없는 응답 → WidgetExtException")
    void ioErrorAndMalformedBodyThrow() {
        server.expect(requestTo("https://fx.test/v1/2026-10-02?symbols=KRW,USD"))
                .andRespond(withException(new IOException("connect timed out")));
        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class);

        server.reset();
        server.expect(requestTo("https://fx.test/v1/2026-10-02?symbols=KRW,USD"))
                .andRespond(withSuccess("{\"message\":\"oops\"}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class);
    }

    @Test
    @DisplayName("0·음수 값은 나눌 수 없어 그 통화만 버린다")
    void nonPositiveRateIsSkipped() {
        server.expect(requestTo("https://fx.test/v1/2026-10-02?symbols=KRW,USD"))
                .andRespond(withSuccess("""
                        {"base":"EUR","date":"2026-10-02","rates":{"KRW":1513.44,"USD":0}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(provider.fetch("KRW", List.of("USD", "EUR"), d(10, 2), d(10, 2)))
                .containsExactly(new ExchangeRatePoint(d(10, 2), "EUR", new BigDecimal("1513.44000000")));
    }

    @Test
    @DisplayName("기준 통화가 KRW 가 아니면 부르지 않고 예외")
    void nonKrwBaseThrowsWithoutCall() {
        assertThatThrownBy(() -> provider.fetch("USD", List.of("EUR"), d(10, 2), d(10, 2)))
                .isInstanceOf(WidgetExtException.class);
        server.verify(); // 기대한 요청 없음 = 부르지 않았다
    }
}
