package kr.dongkuk.maru.mdm.engine.domain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CodeRef;

/**
 * 상속 체인 AND 누적 유효 식 조립(02:79, 02:103-134, TSK-03-02 design §6.8). 유효 식은 저장하지 않는 파생값이다 —
 * 쓰는 시점에 부모 체인을 올라가며 만든다. 목록은 모두 최상위 조상부터 자신까지의 순서다.
 *
 * <p>유효 AST 는 조상 AST 를 AND 노드로 잇기만 하고 다시 파싱하지 않는다(02:125). EvalEx AST 에는 괄호 노드가 없고
 * {@code &&} 는 왼쪽 결합이므로, 이렇게 이은 AST 는 유효 텍스트를 다시 파싱한 AST 와 같다.
 */
public final class EffectiveExpressions {

    private static final String BASE = "BASE";

    private EffectiveExpressions() {}

    /** null·공백 식은 건너뛴다. 0개면 null, 1개면 그 식 그대로, 2개 이상이면 {@code (a) && (b) && …}. */
    public static String text(List<String> ownRootFirst) {
        List<String> own = ownRootFirst.stream().filter(s -> s != null && !s.isBlank()).toList();
        if (own.isEmpty()) {
            return null;
        }
        if (own.size() == 1) {
            return own.get(0);
        }
        StringBuilder sb = new StringBuilder();
        for (String s : own) {
            if (!sb.isEmpty()) {
                sb.append(" && ");
            }
            sb.append('(').append(s).append(')');
        }
        return sb.toString();
    }

    /** null 은 건너뛴다. 0개면 null, 1개면 그대로(복사), 2개 이상이면 왼쪽 중첩 AND — {@code AND(AND(조부, 부), 자신)}. */
    public static Map<String, Object> ast(List<Map<String, Object>> ownAstsRootFirst) {
        Map<String, Object> acc = null;
        for (Map<String, Object> next : ownAstsRootFirst) {
            if (next == null) {
                continue;
            }
            acc = acc == null ? new LinkedHashMap<>(next) : and(acc, next);
        }
        return acc;
    }

    private static Map<String, Object> and(Map<String, Object> left, Map<String, Object> right) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", "INFIX_OPERATOR");
        node.put("value", "&&");
        node.put("params", List.of(left, right));
        return node;
    }

    /** CODE 종류의 자동 생성 식 {@code MASTER("<마루 코드>", "<카테고리>", value)}(02:55). 카테고리가 비면 BASE. */
    public static String codeRefText(CodeRef ref) {
        return "MASTER(" + quote(ref.maruCodeId()) + ", " + quote(cate(ref)) + ", " + ReservedNames.DOMAIN_VALUE + ")";
    }

    /** {@link #codeRefText} 와 같은 모양의 FUNCTION 노드. */
    public static Map<String, Object> codeRefAst(CodeRef ref) {
        List<Map<String, Object>> params = new ArrayList<>();
        params.add(leaf("STRING_LITERAL", ref.maruCodeId()));
        params.add(leaf("STRING_LITERAL", cate(ref)));
        params.add(leaf("VARIABLE_OR_CONSTANT", ReservedNames.DOMAIN_VALUE));
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", "FUNCTION");
        node.put("value", "MASTER");
        node.put("params", params);
        return node;
    }

    /** 유효 코드 참조 — 부모 체인에서 가장 가까운(자신 쪽) 지정값(02:115, 대체 상속). 없으면 null. */
    public static CodeRef effectiveCodeRef(List<CodeRef> rootFirst) {
        for (int i = rootFirst.size() - 1; i >= 0; i--) {
            if (rootFirst.get(i) != null) {
                return rootFirst.get(i);
            }
        }
        return null;
    }

    /** 비즈니스 요구 변수 — 유효 비즈니스식이 쓰는 변수에서 {@code value} 를 뺀 이름(상수는 이미 빠져 있다, 02:80). */
    public static List<String> bizRequiredVars(String effectiveBizText, MdmEvaluator evaluator) {
        Objects.requireNonNull(evaluator, "evaluator");
        if (effectiveBizText == null || effectiveBizText.isBlank()) {
            return List.of();
        }
        return evaluator.usedVariables(effectiveBizText).stream()
                .filter(v -> !v.equalsIgnoreCase(ReservedNames.DOMAIN_VALUE))
                .toList();
    }

    private static String cate(CodeRef ref) {
        return ref.cateId() == null || ref.cateId().isEmpty() ? BASE : ref.cateId();
    }

    private static Map<String, Object> leaf(String type, String value) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", type);
        node.put("value", value);
        return node;
    }

    /** EvalEx 문자열 리터럴 — {@code "}·{@code \} 를 이스케이프한다. */
    private static String quote(String s) {
        return '"' + s.replace("\\", "\\\\").replace("\"", "\\\"") + '"';
    }
}
