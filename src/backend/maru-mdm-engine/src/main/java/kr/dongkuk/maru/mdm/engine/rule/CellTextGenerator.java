package kr.dongkuk.maru.mdm.engine.rule;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * op-code 셀 → EvalEx 텍스트 생성기(06-business-rule.md:242-261 「EvalEx 생성 규칙」, TSK-03-03 design §6.10-6.11).
 *
 * <p>엔진 판정은 이 생성기를 부르지 않고 스냅샷의 {@code RuleCell.text} 를 평가한다(06:269·426·471, D4). 서버가 스냅샷을
 * 조립하거나 값 테스트 정의를 채울 때 부른다. 같은 입력은 바이트가 같은 텍스트를 낸다(06:261). 오류는 모두
 * {@link IllegalArgumentException} 이다.
 */
public final class CellTextGenerator {

    /** NA 셀 텍스트 — 평가 목록에서 빠진다(RuleCell.text 는 null 이 아니다). */
    public static final String NA_TEXT = "";

    /** 접은 뒤 {@code %} 개수 상한(06:158). */
    public static final int MAX_PATTERN_WILDCARDS = 3;

    /** 정규식형 패턴에서 앞에 {@code \} 를 붙이는 글자 14종(06:158·258). */
    public static final Set<String> REGEX_META =
            Set.of("\\", "^", "$", ".", "|", "?", "*", "+", "(", ")", "[", "]", "{", "}");

    private static final Pattern NUMBER_LITERAL = Pattern.compile("^[+-]?\\d+(\\.\\d+)?$");
    private static final Pattern IDENTIFIER = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");

    private static final String NULL_GUARD = " != NULL && ";

    /** 패턴 토큰 종류. record·enum 을 두지 않는다(design D3). */
    private static final int CHAR = 0;
    private static final int ANY = 1;
    private static final int ONE = 2;

    private CellTextGenerator() {}

    /** 이름 변수면 var_name, 식 변수(varName == null && exprText != null)면 {@code "_V" + varId}. 그 밖은 IAE. */
    public static String subject(RuleVar var) {
        if (var.varName() != null) {
            return identifier(var.varName());
        }
        if (var.exprText() != null) {
            return ReservedNames.EXPR_VAR_PREFIX + var.varId();
        }
        throw new IllegalArgumentException("주어가 없다(var_name·식 모두 없음): var " + var.varId());
    }

    /**
     * 조건 셀 텍스트. NA → {@link #NA_TEXT}, Expression 셀(op 없음, expr 있음) → expr 그대로.
     * {@code maruCodeId} 는 CODE_IN 에만 쓴다.
     */
    public static String conditionText(RuleCell cell, @Nullable String subject, DataType dataType,
            @Nullable String maruCodeId) {
        String op = cell.op();
        if (op == null) {
            if (cell.expr() != null) {
                return cell.expr();
            }
            throw new IllegalArgumentException("셀에 op 도 expr 도 없다");
        }
        if (op.equals("NA")) {
            return NA_TEXT;
        }
        if (subject == null) {
            throw new IllegalArgumentException("op-code 셀에 주어가 없다: " + op);
        }
        String v = identifier(subject);
        String guard = v + NULL_GUARD;
        switch (op) {
            case "EQ":
                if (dataType == DataType.STRING) {
                    return guard + pattern(v, required(cell.left(), op));
                }
                return guard + v + " == " + literal(cell.left(), dataType);
            case "NE":
                return guard + v + " != " + literal(cell.left(), dataType);
            case "LT":
                return guard + v + " < " + literal(cell.left(), dataType);
            case "LE":
                return guard + v + " <= " + literal(cell.left(), dataType);
            case "GT":
                return guard + v + " > " + literal(cell.left(), dataType);
            case "GE":
                return guard + v + " >= " + literal(cell.left(), dataType);
            case "IN": {
                List<String> parts = new ArrayList<>();
                for (String e : list(cell, op)) {
                    parts.add(v + " == " + literal(e, dataType));
                }
                return guard + "(" + String.join(" || ", parts) + ")";
            }
            case "NOT_IN": {
                List<String> parts = new ArrayList<>();
                for (String e : list(cell, op)) {
                    parts.add(v + " != " + literal(e, dataType));
                }
                return guard + String.join(" && ", parts);
            }
            case "CODE_IN":
                if (maruCodeId == null || maruCodeId.isEmpty()) {
                    throw new IllegalArgumentException("CODE_IN 에 마루 코드가 없다");
                }
                return guard + "MASTER(" + stringLiteral(maruCodeId) + ", " + stringLiteral(required(cell.left(), op))
                        + ", " + v + ")";
            case "CONTAINS":
                return guard + "INSTR(" + v + ", " + stringLiteral(nonEmpty(cell.left(), op)) + ") > 0";
            case "INSTR":
                return guard + "INSTR(" + stringLiteral(nonEmpty(cell.left(), op)) + ", " + v + ") > 0";
            case "IS_NULL":
                return v + " == NULL";
            case "NOT_NULL":
                return v + " != NULL";
            case "<= 변수 <=":
                return guard + range(v, ">=", "<=", cell, dataType);
            case "<= 변수 <":
                return guard + range(v, ">=", "<", cell, dataType);
            case "< 변수 <=":
                return guard + range(v, ">", "<=", cell, dataType);
            case "< 변수 <":
                return guard + range(v, ">", "<", cell, dataType);
            default:
                throw new IllegalArgumentException("모르는 op: " + op);
        }
    }

    /** 결과 셀 텍스트. val → 리터럴, expr → 그대로. */
    public static String resultText(RuleCell cell, DataType dataType) {
        if (cell.val() != null) {
            return literal(cell.val(), dataType);
        }
        if (cell.expr() != null) {
            return cell.expr();
        }
        throw new IllegalArgumentException("결과 셀에 val 도 expr 도 없다");
    }

    /** {@code =} 값(저장 문자열)이 정규식형이면 앵커 없는 Java 정규식, 정확 일치·단순형이면 빈 값. 거부 대상이면 IAE. */
    public static Optional<String> patternRegex(String patternValue) {
        List<int[]> tokens = tokenize(Objects.requireNonNull(patternValue, "patternValue"));
        return isRegexShape(tokens) ? Optional.of(regex(tokens)) : Optional.empty();
    }

    /** 정의의 모든 셀에 text 를 채운 새 RuleDefinition. {@code maruCodeIdByDomainId} 는 CODE_IN 셀에서만 부른다. */
    public static RuleDefinition withTexts(RuleDefinition definition, Function<String, String> maruCodeIdByDomainId) {
        Map<Integer, RuleVar> vars = new LinkedHashMap<>();
        for (RuleVar v : definition.vars()) {
            vars.put(v.varId(), v);
        }
        List<RuleRow> rows = new ArrayList<>();
        for (RuleRow row : definition.rows()) {
            Map<Integer, RuleCell> cells = new LinkedHashMap<>();
            for (Map.Entry<Integer, RuleCell> e : row.cells().entrySet()) {
                RuleCell c = e.getValue();
                try {
                    cells.put(e.getKey(), withText(c, text(vars.get(e.getKey()), c, maruCodeIdByDomainId)));
                } catch (IllegalArgumentException ex) {
                    throw new IllegalArgumentException("rule " + definition.ruleId() + " row " + row.rowId() + " var "
                            + e.getKey() + ": " + ex.getMessage(), ex);
                }
            }
            rows.add(new RuleRow(row.rowId(), row.seq(), row.rowKind(), Collections.unmodifiableMap(cells)));
        }
        return new RuleDefinition(definition.ruleId(), definition.ver(), definition.ruleKind(), definition.hitPolicy(),
                definition.applyFrom(), definition.applyTo(), definition.engineVersion(), definition.vars(),
                definition.contract(), Collections.unmodifiableList(rows));
    }

    // ------------------------------------------------------------------ 내부

    private static String text(RuleVar var, RuleCell cell, Function<String, String> maruCodeIdByDomainId) {
        if (var == null) {
            throw new IllegalArgumentException("변수 정의에 없는 var_id");
        }
        if (var.varKind() == VarKind.RESULT) {
            return resultText(cell, var.dataType());
        }
        boolean opCell = cell.op() != null && !cell.op().equals("NA");
        String subject = opCell ? subject(var) : null;
        String maruCodeId = "CODE_IN".equals(cell.op()) ? maruCodeIdByDomainId.apply(var.domainId()) : null;
        return conditionText(cell, subject, var.dataType(), maruCodeId);
    }

    private static RuleCell withText(RuleCell c, String text) {
        return new RuleCell(c.op(), c.left(), c.right(), c.list(), c.expr(), c.ast(), c.val(), text);
    }

    private static String identifier(String name) {
        if (!IDENTIFIER.matcher(name).matches()) {
            throw new IllegalArgumentException("식별자가 아니다: " + name);
        }
        return name;
    }

    private static String required(String value, String op) {
        if (value == null) {
            throw new IllegalArgumentException(op + " 값이 없다");
        }
        return value;
    }

    private static String nonEmpty(String value, String op) {
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException(op + " 값이 비었다");
        }
        return value;
    }

    private static List<String> list(RuleCell cell, String op) {
        if (cell.list() == null || cell.list().isEmpty()) {
            throw new IllegalArgumentException(op + " 목록이 비었다");
        }
        return cell.list();
    }

    /** 구간 op — 왼쪽 부등호는 뒤집어 {@code V ⊙ L}, 오른쪽은 그대로 {@code V ⊙ R}(06:154·252). */
    private static String range(String v, String leftOp, String rightOp, RuleCell cell, DataType dataType) {
        String l = literal(required(cell.left(), "구간 left"), dataType);
        String r = literal(required(cell.right(), "구간 right"), dataType);
        return v + " " + leftOp + " " + l + " && " + v + " " + rightOp + " " + r;
    }

    /** 데이터 타입으로 리터럴화(design §6.10.2). */
    private static String literal(String value, DataType dataType) {
        if (value == null) {
            throw new IllegalArgumentException("리터럴 값이 없다");
        }
        if (dataType == null) {
            throw new IllegalArgumentException("데이터 타입이 없다");
        }
        switch (dataType) {
            case NUMBER:
                return numberLiteral(value);
            case BOOLEAN:
                if (value.equalsIgnoreCase("TRUE")) {
                    return "TRUE";
                }
                if (value.equalsIgnoreCase("FALSE")) {
                    return "FALSE";
                }
                throw new IllegalArgumentException("불린이 아니다: " + value);
            default:
                return stringLiteral(value);
        }
    }

    /** 숫자 리터럴 — 선행 {@code +}·앞 0·끝 0 을 지우고, 0 은 {@code 0}, 음수는 괄호(06:248-249). */
    private static String numberLiteral(String value) {
        if (!NUMBER_LITERAL.matcher(value).matches()) {
            throw new IllegalArgumentException("숫자 형식이 아니다: " + value);
        }
        BigDecimal n = new BigDecimal(value).stripTrailingZeros();
        if (n.signum() == 0) {
            return "0";
        }
        String s = n.toPlainString();
        return n.signum() < 0 ? "(" + s + ")" : s;
    }

    /** 문자열 리터럴 — 큰따옴표, {@code \}·{@code "} 만 이스케이프, 제어문자 거부(06:247). */
    private static String stringLiteral(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 0x20 || c == 0x7F) {
                throw new IllegalArgumentException("제어문자가 있다: U+" + String.format(Locale.ROOT, "%04X", (int) c));
            }
            if (c == '\\' || c == '"') {
                sb.append('\\');
            }
            sb.append(c);
        }
        return sb.append('"').toString();
    }

    /** STRING EQ 값의 {@code =} 패턴(design §6.11). 반환값은 가드 뒤에 붙는 부분이다. */
    private static String pattern(String v, String value) {
        List<int[]> tokens = tokenize(value);
        int n = tokens.size();
        if (isRegexShape(tokens)) {
            return "STR_MATCHES(" + v + ", " + stringLiteral(regex(tokens)) + ")";
        }
        boolean firstAny = n > 0 && tokens.get(0)[0] == ANY;
        boolean lastAny = n > 0 && tokens.get(n - 1)[0] == ANY;
        if (firstAny && lastAny) {
            return "INSTR(" + v + ", " + stringLiteral(chars(tokens, 1, n - 1)) + ") > 0";
        }
        if (lastAny) {
            return "STR_STARTS_WITH(" + v + ", " + stringLiteral(chars(tokens, 0, n - 1)) + ")";
        }
        if (firstAny) {
            return "STR_ENDS_WITH(" + v + ", " + stringLiteral(chars(tokens, 1, n)) + ")";
        }
        return v + " == " + stringLiteral(chars(tokens, 0, n));
    }

    /** 토큰화 + 연속 ANY 접기 + 검사(design §6.11 1-3). 토큰은 {종류, 글자}. */
    private static List<int[]> tokenize(String value) {
        List<int[]> tokens = new ArrayList<>();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\') {
                if (i + 1 >= value.length()) {
                    throw new IllegalArgumentException("패턴 끝에 홀로 선 백슬래시: " + value);
                }
                char next = value.charAt(i + 1);
                if (next != '%' && next != '_' && next != '\\') {
                    throw new IllegalArgumentException("패턴에 홀로 선 백슬래시: " + value);
                }
                tokens.add(new int[] {CHAR, next});
                i++;
            } else if (c == '%') {
                if (tokens.isEmpty() || tokens.get(tokens.size() - 1)[0] != ANY) {
                    tokens.add(new int[] {ANY, c});
                }
            } else if (c == '_') {
                tokens.add(new int[] {ONE, c});
            } else {
                tokens.add(new int[] {CHAR, c});
            }
        }
        int anyCount = 0;
        for (int[] t : tokens) {
            anyCount += t[0] == ANY ? 1 : 0;
        }
        if (tokens.size() == 1 && tokens.get(0)[0] == ANY) {
            throw new IllegalArgumentException("% 단독 패턴: " + value);
        }
        if (anyCount > MAX_PATTERN_WILDCARDS) {
            throw new IllegalArgumentException("% 가 " + MAX_PATTERN_WILDCARDS + " 개를 넘는다: " + value);
        }
        return tokens;
    }

    private static boolean isRegexShape(List<int[]> tokens) {
        int n = tokens.size();
        int anyCount = 0;
        boolean wildcard = false;
        for (int[] t : tokens) {
            if (t[0] == ONE) {
                return true;
            }
            wildcard |= t[0] == ANY;
            anyCount += t[0] == ANY ? 1 : 0;
        }
        if (!wildcard) {
            return false;
        }
        boolean firstAny = tokens.get(0)[0] == ANY;
        boolean lastAny = tokens.get(n - 1)[0] == ANY;
        boolean simple = (!firstAny && lastAny && anyCount == 1)
                || (firstAny && !lastAny && anyCount == 1)
                || (firstAny && lastAny && anyCount == 2);
        return !simple;
    }

    private static String chars(List<int[]> tokens, int from, int to) {
        StringBuilder sb = new StringBuilder();
        for (int i = from; i < to; i++) {
            sb.append((char) tokens.get(i)[1]);
        }
        return sb.toString();
    }

    /** 정규식 — 글자의 메타문자만 {@code \} 로, ANY → {@code .*}, ONE → {@code .}, 앵커 없음(06:158). */
    private static String regex(List<int[]> tokens) {
        StringBuilder sb = new StringBuilder();
        for (int[] t : tokens) {
            if (t[0] == ANY) {
                sb.append(".*");
            } else if (t[0] == ONE) {
                sb.append('.');
            } else {
                String c = String.valueOf((char) t[1]);
                if (REGEX_META.contains(c)) {
                    sb.append('\\');
                }
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
