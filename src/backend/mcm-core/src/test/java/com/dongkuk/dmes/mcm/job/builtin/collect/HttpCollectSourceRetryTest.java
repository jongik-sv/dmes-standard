package com.dongkuk.dmes.mcm.job.builtin.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.HttpSource;
import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** HTTP 수집의 일시 오류 1회 재시도(source.retryTransient) — 실제 네트워크·실제 대기 없이 목 서버·가짜 시계·가짜 sleeper 로 본다. */
class HttpCollectSourceRetryTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 9);
    private static final Instant NOW = Instant.parse("2026-10-09T00:00:00Z");
    private static final String URL = "https://api.example.com/q?s=1";
    private static final String BODY = "{\"v\":7}";

    private MockRestServiceServer server;
    private HttpCollectSource source;
    private final List<Long> sleeps = new ArrayList<>();
    private boolean interruptOnSleep;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        source = new HttpCollectSource(host -> host.equals("api.example.com"), builder, host -> new InetAddress[] {publicAddr()}, Duration.ofSeconds(3),
                Clock.fixed(NOW, ZoneOffset.UTC), millis -> {
                    if (interruptOnSleep) throw new InterruptedException("test");
                    sleeps.add(millis);
                }, () -> 0);
    }

    private static InetAddress publicAddr() {
        try {
            return InetAddress.getByAddress(new byte[] {(byte) 203, 0, 113, 10});
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static HttpSource http(boolean retry) {
        List<CollectConfig.HttpItem> items = List.of(new CollectConfig.HttpItem("v", "v", CollectConfigs.parsePath("v", "v")));
        return new HttpSource(URI.create(URL), items, URL, retry);
    }

    private HttpCollectSource.Result run(boolean retry, Instant deadline) {
        return source.collectDetailed(http(retry), TODAY, Map.of(), deadline);
    }

    private void expectFail(HttpStatus status) {
        server.expect(once(), requestTo(URL)).andRespond(withStatus(status));
    }

    private void expectOk() {
        server.expect(once(), requestTo(URL)).andRespond(withSuccess(BODY, MediaType.APPLICATION_JSON));
    }

    @Test
    @DisplayName("503 뒤 200 — 재시도 1회로 성공하고, 3초 대기와 설명이 남는다")
    void retriesOnce503() {
        expectFail(HttpStatus.SERVICE_UNAVAILABLE);
        expectOk();
        HttpCollectSource.Result r = run(true, null);
        server.verify();
        assertThat(r.items()).extracting(CollectItem::key).containsExactly("v");
        assertThat(r.retryNote()).isEqualTo("일시 오류(HTTP 503) 후 재시도 1회로 성공");
        assertThat(sleeps).containsExactly(3000L);
    }

    @Test
    @DisplayName("502·504·429 도 재시도한다")
    void retriesOtherTransientStatuses() {
        for (HttpStatus s : List.of(HttpStatus.BAD_GATEWAY, HttpStatus.GATEWAY_TIMEOUT, HttpStatus.TOO_MANY_REQUESTS)) {
            server.reset();
            sleeps.clear();
            expectFail(s);
            expectOk();
            assertThat(run(true, null).retryNote()).contains("HTTP " + s.value());
            server.verify();
            assertThat(sleeps).hasSize(1);
        }
    }

    @Test
    @DisplayName("연결 오류(IOException → ResourceAccessException)도 재시도한다")
    void retriesIoError() {
        server.expect(once(), requestTo(URL)).andRespond(request -> {
            throw new IOException("connection reset");
        });
        expectOk();
        HttpCollectSource.Result r = run(true, null);
        server.verify();
        assertThat(r.retryNote()).isEqualTo("일시 오류(ResourceAccessException) 후 재시도 1회로 성공");
    }

    @Test
    @DisplayName("두 번 모두 503 — 호출은 정확히 2번이고 실패 문구에 재시도 후에도 실패라고 덧붙는다(주소는 없다)")
    void failsAfterOneRetry() {
        expectFail(HttpStatus.SERVICE_UNAVAILABLE);
        expectFail(HttpStatus.SERVICE_UNAVAILABLE);
        assertThatThrownBy(() -> run(true, null)).isInstanceOf(CollectException.class)
                .hasMessage("수집 요청 실패: HTTP 503 (일시 오류 재시도 1회 후에도 실패)")
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain("example.com"));
        server.verify();
        assertThat(sleeps).hasSize(1);
    }

    @Test
    @DisplayName("재시도에서 일시 오류가 아닌 오류가 나면 그 오류 문구 그대로")
    void secondAttemptNonTransient() {
        expectFail(HttpStatus.SERVICE_UNAVAILABLE);
        expectFail(HttpStatus.NOT_FOUND);
        assertThatThrownBy(() -> run(true, null)).isInstanceOf(CollectException.class).hasMessage("수집 요청 실패: HTTP 404");
        server.verify();
    }

    @Test
    @DisplayName("500·404·400·401 은 재시도하지 않는다 — 호출 1번, 종전 문구")
    void nonTransientStatusesAreNotRetried() {
        for (HttpStatus s : List.of(HttpStatus.INTERNAL_SERVER_ERROR, HttpStatus.NOT_FOUND, HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)) {
            server.reset();
            sleeps.clear();
            expectFail(s);
            assertThatThrownBy(() -> run(true, null)).hasMessage("수집 요청 실패: HTTP " + s.value());
            server.verify();
            assertThat(sleeps).isEmpty();
        }
    }

    @Test
    @DisplayName("응답이 JSON 이 아니거나 비어 있으면 재시도하지 않는다")
    void contentErrorsAreNotRetried() {
        server.expect(once(), requestTo(URL)).andRespond(withSuccess("not json", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> run(true, null)).hasMessage("응답을 JSON 으로 읽지 못했습니다.");
        server.verify();
        assertThat(sleeps).isEmpty();
    }

    @Test
    @DisplayName("옵션이 꺼져 있으면(기본) 503 도 한 번만 부르고 종전 문구, 대기 없음")
    void offByDefault() {
        expectFail(HttpStatus.SERVICE_UNAVAILABLE);
        assertThatThrownBy(() -> run(false, null)).hasMessage("수집 요청 실패: HTTP 503");
        server.verify();
        assertThat(sleeps).isEmpty();
        assertThat(new HttpSource(URI.create(URL), List.of()).retryTransient()).isFalse();
    }

    @Test
    @DisplayName("429 의 Retry-After(정수 초)는 상한 10초까지 따른다 — 5초면 5초 대기, 11초면 재시도 없이 실패, 날짜 형식은 기본 3초")
    void retryAfter() {
        server.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, "5"));
        expectOk();
        run(true, null);
        server.verify();
        assertThat(sleeps).containsExactly(5000L);

        server.reset();
        sleeps.clear();
        server.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, "11"));
        assertThatThrownBy(() -> run(true, null)).hasMessage("수집 요청 실패: HTTP 429");
        server.verify();
        assertThat(sleeps).isEmpty();

        server.reset();
        server.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, "Wed, 21 Oct 2026 07:28:00 GMT"));
        expectOk();
        run(true, null);
        assertThat(sleeps).containsExactly(3000L);
    }

    @Test
    @DisplayName("Retry-After 파싱 — 숫자 글자만, 길이 상한")
    void retryAfterParsing() {
        assertThat(HttpCollectSource.retryAfterMs("0")).isEqualTo(0L);
        assertThat(HttpCollectSource.retryAfterMs(" 7 ")).isEqualTo(7000L);
        assertThat(HttpCollectSource.retryAfterMs("-1")).isNull();
        assertThat(HttpCollectSource.retryAfterMs("1.5")).isNull();
        assertThat(HttpCollectSource.retryAfterMs("")).isNull();
        assertThat(HttpCollectSource.retryAfterMs(null)).isNull();
        assertThat(HttpCollectSource.retryAfterMs("1234567890")).isNull();
    }

    @Test
    @DisplayName("남은 시간이 대기(3초) + 최악 한 번 호출(8초)보다 적으면 재시도하지 않는다 — 딱 11초면 한다")
    void respectsRemainingBudget() {
        expectFail(HttpStatus.SERVICE_UNAVAILABLE);
        assertThatThrownBy(() -> run(true, NOW.plusSeconds(10))).hasMessage("수집 요청 실패: HTTP 503");
        server.verify();
        assertThat(sleeps).isEmpty();

        server.reset();
        expectFail(HttpStatus.SERVICE_UNAVAILABLE);
        expectOk();
        run(true, NOW.plusSeconds(11));
        server.verify();
        assertThat(sleeps).containsExactly(3000L);
    }

    @Test
    @DisplayName("대기 중 인터럽트(작업 시간 초과 감시)되면 즉시 중단하고 인터럽트 표시를 되살린다")
    void interruptStopsRetry() {
        expectFail(HttpStatus.SERVICE_UNAVAILABLE);
        interruptOnSleep = true;
        try {
            assertThatThrownBy(() -> run(true, null)).isInstanceOf(CollectException.class).hasMessage("수집이 중단되었습니다.");
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();   // 다음 시험으로 끌고 가지 않는다
        }
        server.verify();
    }

    @Test
    @DisplayName("보안 검사에 걸린 호스트는 호출도 재시도도 하지 않는다")
    void securityRefusalIsNotRetried() {
        HttpSource other = new HttpSource(URI.create("https://evil.example.org/q"), List.of(), "https://evil.example.org/q", true);
        assertThatThrownBy(() -> source.collectDetailed(other, TODAY, Map.of(), null)).hasMessage("허용 목록에 없는 호스트라 수집하지 않습니다.");
        server.verify();
        assertThat(sleeps).isEmpty();
    }

    @Test
    @DisplayName("재시도 없이 성공하면 설명(retryNote)이 없다")
    void noNoteWithoutRetry() {
        expectOk();
        assertThat(run(true, null).retryNote()).isNull();
    }
}
