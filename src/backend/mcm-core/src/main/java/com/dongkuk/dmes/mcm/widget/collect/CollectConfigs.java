package com.dongkuk.dmes.mcm.widget.collect;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.ExchangeSource;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.HttpItem;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.HttpSource;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.Mode;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.Schedule;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.Source;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig.SqlSource;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * 정시 수집 정의 파싱·검사 — 스펙 2026-10-05 정시 수집 §2. 저장 때({@code WidgetDefConfigRules})와 수집기가 실행 때마다 함께 쓴다
 * (저장된 값을 믿지 않는다). 어기면 {@code BusinessException(INVALID_VALUE)} 한국어 한 문장. 알 수 없는 키는 무시한다.
 */
public final class CollectConfigs {

    /** interval 에 허용하는 분(1440 의 약수 중 자정에 맞춰지고 외부 호출이 잦지 않은 것). */
    public static final List<Integer> EVERY_MIN_ALLOWED = List.of(5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720, 1440);
    public static final int AT_MAX = 24;
    /** 환율 원천의 interval 최소 주기(분) — 외부 제공자 호출이 잦지 않게. */
    public static final int EXCHANGE_EVERY_MIN_MIN = 60;
    public static final int ITEMS_MAX = 20;
    public static final int KEY_MAX = 100;
    public static final int PATH_MAX = 200;
    public static final int URL_MAX = 500;
    public static final int CURRENCIES_MAX = 10;
    public static final int FIELD_MAX = 100;
    public static final int DAYS_DEFAULT = 7;
    public static final int DAYS_MAX = 90;
    public static final int UNIT_MAX = 10;
    static final int PATH_DEPTH_MAX = 20;
    static final int PATH_INDEX_MAX = 9999;

    private static final Pattern AT = Pattern.compile("^([01][0-9]|2[0-3]):[0-5][0-9]$");
    private static final Pattern CURRENCY = Pattern.compile("^[A-Z]{3}$");
    private static final Pattern PATH_NAME = Pattern.compile("^[\\p{L}\\p{N}_$\\-]+$");
    private static final ObjectMapper JSON = new ObjectMapper();

    private CollectConfigs() {}

    /** 저장된 CONFIG_JSON 글자를 읽어 검사한다. */
    public static CollectConfig parse(String configJson) {
        if (configJson == null || configJson.isBlank()) throw invalid("정시 수집 설정이 없습니다.");
        try {
            return parse(JSON.readTree(configJson));
        } catch (JsonProcessingException e) {
            throw invalid("정시 수집 설정(configJson)이 올바른 JSON 이 아닙니다.");
        }
    }

    public static CollectConfig parse(JsonNode config) {
        if (config == null || !config.isObject()) throw invalid("정시 수집 설정은 JSON 객체여야 합니다.");
        Schedule schedule = parseSchedule(config.get("schedule"));
        Source source = parseSource(config.get("source"));
        JsonNode show = config.get("show");
        int days = DAYS_DEFAULT;
        String unit = "";
        if (show != null && !show.isNull()) {
            if (!show.isObject()) throw invalid("정시 수집 표시 설정(show)은 객체여야 합니다.");
            JsonNode d = show.get("days");
            if (d != null && !d.isNull()) {
                if (!d.isIntegralNumber() || !d.canConvertToInt() || d.asInt() < 1 || d.asInt() > DAYS_MAX) {
                    throw invalid("표시 기간(show.days)은 1~" + DAYS_MAX + " 사이 정수여야 합니다.");
                }
                days = d.asInt();
            }
            JsonNode u = show.get("unit");
            if (u != null && !u.isNull()) {
                if (!u.isTextual() || u.asText().length() > UNIT_MAX) {
                    throw invalid("값 단위(show.unit)는 " + UNIT_MAX + "자 이하 문자열이어야 합니다.");
                }
                unit = u.asText();
            }
        }
        if (source instanceof ExchangeSource && schedule.mode() == Mode.INTERVAL && schedule.everyMin() < EXCHANGE_EVERY_MIN_MIN) {
            throw invalid("환율 원천은 수집 주기(schedule.everyMin)를 " + EXCHANGE_EVERY_MIN_MIN + "분 이상으로 정해 주세요(정해진 시각 daily 는 가능합니다).");
        }
        return new CollectConfig(schedule, source, days, unit);
    }

    /**
     * 저장 검사 — {@link #parse(JsonNode)} + sql 원천은 {@code validateSql}(실행기의 SQL 검사, 사용자 변수 거절)을, http 원천은 호스트 허용 여부를
     * 본다. hostAllowed 가 null 이면 호스트 허용 목록은 저장 때 보지 않는다(수집기가 실행 때마다 거절한다).
     */
    public static CollectConfig check(JsonNode config, Consumer<String> validateSql, Predicate<String> hostAllowed) {
        CollectConfig parsed = parse(config);
        if (parsed.source() instanceof SqlSource sql) {
            validateSql.accept(sql.sql());
        } else if (parsed.source() instanceof HttpSource http && hostAllowed != null && !hostAllowed.test(http.url().getHost())) {
            throw invalid("이 호스트는 수집 허용 목록(dmes.widget.collect.allowed-hosts)에 없습니다: " + http.url().getHost());
        }
        return parsed;
    }

    // ── schedule ─────────────────────────────────────────────────────

    private static Schedule parseSchedule(JsonNode node) {
        if (node == null || !node.isObject()) throw invalid("수집 일정(schedule)이 없습니다.");
        String mode = text(node, "mode");
        if ("interval".equals(mode)) {
            JsonNode every = node.get("everyMin");
            if (every == null || !every.isIntegralNumber() || !every.canConvertToInt() || !EVERY_MIN_ALLOWED.contains(every.asInt())) {
                throw invalid("수집 주기(schedule.everyMin)는 " + EVERY_MIN_ALLOWED.stream().map(String::valueOf)
                        .collect(java.util.stream.Collectors.joining("·")) + " 분 중 하나여야 합니다.");
            }
            return new Schedule(Mode.INTERVAL, every.asInt(), List.of());
        }
        if ("daily".equals(mode)) {
            JsonNode at = node.get("at");
            if (at == null || !at.isArray() || at.isEmpty() || at.size() > AT_MAX) {
                throw invalid("수집 시각(schedule.at)은 HH:mm 을 1~" + AT_MAX + "개 담은 배열이어야 합니다.");
            }
            List<LocalTime> times = new ArrayList<>();
            Set<LocalTime> seen = new HashSet<>();
            for (JsonNode item : at) {
                if (!item.isTextual() || !AT.matcher(item.asText()).matches()) {
                    throw invalid("수집 시각은 24시간제 HH:mm 형식이어야 합니다: " + shorten(item.asText()));
                }
                LocalTime t = LocalTime.parse(item.asText());
                if (!seen.add(t)) throw invalid("수집 시각이 겹칩니다: " + item.asText());
                times.add(t);
            }
            return new Schedule(Mode.DAILY, 0, List.copyOf(times));
        }
        throw invalid("수집 일정 방식(schedule.mode)은 interval 또는 daily 여야 합니다.");
    }

    // ── source ───────────────────────────────────────────────────────

    private static Source parseSource(JsonNode node) {
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
        URI url = parseUrl(text(node, "url"));
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
        return new HttpSource(url, List.copyOf(out));
    }

    /** http·https 절대 주소, 호스트 있음, 사용자 정보({@code user:pw@}) 없음. */
    static URI parseUrl(String text) {
        if (text == null || text.isBlank()) throw invalid("수집 주소(source.url)를 입력해 주세요.");
        if (text.length() > URL_MAX) throw invalid("수집 주소는 " + URL_MAX + "자 이하여야 합니다.");
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
