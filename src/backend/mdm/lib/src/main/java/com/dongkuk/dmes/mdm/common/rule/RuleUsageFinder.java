package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 룰 활용처 계산(TSK-08-02 design §6.3.9, 카드 ⑧). 이 룰을 담은 세트마다, 세트 안 각 룰의 "읽는 이름"과 "만드는 이름"을 그 룰의
 * 최신 RELEASED 버전으로 계산한다(06:754 세트 계산 관례). 이 룰에 RELEASED 가 없으면 이 룰만 호출자가 준 버전으로 계산한다.
 *
 * <ul>
 *   <li>읽는 이름: 식 변수가 아닌 COND 의 {@code VAR_NAME} + 식 변수 {@code VAR_AST} 와 Expression 셀 {@code ast} 의
 *       {@code VARIABLE_OR_CONSTANT} 노드 값</li>
 *   <li>만드는 이름: RESULT 의 {@code VAR_NAME}, 결과 열 그룹이면 {@code RES_GRP}</li>
 * </ul>
 */
@Component
public class RuleUsageFinder {

    /** 세트 하나의 활용처 — 의존·역의존 룰은 세트에 적힌 순서다. */
    public record SetUsage(String setId, String setName, String status, List<String> dependsOn, List<String> dependedBy) {
    }

    private record Names(Set<String> reads, Set<String> produces) {
    }

    private final RuleQueries queries;

    public RuleUsageFinder(RuleQueries queries) {
        this.queries = queries;
    }

    /** @param fallbackVer 이 룰에 RELEASED 가 없을 때 쓸 버전(view 의 선택 버전). null 이면 이 룰의 이름은 비어 있다 */
    public List<SetUsage> find(String ruleId, Integer fallbackVer) {
        List<SetUsage> out = new ArrayList<>();
        for (MdmRuleSet set : queries.allSets()) {
            List<String> members = new ArrayList<>(new LinkedHashSet<>(DomainJson.readList(set.getRuleIds()).stream().map(String::valueOf).toList()));
            if (!members.contains(ruleId)) {
                continue;
            }
            Map<String, Integer> released = queries.latestReleasedVers(members);
            Integer selfVer = released.containsKey(ruleId) ? released.get(ruleId) : fallbackVer;
            Names self = selfVer == null ? new Names(Set.of(), Set.of()) : names(ruleId, selfVer);
            List<String> dependsOn = new ArrayList<>();
            List<String> dependedBy = new ArrayList<>();
            for (String other : members) {
                if (other.equals(ruleId) || !released.containsKey(other)) {
                    continue;
                }
                Names o = names(other, released.get(other));
                if (intersects(o.produces(), self.reads())) {
                    dependsOn.add(other);
                }
                if (intersects(o.reads(), self.produces())) {
                    dependedBy.add(other);
                }
            }
            out.add(new SetUsage(set.getMaruRuleSetId(), set.getMaruRuleSetName(), set.getStatus(), dependsOn, dependedBy));
        }
        return out;
    }

    private Names names(String ruleId, int ver) {
        Set<String> reads = new LinkedHashSet<>();
        Set<String> produces = new LinkedHashSet<>();
        for (MdmRuleVar v : queries.vars(ruleId, ver)) {
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
        for (MdmRuleRow row : queries.rows(ruleId, ver)) {
            for (Map<String, Object> cell : RuleCellsCodec.parse(row.getCells()).values()) {
                if (cell.get("ast") instanceof Map<?, ?> ast) {
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

    private static boolean intersects(Set<String> a, Set<String> b) {
        for (String x : a) {
            if (b.contains(x)) {
                return true;
            }
        }
        return false;
    }
}
