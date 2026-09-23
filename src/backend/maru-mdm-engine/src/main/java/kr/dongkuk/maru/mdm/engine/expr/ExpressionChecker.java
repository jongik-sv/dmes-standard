package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.parser.ASTNode;
import com.ezylang.evalex.parser.ParseException;
import com.ezylang.evalex.parser.Token;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;

/**
 * 저장 시 검사(06:446, 06:339·346·347·348, TSK-03-02 design §6.4). 파싱 → 칸별 함수 화이트리스트 → {@code MASTER}
 * 인자 모양 → {@code STR_MATCHES} 정규식 → 변수(예약 이름, {@code DOMAIN_STD} 의 {@code value} 전용) 순으로 보고
 * 문제를 모두 모아 돌려준다. 결과 타입(boolean 인지)은 테스트 케이스 평가로 확인하는 서버 몫이다.
 */
public final class ExpressionChecker {

    /** 파싱 실패 — 사전 밖 함수·인자 수 부족·문법 축소 위반. */
    public static final String PARSE = "PARSE";
    /** 칸에서 허용하지 않는 함수(비즈니스 함수를 표준 칸에 쓴 경우 등). */
    public static final String FUNCTION = "FUNCTION";
    /** {@code DOMAIN_STD} 에 {@code value} 밖의 변수. */
    public static final String VARIABLE = "VARIABLE";
    /** 예약 이름({@code EVAL_TS}·{@code _} 접두·상수 8종). */
    public static final String RESERVED = "RESERVED";
    /** {@code MASTER}·{@code MASTER_AT} 의 인자 수·리터럴·{@code attr} 모양 위반. */
    public static final String MDM_ARGUMENT = "MDM_ARGUMENT";
    /** {@code STR_MATCHES} 정규식 위반({@link RegexPolicy}) 또는 패턴이 리터럴이 아니다. */
    public static final String REGEX = "REGEX";

    private static final Pattern ATTR = Pattern.compile("attr(0[1-9]|10)");

    private final MdmEvaluator evaluator;

    public ExpressionChecker(MdmEvaluator evaluator) {
        this.evaluator = Objects.requireNonNull(evaluator, "evaluator");
    }

    /** 문제 목록. 비었으면 통과다. */
    public List<Problem> check(String text, Slot slot) {
        List<Problem> out = new ArrayList<>();
        Expression expression = new Expression(text, evaluator.configuration());
        Set<String> usedVariables;
        List<ASTNode> nodes;
        try {
            expression.validate();
            usedVariables = expression.getUsedVariables();
            nodes = expression.getAllASTNodes();
        } catch (ParseException e) {
            out.add(new Problem(PARSE, e.getMessage()));
            return out;
        }
        Set<String> allowed = new HashSet<>(FunctionSets.STANDARD);
        if (slot.businessFunctions()) {
            allowed.addAll(evaluator.businessFunctionNames());
        }
        for (ASTNode node : nodes) {
            Token token = node.getToken();
            if (token.getType() != Token.TokenType.FUNCTION) {
                continue;
            }
            String name = token.getValue().toUpperCase(Locale.ROOT);
            if (!allowed.contains(name)) {
                out.add(new Problem(FUNCTION, slot + " 칸에서 쓸 수 없는 함수: " + token.getValue()));
            }
            if (name.equals("MASTER")) {
                checkMaster(node, MdmFunction.MASTER, out);
            } else if (name.equals("MASTER_AT")) {
                checkMaster(node, MdmFunction.MASTER_AT, out);
            } else if (name.equals("STR_MATCHES")) {
                checkRegex(node, out);
            }
        }
        for (String variable : usedVariables) {
            if (isReservedInExpression(variable)) {
                out.add(new Problem(RESERVED, "식에 쓸 수 없는 예약 변수: " + variable));
            } else if (slot.valueOnly() && !variable.equalsIgnoreCase(ReservedNames.DOMAIN_VALUE)) {
                out.add(new Problem(VARIABLE, slot + " 칸은 value 만 쓴다: " + variable));
            }
        }
        return out;
    }

    /** 선언 변수명 검사(06:347) — 상수 8종·{@code EVAL_TS}·{@code _} 접두는 쓸 수 없다(대소문자 무시). */
    public static List<Problem> checkVariableName(String name) {
        List<Problem> out = new ArrayList<>();
        if (ReservedNames.CONSTANTS.contains(name.toUpperCase(Locale.ROOT)) || isReservedInExpression(name)) {
            out.add(new Problem(RESERVED, "변수명으로 쓸 수 없는 예약 이름: " + name));
        }
        return out;
    }

    private static boolean isReservedInExpression(String name) {
        return name.toUpperCase(Locale.ROOT).equals(ReservedNames.EVAL_TS) || name.startsWith(ReservedNames.RESERVED_PREFIX);
    }

    /**
     * 인자 수, id·cate 문자열 리터럴, attr 자리(있으면) 문자열 리터럴 {@code attr01}-{@code attr10}(06:339).
     * attr 은 최소 인자 수 바로 뒤 자리다(MASTER 넷째, MASTER_AT 다섯째).
     */
    private static void checkMaster(ASTNode node, MdmFunction shape, List<Problem> out) {
        List<ASTNode> args = node.getParameters();
        String name = shape.name();
        if (args.size() < shape.minArgs() || args.size() > shape.maxArgs()) {
            out.add(new Problem(MDM_ARGUMENT, name + " 인자는 " + shape.minArgs() + "-" + shape.maxArgs() + "개다: "
                    + args.size() + "개"));
            return;
        }
        if (!isStringLiteral(args.get(0))) {
            out.add(new Problem(MDM_ARGUMENT, name + " 의 id 는 문자열 리터럴이어야 한다"));
        }
        if (!isStringLiteral(args.get(1))) {
            out.add(new Problem(MDM_ARGUMENT, name + " 의 cate 는 문자열 리터럴이어야 한다"));
        }
        if (args.size() > shape.minArgs()) {
            ASTNode attr = args.get(shape.minArgs());
            if (!isStringLiteral(attr) || !ATTR.matcher(attr.getToken().getValue()).matches()) {
                out.add(new Problem(MDM_ARGUMENT, name + " 의 attr 는 \"attr01\"-\"attr10\" 문자열 리터럴이어야 한다: "
                        + attr.getToken().getValue()));
            }
        }
    }

    /** 패턴이 리터럴이면 {@link RegexPolicy} 로 보고, 아니면 검사할 수 없으므로 거부한다. */
    private static void checkRegex(ASTNode node, List<Problem> out) {
        List<ASTNode> args = node.getParameters();
        if (args.size() < 2 || !isStringLiteral(args.get(1))) {
            out.add(new Problem(REGEX, "STR_MATCHES 의 패턴은 문자열 리터럴이어야 한다"));
            return;
        }
        String pattern = args.get(1).getToken().getValue();
        RegexPolicy.violations(pattern).forEach(v -> out.add(new Problem(REGEX, v + " — " + pattern)));
    }

    private static boolean isStringLiteral(ASTNode node) {
        return node.getToken().getType() == Token.TokenType.STRING_LITERAL;
    }

    /** 검사 문제 하나. expr 패키지에는 record 를 두지 않는다(영구 스키마 대조 테스트). */
    public static final class Problem {
        private final String kind;
        private final String detail;

        public Problem(String kind, String detail) {
            this.kind = Objects.requireNonNull(kind, "kind");
            this.detail = Objects.requireNonNull(detail, "detail");
        }

        /** {@link #PARSE}·{@link #FUNCTION}·{@link #VARIABLE}·{@link #RESERVED}·{@link #MDM_ARGUMENT}·{@link #REGEX}. */
        public String kind() {
            return kind;
        }

        public String detail() {
            return detail;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Problem p && kind.equals(p.kind) && detail.equals(p.detail);
        }

        @Override
        public int hashCode() {
            return Objects.hash(kind, detail);
        }

        @Override
        public String toString() {
            return kind + ": " + detail;
        }
    }
}
