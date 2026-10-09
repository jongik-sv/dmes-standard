package com.dongkuk.dmes.mcm.job.builtin.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.HttpSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.SqlSource;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** COLLECT 작업 설정 파싱·검사(설계 §5.1·§5.4) — 원천 2종·저장 여부·경로 문법. */
class CollectConfigsTest {

    private static final ObjectMapper OM = new ObjectMapper();
    private static final String SQL_SOURCE = "\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1 AS V FROM T\",\"valueField\":\"V\"}";
    private static final String HTTP_SOURCE = "\"source\":{\"kind\":\"http\",\"url\":\"https://api.example.com/q?s=1\",\"items\":[{\"key\":\"price\",\"path\":\"data.items[0].price\"}]}";

    private static CollectConfig parse(String json) {
        return CollectConfigs.parse(json);
    }

    private static void assertRejected(String json, String messagePart) {
        assertThatThrownBy(() -> parse(json)).isInstanceOf(BusinessException.class).hasMessageContaining(messagePart);
    }

    @Test
    @DisplayName("두 원천의 정상 설정 — save 기본 true, 알 수 없는 키는 무시")
    void validConfigs() {
        CollectConfig sql = parse("{" + SQL_SOURCE.replace("\"valueField\":\"V\"", "\"valueField\":\"V\",\"keyField\":\"K\"") + ",\"extra\":1}");
        assertThat(sql.save()).isTrue();
        assertThat(sql.source()).isEqualTo(new SqlSource("SELECT 1 AS V FROM T", "V", "K"));

        CollectConfig http = parse("{" + HTTP_SOURCE + ",\"save\":false}");
        assertThat(http.save()).isFalse();
        HttpSource h = (HttpSource) http.source();
        assertThat(h.url().getHost()).isEqualTo("api.example.com");
        assertThat(h.items().get(0).path()).containsExactly("data", "items", 0, "price");
    }

    @Test
    @DisplayName("HTTP 일시 오류 재시도 옵션 retryTransient — 키 없음·null 은 꺼짐, true/false 는 그대로, 불리언이 아니면 거절")
    void retryTransientOption() {
        String withKey = HTTP_SOURCE.replace("\"kind\":\"http\",", "\"kind\":\"http\",\"retryTransient\":%s,");
        assertThat(((HttpSource) parse("{" + HTTP_SOURCE + "}").source()).retryTransient()).isFalse();
        assertThat(((HttpSource) parse("{" + withKey.formatted("true") + "}").source()).retryTransient()).isTrue();
        assertThat(((HttpSource) parse("{" + withKey.formatted("false") + "}").source()).retryTransient()).isFalse();
        assertThat(((HttpSource) parse("{" + withKey.formatted("null") + "}").source()).retryTransient()).isFalse();
        assertRejected("{" + withKey.formatted("\"yes\"") + "}", "retryTransient");
        assertRejected("{" + withKey.formatted("1") + "}", "retryTransient");
    }

    @Test
    @DisplayName("설정 전체·원천 모양 위반")
    void shapeRejected() {
        assertRejected("[]", "JSON 객체");
        assertRejected("not json", "올바른 JSON");
        assertRejected(" ", "수집 설정이 없습니다");
        assertRejected("{}", "수집 원천");
        assertRejected("{\"source\":{\"kind\":\"ftp\"}}", "sql·http");
        assertRejected("{\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}}", "sql·http");   // 환율 수집은 2026-10-09 제거 — mdm 환율 마스터로 일원화
        assertRejected("{" + SQL_SOURCE + ",\"save\":\"yes\"}", "save");
        assertRejected("{\"source\":{\"kind\":\"sql\",\"sql\":\"\",\"valueField\":\"V\"}}", "수집 SQL");
        assertRejected("{\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1 FROM T\"}}", "값 열");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ftp://x/y", "https://user:pw@api.example.com/x", "/relative", "https:///nohost"})
    @DisplayName("http 주소: 절대 http(s)·호스트 있음·사용자 정보 없음")
    void badUrls(String url) {
        assertRejected("{\"source\":{\"kind\":\"http\",\"url\":\"" + url + "\",\"items\":[{\"key\":\"k\",\"path\":\"a\"}]}}", "수집 주소");
    }

    @Test
    @DisplayName("응답 경로 문법 — 점·대괄호만, 최대 20 조각")
    void paths() {
        assertThat(CollectConfigs.parsePath("k", "a.b[0].c")).containsExactly("a", "b", 0, "c");
        for (String bad : List.of("", "a..b", ".a", "a.", "a[b]", "a[0]b", "a[]", "a[10000]", "a b")) {
            assertThatThrownBy(() -> CollectConfigs.parsePath("k", bad)).as(bad).isInstanceOf(BusinessException.class);
        }
        List<String> deep = new ArrayList<>();
        for (int i = 0; i < 21; i++) deep.add("p" + i);
        assertThatThrownBy(() -> CollectConfigs.parsePath("k", String.join(".", deep))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("저장 검사 — sql 은 검사기를 부르고, http 는 허용 호스트")
    void check() throws Exception {
        List<String> seen = new ArrayList<>();
        CollectConfigs.check(OM.readTree("{" + SQL_SOURCE + "}"), seen::add, null);
        assertThat(seen).containsExactly("SELECT 1 AS V FROM T");

        var http = OM.readTree("{" + HTTP_SOURCE + "}");
        CollectConfigs.check(http, s -> { throw new AssertionError("sql 검사는 http 에서 부르지 않는다"); }, null);
        CollectConfigs.check(http, s -> { }, host -> host.equalsIgnoreCase("api.example.com"));
        assertThatThrownBy(() -> CollectConfigs.check(http, s -> { }, host -> false)).isInstanceOf(BusinessException.class).hasMessageContaining("허용 목록");
    }
}
