package com.dongkuk.dmes.mdm.common.rule.check;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.str;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 셀 하나의 정규화 + 검사(TSK-08-04 design §6.3, 06 「저장 시 검사」 타입·op 허용·범위 자리·경계 순서·목록·{@code =} 패턴·CONTAINS·INSTR).
 * 원장을 읽지 않는 순수 static 이다. 정규화 결과는 새 셀 맵이고 입력 맵은 바꾸지 않는다. 키 일곱({@code op,left,right,list,expr,ast,val})
 * 밖을 만들지 않는다.
 *
 * <p>판별: 데이터 타입 = {@code ResolvedVar.dataType}, 일자 = {@code dateString}, 코드 = {@code maruCodeId != null}. 숫자 텍스트는 다시
 * 쓰지 않는다(I9). op 단계(허용 행렬·범위 자리)에서 걸리면 값은 보지 않는다.
 */
public final class RuleCellRules {

    /** 셀 문제 하나. 행·열 표시는 호출자가 붙인다. */
    public record Problem(RuleSaveIssueCode code, String message) {
    }

    /** 정규화한 셀과 문제 목록. 문제가 있으면 셀은 정규화 도중의 모양일 수 있다(저장하지 않는다). */
    public record Result(Map<String, Object> cell, List<Problem> problems) {
        public boolean ok() {
            return problems.isEmpty();
        }
    }

    /** 06:130-176 NUMBER 리터럴(지수·16진 불허) — {@code CellTextGenerator.NUMBER_LITERAL} 과 같다. */
    private static final Pattern NUMBER_LITERAL = Pattern.compile("^[+-]?\\d+(\\.\\d+)?$");

    private static final Set<String> RANGE_OPS = Set.of("<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <");
    /** 1 타입 op(06 op-code 표의 타입 칸이 1 인 것). */
    private static final Set<String> UNARY_OPS = Set.of("EQ", "NE", "LT", "LE", "GT", "GE", "IN", "NOT_IN", "CODE_IN", "CONTAINS", "INSTR",
            "IS_NULL", "NOT_NULL");

    private RuleCellRules() {
    }

    /** 조건 셀. Expression 조건 열은 op 가 NA 이거나 식이 있는지만 본다(식 검사는 {@link RuleExpressionChecks}). */
    public static Result condition(ResolvedVar var, Map<String, Object> cell) {
        Map<String, Object> out = new LinkedHashMap<>(cell);
        List<Problem> problems = new ArrayList<>();
        String op = str(cell.get("op"));
        if ("Expression".equals(var.dispType())) {
            if (op != null && !op.equals("NA")) {
                problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED, "Expression 열에는 op " + op + " 를 둘 수 없다(식 또는 무관)"));
            } else if (op == null && str(cell.get("expr")) == null) {
                problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED, "Expression 열 셀에 식이 없다(무관이면 - 로 둔다)"));
            }
            return new Result(out, problems);
        }
        if (op == null) {
            problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED,
                    cell.get("expr") != null ? "op-code 열에는 식을 둘 수 없다(Expression 열로 보낸다)" : "셀에 op 가 없다"));
            return new Result(out, problems);
        }
        if (!opAllowed(var, op, problems)) {
            return new Result(out, problems);
        }
        Kind k = Kind.of(var);
        switch (op) {
            case "NA", "IS_NULL", "NOT_NULL" -> {
            }
            case "EQ" -> eq(k, out, problems);
            case "NE", "LT", "LE", "GT", "GE" -> single(k, op, out, problems);
            case "IN", "NOT_IN" -> list(k, op, out, problems);
            case "CODE_IN", "CONTAINS", "INSTR" -> text(op, out, problems);
            default -> range(k, op, out, problems);
        }
        return new Result(out, problems);
    }

    /** 결과 셀. Value 는 {@code val} 을 결과 변수 타입으로 검사하고, Expression 열의 식은 {@link RuleExpressionChecks} 가 본다. */
    public static Result result(ResolvedVar var, Map<String, Object> cell) {
        Map<String, Object> out = new LinkedHashMap<>(cell);
        List<Problem> problems = new ArrayList<>();
        if (cell.get("op") != null) {
            problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED, "결과 셀에는 op 를 둘 수 없다(무관 결과 셀 금지, 06:387)"));
            return new Result(out, problems);
        }
        String val = str(cell.get("val"));
        String expr = str(cell.get("expr"));
        if (val == null && expr == null) {
            problems.add(new Problem(RuleSaveIssueCode.INCOMPLETE_RESULT, "결과 값이 없다"));
            return new Result(out, problems);
        }
        if (val == null) {
            if (!"Expression".equals(var.dispType())) {
                problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED, "Value 열에는 식을 둘 수 없다"));
            }
            return new Result(out, problems);
        }
        if ("Expression".equals(var.dispType())) {
            // 2026-09-28 — Expression 열의 칸은 식 하나다(상수도 식: 1.0). 값 칸이 섞이면 표에는 식 칸만 그려져 보이지 않는 값이 된다.
            problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED, "Expression 열에는 값 대신 식을 적는다(상수도 식이다, 예: 1.0)"));
            return new Result(out, problems);
        }
        String normalized = literal(Kind.of(var), val, problems);
        if (normalized != null) {
            out.put("val", normalized);
        }
        return new Result(out, problems);
    }

    // ── op 단계 ──

    /** 06:130-176 op-code 표 — 표시 타입(범위 자리) → 데이터 타입. */
    private static boolean opAllowed(ResolvedVar var, String op, List<Problem> problems) {
        boolean range = RANGE_OPS.contains(op);
        if (!range && !UNARY_OPS.contains(op) && !op.equals("NA")) {
            problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED, "모르는 op: " + op));
            return false;
        }
        String disp = var.dispType();
        if (range && !"2".equals(disp)) {
            problems.add(new Problem(RuleSaveIssueCode.RANGE_OP_PLACE, "구간 op " + op + " 는 2 타입 열에서만 쓴다"));
            return false;
        }
        if ("Equal".equals(disp) && !op.equals("EQ") && !op.equals("NA")) {
            problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED, "Equal 열에는 = 와 - 만 쓴다: " + op));
            return false;
        }
        Kind k = Kind.of(var);
        if ((op.equals("CONTAINS") || op.equals("INSTR")) && k.date) {
            problems.add(new Problem(RuleSaveIssueCode.TEXT_DATE_DOMAIN, op + " 는 일자 도메인 변수에 쓸 수 없다"));
            return false;
        }
        boolean typeOk = switch (op) {
            case "NA", "EQ", "IS_NULL", "NOT_NULL" -> true;
            case "NE", "IN", "NOT_IN" -> k.string || k.number;
            case "CODE_IN" -> k.code;
            case "CONTAINS", "INSTR" -> k.string;
            default -> k.number || k.date; // LT·LE·GT·GE·구간 넷
        };
        if (!typeOk) {
            problems.add(new Problem(RuleSaveIssueCode.OP_NOT_ALLOWED, op + " 는 " + k.describe() + " 변수에 쓸 수 없다"));
        }
        return typeOk;
    }

    // ── 값 단계 ──

    private static void eq(Kind k, Map<String, Object> out, List<Problem> problems) {
        String left = str(out.get("left"));
        if (left == null) {
            problems.add(new Problem(RuleSaveIssueCode.TYPE_LITERAL, "= 값이 없다"));
            return;
        }
        if (k.number && hasWildcard(left)) {
            problems.add(new Problem(RuleSaveIssueCode.PATTERN_NOT_STRING, "= 패턴은 String 변수에서만 쓴다: " + left));
            return;
        }
        if (!k.string || k.code) {
            // 코드 도메인은 코드 목록에서 고르므로 패턴이 없다(06:158) — 글자 그대로.
            String normalized = literal(k, left, problems);
            if (normalized != null) {
                out.put("left", normalized);
            }
            return;
        }
        if (!hasWildcard(left)) {
            return;
        }
        if (k.date) {
            problems.add(new Problem(RuleSaveIssueCode.PATTERN_DATE_WILDCARD, "일자 도메인 값에는 % · _ 를 쓸 수 없다: " + left));
            return;
        }
        String folded = foldPercents(left);
        if (folded.equals("%")) {
            problems.add(new Problem(RuleSaveIssueCode.PATTERN_ONLY_PERCENT, "% 하나뿐인 패턴은 쓸 수 없다(- 또는 IS NOT NULL)"));
            return;
        }
        if (folded.length() > RuleLimits.MAX_PATTERN_CHARS) {
            problems.add(new Problem(RuleSaveIssueCode.PATTERN_TOO_LONG, "= 패턴이 " + RuleLimits.MAX_PATTERN_CHARS + "자를 넘는다"));
            return;
        }
        int wildcards = countPercents(folded);
        if (wildcards > RuleLimits.MAX_PATTERN_WILDCARDS) {
            problems.add(new Problem(RuleSaveIssueCode.PATTERN_TOO_MANY_PERCENT,
                    "= 패턴의 % 가 " + RuleLimits.MAX_PATTERN_WILDCARDS + "개를 넘는다: " + wildcards + "개"));
            return;
        }
        out.put("left", folded);
    }

    private static void single(Kind k, String op, Map<String, Object> out, List<Problem> problems) {
        String left = str(out.get("left"));
        if (left == null) {
            problems.add(new Problem(RuleSaveIssueCode.TYPE_LITERAL, op + " 값이 없다"));
            return;
        }
        String normalized = literal(k, left, problems);
        if (normalized != null) {
            out.put("left", normalized);
        }
    }

    /** 원소를 타입대로 검사 → 같은 값이면 앞 원소를 남기고 중복 제거 → NUMBER 는 값 순서·String 은 UTF-16 사전순 → 원소 수 상한. */
    private static void list(Kind k, String op, Map<String, Object> out, List<Problem> problems) {
        List<String> raw = new ArrayList<>();
        if (out.get("list") instanceof List<?> l) {
            l.forEach(x -> raw.add(x == null ? null : x.toString()));
        }
        if (raw.isEmpty()) {
            problems.add(new Problem(RuleSaveIssueCode.LIST_EMPTY, op + " 목록이 비었다"));
            return;
        }
        List<String> kept = new ArrayList<>();
        for (String e : raw) {
            if (e == null) {
                problems.add(new Problem(RuleSaveIssueCode.TYPE_LITERAL, op + " 목록에 빈 원소가 있다"));
                return;
            }
            String normalized = literal(k, e, problems);
            if (normalized == null) {
                return;
            }
            boolean dup = kept.stream().anyMatch(x -> k.number ? new BigDecimal(x).compareTo(new BigDecimal(normalized)) == 0 : x.equals(normalized));
            if (!dup) {
                kept.add(normalized);
            }
        }
        Comparator<String> order = k.number ? Comparator.comparing(BigDecimal::new) : Comparator.naturalOrder();
        kept.sort(order);
        if (kept.size() > RuleLimits.MAX_LIST_ELEMENTS) {
            problems.add(new Problem(RuleSaveIssueCode.LIST_TOO_LONG,
                    op + " 원소가 " + RuleLimits.MAX_LIST_ELEMENTS + "개를 넘는다: " + kept.size() + "개"));
            return;
        }
        out.put("list", kept);
    }

    /** CODE_IN·CONTAINS·INSTR — 빈 값 거부, 길이 상한, 값은 글자 그대로. */
    private static void text(String op, Map<String, Object> out, List<Problem> problems) {
        String left = str(out.get("left"));
        if (left == null || left.isEmpty()) {
            problems.add(new Problem(RuleSaveIssueCode.TEXT_EMPTY, op + " 값이 비었다"));
            return;
        }
        if (left.length() > RuleLimits.MAX_TEXT_CHARS) {
            problems.add(new Problem(RuleSaveIssueCode.TEXT_TOO_LONG, op + " 값이 " + RuleLimits.MAX_TEXT_CHARS + "자를 넘는다"));
        }
    }

    /** 구간 op — 한쪽 빈 구간은 1 타입 op 로 바꾸고(06:152), 양쪽 빈칸·하한=상한·하한>상한은 거부한다. */
    private static void range(Kind k, String op, Map<String, Object> out, List<Problem> problems) {
        String left = blankToNull(str(out.get("left")));
        String right = blankToNull(str(out.get("right")));
        if (left == null && right == null) {
            problems.add(new Problem(RuleSaveIssueCode.BOUND_EMPTY, "구간의 하한·상한이 모두 비었다(무관이면 - 로 둔다)"));
            return;
        }
        if (left == null || right == null) {
            String value = left != null ? left : right;
            String unary = left != null ? (op.startsWith("<=") ? "GE" : "GT") : (op.endsWith("<=") ? "LE" : "LT");
            String normalized = literal(k, value, problems);
            if (normalized == null) {
                return;
            }
            out.clear();
            out.put("op", unary);
            out.put("left", normalized);
            return;
        }
        String l = literal(k, left, problems);
        String r = literal(k, right, problems);
        if (l == null || r == null) {
            return;
        }
        int cmp = k.number ? new BigDecimal(l).compareTo(new BigDecimal(r)) : l.compareTo(r);
        if (cmp == 0) {
            problems.add(new Problem(RuleSaveIssueCode.BOUND_EQUAL, "하한과 상한이 같다(" + l + ", " + r + ") — = 를 쓴다"));
        } else if (cmp > 0) {
            problems.add(new Problem(RuleSaveIssueCode.BOUND_ORDER, "하한 " + l + " 이(가) 상한 " + r + " 보다 크다"));
        }
    }

    /** 타입 검사 + 정규화. 실패면 문제를 더하고 null. NUMBER 는 그대로, BOOLEAN 은 대문자. */
    private static String literal(Kind k, String value, List<Problem> problems) {
        if (k.number) {
            if (!NUMBER_LITERAL.matcher(value).matches()) {
                problems.add(new Problem(RuleSaveIssueCode.TYPE_LITERAL, "숫자가 아니다(지수·16진 표기 불가): " + value));
                return null;
            }
            return value;
        }
        if (k.bool) {
            if (value.equalsIgnoreCase("TRUE") || value.equalsIgnoreCase("FALSE")) {
                return value.toUpperCase(Locale.ROOT);
            }
            problems.add(new Problem(RuleSaveIssueCode.TYPE_LITERAL, "불린은 TRUE·FALSE 만 쓴다: " + value));
            return null;
        }
        return value;
    }

    // ── = 패턴 ──

    /** 막지 않은 {@code %}·{@code _} 가 있는가. {@code \} 뒤 한 글자는 글자다. */
    private static boolean hasWildcard(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\') {
                i++;
            } else if (c == '%' || c == '_') {
                return true;
            }
        }
        return false;
    }

    /** 연속한 막지 않은 {@code %} 를 하나로 접는다. 막은 글자({@code \%} 등)는 그대로 둔다. */
    private static String foldPercents(String value) {
        StringBuilder sb = new StringBuilder(value.length());
        boolean prevPercent = false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\' && i + 1 < value.length()) {
                sb.append(c).append(value.charAt(++i));
                prevPercent = false;
            } else if (c == '%') {
                if (!prevPercent) {
                    sb.append(c);
                }
                prevPercent = true;
            } else {
                sb.append(c);
                prevPercent = false;
            }
        }
        return sb.toString();
    }

    private static int countPercents(String value) {
        int n = 0;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\') {
                i++;
            } else if (c == '%') {
                n++;
            }
        }
        return n;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /** 변수의 데이터 타입 종류. 데이터 타입이 비면 STRING(ResolvedVar 규칙). */
    private record Kind(boolean number, boolean bool, boolean string, boolean date, boolean code, String dataType) {
        static Kind of(ResolvedVar var) {
            String dt = var.dataType() == null ? "STRING" : var.dataType();
            boolean string = dt.equals("STRING");
            return new Kind(dt.equals("NUMBER"), dt.equals("BOOLEAN"), string, string && var.dateString(), string && var.maruCodeId() != null, dt);
        }

        String describe() {
            return date ? "일자 String" : code ? "코드 String" : dataType;
        }
    }
}
