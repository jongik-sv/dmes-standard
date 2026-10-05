package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 판정 오류(엔진 {@code Violation}·케이스 입력 검사)를 현업 담당자가 읽는 한국어 문장으로 옮긴다 — 무엇이 · 왜 · 어떻게 고치나.
 *
 * <p>엔진 원문은 개발자용이라(예: {@code rule R: 열 조건 var 2 식 '...' 평가 오류: NullPointerException: ...}) 화면에는 이 문장을
 * {@code message} 로 보이고 원문은 {@code detail} 로 남긴다({@link RuleCaseJudge}). 엔진 메시지 모양은 {@code maru-mdm-engine} 의
 * {@code RuleEvaluator}·{@code MdmRuleEngine}·{@code RecordKeys}·{@code ValueConverter}·EvalEx 예외 문구를 따른다. 모르는 모양이면
 * {@code rule X: } 머리만 떼고 원문을 그대로 돌려준다(정보를 잃지 않는다).
 */
public final class RuleErrorText {

    private static final Pattern RULE_PREFIX = Pattern.compile("^rule \\S+: ");
    private static final Pattern GROUP_COND = Pattern.compile("^(?:결과 열 그룹 (\\S+) )?열 조건 var \\d+ (.*)$", Pattern.DOTALL);
    private static final Pattern ROW_CELL = Pattern.compile("^row (\\d+) var \\d+ (.*)$", Pattern.DOTALL);
    private static final Pattern EXPR_VAR = Pattern.compile("^_V\\d+ (.*)$", Pattern.DOTALL);
    private static final Pattern EVAL_FAIL = Pattern.compile("^식 '(.*)' 평가 오류: (.*)$", Pattern.DOTALL);
    private static final Pattern NOT_BOOLEAN = Pattern.compile("^식 '(.*)' 결과가 불린이 아니다: (\\w+)$", Pattern.DOTALL);
    private static final Pattern CAUSE = Pattern.compile("^(\\w+): (.*)$", Pattern.DOTALL);
    private static final Pattern CONVERT = Pattern.compile("(\\w+) 값 '(.*)' 을 (\\w+) 로 바꿀 수 없다$", Pattern.DOTALL);
    private static final Pattern UNKNOWN_VAR = Pattern.compile("Variable or constant value for '([^']+)' not found");
    private static final Pattern UNKNOWN_FUNC = Pattern.compile("Undefined function '([^']+)'");
    private static final Pattern ARG_NULL = Pattern.compile("^(\\w+) 의 인자 \\S+ 가 NULL 이다");
    private static final Pattern ARG_TYPE = Pattern.compile("^(\\w+) 는 \\w+ 인자를 받지 않는다");
    private static final Pattern HIT_ROWS = Pattern.compile("\\[([\\d, ]*)]");
    private static final Pattern RULE_MISSING = Pattern.compile("룰이 없다: (\\S+)");
    /** 엔진 {@code SET_NOT_FOUND} 원문 {@code 세트가 없다: {setId} @ {Instant}}(판정 시각은 없을 수 있다). */
    private static final Pattern SET_MISSING = Pattern.compile("세트가 없다: (\\S+)(?: @ (\\S+))?");
    private static final DateTimeFormatter KST_TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Pattern COLLECT = Pattern.compile("^COLLECT (\\w+) 집계 오류");
    private static final Pattern IDENT = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final Set<String> NOT_INPUT = Set.of("TRUE", "FALSE", "NULL", "EVAL_TS", "PI", "E");

    private RuleErrorText() {
    }

    /** 오류 하나를 사용자 문장으로. {@code message} 가 원문이다. */
    public static String describe(String stage, String code, Integer rowId, String name, String message) {
        String raw = message == null ? "" : message;
        String body = RULE_PREFIX.matcher(raw).replaceFirst("");
        String text = switch (code == null ? "" : code) {
            case "EVALUATION_ERROR" -> evaluation(stage, name, body);
            case "MISSING_KEY" -> "RESULT_CHECK".equals(stage) && rowId != null
                    ? rowName(rowId) + " 결과를 계산하려면 입력 " + name + " 값이 필요한데 없습니다. " + name + " 값을 넣으세요."
                    : "입력에 " + name + " 값이 없습니다. 이 룰을 판정하려면 " + name + " 값을 넣어야 합니다.";
            case "REQUIRED_NULL" -> rowName(rowId) + " 결과를 계산하려면 입력 " + name + " 값이 필요한데 비어 있습니다(NULL). "
                    + name + " 값을 넣으세요.";
            case "TYPE_CONVERSION" -> conversion(stage, rowId, name, body);
            case "UNIQUE_MULTIPLE_HITS" -> "적중 방식이 UNIQUE(한 행만 맞아야 함)인데 여러 행" + hitRows(body)
                    + "이 함께 맞았습니다. 행 조건이 서로 겹치지 않게 고치거나, 적중 방식을 FIRST·PRIORITY 등으로 바꾸세요.";
            case "ANY_CONFLICT" -> "적중 방식이 ANY(맞은 행의 결과가 모두 같아야 함)인데 결과 " + name
                    + " 의 값이 행마다 다릅니다. 맞는 행들이 같은 값을 내게 고치거나, 적중 방식을 바꾸세요.";
            case "RULE_NOT_FOUND" -> "판정 시각에 적용되는 룰" + ruleOf(body)
                    + " 을 찾지 못했습니다. 룰의 적용 기간(시작·종료)과 판정 시각을 확인하세요.";
            case "SET_NOT_FOUND" -> setNotFound(body);
            case "SET_DEPRECATED" -> "폐기된 룰 세트라 판정하지 않습니다. 사용 중인 세트를 고르세요.";
            // 하위 세트 spec §3.3 — 엔진 원문 모양은 eng:4 가 정한다. 모양을 읽지 않고 원문을 문장 안에 그대로 둔다(정보를 잃지 않는다).
            case "SET_CALL_CYCLE" -> "하위 세트 호출이 순환해 판정을 멈췄습니다(" + body + "). 세트가 서로를 부르지 않게 흐름을 고치세요.";
            case "SET_CALL_DEPTH" -> "하위 세트 호출 단계가 5 를 넘어 판정을 멈췄습니다(" + body + "). 부르는 단계를 줄이세요.";
            case "RESERVED_KEY" -> name != null && name.contains(",")
                    ? "대소문자만 다른 입력 이름이 둘 이상 있습니다(" + name + "). 하나만 남기세요."
                    : "입력 이름 " + name + " 은(는) '_' 로 시작해 쓸 수 없습니다(예약된 이름). 다른 이름으로 바꾸세요.";
            case "EVAL_TS_KEY" -> "입력 이름 " + name + " 은(는) 판정 시각용으로 예약되어 있어 쓸 수 없습니다. 입력에서 빼세요.";
            case "CONSTANT_KEY" -> "입력 이름 " + name + " 은(는) 식에서 쓰는 상수 이름(PI·TRUE 등)과 같아 쓸 수 없습니다. 다른 이름으로 바꾸세요.";
            case "INVALID_INPUT_JSON" -> "케이스 입력이 올바른 JSON 객체가 아닙니다. {\"이름\": 값} 모양으로 적으세요.";
            default -> null;
        };
        return text != null ? text : body;
    }

    // ------------------------------------------------------------------ 평가 오류

    /** 식을 계산하지 못한 경우 — 어디(열 조건·조건 칸·결과 칸·변수 식)의 어떤 식이 왜 실패했는지. */
    private static String evaluation(String stage, String name, String body) {
        Matcher collect = COLLECT.matcher(body);
        if (collect.find()) {
            return "결과 " + name + " 의 값을 모으지(COLLECT " + collect.group(1) + ") 못했습니다. "
                    + ("LIST".equals(collect.group(1)) || "COUNT".equals(collect.group(1)) ? "맞은 행들의 결과 값을 확인하세요."
                            : "합계·최소·최대는 숫자 결과에만 쓸 수 있습니다. 결과 값이나 집계 방식을 확인하세요.");
        }
        String where;
        String target;
        String rest;
        Matcher m;
        if ((m = GROUP_COND.matcher(body)).matches()) {
            where = m.group(1) != null ? "결과 열 그룹 " + m.group(1) + " 의 열 조건" : "결과 열 그룹의 열 조건";
            target = "열 조건";
            rest = m.group(2);
        } else if ((m = ROW_CELL.matcher(body)).matches()) {
            boolean result = "RESULT_EVAL".equals(stage);
            where = rowName(Integer.valueOf(m.group(1))) + (result ? " 결과 칸" : " 조건 칸");
            target = result ? "결과 칸 식" : "조건 칸 식";
            rest = m.group(2);
        } else if ((m = EXPR_VAR.matcher(body)).matches()) {
            where = "조건 열의 변수 식";
            target = "변수 식";
            rest = m.group(1);
        } else {
            return null;
        }

        Matcher nb = NOT_BOOLEAN.matcher(rest);
        if (nb.matches()) {
            return where + " `" + nb.group(1) + "` 의 결과가 참/거짓이 아니라 " + typeName(nb.group(2)) + "입니다. "
                    + "조건은 참이나 거짓을 내는 식이어야 합니다(예: 비교 >, ==).";
        }
        Matcher ef = EVAL_FAIL.matcher(rest);
        if (!ef.matches()) {
            return null;
        }
        String expr = ef.group(1);
        String head = where + " `" + expr + "` 을 계산하지 못했습니다. ";
        return head + reason(ef.group(2), expr, target);
    }

    /** 원인 문구 → 사용자 문장. 원인 모양: {@code 예외 단순 이름: 메시지}. */
    private static String reason(String causeText, String expr, String target) {
        Matcher c = CAUSE.matcher(causeText);
        String type = c.matches() ? c.group(1) : "";
        String msg = c.matches() ? c.group(2) : causeText;
        Matcher m;
        if ("NullPointerException".equals(type) || ARG_NULL.matcher(msg).find()) {
            List<String> inputs = inputs(expr);
            String who = inputs.size() == 1 ? "입력 " + inputs.get(0) + " 가 비어 있습니다(NULL). "
                    : inputs.isEmpty() ? "비어 있는(NULL) 값이 함수에 들어갔습니다. "
                            : "입력 " + String.join(", ", inputs) + " 가운데 비어 있는(NULL) 값이 있습니다. ";
            return who + "값을 넣거나, " + target + "에 NULL 검사를 더하세요.";
        }
        if ((m = UNKNOWN_VAR.matcher(msg)).find()) {
            return "입력에 " + m.group(1) + " 값이 없습니다. " + m.group(1) + " 값을 넣거나, 식에 쓴 이름이 맞는지 확인하세요.";
        }
        if ((m = UNKNOWN_FUNC.matcher(msg)).find()) {
            return "쓸 수 없는 함수입니다: " + m.group(1) + ". 함수 이름을 확인하세요.";
        }
        if ("ParseException".equals(type)) {
            return "식 문법이 올바르지 않습니다. 괄호·따옴표·연산자를 확인하세요.";
        }
        if (msg.contains("Division by zero") || msg.contains("/ by zero")) {
            return "0 으로 나누었습니다. 나누는 값이 0 이 되지 않게 식이나 입력을 고치세요.";
        }
        if (msg.contains("안에 끝나지 않았다")) {
            return "계산이 너무 오래 걸려 멈췄습니다. 식을 더 단순하게 고치세요.";
        }
        if ((m = ARG_TYPE.matcher(msg)).find()) {
            return "함수 " + m.group(1) + " 에 맞지 않는 종류의 값(숫자·문자 등)이 들어갔습니다. 입력 값의 종류를 확인하세요.";
        }
        return "식과 입력 값을 확인하세요.";
    }

    /** 식에 쓴 입력 이름 — 문자열 리터럴·함수 이름·상수·예약 이름({@code EVAL_TS}, {@code _V*})은 뺀다. */
    static List<String> inputs(String expr) {
        String bare = expr.replaceAll("\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'", "\"\"");
        List<String> out = new ArrayList<>();
        Matcher m = IDENT.matcher(bare);
        while (m.find()) {
            String id = m.group();
            if (Character.isDigit(id.charAt(0)) || id.startsWith("_") || NOT_INPUT.contains(id.toUpperCase(Locale.ROOT))) {
                continue;
            }
            if (m.start() > 0 && Character.isDigit(bare.charAt(m.start() - 1))) {
                continue; // 1E5 같은 숫자 지수
            }
            int next = m.end();
            while (next < bare.length() && Character.isWhitespace(bare.charAt(next))) {
                next++;
            }
            if (next < bare.length() && bare.charAt(next) == '(') {
                continue;
            }
            if (!out.contains(id)) {
                out.add(id);
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ 타입 변환

    private static String conversion(String stage, Integer rowId, String name, String body) {
        Matcher m = CONVERT.matcher(body);
        if (!m.find()) {
            return null;
        }
        String now = "(지금 값: '" + m.group(2) + "')";
        String type = typeName(m.group(3));
        if ("RESULT_EVAL".equals(stage)) {
            return rowName(rowId) + " 결과 " + name + " 에는 " + type + " 값이 와야 합니다" + now + ". 결과 칸의 값이나 식을 고치세요.";
        }
        if ("ROW_SELECT".equals(stage)) {
            return "조건 열의 변수 식 결과는 " + type + " 값이어야 합니다" + now + ". 식을 고치세요.";
        }
        return "입력 " + name + " 에는 " + type + " 값이 와야 합니다" + now + ". " + type + " 값으로 고치세요.";
    }

    private static String typeName(String dataType) {
        return switch (dataType == null ? "" : dataType.toUpperCase(Locale.ROOT)) {
            case "NUMBER" -> "숫자";
            case "STRING" -> "문자";
            case "BOOLEAN" -> "참/거짓(TRUE·FALSE)";
            case "DATE", "DATE_TIME" -> "날짜";
            default -> dataType;
        };
    }

    // ------------------------------------------------------------------ 조각

    private static String rowName(Integer rowId) {
        return rowId == null ? "이 행의" : "row_id " + rowId + " 행의";
    }

    private static String hitRows(String body) {
        Matcher m = HIT_ROWS.matcher(body);
        return m.find() ? "(row_id " + m.group(1) + ")" : "";
    }

    /**
     * 판정 시각에 적용되는 세트 버전이 없음(스펙 §8 — 대상 ID·시각). 세트 자체가 없는지는 원문만으로 알 수 없어, 세트 원장을 아는 호출자가
     * {@link #setAbsent} 로 따로 바꾼다({@code RuleSetRunner.execute}).
     */
    private static String setNotFound(String body) {
        Matcher m = SET_MISSING.matcher(body);
        if (!m.find()) {
            return "룰 세트를 찾지 못했습니다. 세트 ID 를 확인하세요.";
        }
        if (m.group(2) == null) {
            return "룰 세트 " + m.group(1) + " 를 찾지 못했습니다. 세트 ID 를 확인하세요.";
        }
        return "판정 시각 " + kst(m.group(2)) + " 에 적용되는 룰 세트 " + m.group(1)
                + " 의 버전이 없습니다. 세트 버전의 확정 여부와 적용 기간(시작·종료), 판정 시각을 확인하세요.";
    }

    /**
     * 하위 세트에서 올라온 위반 — 문구 앞에 세트 경로({@code "세트 A › 단가 결정(s1) › "}, {@code RuleSetRunner.pathText})를 붙인다(하위 세트 spec §4.1).
     * 경로가 null 이거나 비면 문구 그대로.
     */
    public static String withSetPath(String pathText, String text) {
        return pathText == null || pathText.isEmpty() ? text : pathText + text;
    }

    /** 세트 원장에 그 ID 가 아예 없음. */
    public static String setAbsent(String setId) {
        return "룰 세트 " + setId + " 가 없습니다. 세트 ID 를 확인하세요.";
    }

    /** 엔진 {@code SET_NOT_FOUND} 원문의 세트 ID. 모양이 다르면 null. */
    public static String missingSetId(String message) {
        Matcher m = SET_MISSING.matcher(message == null ? "" : message);
        return m.find() ? m.group(1) : null;
    }

    /** 엔진 원문의 시각(Instant ISO-8601, UTC) → KST {@code yyyy-MM-dd HH:mm:ss}. 읽지 못하면 원문 그대로. */
    private static String kst(String instant) {
        try {
            return LocalDateTime.ofInstant(Instant.parse(instant), MdmClockConfig.KST).format(KST_TS);
        } catch (DateTimeParseException e) {
            return instant;
        }
    }

    private static String ruleOf(String body) {
        Matcher m = RULE_MISSING.matcher(body);
        return m.find() ? " " + m.group(1) : "";
    }
}
