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

/** {@link FrankfurterProvider} — 구간·하루 응답 파싱, 역수·8자리 반올림(HALF_UP), 오류 → 예외. 가짜 HTTP 만 쓴다. */
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
    @DisplayName("구간 응답 — base=KRW 값을 역수로 바꿔 「1 외화 = n KRW」, 소수 8자리 반올림, 묻지 않은 통화는 버린다")
    void rangeResponseIsInvertedAndRounded() {
        server.expect(requestTo("https://fx.test/v1/2026-09-29..2026-09-30?base=KRW&symbols=USD,EUR"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"amount":1.0,"base":"KRW","start_date":"2026-09-29","end_date":"2026-09-30",
                         "rates":{"2026-09-29":{"USD":0.000723,"EUR":0.0006,"JPY":0.105},
                                  "2026-09-30":{"USD":0.000724,"EUR":0.00065}}}
                        """, MediaType.APPLICATION_JSON));

        List<ExchangeRatePoint> points = provider.fetch("KRW", List.of("USD", "EUR"), d(9, 29), d(9, 30));

        server.verify();
        assertThat(points).containsExactlyInAnyOrder(
                new ExchangeRatePoint(d(9, 29), "USD", new BigDecimal("1383.12586445")),
                new ExchangeRatePoint(d(9, 29), "EUR", new BigDecimal("1666.66666667")), // HALF_UP: …666|66 → …667
                new ExchangeRatePoint(d(9, 30), "USD", new BigDecimal("1381.21546961")),
                new ExchangeRatePoint(d(9, 30), "EUR", new BigDecimal("1538.46153846")));
    }

    @Test
    @DisplayName("하루 요청 — /{date} 를 부르고 응답의 date(직전 영업일일 수 있다)로 적는다")
    void singleDayResponseUsesResponseDate() {
        server.expect(requestTo("https://fx.test/v1/2026-09-30?base=KRW&symbols=USD"))
                .andRespond(withSuccess("""
                        {"amount":1.0,"base":"KRW","date":"2026-09-29","rates":{"USD":0.000724}}
                        """, MediaType.APPLICATION_JSON));

        List<ExchangeRatePoint> points = provider.fetch("KRW", List.of("USD"), d(9, 30), d(9, 30));

        server.verify();
        assertThat(points).containsExactly(new ExchangeRatePoint(d(9, 29), "USD", new BigDecimal("1381.21546961")));
    }

    @Test
    @DisplayName("HTTP 오류 → WidgetExtException(주소는 메시지에 넣지 않는다)")
    void httpErrorThrows() {
        server.expect(requestTo("https://fx.test/v1/2026-09-30?base=KRW&symbols=USD"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).body("{\"message\":\"not found\"}")
                        .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(9, 30), d(9, 30)))
                .isInstanceOf(WidgetExtException.class)
                .hasMessageContaining("404")
                .hasMessageNotContaining("fx.test");
    }

    @Test
    @DisplayName("연결 실패·rates 없는 응답 → WidgetExtException")
    void ioErrorAndMalformedBodyThrow() {
        server.expect(requestTo("https://fx.test/v1/2026-09-30?base=KRW&symbols=USD"))
                .andRespond(withException(new IOException("connect timed out")));
        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(9, 30), d(9, 30)))
                .isInstanceOf(WidgetExtException.class);

        server.reset();
        server.expect(requestTo("https://fx.test/v1/2026-09-30?base=KRW&symbols=USD"))
                .andRespond(withSuccess("{\"message\":\"oops\"}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.fetch("KRW", List.of("USD"), d(9, 30), d(9, 30)))
                .isInstanceOf(WidgetExtException.class);
    }

    @Test
    @DisplayName("0·음수 값은 역수를 만들 수 없어 버린다")
    void nonPositiveRateIsSkipped() {
        server.expect(requestTo("https://fx.test/v1/2026-09-30?base=KRW&symbols=USD,EUR"))
                .andRespond(withSuccess("""
                        {"date":"2026-09-30","rates":{"USD":0,"EUR":0.0006}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(provider.fetch("KRW", List.of("USD", "EUR"), d(9, 30), d(9, 30)))
                .containsExactly(new ExchangeRatePoint(d(9, 30), "EUR", new BigDecimal("1666.66666667")));
    }
}
