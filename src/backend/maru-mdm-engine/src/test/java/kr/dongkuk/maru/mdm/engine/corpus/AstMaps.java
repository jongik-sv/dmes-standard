package kr.dongkuk.maru.mdm.engine.corpus;

import com.ezylang.evalex.parser.ASTNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * EvalEx {@link ASTNode} → 코퍼스 {@code AstNode} JSON 모양(TSK-03-04 design §6.11, 원천 {@code AstExporter.toMap} 규칙).
 * 자식이 없으면 {@code params} 키를 뺀다(스키마 {@code $defs/AstNode}).
 */
final class AstMaps {

    private AstMaps() {}

    static Map<String, Object> toMap(ASTNode node) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", node.getToken().getType().name());
        m.put("value", node.getToken().getValue());
        if (!node.getParameters().isEmpty()) {
            List<Map<String, Object>> params = new ArrayList<>();
            for (ASTNode p : node.getParameters()) {
                params.add(toMap(p));
            }
            m.put("params", params);
        }
        return m;
    }
}
