package kr.dongkuk.maru.mdm.engine.corpus;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.config.FunctionDictionaryIfc;
import com.ezylang.evalex.config.MapBasedFunctionDictionary;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.FunctionIfc;
import com.ezylang.evalex.parser.ParseException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;

/**
 * 코퍼스 서버 러너의 하네스(TSK-03-04 design §6.11, D2). 교체 지점은 {@link #configuration} 하나다.
 *
 * <p>하네스가 엔진 동작을 대신 정하는 자리(예약 키·키 누락·값 변환·NA·오류 매핑)는 TSK-03-03 설계 §6.2·§6.7·§6.8 의 규칙을
 * 옮긴 거울이다. 03-03·03-02 가 머지되면 design §6.15 대로 실물로 바꾼다.
 */
final class CorpusEvalExHarness {

    /** 평가 결과 — {@code value}(TypedValue JSON) 또는 {@code error}(ErrorCode 이름) 중 하나. */
    record Outcome(JsonNode value, String error, String message) {

        static Outcome value(JsonNode v) {
            return new Outcome(v, null, null);
        }

        static Outcome error(Code code, String message) {
            return new Outcome(null, code.name(), message);
        }
    }

    private static final JsonNodeFactory JSON = JsonNodeFactory.instance;

    private CorpusEvalExHarness() {}

    /** 교체 지점 — TSK-03-02 가 MdmExpressionConfig.create 를 구현하면 이 몸체를 그 호출 한 줄로 바꾼다(D2). */
    @SuppressWarnings("unchecked")
    static ExpressionConfiguration configuration(Map<String, List<String>> codeSets) {
        FunctionDictionaryIfc std = ExpressionConfiguration.defaultConfiguration().getFunctionDictionary();
        List<Map.Entry<String, FunctionIfc>> fns = new ArrayList<>();
        for (String name : FunctionSets.BASE) {
            fns.add(Map.entry(name, std.getFunction(name)));
        }
        fns.add(Map.entry("INSTR", new CorpusFunctions.InstrStandIn()));
        fns.add(Map.entry("MASTER", new CorpusFunctions.MasterStandIn(codeSets)));
        return ExpressionConfiguration.builder()
                .mathContext(MdmExpressionConfig.MATH_CONTEXT)
                .zoneId(MdmExpressionConfig.ZONE)
                .locale(MdmExpressionConfig.LOCALE)
                .allowOverwriteConstants(MdmExpressionConfig.ALLOW_OVERWRITE_CONSTANTS)
                .lenientMode(MdmExpressionConfig.LENIENT_MODE)
                .regexTimeoutMillis(MdmExpressionConfig.REGEX_TIMEOUT_MILLIS)
                .maxRecursionDepth(MdmExpressionConfig.MAX_RECURSION_DEPTH)
                .arraysAllowed(MdmExpressionConfig.ARRAYS_ALLOWED)
                .structuresAllowed(MdmExpressionConfig.STRUCTURES_ALLOWED)
                .implicitMultiplicationAllowed(MdmExpressionConfig.IMPLICIT_MULTIPLICATION_ALLOWED)
                .singleQuoteStringLiteralsAllowed(MdmExpressionConfig.SINGLE_QUOTE_STRING_LITERALS_ALLOWED)
                .binaryAllowed(MdmExpressionConfig.BINARY_ALLOWED)
                .stripTrailingZeros(MdmExpressionConfig.STRIP_TRAILING_ZEROS)
                .decimalPlacesRounding(MdmExpressionConfig.DECIMAL_PLACES_ROUNDING)
                .functionDictionary(MapBasedFunctionDictionary.ofFunctions(fns.toArray(Map.Entry[]::new)))
                .build();
    }

    /** 사례의 {@code codeSets}(없으면 빈 맵). */
    static Map<String, List<String>> codeSets(JsonNode c) {
        Map<String, List<String>> sets = new HashMap<>();
        if (c.has("codeSets")) {
            c.get("codeSets").properties().forEach(e -> {
                List<String> codes = new ArrayList<>();
                e.getValue().forEach(n -> codes.add(n.asText()));
                sets.put(e.getKey(), codes);
            });
        }
        return sets;
    }

    // ------------------------------------------------------------------ 평가 절차(design §6.11)

    static Outcome evaluateExpr(JsonNode c) {
        Map<String, JsonNode> vars = new LinkedHashMap<>();
        c.get("vars").properties().forEach(e -> vars.put(e.getKey(), e.getValue()));
        Outcome reserved = checkRecordKeys(vars.keySet());
        if (reserved != null) {
            return reserved;
        }
        Expression expression = new Expression(c.get("expr").asText(), configuration(codeSets(c)));
        try {
            Set<String> present = new HashSet<>();
            vars.keySet().forEach(k -> present.add(k.toUpperCase(Locale.ROOT)));
            for (String used : expression.getUsedVariables()) {
                String upper = used.toUpperCase(Locale.ROOT);
                if (!ReservedNames.CONSTANTS.contains(upper) && !present.contains(upper)) {
                    return Outcome.error(Code.MISSING_KEY, used);
                }
            }
            for (Map.Entry<String, JsonNode> e : vars.entrySet()) {
                expression.with(e.getKey(), toJava(e.getValue()));
            }
            return Outcome.value(toTypedValue(expression.evaluate()));
        } catch (ParseException e) {
            throw new AssertionError("코퍼스 식이 파싱되지 않는다: " + c.get("expr").asText() + " — " + e.getMessage(), e);
        } catch (EvaluationException | RuntimeException e) {
            return Outcome.error(Code.EVALUATION_ERROR, e.toString());
        }
    }

    static Outcome evaluateCell(JsonNode c) {
        JsonNode var = c.get("variable");
        String name = var.get("name").asText();
        String dataType = var.get("dataType").asText();
        Outcome reserved = checkRecordKeys(List.of(name));
        if (reserved != null) {
            return reserved;
        }
        Object value;
        try {
            value = toDeclared(toJava(c.get("value")), dataType);
        } catch (IllegalArgumentException e) {
            return Outcome.error(Code.TYPE_CONVERSION, e.getMessage());
        }
        JsonNode cell = c.get("cell");
        if ("NA".equals(cell.path("op").asText())) {
            return Outcome.value(bool(true));
        }
        String maruCodeId = var.has("maruCodeId") ? var.get("maruCodeId").asText() : null;
        String text = CellTextOracle.conditionText(cell, name, dataType, maruCodeId);
        try {
            Expression expression = new Expression(text, configuration(codeSets(c))).with(name, value);
            return Outcome.value(toTypedValue(expression.evaluate()));
        } catch (ParseException e) {
            throw new AssertionError("오라클 텍스트가 파싱되지 않는다: " + text + " — " + e.getMessage(), e);
        } catch (EvaluationException | RuntimeException e) {
            return Outcome.error(Code.EVALUATION_ERROR, text + " — " + e);
        }
    }

    // ------------------------------------------------------------------ 엔진 동작 거울

    /**
     * 예약 키(03-03 §6.8 {@code RecordKeys}): 키 순서대로 상수 8종(대문자 비교) → CONSTANT_KEY, EVAL_TS(대문자 비교) → EVAL_TS_KEY,
     * {@code _} 접두 → RESERVED_KEY, 이어서 대소문자만 다른 키 묶음 → RESERVED_KEY. 처음 어긋난 키. 없으면 null.
     */
    static Outcome checkRecordKeys(Collection<String> keys) {
        Set<String> upper = new HashSet<>();
        for (String key : keys) {
            String u = key.toUpperCase(Locale.ROOT);
            if (ReservedNames.CONSTANTS.contains(u)) {
                return Outcome.error(Code.CONSTANT_KEY, key);
            }
            if (ReservedNames.EVAL_TS.equals(u)) {
                return Outcome.error(Code.EVAL_TS_KEY, key);
            }
            if (key.startsWith(ReservedNames.RESERVED_PREFIX)) {
                return Outcome.error(Code.RESERVED_KEY, key);
            }
        }
        for (String key : keys) {
            if (!upper.add(key.toUpperCase(Locale.ROOT))) {
                return Outcome.error(Code.RESERVED_KEY, key);
            }
        }
        return null;
    }

    /** TypedValue JSON → Java 값. NUMBER 는 스케일을 유지한 {@code new BigDecimal(value)}. */
    static Object toJava(JsonNode tv) {
        return switch (tv.get("type").asText()) {
            case "NULL" -> null;
            case "NUMBER" -> new BigDecimal(tv.get("value").asText());
            case "STRING" -> tv.get("value").asText();
            case "BOOLEAN" -> Boolean.valueOf(tv.get("value").asText());
            default -> throw new AssertionError("코퍼스에 없는 TypedValue: " + tv);
        };
    }

    /** 선언 타입 변환(03-03 §6.7 {@code ValueConverter.toDeclared}). 실패하면 IAE(부르는 쪽이 TYPE_CONVERSION 으로 바꾼다). */
    static Object toDeclared(Object value, String dataType) {
        if (value == null) {
            return null;
        }
        switch (dataType) {
            case "NUMBER":
                if (value instanceof BigDecimal) {
                    return value;
                }
                if (value instanceof String s) {
                    try {
                        return new BigDecimal(s);
                    } catch (NumberFormatException e) {
                        throw new IllegalArgumentException("NUMBER 로 바꿀 수 없다: " + s);
                    }
                }
                throw new IllegalArgumentException("NUMBER 로 바꿀 수 없다: " + value);
            case "STRING":
            case "DATE":
                if (value instanceof String) {
                    return value;
                }
                if (value instanceof BigDecimal d) {
                    return d.toPlainString();
                }
                throw new IllegalArgumentException("STRING 으로 바꿀 수 없다: " + value);
            case "BOOLEAN":
                if (value instanceof Boolean) {
                    return value;
                }
                if (value instanceof String s && (s.equalsIgnoreCase("TRUE") || s.equalsIgnoreCase("FALSE"))) {
                    return Boolean.valueOf(s.equalsIgnoreCase("TRUE"));
                }
                throw new IllegalArgumentException("BOOLEAN 으로 바꿀 수 없다: " + value);
            default:
                throw new IllegalArgumentException("모르는 데이터 타입: " + dataType);
        }
    }

    /** 결과 {@link EvaluationValue} → TypedValue JSON. */
    static JsonNode toTypedValue(EvaluationValue v) {
        ObjectNode n = JSON.objectNode();
        if (v.isNullValue()) {
            n.put("type", "NULL");
        } else if (v.isBooleanValue()) {
            n.put("type", "BOOLEAN").put("value", v.getBooleanValue().toString());
        } else if (v.isNumberValue()) {
            n.put("type", "NUMBER").put("value", v.getNumberValue().toPlainString());
        } else if (v.isStringValue()) {
            n.put("type", "STRING").put("value", v.getStringValue());
        } else {
            throw new AssertionError("코퍼스가 다루지 않는 결과 타입: " + v);
        }
        return n;
    }

    private static JsonNode bool(boolean b) {
        return JSON.objectNode().put("type", "BOOLEAN").put("value", Boolean.toString(b));
    }
}
