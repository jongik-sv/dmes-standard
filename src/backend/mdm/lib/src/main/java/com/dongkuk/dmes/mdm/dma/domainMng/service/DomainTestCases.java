package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code TEST_CASES}·{@code EXAMPLES} JSON ↔ 화면 grid 행 변환(TSK-04-03 design D4). grid 행은
 * {@code [{VALUE, EXPECT, VARS(JSON 문자열), MEMO}]}, 예시 값 grid 는 {@code [{VALUE}]}.
 */
public final class DomainTestCases {

    private DomainTestCases() {}

    /** 화면 grid 행 → 케이스. 모양이 틀린 행은 {@code problem} 을 채워 둔다(S06). */
    public static List<DomainTestCase> fromRows(List<Map<String, Object>> rows) {
        List<DomainTestCase> out = new ArrayList<>();
        if (rows == null) {
            return out;
        }
        for (Map<String, Object> row : rows) {
            out.add(fromMap(get(row, "VALUE", "value"), get(row, "EXPECT", "expect"), get(row, "VARS", "vars"),
                    get(row, "MEMO", "memo")));
        }
        return out;
    }

    /** 저장된 JSON → 케이스. 숫자 값은 {@code toString} 그대로 문자열로 읽는다. */
    public static List<DomainTestCase> fromJson(String json) {
        List<DomainTestCase> out = new ArrayList<>();
        for (Object o : DomainJson.readList(json)) {
            if (o instanceof Map<?, ?> m) {
                out.add(fromMap(m.get("value"), m.get("expect"), m.get("vars"), m.get("memo")));
            }
        }
        return out;
    }

    /** 케이스 → 저장 JSON. 비었으면 null. vars·memo 는 있을 때만 쓴다. */
    public static String toJson(List<DomainTestCase> cases) {
        if (cases == null || cases.isEmpty()) {
            return null;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (DomainTestCase c : cases) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("value", c.value());
            m.put("expect", c.expect());
            if (c.vars() != null && !c.vars().isEmpty()) {
                m.put("vars", c.vars());
            }
            if (c.memo() != null) {
                m.put("memo", c.memo());
            }
            out.add(m);
        }
        return DomainJson.write(out);
    }

    /** 케이스 → 화면 grid 행. */
    public static List<Map<String, Object>> toRows(List<DomainTestCase> cases) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (DomainTestCase c : cases) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("VALUE", c.value());
            m.put("EXPECT", c.expect());
            m.put("VARS", c.vars() == null || c.vars().isEmpty() ? null : DomainJson.write(c.vars()));
            m.put("MEMO", c.memo());
            out.add(m);
        }
        return out;
    }

    public static List<String> examplesFromRows(List<Map<String, Object>> rows) {
        List<String> out = new ArrayList<>();
        if (rows == null) {
            return out;
        }
        for (Map<String, Object> row : rows) {
            Object v = get(row, "VALUE", "value");
            if (v != null && !v.toString().isBlank()) {
                out.add(v.toString().trim());
            }
        }
        return out;
    }

    public static List<String> examplesFromJson(String json) {
        return DomainJson.readList(json).stream().filter(o -> o != null).map(Object::toString).toList();
    }

    public static String examplesToJson(List<String> examples) {
        return examples == null || examples.isEmpty() ? null : DomainJson.write(examples);
    }

    private static DomainTestCase fromMap(Object value, Object expect, Object vars, Object memo) {
        List<String> problems = new ArrayList<>();
        String text = value == null ? null : value.toString();
        if (text == null || text.isBlank()) {
            problems.add("입력값이 비었다");
        }
        Boolean exp = null;
        if (expect instanceof Boolean b) {
            exp = b;
        } else if ("true".equalsIgnoreCase(String.valueOf(expect)) || "false".equalsIgnoreCase(String.valueOf(expect))) {
            exp = Boolean.parseBoolean(String.valueOf(expect));
        } else {
            problems.add("기대값은 true/false 여야 한다: " + expect);
        }
        Map<String, Object> varMap = new LinkedHashMap<>();
        if (vars instanceof Map<?, ?> m) {
            m.forEach((k, v) -> varMap.put(String.valueOf(k), v));
        } else if (vars instanceof String s && !s.isBlank()) {
            try {
                Map<String, Object> parsed = DomainJson.readMap(s);
                if (parsed != null) {
                    varMap.putAll(parsed);
                }
            } catch (IllegalArgumentException e) {
                problems.add("변수는 JSON 객체여야 한다: " + s);
            }
        }
        String memoText = memo == null || memo.toString().isBlank() ? null : memo.toString();
        return new DomainTestCase(text, exp, varMap, memoText, problems.isEmpty() ? null : String.join("; ", problems));
    }

    private static Object get(Map<String, Object> row, String upper, String lower) {
        return row.containsKey(upper) ? row.get(upper) : row.get(lower);
    }
}
