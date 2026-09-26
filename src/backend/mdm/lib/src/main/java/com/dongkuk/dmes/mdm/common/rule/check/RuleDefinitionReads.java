package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 룰 하나가 읽는 이름과 만드는 이름(TSK-08-04 design §2.2, 06:754 세트 계산 관례). 활용처(카드 ⑧, {@code RuleUsageFinder})와 세트 순서 검사
 * ({@code RuleSetOrderCheck})가 같은 계산을 쓴다. 이름은 저장된 글자 그대로다(대문자로 바꾸지 않고 상수도 거르지 않는다).
 *
 * <ul>
 *   <li>읽는 이름: 식 변수가 아닌 COND 의 {@code VAR_NAME} + 식 변수 {@code VAR_AST} 와 셀 {@code ast} 의 {@code VARIABLE_OR_CONSTANT} 노드 값</li>
 *   <li>만드는 이름: RESULT 의 {@code VAR_NAME}, 결과 열 그룹이면 {@code RES_GRP}</li>
 * </ul>
 */
public final class RuleDefinitionReads {

    public record Names(Set<String> reads, Set<String> produces) {
    }

    private RuleDefinitionReads() {
    }

    /** @param rowCells 행마다 파싱한 셀(var_id → 셀) */
    public static Names of(List<MdmRuleVar> vars, List<Map<Integer, Map<String, Object>>> rowCells) {
        Set<String> reads = new LinkedHashSet<>();
        Set<String> produces = new LinkedHashSet<>();
        for (MdmRuleVar v : vars) {
            boolean exprVar = v.getVarAst() != null && !v.getVarAst().isBlank();
            if ("COND".equals(v.getVarKind())) {
                if (exprVar) {
                    collect(DomainJson.readMap(v.getVarAst()), reads);
                } else if (v.getVarName() != null && !v.getVarName().isBlank()) {
                    reads.add(v.getVarName());
                }
            } else {
                if (v.getVarName() != null && !v.getVarName().isBlank()) {
                    produces.add(v.getVarName());
                }
                if (v.getResGrp() != null && !v.getResGrp().isBlank()) {
                    produces.add(v.getResGrp());
                }
            }
        }
        for (Map<Integer, Map<String, Object>> cells : rowCells) {
            for (Map<String, Object> cell : cells.values()) {
                Map<String, Object> ast = RuleCellsCodec.ast(cell.get("ast"));
                if (ast != null) {
                    collect(ast, reads);
                }
            }
        }
        return new Names(reads, produces);
    }

    private static void collect(Map<?, ?> node, Set<String> into) {
        if (node == null) {
            return;
        }
        if ("VARIABLE_OR_CONSTANT".equals(node.get("type")) && node.get("value") instanceof String name) {
            into.add(name);
        }
        if (node.get("params") instanceof List<?> params) {
            for (Object p : params) {
                if (p instanceof Map<?, ?> child) {
                    collect(child, into);
                }
            }
        }
    }
}
