package kr.dongkuk.maru.mdm.engine.corpus;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * op-code 셀 → EvalEx 텍스트 test 전용 오라클(TSK-03-04 design §6.11, D3).
 *
 * <p>06 「EvalEx 생성 규칙」(06:242-262)과 TSK-03-03 design §6.10·§6.11 을 옮긴 거울이다. 시그니처는 03-03
 * {@code CellTextGenerator} 와 짝을 맞추고 인자만 코퍼스 모양(Jackson 셀, 문자열 데이터 타입)이다. 03-03 이 머지되면
 * {@code CellTextGenerator} 호출로 바꾸고 이 파일을 지운다(design §6.15 P1).
 */
final class CellTextOracle {

    /** NA 셀의 텍스트(03-03 {@code CellTextGenerator.NA_TEXT}). */
    static final String NA_TEXT = "";

    /** 접은 뒤 {@code %} 개수 상한(03-03 {@code MAX_PATTERN_WILDCARDS}). */
    static final int MAX_PATTERN_WILDCARDS = 3;

    /** 정규식 메타문자 14종 — 글자 토큰이 이 문자면 앞에 {@code \} 를 붙인다. */
    static final String REGEX_META = "\\^$.|?*+()[]{}";

    private static final Pattern NUMBER_LITERAL = Pattern.compile("^[+-]?\\d+(\\.\\d+)?$");

    private CellTextOracle() {}

    /** 조건 셀 텍스트. {@code subject} 는 V 자리 변수 이름, {@code dataType} 은 NUMBER·STRING·BOOLEAN·DATE. */
    static String conditionText(JsonNode cell, String subject, String dataType, String maruCodeId) {
        if (!cell.has("op")) {
            if (cell.has("expr")) {
                return cell.get("expr").asText();
            }
            throw new IllegalArgumentException("op 도 expr 도 없는 조건 셀: " + cell);
        }
        String op = cell.get("op").asText();
        String v = subject;
        String g = v + " != NULL && ";
        switch (op) {
            case "NA":
                return NA_TEXT;
            case "IS_NULL":
                return v + " == NULL";
            case "NOT_NULL":
                return v + " != NULL";
            case "EQ":
                if ("STRING".equals(dataType)) {
                    return g + patternText(v, left(cell));
                }
                return g + v + " == " + literal(left(cell), dataType);
            case "NE":
                return g + v + " != " + literal(left(cell), dataType);
            case "LT":
                return g + v + " < " + literal(left(cell), dataType);
            case "LE":
                return g + v + " <= " + literal(left(cell), dataType);
            case "GT":
                return g + v + " > " + literal(left(cell), dataType);
            case "GE":
                return g + v + " >= " + literal(left(cell), dataType);
            case "IN": {
                List<String> parts = new ArrayList<>();
                for (String item : list(cell)) {
                    parts.add(v + " == " + literal(item, dataType));
                }
                return g + "(" + String.join(" || ", parts) + ")";
            }
            case "NOT_IN": {
                List<String> parts = new ArrayList<>();
                for (String item : list(cell)) {
                    parts.add(v + " != " + literal(item, dataType));
                }
                return g + String.join(" && ", parts);
            }
            case "CODE_IN":
                if (maruCodeId == null) {
                    throw new IllegalArgumentException("maruCodeId 없는 CODE_IN");
                }
                return g + "MASTER(" + stringLiteral(maruCodeId) + ", " + stringLiteral(left(cell)) + ", " + v + ")";
            case "CONTAINS":
                return g + "INSTR(" + v + ", " + stringLiteral(nonEmpty(left(cell))) + ") > 0";
            case "INSTR":
                return g + "INSTR(" + stringLiteral(nonEmpty(left(cell))) + ", " + v + ") > 0";
            case "<= 변수 <=":
                return g + v + " >= " + literal(left(cell), dataType) + " && " + v + " <= " + literal(right(cell), dataType);
            case "<= 변수 <":
                return g + v + " >= " + literal(left(cell), dataType) + " && " + v + " < " + literal(right(cell), dataType);
            case "< 변수 <=":
                return g + v + " > " + literal(left(cell), dataType) + " && " + v + " <= " + literal(right(cell), dataType);
            case "< 변수 <":
                return g + v + " > " + literal(left(cell), dataType) + " && " + v + " < " + literal(right(cell), dataType);
            default:
                throw new IllegalArgumentException("모르는 op: " + op);
        }
    }

    /** {@code =} 값이 정규식형이면 앵커 없는 Java 정규식, 정확 일치·단순형이면 빈 값. 거부 대상이면 IAE(03-03 §6.11 5). */
    static Optional<String> patternRegex(String patternValue) {
        List<Object> tokens = checkedTokens(patternValue);
        return shape(tokens) == Shape.REGEX ? Optional.of(toRegex(tokens)) : Optional.empty();
    }

    /** 패턴 → 정규식(모양 판정 없이). 글자는 {@link #REGEX_META} 면 이스케이프, {@code %} → {@code .*}, {@code _} → {@code .}. */
    static String likeToRegex(String pattern) {
        return toRegex(tokenize(pattern));
    }

    // ------------------------------------------------------------------ = 패턴(03-03 §6.11)

    private enum Wild { ANY, ONE }

    private enum Shape { EXACT, PREFIX, SUFFIX, INFIX, REGEX }

    private static String patternText(String v, String value) {
        List<Object> tokens = checkedTokens(value);
        return switch (shape(tokens)) {
            case EXACT -> v + " == " + stringLiteral(tokens.isEmpty() ? "" : (String) tokens.get(0));
            case PREFIX -> "STR_STARTS_WITH(" + v + ", " + stringLiteral((String) tokens.get(0)) + ")";
            case SUFFIX -> "STR_ENDS_WITH(" + v + ", " + stringLiteral((String) tokens.get(1)) + ")";
            case INFIX -> "INSTR(" + v + ", " + stringLiteral((String) tokens.get(1)) + ") > 0";
            case REGEX -> "STR_MATCHES(" + v + ", " + stringLiteral(toRegex(tokens)) + ")";
        };
    }

    /** 토큰: 이어진 글자는 String 하나, 와일드카드는 {@link Wild}. 연속 ANY 는 하나로 접는다. 홀로 선 {@code \} 는 IAE. */
    private static List<Object> tokenize(String p) {
        List<Object> tokens = new ArrayList<>();
        StringBuilder lit = new StringBuilder();
        for (int i = 0; i < p.length(); i++) {
            char ch = p.charAt(i);
            Object wild = null;
            if (ch == '\\') {
                if (i + 1 >= p.length() || "%_\\".indexOf(p.charAt(i + 1)) < 0) {
                    throw new IllegalArgumentException("홀로 선 \\ 는 쓸 수 없다: " + p);
                }
                lit.append(p.charAt(++i));
                continue;
            } else if (ch == '%') {
                wild = Wild.ANY;
            } else if (ch == '_') {
                wild = Wild.ONE;
            } else {
                lit.append(ch);
                continue;
            }
            if (lit.length() > 0) {
                tokens.add(lit.toString());
                lit.setLength(0);
            }
            if (!(wild == Wild.ANY && !tokens.isEmpty() && tokens.get(tokens.size() - 1) == Wild.ANY)) {
                tokens.add(wild);
            }
        }
        if (lit.length() > 0) {
            tokens.add(lit.toString());
        }
        return tokens;
    }

    private static List<Object> checkedTokens(String value) {
        List<Object> tokens = tokenize(value);
        if (tokens.size() == 1 && tokens.get(0) == Wild.ANY) {
            throw new IllegalArgumentException("% 만 있는 패턴은 쓸 수 없다: " + value);
        }
        if (tokens.stream().filter(t -> t == Wild.ANY).count() > MAX_PATTERN_WILDCARDS) {
            throw new IllegalArgumentException("% 가 " + MAX_PATTERN_WILDCARDS + " 개를 넘는다: " + value);
        }
        return tokens;
    }

    private static Shape shape(List<Object> t) {
        if (t.stream().noneMatch(x -> x instanceof Wild)) {
            return Shape.EXACT;
        }
        if (t.size() == 2 && t.get(0) instanceof String && t.get(1) == Wild.ANY) {
            return Shape.PREFIX;
        }
        if (t.size() == 2 && t.get(0) == Wild.ANY && t.get(1) instanceof String) {
            return Shape.SUFFIX;
        }
        if (t.size() == 3 && t.get(0) == Wild.ANY && t.get(1) instanceof String && t.get(2) == Wild.ANY) {
            return Shape.INFIX;
        }
        return Shape.REGEX;
    }

    private static String toRegex(List<Object> tokens) {
        StringBuilder re = new StringBuilder();
        for (Object t : tokens) {
            if (t == Wild.ANY) {
                re.append(".*");
            } else if (t == Wild.ONE) {
                re.append('.');
            } else {
                for (char ch : ((String) t).toCharArray()) {
                    if (REGEX_META.indexOf(ch) >= 0) {
                        re.append('\\');
                    }
                    re.append(ch);
                }
            }
        }
        return re.toString();
    }

    // ------------------------------------------------------------------ 리터럴(03-03 §6.10.2)

    static String literal(String value, String dataType) {
        return switch (dataType) {
            case "NUMBER" -> numberLiteral(value);
            case "BOOLEAN" -> {
                if (value.equalsIgnoreCase("TRUE") || value.equalsIgnoreCase("FALSE")) {
                    yield value.toUpperCase();
                }
                throw new IllegalArgumentException("BOOLEAN 리터럴이 아니다: " + value);
            }
            case "STRING", "DATE" -> stringLiteral(value);
            default -> throw new IllegalArgumentException("모르는 데이터 타입: " + dataType);
        };
    }

    private static String numberLiteral(String value) {
        if (value == null || !NUMBER_LITERAL.matcher(value).matches()) {
            throw new IllegalArgumentException("숫자 리터럴 모양이 아니다: " + value);
        }
        BigDecimal d = new BigDecimal(value).stripTrailingZeros();
        if (d.signum() == 0) {
            return "0";
        }
        String s = d.toPlainString();
        return d.signum() < 0 ? "(" + s + ")" : s;
    }

    static String stringLiteral(String value) {
        if (value == null) {
            throw new IllegalArgumentException("문자열 값이 없다");
        }
        for (char ch : value.toCharArray()) {
            if (ch < 0x20 || ch == 0x7F) {
                throw new IllegalArgumentException("제어문자가 든 값: " + value);
            }
        }
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String left(JsonNode cell) {
        if (!cell.hasNonNull("left")) {
            throw new IllegalArgumentException("left 가 없다: " + cell);
        }
        return cell.get("left").asText();
    }

    private static String right(JsonNode cell) {
        if (!cell.hasNonNull("right")) {
            throw new IllegalArgumentException("구간 op 에 right 가 없다: " + cell);
        }
        return cell.get("right").asText();
    }

    private static List<String> list(JsonNode cell) {
        if (!cell.has("list") || cell.get("list").isEmpty()) {
            throw new IllegalArgumentException("IN 목록이 비었다: " + cell);
        }
        List<String> items = new ArrayList<>();
        cell.get("list").forEach(n -> items.add(n.asText()));
        return items;
    }

    private static String nonEmpty(String s) {
        if (s.isEmpty()) {
            throw new IllegalArgumentException("빈 CONTAINS·INSTR 값");
        }
        return s;
    }
}
