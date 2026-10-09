package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.ExchangeSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.HttpItem;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.HttpSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.Source;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig.SqlSource;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * COLLECT 작업 설정 파싱·검사 — 원천 3종·저장 여부·경로 문법. 저장 때와 실행 때 함께 쓴다(저장된 값을 믿지 않는다).
 * 어기면 {@code BusinessException(INVALID_VALUE)} 한국어 한 문장. 알 수 없는 키는 무시한다.
 */
public final class CollectConfigs {

    public static final int ITEMS_MAX = 20;
    public static final int KEY_MAX = 100;
    public static final int PATH_MAX = 200;
    public static final int URL_MAX = 500;
    public static final int CURRENCIES_MAX = 10;
    public static final int FIELD_MAX = 100;
    static final int PATH_DEPTH_MAX = 20;
    static final int PATH_INDEX_MAX = 9999;

    private static final Pattern CURRENCY = Pattern.compile("^[A-Z]{3}$");
    private static final Pattern PATH_NAME = Pattern.compile("^[\\p{L}\\p{N}_$\\-]+$");
    private static final ObjectMapper JSON = new ObjectMapper();

    private CollectConfigs() {}

    /** 저장된 CONFIG_JSON 글자를 읽어 검사한다. */
    public static CollectConfig parse(String configJson) {
        if (configJson == null || configJson.isBlank()) throw invalid("수집 설정이 없습니다.");
        try {
            return parse(JSON.readTree(configJson));
        } catch (JsonProcessingException e) {
            throw invalid("수집 설정(CONFIG_JSON)이 올바른 JSON 이 아닙니다.");
        }
    }

    public static CollectConfig parse(JsonNode config) {
        if (config == null || !config.isObject()) throw invalid("수집 설정은 JSON 객체여야 합니다.");
        Source source = parseSource(config.get("source"));
        JsonNode save = config.get("save");
        if (save != null && !save.isNull() && !save.isBoolean()) throw invalid("저장 여부(save)는 true 또는 false 여야 합니다.");
        return new CollectConfig(source, save == null || save.isNull() || save.asBoolean());
    }

    /**
     * 저장 검사 — {@link #parse(JsonNode)} + SQL 원천은 {@code validateSql}(사용자 변수 거절 포함), HTTP 원천은 호스트 허용 여부,
     * 환율 원천은 MCM 모듈 작업에서만(계획 D7). hostAllowed 가 null 이면 호스트 허용 목록은 저장 때 보지 않는다(실행 때마다 거절한다).
     */
    public static CollectConfig check(JsonNode config, String moduleCd, Consumer<String> validateSql, Predicate<String> hostAllowed) {
        CollectConfig parsed = parse(config);
        if (parsed.source() instanceof SqlSource sql) {
            validateSql.accept(sql.sql());
        } else if (parsed.source() instanceof HttpSource http && hostAllowed != null && !hostAllowed.test(http.url().getHost())) {
            throw invalid("이 호스트는 수집 허용 목록(dmes.job.http.allowed-hosts)에 없습니다: " + http.url().getHost());
        } else if (parsed.source() instanceof ExchangeSource && !"MCM".equalsIgnoreCase(moduleCd)) {
            throw invalid("환율 수집은 MCM 모듈 작업에서만 쓸 수 있습니다.");
        }
        return parsed;
    }

    // ── source ───────────────────────────────────────────────────────

    public static Source parseSource(JsonNode node) {
        if (node == null || !node.isObject()) throw invalid("수집 원천(source)이 없습니다.");
        String kind = text(node, "kind");
        if ("sql".equals(kind)) return parseSql(node);
        if ("http".equals(kind)) return parseHttp(node);
        if ("exchange".equals(kind)) return parseExchange(node);
        throw invalid("수집 원천 종류(source.kind)는 sql·http·exchange 중 하나여야 합니다.");
    }

    private static SqlSource parseSql(JsonNode node) {
        String sql = text(node, "sql");
        if (sql == null || sql.isBlank()) throw invalid("수집 SQL 을 입력해 주세요.");
        String valueField = text(node, "valueField");
        if (valueField == null || valueField.isBlank() || valueField.length() > FIELD_MAX) {
            throw invalid("값 열(source.valueField)을 " + FIELD_MAX + "자 이하로 정해 주세요.");
        }
        String keyField = null;
        JsonNode k = node.get("keyField");
        if (k != null && !k.isNull()) {
            if (!k.isTextual() || k.asText().length() > FIELD_MAX) throw invalid("항목 열(source.keyField)은 " + FIELD_MAX + "자 이하 문자열이어야 합니다.");
            keyField = k.asText().isBlank() ? null : k.asText();
        }
        return new SqlSource(sql, valueField, keyField);
    }

    private static HttpSource parseHttp(JsonNode node) {
        String template = text(node, "url");
        URI url = parseUrl(HttpUrlTemplate.mask(template));   // {{이름}} 자리는 경로·쿼리에만 — 호스트·스킴 자리에 있으면 여기서 거절한다
        JsonNode items = node.get("items");
        if (items == null || !items.isArray() || items.isEmpty() || items.size() > ITEMS_MAX) {
            throw invalid("수집 항목(source.items)은 1~" + ITEMS_MAX + "개여야 합니다.");
        }
        List<HttpItem> out = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        for (JsonNode item : items) {
            String key = item.isObject() ? text(item, "key") : null;
            if (key == null || key.isBlank() || key.length() > KEY_MAX) throw invalid("항목 이름(key)은 1~" + KEY_MAX + "자여야 합니다.");
            if (!keys.add(key)) throw invalid("항목 이름이 겹칩니다: " + shorten(key));
            String path = text(item, "path");
            out.add(new HttpItem(key, path, parsePath(key, path)));
        }
        boolean retryTransient = false;
        JsonNode retry = node.get("retryTransient");
        if (retry != null && !retry.isNull()) {
            if (!retry.isBoolean()) throw invalid("일시 오류 재시도(source.retryTransient)는 true 또는 false 여야 합니다.");
            retryTransient = retry.asBoolean();
        }
        return new HttpSource(url, List.copyOf(out), template.strip(), retryTransient);
    }

    /** http·https 절대 주소, 호스트 있음, 사용자 정보({@code user:pw@}) 없음. */
    static URI parseUrl(String text) {
        return parseUrl(text, URL_MAX);
    }

    /** {@link #parseUrl(String)} 와 같고 길이 상한만 다르다 — 변수를 넣은 실행 주소는 저장 상한({@link #URL_MAX})보다 길 수 있다. */
    static URI parseUrl(String text, int maxLength) {
        if (text == null || text.isBlank()) throw invalid("수집 주소(source.url)를 입력해 주세요.");
        if (text.length() > maxLength) throw invalid("수집 주소는 " + maxLength + "자 이하여야 합니다.");
        URI uri;
        try {
            uri = new URI(text.strip());
        } catch (URISyntaxException e) {
            throw invalid("수집 주소 형식이 올바르지 않습니다.");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) throw invalid("수집 주소는 http:// 또는 https:// 로 시작하는 절대 주소여야 합니다.");
        if (uri.getHost() == null || uri.getHost().isBlank()) throw invalid("수집 주소에 호스트가 있어야 합니다.");
        if (uri.getRawUserInfo() != null) throw invalid("수집 주소에는 사용자 정보(user:password@)를 쓸 수 없습니다.");
        return uri;
    }

    /** {@code data.items[0].price} → ["data","items",0,"price"]. 점·대괄호 경로만, 최대 20 조각. */
    static List<Object> parsePath(String key, String path) {
        if (path == null || path.isBlank() || path.length() > PATH_MAX) {
            throw invalid("항목 " + shorten(key) + " 의 응답 위치(path)는 1~" + PATH_MAX + "자여야 합니다.");
        }
        List<Object> parts = new ArrayList<>();
        int i = 0;
        int n = path.length();
        boolean expectName = true; // 첫 조각이나 '.' 바로 뒤에는 이름
        while (i < n) {
            char c = path.charAt(i);
            if (c == '[') {
                int close = path.indexOf(']', i);
                if (close < 0 || close == i + 1) throw badPath(key);
                String digits = path.substring(i + 1, close);
                if (!digits.chars().allMatch(ch -> ch >= '0' && ch <= '9') || digits.length() > 4) throw badPath(key);
                int index = Integer.parseInt(digits);
                if (index > PATH_INDEX_MAX) throw badPath(key);
                parts.add(index);
                i = close + 1;
                expectName = false;
            } else if (c == '.') {
                if (expectName) throw badPath(key);
                i++;
                if (i >= n) throw badPath(key);
                expectName = true;
            } else {
                if (!expectName && !parts.isEmpty()) throw badPath(key); // ]뒤에 바로 이름이 붙으면 안 된다(a[0]b)
                int end = i;
                while (end < n && path.charAt(end) != '.' && path.charAt(end) != '[') end++;
                String name = path.substring(i, end);
                if (!PATH_NAME.matcher(name).matches()) throw badPath(key);
                parts.add(name);
                i = end;
                expectName = false;
            }
            if (parts.size() > PATH_DEPTH_MAX) throw badPath(key);
        }
        if (parts.isEmpty()) throw badPath(key);
        return List.copyOf(parts);
    }

    private static BusinessException badPath(String key) {
        return invalid("항목 " + shorten(key) + " 의 응답 위치(path)는 data.items[0].price 처럼 점·대괄호 경로여야 합니다.");
    }

    private static ExchangeSource parseExchange(JsonNode node) {
        JsonNode list = node.get("currencies");
        if (list == null || !list.isArray() || list.isEmpty() || list.size() > CURRENCIES_MAX) {
            throw invalid("통화(source.currencies)는 1~" + CURRENCIES_MAX + "개여야 합니다.");
        }
        List<String> currencies = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode c : list) {
            if (!c.isTextual() || !CURRENCY.matcher(c.asText()).matches()) throw invalid("통화는 영문 대문자 3자리여야 합니다: " + shorten(c.asText()));
            if ("KRW".equals(c.asText())) throw invalid("기준 통화 KRW 는 수집할 수 없습니다.");
            if (!seen.add(c.asText())) throw invalid("통화가 겹칩니다: " + c.asText());
            currencies.add(c.asText());
        }
        return new ExchangeSource(List.copyOf(currencies));
    }

    // ── helpers ──────────────────────────────────────────────────────

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || !v.isTextual() ? null : v.asText();
    }

    private static String shorten(String s) {
        if (s == null) return "";
        return s.length() <= 30 ? s : s.substring(0, 30) + "…";
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
