package kr.dongkuk.maru.mdm.engine.expr;

import java.util.List;
import java.util.Set;

/**
 * AST JSON 노드(evalex-guide §8.3, 06:1054 — {@code type}·{@code value}·{@code params}).
 * 정본은 JSON Schema {@code ast-node} 정의이며 이 record 는 그 Java 거울이다(TSK-02-02 design §6.3).
 * 엔진은 AST 를 {@code Map} 으로 내보내고(06:467) 읽지 않는다(06:471). 이 타입은 내보내기·검사 코드가 쓴다.
 *
 * @param value  리터럴 원문(NUMBER_LITERAL 은 입력 텍스트 그대로 — 예 {@code "1.60"}, {@code "1e-3"}, {@code "0xFF"}),
 *               STRING_LITERAL 은 이스케이프를 푼 값, 그 밖에는 이름·기호
 * @param params 자식. 없으면 빈 목록이고 JSON 에서는 키를 뺀다
 */
public record AstNode(Type type, String value, List<AstNode> params) {

    /** 설정({@link MdmExpressionConfig#baseBuilder()})이 허용하는 노드 종류 여섯. ARRAY_INDEX·STRUCTURE_SEPARATOR·POSTFIX_OPERATOR 는 나오지 않는다. */
    public enum Type { NUMBER_LITERAL, STRING_LITERAL, VARIABLE_OR_CONSTANT, PREFIX_OPERATOR, INFIX_OPERATOR, FUNCTION }

    /** EvalEx 3.7.0 표준 중위 연산자(evalex-guide §2). */
    public static final Set<String> INFIX_OPERATORS = Set.of(
            "+", "-", "*", "/", "%", "^", "=", "==", "!=", "<>", "<", "<=", ">", ">=", "&&", "||");

    public static final Set<String> PREFIX_OPERATORS = Set.of("-", "+", "!");
}
