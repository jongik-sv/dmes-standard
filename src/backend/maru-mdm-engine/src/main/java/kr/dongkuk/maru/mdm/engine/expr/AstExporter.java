package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.parser.ASTNode;
import com.ezylang.evalex.parser.ParseException;
import com.ezylang.evalex.parser.Token;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * EvalEx AST → 화면 인터프리터가 읽는 JSON 구조(evalex-guide §8.3, engine-contract §9). 원천 샘플
 * {@code js/AstExporter.java} 를 옮겼다. {@code type} 은 토큰 종류 이름, {@code value} 는 리터럴 원문·이름·기호,
 * 자식이 있을 때만 {@code params} 를 둔다. 정본 모양은 스키마 {@code $defs/AstNode} 다.
 *
 * <p>파싱은 식을 저장할 때 한 번만 한다(EG §8.1). 원천 샘플의 {@code assertDomainRule} 은 옮기지 않았다 —
 * 칸 단위 검사는 {@link ExpressionChecker} 가 한다.
 */
public final class AstExporter {

    private AstExporter() {}

    /** 식 텍스트 → AST JSON(Map). 문법 오류면 {@link ParseException}. */
    public static Map<String, Object> export(String expression, ExpressionConfiguration configuration)
            throws ParseException {
        return toMap(new Expression(expression, configuration).getAbstractSyntaxTree());
    }

    /** ASTNode → Map(재귀). */
    public static Map<String, Object> toMap(ASTNode node) {
        Token token = node.getToken();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", token.getType().name());
        m.put("value", token.getValue());
        List<ASTNode> children = node.getParameters();
        if (children != null && !children.isEmpty()) {
            List<Map<String, Object>> params = new ArrayList<>(children.size());
            for (ASTNode child : children) {
                params.add(toMap(child));
            }
            m.put("params", params);
        }
        return m;
    }

    /**
     * ASTNode → 계약 record. 자식이 없으면 빈 목록이다.
     *
     * @throws IllegalArgumentException 토큰 종류가 {@link AstNode.Type} 여섯 밖일 때(설정상 나오지 않는다)
     */
    public static AstNode toAstNode(ASTNode node) {
        Token token = node.getToken();
        AstNode.Type type = AstNode.Type.valueOf(token.getType().name());
        List<ASTNode> children = node.getParameters();
        List<AstNode> params = children == null ? List.of() : children.stream().map(AstExporter::toAstNode).toList();
        return new AstNode(type, token.getValue(), params);
    }
}
