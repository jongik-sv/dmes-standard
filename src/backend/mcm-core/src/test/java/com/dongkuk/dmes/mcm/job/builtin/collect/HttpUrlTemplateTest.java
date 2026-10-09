package com.dongkuk.dmes.mcm.job.builtin.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.HttpSource;
import java.net.InetAddress;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** 수집(HTTP) 주소의 {@code {{이름}}} 변수 자리 — 저장 검사(경로·쿼리에만)와 실행 때 치환(인코딩·정의 확인·호스트 재검사). DB·네트워크를 쓰지 않는다. */
class HttpUrlTemplateTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 5);
    private static final String ITEMS = "\"items\":[{\"key\":\"P\",\"path\":\"data.price\"}]";

    private static HttpSource parsed(String url) {
        String json = "{\"source\":{\"kind\":\"http\",\"url\":" + quote(url) + "," + ITEMS + "}}";
        return (HttpSource) CollectConfigs.parse(json).source();
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    @Test
    @DisplayName("저장: 경로·쿼리의 변수 자리는 받고, 원문은 그대로 보관하며 url 은 호스트 검사용으로 읽는다")
    void parseKeepsTemplate() {
        HttpSource h = parsed("https://api.example.com/q/{{symbol}}?d={{baseDt}}&k=1");
        assertThat(h.template()).isEqualTo("https://api.example.com/q/{{symbol}}?d={{baseDt}}&k=1");
        assertThat(h.url().getHost()).isEqualTo("api.example.com");
        assertThat(HttpUrlTemplate.hasVariables(h.template())).isTrue();
        assertThat(HttpUrlTemplate.hasVariables("https://api.example.com/q")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://{{host}}/q",
            "{{scheme}}://api.example.com/q",
            "https://api.example.com{{path}}",
            "https://api.example.com:{{port}}/q",
            "https://user@{{host}}/q",
            "https://api.example.com{{p}}/q",
            "https://api{{x}}.example.com/q",
    })
    @DisplayName("저장: 스킴·호스트·포트 자리의 변수는 거절한다")
    void rejectsPlaceholderInAuthority(String url) {
        assertThatThrownBy(() -> parsed(url)).isInstanceOf(BusinessException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://api.example.com/q/{{1bad}}", "https://api.example.com/q/{{a-b}}", "https://api.example.com/q/{{}}", "https://api.example.com/q/{x}"})
    @DisplayName("저장: 이름 규칙([A-Za-z][A-Za-z0-9_]{0,29})을 어긴 자리나 남은 중괄호는 주소 형식 오류다")
    void rejectsBadPlaceholderNames(String url) {
        assertThatThrownBy(() -> parsed(url)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("치환: 작업 변수 값을 퍼센트 인코딩한다 — / ? # & @ : 공백·줄바꿈·% 는 구조를 바꾸지 못한다")
    void encodesValues() {
        HttpSource h = parsed("https://api.example.com/q/{{a}}?s={{b}}");
        Map<String, Object> vars = new HashMap<>();
        vars.put("a", "x?z#w@evil.com:80");
        vars.put("b", "한글 &k=1\r\n%41");
        var uri = HttpUrlTemplate.render(h, vars, TODAY);
        assertThat(uri.getHost()).isEqualTo("api.example.com");
        assertThat(uri.getRawPath()).isEqualTo("/q/x%3Fz%23w%40evil.com%3A80");
        assertThat(uri.getRawQuery()).isEqualTo("s=%ED%95%9C%EA%B8%80%20%26k%3D1%0D%0A%2541");
        assertThat(uri.getRawFragment()).isNull();
        assertThat(uri.getRawUserInfo()).isNull();
    }

    @Test
    @DisplayName("치환: 안전한 글자(영문·숫자 - . _ ~)는 그대로, 숫자·BigDecimal 은 글자로")
    void plainValues() {
        HttpSource h = parsed("https://api.example.com/q/{{a}}/{{n}}/{{d}}");
        Map<String, Object> vars = Map.of("a", "AZaz09-._~", "n", 12, "d", new java.math.BigDecimal("1E+3"));
        assertThat(HttpUrlTemplate.render(h, vars, TODAY).getRawPath()).isEqualTo("/q/AZaz09-._~/12/1000");
    }

    @Test
    @DisplayName("치환: 내장 변수 today·yesterday·monthStart 는 예정 날짜 기준이고, 같은 이름의 작업 변수가 있으면 그것이 먼저다")
    void builtinVariables() {
        HttpSource h = parsed("https://api.example.com/q?t={{today}}&y={{yesterday}}&m={{monthStart}}");
        assertThat(HttpUrlTemplate.render(h, Map.of(), TODAY).getRawQuery()).isEqualTo("t=2026-10-05&y=2026-10-04&m=2026-10-01");
        assertThat(HttpUrlTemplate.render(h, Map.of("today", "2026-01-02"), TODAY).getRawQuery()).isEqualTo("t=2026-01-02&y=2026-10-04&m=2026-10-01");
        HttpSource now = parsed("https://api.example.com/q?n={{now}}");
        assertThat(HttpUrlTemplate.render(now, Map.of(), TODAY).getRawQuery()).matches("n=\\d{4}-\\d{2}-\\d{2}T\\d{2}%3A\\d{2}%3A\\d{2}");
    }

    @Test
    @DisplayName("치환: 정의되지 않은 변수는 거절하고 메시지에 주소 원문(호스트·질의)을 넣지 않는다")
    void undefinedVariable() {
        HttpSource h = parsed("https://api.example.com/q?apikey=SECRET-KEY&s={{symbol}}");
        assertThatThrownBy(() -> HttpUrlTemplate.render(h, Map.of(), TODAY))
                .isInstanceOf(CollectException.class)
                .hasMessageContaining("{{symbol}}")
                .message().doesNotContain("SECRET-KEY").doesNotContain("api.example.com").doesNotContain("http");
    }

    @Test
    @DisplayName("치환: 값이 없음(null)·객체·목록·빈 글자·200자 초과·. 와 .. 는 거절한다")
    void badValues() {
        HttpSource h = parsed("https://api.example.com/q/{{a}}");
        Map<String, Object> nul = new HashMap<>();
        nul.put("a", null);
        assertRejected(h, nul, "값이 없거나");
        assertRejected(h, Map.of("a", Map.of("k", 1)), "값이 없거나");
        assertRejected(h, Map.of("a", List.of(1)), "값이 없거나");
        assertRejected(h, Map.of("a", ""), "비어 있습니다");
        assertRejected(h, Map.of("a", "x".repeat(201)), "200자");
        assertRejected(h, Map.of("a", ".."), "..");
        assertRejected(h, Map.of("a", "."), ".");
        assertThat(HttpUrlTemplate.render(h, Map.of("a", "x".repeat(200)), TODAY).getRawPath()).hasSize(3 + 200);
    }

    @Test
    @DisplayName("치환: 템플릿 글자나 다른 값과 붙여 . 또는 .. 조각을 만들려 해도 거절한다(값 검사가 먼저 막고, 경로 조각 검사가 한 번 더 막는다)")
    void dotSegmentsFromConcatenation() {
        assertRejected(parsed("https://a.com/v1/.{{x}}/y"), Map.of("x", "."), ".");
        assertRejected(parsed("https://a.com/v1/{{x}}{{y}}/z"), Map.of("x", ".", "y", "."), ".");
        assertThat(HttpUrlTemplate.render(parsed("https://a.com/v1/{{x}}.{{y}}/z"), Map.of("x", "a", "y", "b"), TODAY).getRawPath()).isEqualTo("/v1/a.b/z");
    }

    @ParameterizedTest
    @ValueSource(strings = {"../../admin", "a/b", "a\\b", "%2e%2e", "50%", "x..y"})
    @DisplayName("치환: 경로 자리 값에 / \\ % .. 가 있으면 거절한다 — 인코딩한 %2F·%5C 를 대상 서버가 풀 수 있다")
    void pathPlaceholderRejectsTraversalChars(String value) {
        HttpSource h = parsed("https://api.example.com/q/{{a}}/y");
        assertRejected(h, Map.of("a", value), "경로 자리");
    }

    @Test
    @DisplayName("치환: 쿼리 자리는 같은 값도 인코딩만 하고 받는다(% 도 %25 로)")
    void queryPlaceholderOnlyEncodes() {
        HttpSource h = parsed("https://api.example.com/q?s={{a}}#f{{b}}");
        var uri = HttpUrlTemplate.render(h, Map.of("a", "../../admin 50%", "b", "a/b"), TODAY);
        assertThat(uri.getRawPath()).isEqualTo("/q");
        assertThat(uri.getRawQuery()).isEqualTo("s=..%2F..%2Fadmin%2050%25");
    }

    @Test
    @DisplayName("치환: 경로 자리 값이 한글이어도 그대로 인코딩된다")
    void pathPlaceholderAllowsKorean() {
        HttpSource h = parsed("https://api.example.com/q/{{a}}");
        assertThat(HttpUrlTemplate.render(h, Map.of("a", "설비1"), TODAY).getRawPath()).isEqualTo("/q/%EC%84%A4%EB%B9%84" + "1");
    }

    @Test
    @DisplayName("치환: 저장 상한(500자)을 넘어도 치환 상한(2000자) 안이면 받고, 넘으면 길이 때문임을 밝혀 거절한다")
    void renderedLengthLimit() {
        HttpSource h = parsed("https://api.example.com/q?s={{a}}&t={{b}}");
        String ko100 = "가".repeat(100);   // 인코딩하면 900자 — 저장 상한 500 은 넘고 치환 상한 2000 은 안 넘는다
        var uri = HttpUrlTemplate.render(h, Map.of("a", ko100, "b", "x"), TODAY);
        assertThat(uri.getRawQuery().length()).isGreaterThan(CollectConfigs.URL_MAX).isLessThan(HttpUrlTemplate.RENDERED_MAX);
        assertRejected(h, Map.of("a", "가".repeat(200), "b", "가".repeat(100)), "2000자");   // 1800 + 900 > 2000
    }

    private static void assertRejected(HttpSource h, Map<String, Object> vars, String messagePart) {
        assertThatThrownBy(() -> HttpUrlTemplate.render(h, vars, TODAY)).isInstanceOf(CollectException.class).hasMessageContaining(messagePart);
    }

    @Test
    @DisplayName("치환: 자리가 없는 주소는 그대로(변수 인자가 있어도)")
    void noPlaceholders() {
        HttpSource h = parsed("https://api.example.com/q?s=1");
        assertThat(HttpUrlTemplate.render(h, Map.of("a", "b"), TODAY)).isEqualTo(h.url());
    }

    // ── HttpCollectSource 통합: 치환 뒤 허용 호스트·주소 검사 ─────────────────────

    @Test
    @DisplayName("수집: 치환한 주소로 호출하고, 값에 호스트를 바꾸려는 글자가 있어도 인코딩돼 같은 호스트로만 나간다")
    void collectUsesRenderedUrl() {
        Fixture f = new Fixture();
        f.server.expect(requestTo("https://api.example.com/q/005930?d=2026-10-05")).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"data\":{\"price\":71200}}", MediaType.APPLICATION_JSON));
        List<CollectItem> items = f.source.collect(parsed("https://api.example.com/q/{{symbol}}?d={{today}}"), TODAY, Map.of("symbol", "005930"));
        f.server.verify();
        assertThat(items).extracting(CollectItem::key).containsExactly("P");

        // 경로 자리에 호스트·경로를 바꾸려는 글자가 든 값은 거절한다 — 인코딩해도 대상 서버가 %2F 를 풀 수 있다. 호출도 이름 풀이도 하지 않는다.
        Fixture g = new Fixture();
        assertThatThrownBy(() -> g.source.collect(parsed("https://api.example.com/q/{{symbol}}?d=1"), TODAY, Map.of("symbol", "@evil.com/../")))
                .isInstanceOf(CollectException.class);
        g.server.verify();
        assertThat(g.resolved).isEmpty();

        // 같은 값이 쿼리 자리에서는 인코딩만 되어 같은 호스트로 나간다.
        Fixture q = new Fixture();
        q.server.expect(requestTo("https://api.example.com/q?s=%40evil.com%2F..%2F")).andRespond(withSuccess("{\"data\":{\"price\":1}}", MediaType.APPLICATION_JSON));
        q.source.collect(parsed("https://api.example.com/q?s={{symbol}}"), TODAY, Map.of("symbol", "@evil.com/../"));
        q.server.verify();
        assertThat(q.resolved).containsExactly("api.example.com");
    }

    @Test
    @DisplayName("수집: 변수가 정의되지 않으면 호출도 이름 풀이도 하지 않고 거절한다")
    void collectUndefinedVariableMakesNoCall() {
        Fixture f = new Fixture();
        assertThatThrownBy(() -> f.source.collect(parsed("https://api.example.com/q/{{symbol}}"), TODAY, Map.of()))
                .isInstanceOf(CollectException.class).hasMessageContaining("{{symbol}}");
        f.server.verify();
        assertThat(f.resolved).isEmpty();
    }

    @Test
    @DisplayName("수집: 변수 없는 기존 호출 collect(source, today)는 자리가 있으면 정의 없음으로 거절한다")
    void legacySignatureRejectsTemplate() {
        Fixture f = new Fixture();
        assertThatThrownBy(() -> f.source.collect(parsed("https://api.example.com/q/{{symbol}}"), TODAY)).isInstanceOf(CollectException.class);
    }

    private static final class Fixture {
        final MockRestServiceServer server;
        final HttpCollectSource source;
        final List<String> resolved = new ArrayList<>();

        Fixture() {
            RestClient.Builder builder = RestClient.builder();
            server = MockRestServiceServer.bindTo(builder).build();
            source = new HttpCollectSource(JobCollectHosts.matcher(List.of("api.example.com")), builder, host -> {
                resolved.add(host);
                try {
                    return new InetAddress[] {InetAddress.getByAddress(new byte[] {8, 8, 8, 8})};
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            });
        }
    }
}
