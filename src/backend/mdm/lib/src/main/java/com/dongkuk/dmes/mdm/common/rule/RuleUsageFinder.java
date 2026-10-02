package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads;
import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads.Names;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 룰 활용처 계산(TSK-08-02 design §6.3.9, 카드 ⑧). 이 룰을 담은 세트마다, 세트 안 각 룰의 "읽는 이름"과 "만드는 이름"을 그 룰의
 * 최신 RELEASED 버전으로 계산한다(06:754 세트 계산 관례). 이 룰에 RELEASED 가 없으면 이 룰만 호출자가 준 버전으로 계산한다.
 * 세트의 멤버 룰은 세트의 표시 버전(지금 적용 중인 RELEASED, 없으면 VER 최대 — D-144 2단계 J11)의 RULE_IDS 다.
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

    private final RuleQueries queries;
    private final RuleSetVersionQueries setVersions;
    private final Clock clock;

    public RuleUsageFinder(RuleQueries queries, RuleSetVersionQueries setVersions, Clock clock) {
        this.queries = queries;
        this.setVersions = setVersions;
        this.clock = clock;
    }

    /** @param fallbackVer 이 룰에 RELEASED 가 없을 때 쓸 버전(view 의 선택 버전). null 이면 이 룰의 이름은 비어 있다 */
    public List<SetUsage> find(String ruleId, BigDecimal fallbackVer) {
        List<SetUsage> out = new ArrayList<>();
        List<MdmRuleSet> sets = queries.allSets();
        Map<String, List<MdmRuleSetVer>> byId = setVersions.versionsOf(sets.stream().map(MdmRuleSet::getMaruRuleSetId).toList());
        LocalDateTime now = LocalDateTime.now(clock);
        for (MdmRuleSet set : sets) {
            List<String> members = RuleSetVersionQueries.display(byId.get(set.getMaruRuleSetId()), now)
                    .map(RuleSetVersionQueries::members).orElse(List.of());
            if (!members.contains(ruleId)) {
                continue;
            }
            Map<String, BigDecimal> released = queries.latestReleasedVers(members);
            BigDecimal selfVer = released.containsKey(ruleId) ? released.get(ruleId) : fallbackVer;
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

    /** 이름 계산은 {@link RuleDefinitionReads} 가 맡는다(TSK-08-04 — 세트 순서 검사와 같은 계산). */
    private Names names(String ruleId, BigDecimal ver) {
        return RuleDefinitionReads.of(queries.vars(ruleId, ver),
                queries.rows(ruleId, ver).stream().map(r -> RuleCellsCodec.parse(r.getCells())).toList());
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
