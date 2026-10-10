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
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.TreeSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 쿼리 위젯 「입력 조건」 도우미 — 스펙 2026-10-02-widget-admin-generic 입력 조건. 보안 규칙:
 * <ul>
 *   <li>사용자가 보낸 값은 <b>바인드 변수로만</b> SQL 에 들어간다. 이 클래스는 SQL 글자를 만지지 않고, 값을 {@link BigDecimal}·{@link String}·null
 *       (스칼라)와, {@code multi} 조건에 한해 불변 글자 목록({@code List<String>})으로만 돌려준다. 목록은 {@code IN (:x)} 자리에서만
 *       쓰이도록 {@link SqlGuard} 가 막고, 빈 선택은 {@code [null]} 로 바꿔 {@code IN ()} 가 되지 않게 한다.</li>
 *   <li>정의({@code params})는 저장 때도 실행 때마다도 {@link #parse} 로 다시 검사한다(저장된 값을 믿지 않는다).</li>
 *   <li>값은 바인드되지만 값 안의 특수문자는 DB 가 쓰이는 자리대로 해석한다 — {@code LIKE} 의 {@code %}·{@code _} 와일드카드나 정규식 인자로 쓰면
 *       그대로 패턴으로 읽힌다(이스케이프하지 않는다. 와일드카드가 문제인 SQL 은 정의 작성자가 {@code ESCAPE} 등으로 다룬다).</li>
 *   <li>값은 모두 글자로 오며(200자 이하) 형별로 서버가 해석한다: text=그대로, number=BigDecimal, date=yyyyMMdd 로 정규화한 글자,
 *       select=선언된 선택지 중 하나. 해석에 실패하면 거절한다. 빈 값(공백만 포함)은 값이 없는 것이다 — 기본값 → 필수면 거절 → 형 붙은 null.</li>
 * </ul>
 */
public final class QueryParams {

    public static final int MAX_PARAMS = 10;
    /** 조건 하나가 SQL 에 노출하는 바인드 이름(name·toName·countName)을 합친 전체 상한. */
    public static final int MAX_BIND_NAMES = 20;
    /** multi 가 한 번에 고를 수 있는 개수 상한(Oracle {@code IN} 목록 1000 한도 아래). */
    public static final int MULTI_MAX = 100;
    public static final int SPAN_DAYS_LIMIT = 3660;
    public static final int VALUE_MAX = 200;
    public static final int LABEL_MAX = 50;
    public static final int OPTIONS_MAX = 50;
    /** widgetData/run 의 paramsJson 전체 길이 상한 — 원소 50자 × 100개가 5300자라 4000자로는 모자라 16000자(2차 스펙 §2.4). */
    public static final int VALUES_JSON_MAX = 16000;
    /** 미리보기가 받는 조건 정의 JSON 길이 상한(CONFIG_JSON 상한과 같다). */
    static final int DEFS_JSON_MAX = 200 * 1024;
    /** number 가 받는 유효 자릿수·소수 자릿수 상한 — {@code 1e999999999} 같은 값이 DB 까지 가지 않게. */
    static final int NUMBER_MAX_PRECISION = 38;
    static final int NUMBER_MAX_SCALE = 38;

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final Pattern NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,29}$");
    private static final Pattern CODE_GROUP = Pattern.compile("^[A-Z][A-Z0-9_]{1,49}$");
    private static final Pattern RELATIVE = Pattern.compile("^([+-]?)([0-9]{1,3})([dwMy])$");
    /** 상대 날짜 낱말이 문법에 맞는지만 볼 때 쓰는 기준일(결과는 기준일과 무관하게 늘 풀린다). */
    private static final LocalDate PROBE_DAY = LocalDate.of(2000, 1, 1);
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
     * 해석을 마친 바인드 값 하나. value 는 {@link BigDecimal}(number·multi 의 개수)·{@link String}(그 밖)·null(값 없음)·
     * {@code List<String>}(multi 의 글자 목록, 비었으면 원소 하나짜리 {@code [null]}). sqlType 은 null·목록 원소에도 붙일 형
     * ({@link Types#NUMERIC} 또는 {@link Types#VARCHAR}).
     */
    public record Bound(Object value, int sqlType) {

        /** 캐시 키에 넣을 값 — 바인드 값과 같다(number 는 {@link QueryParams#coerce} 에서, multi 는 정규화 때 이미 불변 목록이다). */
        public Object cacheValue() {
            return value;
        }
    }

    private QueryParams() {}

    // ── 정의 파싱·검사 ───────────────────────────────────────────────

    /**
     * CONFIG_JSON 의 {@code params} 를 읽어 검사한다. 없거나 null 이면 빈 목록. 어기면 {@code BusinessException(INVALID_VALUE)} 한국어 한 문장.
     * 검사: 배열·개수(10)·바인드 이름 전체(20)·이름 형식·시스템 변수 이름·중복(대소문자 구분)·형·label(50자)·default(글자·200자·형 일치)·선택지.
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
            // name·toName·countName 은 같은 집합에서 겹치지 않아야 한다 — SQL 의 :이름 하나가 두 칸을 가리키면 안 된다.
            for (String bindName : param.bindNames()) {
                if (!names.add(bindName)) throw invalid("입력 조건 이름이 겹칩니다: :" + bindName);
            }
            result.add(param);
        }
        if (names.size() > MAX_BIND_NAMES) throw invalid("입력 조건이 SQL 에 쓰는 이름은 최대 " + MAX_BIND_NAMES + "개까지 정할 수 있습니다.");
        return List.copyOf(result);
    }

    private static QueryParam parseOne(JsonNode item) {
        String name = bindName(textOrNull(item, "name"), null);
        Type type = Type.of(textOrNull(item, "type"));
        if (type == null) {
            throw invalid("입력 조건 :" + name + " 의 형(type)은 text·number·date·select·daterange·multi 중 하나여야 합니다.");
        }

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

        boolean listed = type == Type.SELECT || type == Type.MULTI;
        String codeGroup = listed ? parseCodeGroup(name, item.get("codeGroup")) : null;
        List<Option> options = List.of();
        if (listed) {
            JsonNode optionNode = item.get("options");
            boolean hasOptions = optionNode != null && !optionNode.isNull() && !(optionNode.isArray() && optionNode.isEmpty());
            if (codeGroup != null && hasOptions) throw invalid("입력 조건 :" + name + " 은(는) 선택지(options)와 코드 그룹(codeGroup)을 함께 쓸 수 없습니다.");
            if (codeGroup == null) options = parseOptions(name, optionNode, type);
        }

        String toName = null;
        String toDefault = null;
        Integer maxSpanDays = null;
        if (type == Type.DATERANGE) {
            toName = bindName(textOrNull(item, "toName"), name);
            toDefault = parseDefaultText(name, "toDefault", item.get("toDefault"));
            maxSpanDays = parseMaxSpan(name, item.get("maxSpanDays"));
        }
        String countName = null;
        if (type == Type.MULTI) {
            String rawCount = textOrNull(item, "countName");
            if (rawCount != null && !rawCount.isBlank()) countName = bindName(rawCount, name);
        }

        String defaultValue = parseDefaultText(name, "default", item.get("default"));
        QueryParam param = new QueryParam(name, label, type, defaultValue, required, options, codeGroup, toName, toDefault,
                maxSpanDays, countName);
        // 기본값이 형·선택지에 맞는지 같은 해석 규칙으로 본다(코드 그룹 항목은 lookup 이 있는 저장 때 {@link #requireCodeGroups} 가 본다).
        if (defaultValue != null) checkDefault(param, defaultValue, false);
        if (toDefault != null) checkDefault(param, toDefault, true);
        return param;
    }

    /** 바인드 이름 하나 — 형식·시스템 변수 이름·(있으면) 다른 이름과 같지 않음을 본다. */
    private static String bindName(String name, String other) {
        if (name == null || !NAME.matcher(name).matches()) {
            throw invalid("입력 조건 이름은 영문자로 시작하는 영문·숫자·밑줄 30자 이하여야 합니다: " + name);
        }
        if (SqlGuard.SYSTEM_VARIABLES.contains(name)) {
            throw invalid("입력 조건 이름 :" + name + " 은(는) 시스템 변수 이름과 같아 쓸 수 없습니다.");
        }
        if (name.equals(other)) throw invalid("입력 조건 이름이 겹칩니다: :" + name);
        return name;
    }

    private static String parseCodeGroup(String name, JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (!node.isTextual() || !CODE_GROUP.matcher(node.asText()).matches()) {
            throw invalid("입력 조건 :" + name + " 의 코드 그룹(codeGroup)은 영문 대문자로 시작하는 대문자·숫자·밑줄 2~50자여야 합니다.");
        }
        return node.asText();
    }

    private static Integer parseMaxSpan(String name, JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (!node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 1 || node.asInt() > SPAN_DAYS_LIMIT) {
            throw invalid("입력 조건 :" + name + " 의 최대 일수(maxSpanDays)는 1~" + SPAN_DAYS_LIMIT + " 사이 정수여야 합니다.");
        }
        return node.asInt();
    }

    /** default·toDefault 칸 — 글자·200자 이하, 공백만이면 없음. */
    private static String parseDefaultText(String name, String field, JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (!node.isTextual()) throw invalid("입력 조건 :" + name + " 의 기본값(" + field + ")은 문자열이어야 합니다.");
        if (node.asText().length() > VALUE_MAX) {
            throw invalid("입력 조건 :" + name + " 의 기본값(" + field + ")은 " + VALUE_MAX + "자 이하여야 합니다.");
        }
        return node.asText().isBlank() ? null : node.asText();
    }

    private static List<Option> parseOptions(String name, JsonNode node, Type type) {
        if (node == null || !node.isArray() || node.isEmpty()) {
            throw invalid("입력 조건 :" + name + " 은(는) " + type.name().toLowerCase(Locale.ROOT)
                    + " 형이라 선택지(options) 또는 코드 그룹(codeGroup)이 있어야 합니다.");
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

    /** 정의의 바인드 이름 전체(name·toName·countName) — SqlGuard 에 넘길 선언 이름. */
    public static Set<String> names(Collection<QueryParam> params) {
        Set<String> names = new LinkedHashSet<>();
        for (QueryParam p : params) names.addAll(p.bindNames());
        return names;
    }

    /** multi 조건 이름 — SqlGuard 가 {@code IN (:x)} 자리에서만 쓰게 제한할 이름. */
    public static Set<String> listNames(Collection<QueryParam> params) {
        Set<String> names = new LinkedHashSet<>();
        for (QueryParam p : params) {
            if (p.type() == Type.MULTI) names.add(p.name());
        }
        return names;
    }

    /**
     * 저장할 때 코드 그룹을 확인한다 — 그룹이 있고 사용 중인지, 기본값이 그룹 항목에 있는지. 실행 때는 보낸 값이 항목에 있는지만 본다
     * ({@link #resolve}). lookup 이 null 이면 codeGroup 이 있는 조건은 거절한다.
     */
    public static void requireCodeGroups(Collection<QueryParam> params, QueryCodeLookup lookup) {
        for (QueryParam p : params) {
            if (p.codeGroup() == null) continue;
            if (lookup == null || !lookup.groupExists(p.codeGroup())) {
                throw invalid("입력 조건 " + p.display() + " 의 코드 그룹을 찾을 수 없습니다: " + p.codeGroup());
            }
            if (p.defaultValue() != null) checkDefault(p, p.defaultValue(), false, lookup);
        }
    }

    // ── 값 해석 ──────────────────────────────────────────────────────

    /**
     * widgetData/run 의 paramsJson({@code {"이름":"값"}})을 읽는다. 비어 있으면 값 없음. 값은 글자·숫자·불리언 스칼라를 글자로 바꾸고
     * (JSON null 은 값 없음), 글자만 든 배열은 {@code List<String>}(최대 {@value #MULTI_MAX}개, 빈 배열은 「고른 것 없음」 — 기본값을 쓰지 않는다)으로 받는다.
     * 객체·숫자 배열은 거절한다. 배열이 맞는 자리(multi 이름)인지는 {@link #resolve} 가 정의로 판정한다.
     * 전체 길이는 {@value #VALUES_JSON_MAX}자 이하. 선언되지 않은 이름은 여기서 거르지 않는다 — {@link #resolve} 가 SQL 이
     * 쓰는 선언 이름만 읽으므로 SQL 에 쓰이지 않는다.
     */
    public static Map<String, Object> parseValues(String paramsJson) {
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
        Map<String, Object> values = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> {
            JsonNode v = entry.getValue();
            if (v == null || v.isNull()) return;
            if (v.isArray()) {
                values.put(entry.getKey(), toList(entry.getKey(), v));
                return;
            }
            if (!v.isTextual() && !v.isNumber() && !v.isBoolean()) {
                throw invalid("입력 조건 :" + shorten(entry.getKey()) + " 의 값은 문자·숫자·참거짓 하나이거나 글자 목록이어야 합니다.");
            }
            values.put(entry.getKey(), v.asText());
        });
        return values;
    }

    private static List<String> toList(String key, JsonNode array) {
        if (array.size() > MULTI_MAX) {
            throw invalid("입력 조건 :" + shorten(key) + " 의 목록은 " + MULTI_MAX + "개까지 보낼 수 있습니다.");
        }
        List<String> list = new ArrayList<>(array.size());
        for (JsonNode element : array) {
            if (!element.isTextual()) throw invalid("입력 조건 :" + shorten(key) + " 의 목록 원소는 글자여야 합니다.");
            list.add(element.asText());
        }
        return list;
    }

    /** 4인자 호환판 — 기준일은 Asia/Seoul 의 오늘, 코드 조회 없음. */
    public static Map<String, Bound> resolve(List<QueryParam> defs, Collection<String> usedNames,
                                             Map<String, ?> given, boolean lenient) {
        return resolve(defs, usedNames, given, lenient, LocalDate.now(ZONE), null);
    }

    /**
     * SQL 이 쓰는 사용자 입력 조건(usedNames)의 값을 해석한다. given 에 키가 없으면(JSON null 도 같다) 기본값, 그래도 없거나 키는 있는데
     * 값이 비었으면(공백만 포함) 값 없음 — 필수면 거절·아니면 형을 붙인 null. 선언되지 않은 이름의 given 은 읽지 않는다. lenient(관리자 미리보기)면 필수 누락도 거절하지 않고 null 로 둔다.
     * <ul>
     *   <li>daterange·multi 는 이름 하나로 쓰여도 짝(toName·countName)을 함께 해석해 돌려준다. countName·toName 키를 given 에서 읽는 것은
     *       toName(끝 날짜)뿐이고 countName 은 서버가 계산한다 — 요청이 보낸 countName 값은 읽지 않는다.</li>
     *   <li>기본값의 상대 날짜 낱말은 today(Asia/Seoul 달력의 오늘)로 풀고, 사용자가 보낸 값은 절대 날짜만 받는다.</li>
     *   <li>codeGroup 조건의 값은 lookup 항목에 있어야 한다(lookup 이 null 이면 값이 있는 한 거절 — 실패 닫힘).</li>
     * </ul>
     *
     * @return 이름 → 해석한 바인드 값(처음 쓰인 순서)
     */
    public static Map<String, Bound> resolve(List<QueryParam> defs, Collection<String> usedNames, Map<String, ?> given,
                                             boolean lenient, LocalDate today, QueryCodeLookup lookup) {
        Map<String, QueryParam> owners = new LinkedHashMap<>();
        for (QueryParam p : defs) {
            for (String bindName : p.bindNames()) owners.put(bindName, p);
        }
        Map<String, ?> raw = given == null ? Map.of() : given;
        Map<String, Bound> bound = new LinkedHashMap<>();
        Set<QueryParam> done = new HashSet<>();
        for (String name : usedNames) {
            QueryParam p = owners.get(name);
            if (p == null) throw invalid("SQL 의 :" + name + " 조건이 정의에 선언되어 있지 않습니다.");
            if (!done.add(p)) continue;
            switch (p.type()) {
                case DATERANGE -> resolveRange(p, raw, lenient, today, bound);
                case MULTI -> resolveMulti(p, raw, lenient, lookup, bound);
                default -> resolveScalar(p, raw, lenient, today, lookup, bound);
            }
        }
        return bound;
    }

    private static void resolveScalar(QueryParam p, Map<String, ?> raw, boolean lenient, LocalDate today, QueryCodeLookup lookup,
                                      Map<String, Bound> bound) {
        // 기본값은 키가 없을 때만 쓴다. 키가 있고 값이 비면(공백만 포함) 값 없음 — 필수면 거절, 아니면 형 붙은 null(전체 조회용).
        Object given = raw.get(p.name());
        boolean fromDefault = given == null;
        String value = fromDefault ? p.defaultValue() : scalarText(p, given);
        int sqlType = sqlType(p);
        if (value == null || value.isBlank()) {
            if (p.required() && !lenient) throw required(p);
            bound.put(p.name(), new Bound(null, sqlType));
        } else {
            bound.put(p.name(), new Bound(coerce(p, value, fromDefault, today, lookup), sqlType));
        }
    }

    private static void resolveRange(QueryParam p, Map<String, ?> raw, boolean lenient, LocalDate today, Map<String, Bound> bound) {
        Object givenFrom = raw.get(p.name());
        Object givenTo = raw.get(p.toName());
        String from = stripOrNull(givenFrom == null ? p.defaultValue() : scalarText(p, givenFrom));
        String to = stripOrNull(givenTo == null ? p.toDefault() : scalarText(p, givenTo));
        boolean hasFrom = from != null && !from.isBlank();
        boolean hasTo = to != null && !to.isBlank();
        if (!hasFrom && !hasTo) {
            // maxSpanDays 가 있으면 양끝을 비워 상한을 피할 수 없도록 필수처럼 다룬다.
            if ((p.required() || p.maxSpanDays() != null) && !lenient) throw required(p);
            bound.put(p.name(), new Bound(null, Types.VARCHAR));
            bound.put(p.toName(), new Bound(null, Types.VARCHAR));
            return;
        }
        if (!hasFrom || !hasTo) {
            if (lenient) {
                bound.put(p.name(), new Bound(hasFrom ? dateOf(p, from, givenFrom == null, today) : null, Types.VARCHAR));
                bound.put(p.toName(), new Bound(hasTo ? dateOf(p, to, givenTo == null, today) : null, Types.VARCHAR));
                return;
            }
            throw invalid("입력 조건 " + p.display() + " 은(는) 시작 날짜와 끝 날짜를 함께 입력해야 합니다.");
        }
        LocalDate start = dateOfLocal(p, from, givenFrom == null, today);
        LocalDate end = dateOfLocal(p, to, givenTo == null, today);
        if (start.isAfter(end)) throw invalid("입력 조건 " + p.display() + " 의 시작 날짜가 끝 날짜보다 늦습니다.");
        // 시작·끝을 모두 포함한 일수 — 10-01 ~ 10-31 은 31일이다. Period 는 년·월·일로 나뉘므로 일수는 toEpochDay 차이로 센다.
        if (p.maxSpanDays() != null && end.toEpochDay() - start.toEpochDay() + 1 > p.maxSpanDays()) {
            throw invalid("입력 조건 " + p.display() + " 의 기간은 " + p.maxSpanDays() + "일 이하여야 합니다.");
        }
        bound.put(p.name(), new Bound(YMD.format(start), Types.VARCHAR));
        bound.put(p.toName(), new Bound(YMD.format(end), Types.VARCHAR));
    }

    private static String stripOrNull(String text) {
        return text == null ? null : text.strip();
    }

    private static void resolveMulti(QueryParam p, Map<String, ?> raw, boolean lenient, QueryCodeLookup lookup, Map<String, Bound> bound) {
        Object given = raw.get(p.name());
        List<String> picked;
        if (given == null) {
            picked = splitDefault(p.defaultValue());
        } else if (given instanceof List<?> list) {
            picked = new ArrayList<>(list.size());
            for (Object element : list) {
                if (!(element instanceof String text)) throw invalid("입력 조건 " + p.display() + " 의 목록 원소는 글자여야 합니다.");
                picked.add(text);
            }
        } else {
            throw invalid("입력 조건 " + p.display() + " 의 값은 글자 목록이어야 합니다.");
        }
        List<String> values = normalizeList(p, picked, lookup);
        if (values.isEmpty() && p.required() && !lenient) throw required(p);
        // 빈 목록은 바인드하지 않는다(펼치면 IN () 가 된다) — 원소 하나짜리 [null] 은 IN (NULL) 이라 아무 행도 고르지 않는다.
        List<String> bindValue = values.isEmpty() ? Collections.singletonList(null) : values;
        bound.put(p.name(), new Bound(bindValue, Types.VARCHAR));
        if (p.countName() != null) bound.put(p.countName(), new Bound(BigDecimal.valueOf(values.size()), Types.NUMERIC));
    }

    /** multi 기본값 — 쉼표로 나눈 글자. */
    private static List<String> splitDefault(String defaultValue) {
        if (defaultValue == null || defaultValue.isBlank()) return List.of();
        return List.of(defaultValue.split(",", -1));
    }

    /** 앞뒤 공백 지움 → 빈 값 버림 → 중복 제거 → 사전순 정렬. 같은 선택이 같은 캐시 키가 된다. 개수·길이·NUL·선택지 확인. */
    private static List<String> normalizeList(QueryParam p, List<String> picked, QueryCodeLookup lookup) {
        if (picked.size() > MULTI_MAX) throw invalid("입력 조건 " + p.display() + " 은(는) " + MULTI_MAX + "개까지 고를 수 있습니다.");
        TreeSet<String> unique = new TreeSet<>();
        for (String text : picked) {
            if (text.length() > VALUE_MAX) throw invalid("입력 조건 " + p.display() + " 의 값은 " + VALUE_MAX + "자 이하여야 합니다.");
            if (text.indexOf('\u0000') >= 0) throw invalid("입력 조건 " + p.display() + " 의 값에 쓸 수 없는 문자가 있습니다.");
            String value = text.strip();
            if (!value.isEmpty()) unique.add(value);
        }
        Set<String> allowed = allowedValues(p, lookup);
        for (String value : unique) {
            if (!allowed.contains(value)) throw invalid("입력 조건 " + p.display() + " 의 값은 선택지 중 하나여야 합니다.");
        }
        return Collections.unmodifiableList(new ArrayList<>(unique));
    }

    /** 고를 수 있는 값 — 고정 선택지 또는 코드 그룹 항목. 어느 쪽도 못 읽으면 빈 집합(모든 값 거절). */
    private static Set<String> allowedValues(QueryParam p, QueryCodeLookup lookup) {
        if (p.codeGroup() != null) {
            Set<String> items = lookup == null ? null : lookup.items(p.codeGroup());
            return items == null ? Set.of() : items;
        }
        Set<String> values = new HashSet<>();
        for (Option option : p.options()) values.add(option.value());
        return values;
    }

    private static String scalarText(QueryParam p, Object given) {
        if (given instanceof String text) return text;
        throw invalid("입력 조건 " + p.display() + " 의 값은 글자 하나여야 합니다.");
    }

    private static BusinessException required(QueryParam p) {
        return new BusinessException(ErrorCode.REQUIRED_VALUE, "입력 조건 " + p.display() + " 의 값을 입력해 주세요.");
    }

    /** 바인드 형 — number 는 NUMERIC, 나머지는 VARCHAR(null 에도 붙인다). */
    static int sqlType(QueryParam p) {
        return p.type() == Type.NUMBER ? Types.NUMERIC : Types.VARCHAR;
    }

    /** 값 하나를 형에 맞게 해석한다(비어 있지 않은 값만, 상대 날짜 낱말 없음·코드 조회 없음). 실패하면 거절. 결과는 {@link BigDecimal} 또는 {@link String}. */
    static Object coerce(QueryParam p, String raw) {
        return coerce(p, raw, false, LocalDate.now(ZONE), null);
    }

    private static Object coerce(QueryParam p, String raw, boolean isDefault, LocalDate today, QueryCodeLookup lookup) {
        if (raw.length() > VALUE_MAX) throw invalid("입력 조건 " + p.display() + " 의 값은 " + VALUE_MAX + "자 이하여야 합니다.");
        if (raw.indexOf('\u0000') >= 0) throw invalid("입력 조건 " + p.display() + " 의 값에 쓸 수 없는 문자가 있습니다.");
        return switch (p.type()) {
            case TEXT -> raw;
            case NUMBER -> toNumber(p, raw.strip());
            case DATE -> dateOf(p, raw.strip(), isDefault, today);
            case SELECT -> {
                String value = raw.strip();
                if (!allowedValues(p, lookup).contains(value)) throw invalid("입력 조건 " + p.display() + " 의 값은 선택지 중 하나여야 합니다.");
                yield value;
            }
            case DATERANGE, MULTI -> throw new IllegalStateException("날짜 기간·다중 선택은 resolve 가 해석한다: " + p.type());
        };
    }

    /** 정의 저장 때 기본값 검사 — 형·선택지·상대 날짜 문법. 코드 그룹 항목은 lookup 이 있을 때만 본다. */
    private static void checkDefault(QueryParam p, String value, boolean rangeEnd) {
        checkDefault(p, value, rangeEnd, null);
    }

    private static void checkDefault(QueryParam p, String value, boolean rangeEnd, QueryCodeLookup lookup) {
        boolean deferred = p.codeGroup() != null && lookup == null; // 코드 그룹 항목은 lookup 이 있는 저장 때 본다
        switch (p.type()) {
            case MULTI -> {
                List<String> picked = splitDefault(value);
                if (deferred) basicCheck(p, picked);
                else normalizeList(p, picked, lookup);
            }
            case SELECT -> {
                if (deferred) basicCheck(p, List.of(value));
                else coerce(p, value, true, PROBE_DAY, lookup);
            }
            case DATE, DATERANGE -> dateOf(p, value.strip(), true, PROBE_DAY);
            default -> coerce(p, value, true, PROBE_DAY, lookup);
        }
    }

    /** 항목 집합 없이 볼 수 있는 검사 — 개수·길이·NUL. */
    private static void basicCheck(QueryParam p, List<String> picked) {
        if (picked.size() > MULTI_MAX) throw invalid("입력 조건 " + p.display() + " 은(는) " + MULTI_MAX + "개까지 고를 수 있습니다.");
        for (String text : picked) {
            if (text.length() > VALUE_MAX) throw invalid("입력 조건 " + p.display() + " 의 값은 " + VALUE_MAX + "자 이하여야 합니다.");
            if (text.indexOf('\u0000') >= 0) throw invalid("입력 조건 " + p.display() + " 의 값에 쓸 수 없는 문자가 있습니다.");
        }
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

    /** 기본값이면 상대 날짜 낱말도, 아니면 절대 날짜만 받아 yyyyMMdd 글자(시스템 변수 :today 와 같은 형)로. */
    private static String dateOf(QueryParam p, String s, boolean isDefault, LocalDate today) {
        return YMD.format(dateOfLocal(p, s, isDefault, today));
    }

    private static LocalDate dateOfLocal(QueryParam p, String s, boolean isDefault, LocalDate today) {
        if (isDefault) {
            LocalDate relative = relativeDate(s, today);
            if (relative != null) return relative;
        }
        return toDate(p, s);
    }

    /**
     * 상대 날짜 낱말을 today 기준 날짜로 푼다. 낱말이 아니면 null. 문법: {@code ^[+-]?\d{1,3}[dwMy]$}(일·주·달·해) 또는
     * {@code monthStart}·{@code monthEnd}·{@code prevMonthStart}·{@code prevMonthEnd}·{@code yearStart}. 달·해는 그 달 마지막 날로 맞춘다
     * ({@code LocalDate.plusMonths} 규칙). 결과 연도가 1~9999 밖이면 거절한다.
     */
    public static LocalDate relativeDate(String word, LocalDate today) {
        LocalDate result = switch (word) {
            case "monthStart" -> today.withDayOfMonth(1);
            case "monthEnd" -> today.withDayOfMonth(today.lengthOfMonth());
            case "prevMonthStart" -> today.minusMonths(1).withDayOfMonth(1);
            case "prevMonthEnd" -> today.withDayOfMonth(1).minusDays(1);
            case "yearStart" -> today.withDayOfYear(1);
            default -> {
                Matcher m = RELATIVE.matcher(word);
                if (!m.matches()) yield null;
                int amount = Integer.parseInt(m.group(2)) * ("-".equals(m.group(1)) ? -1 : 1);
                yield switch (m.group(3)) {
                    case "d" -> today.plusDays(amount);
                    case "w" -> today.plusWeeks(amount);
                    case "M" -> today.plusMonths(amount);
                    default -> today.plusYears(amount);
                };
            }
        };
        if (result != null && (result.getYear() < 1 || result.getYear() > 9999)) throw invalid("상대 날짜가 표현할 수 있는 범위를 벗어납니다: " + word);
        return result;
    }

    /** yyyy-MM-dd 또는 yyyyMMdd → 실제 날짜인지 검사해 날짜로. */
    private static LocalDate toDate(QueryParam p, String s) {
        try {
            if (DATE_DASH.matcher(s).matches()) return LocalDate.parse(s, PARSE_DASH);
            if (DATE_COMPACT.matcher(s).matches()) return LocalDate.parse(s, PARSE_COMPACT);
            throw new DateTimeParseException("형식", s, 0);
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
