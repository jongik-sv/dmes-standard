package com.dongkuk.dmes.mcm.widget.query;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.query.QueryParam.Option;
import com.dongkuk.dmes.mcm.widget.query.QueryParam.Type;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.math.BigDecimal;
import java.sql.Types;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 쿼리 위젯 「입력 조건」 도우미 — 스펙 2026-10-02-widget-admin-generic 입력 조건. 보안 규칙:
 * <ul>
 *   <li>사용자가 보낸 값은 <b>바인드 변수로만</b> SQL 에 들어간다. 이 클래스는 SQL 글자를 만지지 않고, 값을 {@link BigDecimal}·{@link String}·null
 *       (스칼라)로만 돌려준다 — {@code NamedParameterJdbcTemplate} 이 펼치는 컬렉션·배열은 만들 수 없다.</li>
 *   <li>정의({@code params})는 저장 때도 실행 때마다도 {@link #parse} 로 다시 검사한다(저장된 값을 믿지 않는다).</li>
 *   <li>값은 바인드되지만 값 안의 특수문자는 DB 가 쓰이는 자리대로 해석한다 — {@code LIKE} 의 {@code %}·{@code _} 와일드카드나 정규식 인자로 쓰면
 *       그대로 패턴으로 읽힌다(이스케이프하지 않는다. 와일드카드가 문제인 SQL 은 정의 작성자가 {@code ESCAPE} 등으로 다룬다).</li>
 *   <li>값은 모두 글자로 오며(200자 이하) 형별로 서버가 해석한다: text=그대로, number=BigDecimal, date=yyyyMMdd 로 정규화한 글자,
 *       select=선언된 선택지 중 하나. 해석에 실패하면 거절한다. 빈 값(공백만 포함)은 값이 없는 것이다 — 기본값 → 필수면 거절 → 형 붙은 null.</li>
 * </ul>
 */
public final class QueryParams {

    public static final int MAX_PARAMS = 10;
    public static final int VALUE_MAX = 200;
    public static final int LABEL_MAX = 50;
    public static final int OPTIONS_MAX = 50;
    /** widgetData/run 의 paramsJson 전체 길이 상한. */
    public static final int VALUES_JSON_MAX = 4000;
    /** 미리보기가 받는 조건 정의 JSON 길이 상한(CONFIG_JSON 상한과 같다). */
    static final int DEFS_JSON_MAX = 200 * 1024;
    /** number 가 받는 유효 자릿수·소수 자릿수 상한 — {@code 1e999999999} 같은 값이 DB 까지 가지 않게. */
    static final int NUMBER_MAX_PRECISION = 38;
    static final int NUMBER_MAX_SCALE = 38;

    private static final Pattern NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,29}$");
    private static final Pattern DATE_DASH = Pattern.compile("^[0-9]{4}-[0-9]{2}-[0-9]{2}$");
    private static final Pattern DATE_COMPACT = Pattern.compile("^[0-9]{8}$");
    private static final DateTimeFormatter PARSE_DASH = DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter PARSE_COMPACT = DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    // JSON 값 뒤 군더더기와 겹친 키(`{"a":"1","a":"2"}`)는 거절한다 — 같은 이름이 둘이면 어느 값이 쓰일지 모호하다.
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            // 12.50 이 double 을 거쳐 12.5 로 바뀌거나 1e999999999 가 Infinity 가 되지 않게 — 숫자는 십진수 그대로 글자로 읽는다.
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .setNodeFactory(JsonNodeFactory.withExactBigDecimals(true))
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    /** 저장된 CONFIG_JSON 읽기용 — 실행기의 sql 읽기와 같은 해석(겹친 키는 뒤의 것)이어야 두 곳이 어긋나지 않는다. */
    private static final ObjectMapper CONFIG_JSON = new ObjectMapper();

    /**
     * 해석을 마친 바인드 값 하나. value 는 {@link BigDecimal}(number)·{@link String}(그 밖)·null(값 없음), sqlType 은 null 에도 붙일 형
     * ({@link Types#NUMERIC} 또는 {@link Types#VARCHAR}).
     */
    public record Bound(Object value, int sqlType) {

        /** 캐시 키에 넣을 값 — 바인드 값과 같다(number 는 {@link QueryParams#coerce} 에서 이미 정규화했다). */
        public Object cacheValue() {
            return value;
        }
    }

    private QueryParams() {}

    // ── 정의 파싱·검사 ───────────────────────────────────────────────

    /**
     * CONFIG_JSON 의 {@code params} 를 읽어 검사한다. 없거나 null 이면 빈 목록. 어기면 {@code BusinessException(INVALID_VALUE)} 한국어 한 문장.
     * 검사: 배열·개수(10)·이름 형식·시스템 변수 이름·중복(대소문자 구분)·형·label(50자)·default(글자·200자·형 일치)·select 선택지.
     */
    public static List<QueryParam> fromConfig(String configJson) {
        if (configJson == null || configJson.isBlank()) return List.of();
        try {
            JsonNode config = CONFIG_JSON.readTree(configJson);
            return parse(config == null ? null : config.get("params"));
        } catch (JsonProcessingException e) {
            throw invalid("위젯 설정(configJson)이 올바른 JSON 이 아닙니다.");
        }
    }

    /** 관리자 미리보기가 받는 조건 정의 JSON 글자(배열). 비어 있으면 빈 목록. */
    public static List<QueryParam> fromDefsJson(String paramDefsJson) {
        if (paramDefsJson == null || paramDefsJson.isBlank()) return List.of();
        if (paramDefsJson.length() > DEFS_JSON_MAX) throw invalid("입력 조건 정의가 너무 큽니다.");
        try {
            return parse(JSON.readTree(paramDefsJson));
        } catch (JsonProcessingException e) {
            throw invalid("입력 조건 정의(paramsJson)가 올바른 JSON 이 아닙니다.");
        }
    }

    /** {@code params} 노드(배열) 검사. null·JSON null 은 빈 목록. */
    public static List<QueryParam> parse(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) return List.of();
        if (!node.isArray()) throw invalid("입력 조건(params)은 배열이어야 합니다.");
        if (node.size() > MAX_PARAMS) throw invalid("입력 조건은 최대 " + MAX_PARAMS + "개까지 정할 수 있습니다.");
        List<QueryParam> result = new ArrayList<>(node.size());
        Set<String> names = new HashSet<>();
        for (JsonNode item : node) {
            if (item == null || !item.isObject()) throw invalid("입력 조건(params)의 각 항목은 객체여야 합니다.");
            QueryParam param = parseOne(item);
            if (!names.add(param.name())) throw invalid("입력 조건 이름이 겹칩니다: :" + param.name());
            result.add(param);
        }
        return List.copyOf(result);
    }

    private static QueryParam parseOne(JsonNode item) {
        String name = textOrNull(item, "name");
        if (name == null || !NAME.matcher(name).matches()) {
            throw invalid("입력 조건 이름은 영문자로 시작하는 영문·숫자·밑줄 30자 이하여야 합니다: " + name);
        }
        if (SqlGuard.SYSTEM_VARIABLES.contains(name)) {
            throw invalid("입력 조건 이름 :" + name + " 은(는) 시스템 변수 이름과 같아 쓸 수 없습니다.");
        }
        Type type = Type.of(textOrNull(item, "type"));
        if (type == null) throw invalid("입력 조건 :" + name + " 의 형(type)은 text·number·date·select 중 하나여야 합니다.");

        String label = null;
        JsonNode labelNode = item.get("label");
        if (labelNode != null && !labelNode.isNull()) {
            if (!labelNode.isTextual() || labelNode.asText().length() > LABEL_MAX) {
                throw invalid("입력 조건 :" + name + " 의 이름표(label)는 " + LABEL_MAX + "자 이하 문자열이어야 합니다.");
            }
            label = labelNode.asText().isBlank() ? null : labelNode.asText();
        }

        boolean required = false;
        JsonNode requiredNode = item.get("required");
        if (requiredNode != null && !requiredNode.isNull()) {
            if (!requiredNode.isBoolean()) throw invalid("입력 조건 :" + name + " 의 필수 여부(required)는 true 또는 false 여야 합니다.");
            required = requiredNode.asBoolean();
        }

        List<Option> options = type == Type.SELECT ? parseOptions(name, item.get("options")) : List.of();
        // 형 검사에 쓸 임시 정의(default 는 아직 비움) — default 가 형·선택지에 맞는지 같은 해석 규칙으로 본다.
        QueryParam draft = new QueryParam(name, label, type, null, required, options);

        String defaultValue = null;
        JsonNode defaultNode = item.get("default");
        if (defaultNode != null && !defaultNode.isNull()) {
            if (!defaultNode.isTextual()) throw invalid("입력 조건 :" + name + " 의 기본값(default)은 문자열이어야 합니다.");
            if (defaultNode.asText().length() > VALUE_MAX) {
                throw invalid("입력 조건 :" + name + " 의 기본값(default)은 " + VALUE_MAX + "자 이하여야 합니다.");
            }
            if (!defaultNode.asText().isBlank()) {
                defaultValue = defaultNode.asText();
                coerce(draft, defaultValue); // 형·선택지 불일치면 거절
            }
        }
        return new QueryParam(name, label, type, defaultValue, required, options);
    }

    private static List<Option> parseOptions(String name, JsonNode node) {
        if (node == null || !node.isArray() || node.isEmpty()) {
            throw invalid("입력 조건 :" + name + " 은(는) select 형이라 선택지(options)가 하나 이상 있어야 합니다.");
        }
        if (node.size() > OPTIONS_MAX) throw invalid("입력 조건 :" + name + " 의 선택지는 최대 " + OPTIONS_MAX + "개까지 정할 수 있습니다.");
        List<Option> options = new ArrayList<>(node.size());
        Set<String> values = new HashSet<>();
        for (JsonNode option : node) {
            String value = option != null && option.isObject() ? textOrNull(option, "value") : null;
            if (value == null || value.isBlank() || value.length() > VALUE_MAX) {
                throw invalid("입력 조건 :" + name + " 의 선택지 값(value)은 비어 있지 않은 " + VALUE_MAX + "자 이하 문자열이어야 합니다.");
            }
            if (value.indexOf('\u0000') >= 0) throw invalid("입력 조건 :" + name + " 의 선택지 값에 쓸 수 없는 문자가 있습니다.");
            // 값은 앞뒤 공백을 지워 비교하므로(coerce) 공백이 붙은 선택지는 고를 수 없다 — 정의 단계에서 거절한다.
            if (!value.equals(value.strip())) throw invalid("입력 조건 :" + name + " 의 선택지 값은 앞뒤에 공백이 없어야 합니다.");
            if (!values.add(value)) throw invalid("입력 조건 :" + name + " 의 선택지 값이 겹칩니다: " + value);
            JsonNode labelNode = option.get("label");
            String label = null;
            if (labelNode != null && !labelNode.isNull()) {
                if (!labelNode.isTextual()) throw invalid("입력 조건 :" + name + " 의 선택지 이름표(label)는 문자열이어야 합니다.");
                label = labelNode.asText();
            }
            options.add(new Option(value, label));
        }
        return List.copyOf(options);
    }

    /** 정의의 이름 집합(SqlGuard 에 넘길 선언 이름). */
    public static Set<String> names(Collection<QueryParam> params) {
        Set<String> names = new LinkedHashSet<>();
        for (QueryParam p : params) names.add(p.name());
        return names;
    }

    // ── 값 해석 ──────────────────────────────────────────────────────

    /**
     * widgetData/run 의 paramsJson({@code {"이름":"값"}})을 읽는다. 비어 있으면 값 없음. 값은 글자·숫자·불리언 스칼라만 받아 글자로 바꾸고
     * (JSON null 은 값 없음), 배열·객체는 거절한다. 전체 길이는 {@value #VALUES_JSON_MAX}자 이하.
     * 선언되지 않은 이름은 여기서 거르지 않는다 — {@link #resolve} 가 SQL 이 쓰는 선언 이름만 읽으므로 SQL 에 쓰이지 않는다.
     */
    public static Map<String, String> parseValues(String paramsJson) {
        if (paramsJson == null || paramsJson.isBlank()) return Map.of();
        if (paramsJson.length() > VALUES_JSON_MAX) throw invalid("입력 조건 값이 너무 깁니다.");
        JsonNode node;
        try {
            node = JSON.readTree(paramsJson);
        } catch (JsonProcessingException e) {
            throw invalid("입력 조건 값(paramsJson)이 올바른 JSON 이 아닙니다.");
        }
        if (node == null || node.isNull() || node.isMissingNode()) return Map.of();
        if (!node.isObject()) throw invalid("입력 조건 값(paramsJson)은 {\"이름\":\"값\"} 모양의 JSON 객체여야 합니다.");
        Map<String, String> values = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> {
            JsonNode v = entry.getValue();
            if (v == null || v.isNull()) return;
            if (!v.isTextual() && !v.isNumber() && !v.isBoolean()) {
                throw invalid("입력 조건 :" + shorten(entry.getKey()) + " 의 값은 문자·숫자·참거짓 하나여야 합니다.");
            }
            values.put(entry.getKey(), v.asText());
        });
        return values;
    }

    /**
     * SQL 이 쓰는 사용자 입력 조건(usedNames)의 값을 해석한다. given 에 키가 없으면(JSON null 도 같다) 기본값, 그래도 없거나 키는 있는데
     * 값이 비었으면(공백만 포함) 값 없음 — 필수면 거절·아니면 형을 붙인 null. 선언되지 않은 이름의 given 은 읽지 않는다. lenient(관리자 미리보기)면 필수 누락도 거절하지 않고 null 로 둔다.
     *
     * @return 이름 → 해석한 바인드 값(usedNames 순서)
     */
    public static Map<String, Bound> resolve(List<QueryParam> defs, Collection<String> usedNames,
                                             Map<String, String> given, boolean lenient) {
        Map<String, QueryParam> byName = new LinkedHashMap<>();
        for (QueryParam p : defs) byName.put(p.name(), p);
        Map<String, String> raw = given == null ? Map.of() : given;
        Map<String, Bound> bound = new LinkedHashMap<>();
        for (String name : usedNames) {
            QueryParam p = byName.get(name);
            if (p == null) throw invalid("SQL 의 :" + name + " 조건이 정의에 선언되어 있지 않습니다.");
            // 기본값은 키가 없을 때만 쓴다. 키가 있고 값이 비면(공백만 포함) 값 없음 — 필수면 거절, 아니면 형 붙은 null(전체 조회용).
            String value = raw.get(name);
            if (value == null) value = p.defaultValue();
            int sqlType = sqlType(p);
            if (value == null || value.isBlank()) {
                if (p.required() && !lenient) {
                    throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력 조건 " + p.display() + " 의 값을 입력해 주세요.");
                }
                bound.put(name, new Bound(null, sqlType));
            } else {
                bound.put(name, new Bound(coerce(p, value), sqlType));
            }
        }
        return bound;
    }

    /** 바인드 형 — number 는 NUMERIC, 나머지는 VARCHAR(null 에도 붙인다). */
    static int sqlType(QueryParam p) {
        return p.type() == Type.NUMBER ? Types.NUMERIC : Types.VARCHAR;
    }

    /** 값 하나를 형에 맞게 해석한다(비어 있지 않은 값만). 실패하면 거절. 결과는 {@link BigDecimal} 또는 {@link String}. */
    static Object coerce(QueryParam p, String raw) {
        if (raw.length() > VALUE_MAX) throw invalid("입력 조건 " + p.display() + " 의 값은 " + VALUE_MAX + "자 이하여야 합니다.");
        if (raw.indexOf('\u0000') >= 0) throw invalid("입력 조건 " + p.display() + " 의 값에 쓸 수 없는 문자가 있습니다.");
        return switch (p.type()) {
            case TEXT -> raw;
            case NUMBER -> toNumber(p, raw.strip());
            case DATE -> toDate(p, raw.strip());
            case SELECT -> {
                String value = raw.strip();
                for (Option option : p.options()) {
                    if (option.value().equals(value)) yield option.value();
                }
                throw invalid("입력 조건 " + p.display() + " 의 값은 선택지 중 하나여야 합니다.");
            }
        };
    }

    /**
     * 숫자는 정규화해 바인드한다 — {@code 1.0}·{@code 1}·{@code 1E+1}·{@code 10} 이 같은 글자로 DB 에 가야 한다(캐시 키와 바인드 값이
     * 늘 같은 모양이어야 같은 캐시 항목이 다른 결과를 내지 않는다 — 십진수를 글자로 바인드하는 드라이버도 있다). 끝의 0 을 지우고, 지수 표기(scale&lt;0)는 정수로 편다.
     */
    private static BigDecimal toNumber(QueryParam p, String s) {
        BigDecimal parsed;
        try {
            parsed = new BigDecimal(s);
        } catch (NumberFormatException e) {
            throw invalid("입력 조건 " + p.display() + " 의 값은 숫자여야 합니다.");
        }
        // 자릿수를 펴기(setScale) 전에 지수 크기부터 막는다 — 1e999999999 를 펴면 메모리가 터진다.
        if (parsed.scale() > NUMBER_MAX_SCALE || parsed.scale() < -NUMBER_MAX_SCALE) throw tooBig(p);
        BigDecimal n = parsed.stripTrailingZeros();
        if (n.scale() < 0) n = n.setScale(0);
        if (n.precision() > NUMBER_MAX_PRECISION) throw tooBig(p);
        return n;
    }

    private static BusinessException tooBig(QueryParam p) {
        return invalid("입력 조건 " + p.display() + " 의 숫자가 너무 크거나 자릿수가 많습니다.");
    }

    /** yyyy-MM-dd 또는 yyyyMMdd → 실제 날짜인지 검사해 yyyyMMdd 글자(시스템 변수 :today 와 같은 형)로. */
    private static String toDate(QueryParam p, String s) {
        try {
            LocalDate date;
            if (DATE_DASH.matcher(s).matches()) date = LocalDate.parse(s, PARSE_DASH);
            else if (DATE_COMPACT.matcher(s).matches()) date = LocalDate.parse(s, PARSE_COMPACT);
            else throw new DateTimeParseException("형식", s, 0);
            return YMD.format(date);
        } catch (DateTimeParseException e) {
            throw invalid("입력 조건 " + p.display() + " 의 값은 yyyy-MM-dd 또는 yyyyMMdd 형식의 실제 날짜여야 합니다.");
        }
    }

    /** 사용자가 보낸 이름을 오류 문구에 되돌릴 때 길이를 자른다. */
    private static String shorten(String s) {
        return s.length() <= 30 ? s : s.substring(0, 30) + "…";
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || !v.isTextual() ? null : v.asText();
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
