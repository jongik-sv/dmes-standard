package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.entity.MdmRuleTestCase;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleResult;

/**
 * 테스트 케이스 판정(TSK-08-05 design §6.4, D6) — 값 테스트({@code RuleValueTestService}, TSK-08-04)에서 옮긴 순수 코드. 값 테스트와 룰 버전
 * 확정 검사(TEST_CASES)가 같은 판정 코드를 부른다(I8). 옮기면서 동작을 바꾸지 않았다(I9).
 */
public final class RuleCaseJudge {

    public static final String HIT_KEY = "hit";

    private static final ObjectMapper INPUT = new ObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);
    private static final Pattern NUMBER_TEXT = Pattern.compile("^[+-]?\\d+(\\.\\d+)?$");

    private RuleCaseJudge() {
    }

    public record Evaluated(RuleResult result, List<Map<String, Object>> errors) {
        public boolean ok() {
            return result != null;
        }
    }

    /** JSON 객체면 맵, 아니면 null. */
    public static Map<String, Object> object(String json) {
        try {
            Object v = INPUT.readValue(json, Object.class);
            if (v instanceof Map<?, ?> m) {
                return INPUT.convertValue(m, new TypeReference<LinkedHashMap<String, Object>>() {});
            }
            return null;
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ 판정

    public static Evaluated evaluate(MdmRuleEngine engine, String ruleId, Map<String, Object> input, Instant ts) {
        try {
            return new Evaluated(engine.evaluate(ruleId, input, ts), null);
        } catch (EngineEvaluationException e) {
            return new Evaluated(null, e.violations().stream().map(RuleCaseJudge::error).toList());
        }
    }

    public static Map<String, Object> runCase(MdmRuleEngine engine, String ruleId, MdmRuleTestCase c, Instant ts, Integer defaultRowId) {
        Map<String, Object> input = object(c.getInputJson());
        Evaluated e = input == null
                ? new Evaluated(null, List.of(error("INPUT_CHECK", "INVALID_INPUT_JSON", null, null, "케이스 입력이 JSON 객체가 아니다")))
                : evaluate(engine, ruleId, input, ts);
        Object hitValue = e.ok() ? hitValue(e.result(), defaultRowId) : null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("caseId", c.getCaseId());
        m.put("caseName", c.getCaseName());
        m.put("outcome", e.ok() ? "OK" : "ERROR");
        List<Map<String, Object>> mismatches = new ArrayList<>();
        m.put("pass", compare(c.getExpectedJson(), e, hitValue, mismatches));
        m.put("mismatches", mismatches);
        m.put("results", e.ok() ? results(e.result()) : null);
        m.put("hit", hitValue);
        m.put("errors", e.errors());
        return m;
    }

    // ------------------------------------------------------------------ 케이스 비교(I24, D12)

    /** hit 표현 — 적중 하나는 row_id, 여럿은 엔진 hits 순서의 배열, 기본 행 적용은 기본 행 row_id, 없음은 null. */
    public static Object hitValue(RuleResult r, Integer defaultRowId) {
        if (r.hits().size() == 1) {
            return r.hits().get(0).rowId();
        }
        if (r.hits().size() > 1) {
            return r.hits().stream().map(RuleResult.Hit::rowId).toList();
        }
        return r.defaultApplied() ? defaultRowId : null;
    }

    /**
     * 기대값이 없으면 null(돌려 보기만). 판정 오류면 false. 기대 JSON 의 키마다 — {@code hit} 은 hit 표현으로, 나머지는 결과 변수 값으로
     * 견준다. 엔진 결과는 결과 변수 타입으로 바뀌어 있으므로 그 값의 타입으로 비교한다(NUMBER 는 BigDecimal {@code compareTo}). 결과에 없는 키는
     * 실패다.
     */
    public static Boolean compare(String expectedJson, Evaluated e, Object hitValue, List<Map<String, Object>> mismatches) {
        if (expectedJson == null || expectedJson.isBlank()) {
            return null;
        }
        Map<String, Object> expected = object(expectedJson);
        if (expected == null) {
            mismatches.add(mismatch("(expected)", expectedJson, null));
            return false;
        }
        if (!e.ok()) {
            return false;
        }
        Map<String, Object> results = e.result().results();
        for (Map.Entry<String, Object> x : expected.entrySet()) {
            if (HIT_KEY.equals(x.getKey())) {
                if (!sameHit(x.getValue(), hitValue)) {
                    mismatches.add(mismatch(HIT_KEY, x.getValue(), hitValue));
                }
                continue;
            }
            String key = resultKey(results, x.getKey());
            if (key == null) {
                mismatches.add(mismatch(x.getKey(), x.getValue(), null));
                continue;
            }
            Object actual = results.get(key);
            if (!sameValue(x.getValue(), actual)) {
                mismatches.add(mismatch(x.getKey(), x.getValue(), value(actual)));
            }
        }
        return mismatches.isEmpty();
    }

    private static String resultKey(Map<String, Object> results, String key) {
        if (results.containsKey(key)) {
            return key;
        }
        return results.keySet().stream().filter(k -> k.equalsIgnoreCase(key)).findFirst().orElse(null);
    }

    public static boolean sameValue(Object expected, Object actual) {
        if (expected == null || actual == null) {
            return expected == null && actual == null;
        }
        if (actual instanceof List<?> list) {
            if (!(expected instanceof List<?> exp) || exp.size() != list.size()) {
                return false;
            }
            for (int i = 0; i < list.size(); i++) {
                if (!sameValue(exp.get(i), list.get(i))) {
                    return false;
                }
            }
            return true;
        }
        if (actual instanceof BigDecimal number) {
            BigDecimal exp = decimal(expected);
            return exp != null && exp.compareTo(number) == 0;
        }
        if (actual instanceof Boolean flag) {
            return expected instanceof Boolean b ? b.equals(flag)
                    : expected instanceof String text && text.trim().toUpperCase(Locale.ROOT).equals(flag ? "TRUE" : "FALSE");
        }
        return expected.toString().equals(actual.toString());
    }

    private static boolean sameHit(Object expected, Object actual) {
        if (expected == null || actual == null) {
            return expected == null && actual == null;
        }
        if (actual instanceof List<?> list) {
            if (!(expected instanceof List<?> exp) || exp.size() != list.size()) {
                return false;
            }
            for (int i = 0; i < list.size(); i++) {
                if (!sameHit(exp.get(i), list.get(i))) {
                    return false;
                }
            }
            return true;
        }
        BigDecimal exp = decimal(expected);
        return exp != null && !(expected instanceof List) && exp.compareTo(new BigDecimal(actual.toString())) == 0;
    }

    private static BigDecimal decimal(Object value) {
        if (value instanceof BigDecimal d) {
            return d;
        }
        if (value instanceof Number n) {
            return new BigDecimal(n.toString());
        }
        if (value instanceof String s && NUMBER_TEXT.matcher(s.trim()).matches()) {
            return new BigDecimal(s.trim());
        }
        return null;
    }

    private static Map<String, Object> mismatch(String key, Object expected, Object actual) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("expected", expected);
        m.put("actual", actual);
        return m;
    }

    // ------------------------------------------------------------------ 응답 모양

    public static Map<String, Object> results(RuleResult r) {
        Map<String, Object> out = new LinkedHashMap<>();
        r.results().forEach((k, v) -> out.put(k, value(v)));
        return out;
    }

    /** NUMBER 는 {@code toPlainString} 문자열, 목록은 원소마다. */
    public static Object value(Object v) {
        if (v instanceof BigDecimal d) {
            return d.toPlainString();
        }
        if (v instanceof List<?> list) {
            return list.stream().map(RuleCaseJudge::value).toList();
        }
        if (v == null || v instanceof Boolean || v instanceof String) {
            return v;
        }
        return v.toString();
    }

    private static Map<String, Object> error(Violation v) {
        return error(v.stage().name(), v.code().name(), v.rowId(), v.name(), v.message());
    }

    private static Map<String, Object> error(String stage, String code, Integer rowId, String name, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("stage", stage);
        m.put("code", code);
        m.put("rowId", rowId);
        m.put("name", name);
        m.put("message", message);
        return m;
    }
}
