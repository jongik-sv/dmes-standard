package com.dongkuk.dmes.mcm.widget.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.ExchangeSource;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.HttpSource;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.Mode;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.SqlSource;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** 정시 수집 설정 파싱·검사·일정 계산 — 스펙 2026-10-05 정시 수집 §2. */
class CollectConfigsTest {

    private static final String SQL_SOURCE = "\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1 AS V FROM T\",\"valueField\":\"V\"}";
    private static final String INTERVAL = "\"schedule\":{\"mode\":\"interval\",\"everyMin\":10}";

    private static CollectConfig parse(String json) {
        return CollectConfigs.parse(json);
    }

    private static LocalDateTime t(int h, int m) {
        return LocalDateTime.of(2026, 10, 5, h, m, 37);
    }

    // ── 일정 계산 ────────────────────────────────────────────────────

    @Test
    @DisplayName("interval: 자정부터 지난 분이 everyMin 의 배수일 때가 수집 시각 — 자정·경계·하루 끝")
    void intervalAlignedToMidnight() {
        CollectConfig.Schedule every10 = parse("{" + INTERVAL + "," + SQL_SOURCE + "}").schedule();
        assertThat(every10.mode()).isEqualTo(Mode.INTERVAL);
        assertThat(every10.isDue(t(0, 0))).isTrue();
        assertThat(every10.isDue(t(0, 9))).isFalse();
        assertThat(every10.isDue(t(0, 10))).isTrue();
        assertThat(every10.isDue(t(9, 10))).isTrue();
        assertThat(every10.isDue(t(9, 15))).isFalse();
        assertThat(every10.isDue(t(23, 50))).isTrue();
        assertThat(every10.isDue(t(23, 59))).isFalse();

        CollectConfig.Schedule every720 = parse("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":720}," + SQL_SOURCE + "}").schedule();
        assertThat(every720.isDue(t(0, 0))).isTrue();
        assertThat(every720.isDue(t(12, 0))).isTrue();
        assertThat(every720.isDue(t(6, 0))).isFalse();

        CollectConfig.Schedule daily1440 = parse("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":1440}," + SQL_SOURCE + "}").schedule();
        assertThat(daily1440.isDue(t(0, 0))).isTrue();
        assertThat(daily1440.isDue(t(0, 1))).isFalse();
        assertThat(daily1440.isDue(t(23, 59))).isFalse();
    }

    @Test
    @DisplayName("interval 허용 분은 5·10·15·20·30·60·120·180·240·360·480·720·1440 뿐이다 — 모두 하루를 나눠 떨어진다")
    void allowedEveryMinutesDivideTheDay() {
        assertThat(CollectConfigs.EVERY_MIN_ALLOWED).containsExactly(5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720, 1440);
        for (int every : CollectConfigs.EVERY_MIN_ALLOWED) {
            assertThat(1440 % every).isZero();
            CollectConfig.Schedule s = parse("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":" + every + "}," + SQL_SOURCE + "}").schedule();
            int due = 0;
            for (int minute = 0; minute < 1440; minute++) if (s.isDue(t(minute / 60, minute % 60))) due++;
            assertThat(due).as("every " + every).isEqualTo(1440 / every);
        }
    }

    @Test
    @DisplayName("daily: 이번 분 HH:mm 이 목록에 있으면 수집 시각 — 00:00·23:59·초는 무시")
    void dailyMatchesHourMinute() {
        CollectConfig.Schedule s = parse("{\"schedule\":{\"mode\":\"daily\",\"at\":[\"00:00\",\"09:30\",\"23:59\"]}," + SQL_SOURCE + "}").schedule();
        assertThat(s.mode()).isEqualTo(Mode.DAILY);
        assertThat(s.isDue(t(0, 0))).isTrue();
        assertThat(s.isDue(t(9, 30))).isTrue();
        assertThat(s.isDue(t(9, 31))).isFalse();
        assertThat(s.isDue(t(9, 29))).isFalse();
        assertThat(s.isDue(t(23, 59))).isTrue();
        assertThat(s.isDue(t(12, 0))).isFalse();
    }

    // ── 정상 설정 ────────────────────────────────────────────────────

    @Test
    @DisplayName("세 원천의 정상 설정과 show 기본값(7일·단위 없음)·알 수 없는 키 무시")
    void validConfigs() {
        CollectConfig sql = parse("{" + INTERVAL + "," + SQL_SOURCE + ",\"unknown\":1}");
        assertThat(sql.source()).isEqualTo(new SqlSource("SELECT 1 AS V FROM T", "V", null));
        assertThat(sql.showDays()).isEqualTo(7);
        assertThat(sql.showUnit()).isEmpty();

        CollectConfig http = parse("{" + INTERVAL + ",\"source\":{\"kind\":\"http\",\"url\":\"https://api.example.com:8443/q?s=005930\","
                + "\"items\":[{\"key\":\"현재가\",\"path\":\"data.items[0].price\"},{\"key\":\"b\",\"path\":\"[1].x-y\"}]},"
                + "\"show\":{\"days\":90,\"unit\":\"원\"}}");
        HttpSource hs = (HttpSource) http.source();
        assertThat(hs.url().getHost()).isEqualTo("api.example.com");
        assertThat(hs.items().get(0).path()).containsExactly("data", "items", 0, "price");
        assertThat(hs.items().get(1).path()).containsExactly(1, "x-y");
        assertThat(http.showDays()).isEqualTo(90);
        assertThat(http.showUnit()).isEqualTo("원");

        CollectConfig fx = parse("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":60},\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\",\"JPY\"]}}");
        assertThat(fx.source()).isEqualTo(new ExchangeSource(List.of("USD", "JPY")));
    }

    // ── 거절 ─────────────────────────────────────────────────────────

    private static void assertRejected(String json, String messagePart) {
        assertThatThrownBy(() -> parse(json)).as(json).isInstanceOf(BusinessException.class)
                .hasMessageContaining(messagePart)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 3, 7, 25, 45, 90, 1441, 2880, -10})
    @DisplayName("everyMin 이 허용 목록 밖이면 거절")
    void everyMinOutsideAllowed(int every) {
        assertRejected("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":" + every + "}," + SQL_SOURCE + "}", "수집 주기");
    }

    @Test
    @DisplayName("일정 모양 위반: 없음·모드 모름·everyMin 글자·at 비었음·25개·형식·겹침")
    void scheduleRejected() {
        assertRejected("{" + SQL_SOURCE + "}", "수집 일정");
        assertRejected("{\"schedule\":{\"mode\":\"weekly\"}," + SQL_SOURCE + "}", "interval 또는 daily");
        assertRejected("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":\"10\"}," + SQL_SOURCE + "}", "수집 주기");
        assertRejected("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":10.5}," + SQL_SOURCE + "}", "수집 주기");
        assertRejected("{\"schedule\":{\"mode\":\"daily\"}," + SQL_SOURCE + "}", "수집 시각");
        assertRejected("{\"schedule\":{\"mode\":\"daily\",\"at\":[]}," + SQL_SOURCE + "}", "수집 시각");
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 25; i++) many.add("\"" + String.format("%02d:00", i % 24) + "\"");
        assertRejected("{\"schedule\":{\"mode\":\"daily\",\"at\":[" + String.join(",", many) + "]}," + SQL_SOURCE + "}", "수집 시각");
        for (String bad : List.of("24:00", "9:30", "09:60", "09:5", "0930", "09:30:00", "ab:cd", "")) {
            assertRejected("{\"schedule\":{\"mode\":\"daily\",\"at\":[\"" + bad + "\"]}," + SQL_SOURCE + "}", "HH:mm");
        }
        assertRejected("{\"schedule\":{\"mode\":\"daily\",\"at\":[\"09:00\",\"09:00\"]}," + SQL_SOURCE + "}", "겹칩니다");
        assertRejected("{\"schedule\":{\"mode\":\"daily\",\"at\":[900]}," + SQL_SOURCE + "}", "HH:mm");
        List<String> all24 = new ArrayList<>();
        for (int i = 0; i < 24; i++) all24.add("\"" + String.format("%02d:15", i) + "\"");
        assertThat(parse("{\"schedule\":{\"mode\":\"daily\",\"at\":[" + String.join(",", all24) + "]}," + SQL_SOURCE + "}").schedule().at()).hasSize(24);
    }

    @Test
    @DisplayName("설정 전체·원천·show 모양 위반")
    void shapeRejected() {
        assertThatThrownBy(() -> CollectConfigs.parse("[]")).isInstanceOf(BusinessException.class).hasMessageContaining("JSON 객체");
        assertThatThrownBy(() -> CollectConfigs.parse("not json")).isInstanceOf(BusinessException.class).hasMessageContaining("올바른 JSON");
        assertThatThrownBy(() -> CollectConfigs.parse(" ")).isInstanceOf(BusinessException.class);
        assertRejected("{" + INTERVAL + "}", "수집 원천");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"ftp\"}}", "sql·http·exchange");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"days\":0}}", "1~90");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"days\":91}}", "1~90");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"days\":\"7\"}}", "1~90");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"days\":7.5}}", "1~90");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"unit\":\"12345678901\"}}", "10자 이하");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"unit\":5}}", "10자 이하");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":5}", "show");
        assertThat(parse("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"unit\":\"1234567890\"}}").showUnit()).hasSize(10);
    }

    @Test
    @DisplayName("sql 원천: sql·valueField 필수, keyField 선택")
    void sqlSourceRules() {
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"sql\",\"valueField\":\"V\"}}", "수집 SQL");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"sql\",\"sql\":\"  \",\"valueField\":\"V\"}}", "수집 SQL");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1\"}}", "값 열");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1\",\"valueField\":\"" + "v".repeat(101) + "\"}}", "값 열");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1\",\"valueField\":\"V\",\"keyField\":5}}", "항목 열");
        assertThat(((SqlSource) parse("{" + INTERVAL + ",\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1\",\"valueField\":\"V\",\"keyField\":\"  \"}}").source()).keyField()).isNull();
    }

    @Test
    @DisplayName("http 원천: 주소(http·https 절대, 사용자 정보 금지)·items 1~20·key 1~100·path 문법·key 중복")
    void httpSourceRules() {
        String ok = "[{\"key\":\"a\",\"path\":\"x\"}]";
        for (String url : List.of("ftp://a.com/x", "file:///etc/passwd", "javascript:alert(1)", "/relative", "//a.com/x", "https://", "http://", "a.com/x",
                "https://user:pw@a.com/x", "https://user@a.com/x", "https://a.com\\@evil.com/", "https://a b.com/")) {
            assertThatThrownBy(() -> parse("{" + INTERVAL + ",\"source\":{\"kind\":\"http\",\"url\":\"" + url.replace("\\", "\\\\") + "\",\"items\":" + ok + "}}"))
                    .as(url).isInstanceOf(BusinessException.class);
        }
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\",\"url\":\"https://a.com/" + "x".repeat(500) + "\",\"items\":" + ok + "}}", "500자");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\",\"items\":" + ok + "}}", "수집 주소");
        String url = "\"url\":\"https://a.com/x\"";
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + "}}", "수집 항목");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + ",\"items\":[]}}", "수집 항목");
        List<String> items = new ArrayList<>();
        for (int i = 0; i < 21; i++) items.add("{\"key\":\"k" + i + "\",\"path\":\"x\"}");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + ",\"items\":[" + String.join(",", items) + "]}}", "1~20");
        assertThat(((HttpSource) parse("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + ",\"items\":[" + String.join(",", items.subList(0, 20)) + "]}}").source()).items()).hasSize(20);
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + ",\"items\":[{\"path\":\"x\"}]}}", "항목 이름");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + ",\"items\":[{\"key\":\"" + "k".repeat(101) + "\",\"path\":\"x\"}]}}", "항목 이름");
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + ",\"items\":[{\"key\":\"a\",\"path\":\"x\"},{\"key\":\"a\",\"path\":\"y\"}]}}", "겹칩니다");
        for (String path : List.of("", "  ", ".a", "a.", "a..b", "a[", "a[]", "a[x]", "a[-1]", "a[10000]", "a[0]b", "a b", "a.b c", "a/b", "a@b", "a:b", "a#b", "a%b", "a?b", "a=b", "a\\\\b", "a['x']", "[", "a.[0]x", "a".repeat(201))) {
            assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + ",\"items\":[{\"key\":\"a\",\"path\":\"" + path + "\"}]}}", "응답 위치");
        }
        assertRejected("{" + INTERVAL + ",\"source\":{\"kind\":\"http\"," + url + ",\"items\":[{\"key\":\"a\"}]}}", "응답 위치");
        for (String path : List.of("a", "a.b.c", "a[0]", "[0]", "a[0][1].b", "data.items[9999].price", "가격", "데이터.종목[0].현재가", "x_y$z-w", "Ünï.ça")) {
            assertThat(CollectConfigs.parsePath("a", path)).as(path).isNotEmpty();
        }
    }

    @Test
    @DisplayName("exchange 원천: 영문 대문자 3자리 1~10개·KRW 제외·중복 없음")
    void exchangeSourceRules() {
        String head = "{\"schedule\":{\"mode\":\"interval\",\"everyMin\":60},\"source\":{\"kind\":\"exchange\",\"currencies\":";
        assertRejected(head + "[]}}", "1~10개");
        assertRejected("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":60},\"source\":{\"kind\":\"exchange\"}}", "1~10개");
        assertRejected(head + "[\"usd\"]}}", "영문 대문자 3자리");
        assertRejected(head + "[\"US\"]}}", "영문 대문자 3자리");
        assertRejected(head + "[\"USDX\"]}}", "영문 대문자 3자리");
        assertRejected(head + "[\"US1\"]}}", "영문 대문자 3자리");
        assertRejected(head + "[5]}}", "영문 대문자 3자리");
        assertRejected(head + "[\"KRW\"]}}", "KRW");
        assertRejected(head + "[\"USD\",\"USD\"]}}", "겹칩니다");
        assertRejected(head + "[\"AAA\",\"BBB\",\"CCC\",\"DDD\",\"EEE\",\"FFF\",\"GGG\",\"HHH\",\"III\",\"JJJ\",\"KKK\"]}}", "1~10개");
        assertThat(((ExchangeSource) parse(head + "[\"AAA\",\"BBB\",\"CCC\",\"DDD\",\"EEE\",\"FFF\",\"GGG\",\"HHH\",\"III\",\"JJJ\"]}}").source()).currencies()).hasSize(10);
    }

    @Test
    @DisplayName("환율 원천의 interval 은 60분 이상(5·10·15·20·30분 거절), daily 는 허용 — 호출 폭주 방지")
    void exchangeIntervalAtLeastSixtyMinutes() {
        String fx = ",\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}}";
        for (int every : List.of(5, 10, 15, 20, 30)) {
            assertRejected("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":" + every + "}" + fx, "60분 이상");
        }
        for (int every : List.of(60, 120, 1440)) {
            assertThat(parse("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":" + every + "}" + fx).schedule().everyMin()).isEqualTo(every);
        }
        assertThat(parse("{\"schedule\":{\"mode\":\"daily\",\"at\":[\"09:00\",\"15:30\"]}" + fx).schedule().at()).hasSize(2);
        // 다른 원천은 5분도 허용
        assertThat(parse("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":5}," + SQL_SOURCE + "}").schedule().everyMin()).isEqualTo(5);
    }

    @Test
    @DisplayName("정수 범위를 벗어난 숫자는 int 로 잘려 허용 값으로 둔갑하지 않고 거절한다(4294967301 → 5)")
    void outOfIntRangeIntegersRejected() {
        assertRejected("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":4294967301}," + SQL_SOURCE + "}", "수집 주기");
        assertRejected("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":99999999999999999999}," + SQL_SOURCE + "}", "수집 주기");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"days\":4294967297}}", "1~90");
        assertRejected("{" + INTERVAL + "," + SQL_SOURCE + ",\"show\":{\"days\":-4294967289}}", "1~90");
    }

    @Test
    @DisplayName("check: sql 원천은 검사 함수로 SQL 을 넘기고, http 원천은 호스트 허용 판정을 거친다(null 이면 저장 때 보지 않음)")
    void checkDelegates() throws Exception {
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        List<String> seen = new ArrayList<>();
        CollectConfigs.check(om.readTree("{" + INTERVAL + "," + SQL_SOURCE + "}"), seen::add, null);
        assertThat(seen).containsExactly("SELECT 1 AS V FROM T");

        com.fasterxml.jackson.databind.JsonNode http = om.readTree("{" + INTERVAL + ",\"source\":{\"kind\":\"http\",\"url\":\"https://Api.Example.com:8443/x\",\"items\":[{\"key\":\"a\",\"path\":\"x\"}]}}");
        CollectConfigs.check(http, s -> { throw new AssertionError("sql 검사는 http 에서 부르지 않는다"); }, null);
        CollectConfigs.check(http, s -> { }, host -> host.equalsIgnoreCase("api.example.com"));
        assertThatThrownBy(() -> CollectConfigs.check(http, s -> { }, host -> false)).isInstanceOf(BusinessException.class).hasMessageContaining("허용 목록");
        CollectConfigs.check(om.readTree("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":60},\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}}"), s -> { throw new AssertionError(); }, host -> false);
    }
}
