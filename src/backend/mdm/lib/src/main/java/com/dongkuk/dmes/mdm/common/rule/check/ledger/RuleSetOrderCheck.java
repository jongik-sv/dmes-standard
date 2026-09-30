package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads;
import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads.Names;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 룰 세트 순서(06:327, TSK-08-04 design §6.4, 흐름도 계획 Task 9). 이 룰을 담은 INUSE 세트마다 흐름(FLOW_JSON, 없으면 RULE_IDS 한 줄
 * 흐름)을 만들고, 이 룰과 다른 룰의 노드 관계({@code FlowTree.relation})로 판정한다. 이 룰은 저장하려는 정의, 나머지 룰은 최신 RELEASED
 * 버전으로 읽는 이름·만드는 이름({@link RuleDefinitionReads})을 견준다. RELEASED 가 없는 룰은 건너뛴다. 구조 오류가 있는 흐름도 건너뛴다
 * (세트 저장 검사가 막는다). 규칙표는 계획 Task 9: SET_CYCLE·SET_ORDER·SET_PAR_SIBLING·SET_IF_SIBLING(ERROR), SET_DUP_RESULT(WARNING).
 */
@Component
@Order(1)
public class RuleSetOrderCheck implements RuleSaveCheck {

    private final RuleQueries queries;

    public RuleSetOrderCheck(RuleQueries queries) {
        this.queries = queries;
    }

    @Override
    public Set<RuleSaveTarget> targets() {
        return EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.COLUMNS, RuleSaveTarget.STORED);
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        Names self = RuleDefinitionReads.of(ctx.rawVars(), LedgerCells.rowCells(ctx.rows()));
        String me = ctx.ruleId();
        for (MdmRuleSet set : queries.allSets()) {
            if (!"INUSE".equals(set.getStatus())) {
                continue;
            }
            List<String> members = new ArrayList<>(new LinkedHashSet<>(DomainJson.readList(set.getRuleIds()).stream().map(String::valueOf).toList()));
            if (!members.contains(me)) {
                continue;
            }
            FlowTree tree = tree(set, members);
            if (tree == null) {
                continue;
            }
            String s = set.getMaruRuleSetId();
            Map<String, Integer> released = queries.latestReleasedVers(members);
            for (String other : members) {
                if (other.equals(me) || !released.containsKey(other)) {
                    continue;
                }
                int ver = released.get(other);
                Names o = RuleDefinitionReads.of(queries.vars(other, ver),
                        queries.rows(other, ver).stream().map(r -> RuleCellsCodec.parse(r.getCells())).toList());
                Set<String> readsOther = common(self.reads(), o.produces());
                Set<String> readByOther = common(self.produces(), o.reads());
                Set<String> dup = common(self.produces(), o.produces());
                Set<Relation> rels = relations(tree, me, other);
                boolean seq = rels.contains(Relation.BEFORE) || rels.contains(Relation.AFTER);
                if (!readsOther.isEmpty() && !readByOther.isEmpty() && seq) {
                    out.add(error(RuleSaveIssueCode.SET_CYCLE, "세트 " + s + ": " + me + "와(과) " + other + "가 서로의 결과를 읽는다(" + me + " ← "
                            + readsOther + ", " + other + " ← " + readByOther + ") — 순서로 풀리지 않는 순환이다"));
                } else if (!readsOther.isEmpty() && rels.contains(Relation.BEFORE)) {
                    out.add(error(RuleSaveIssueCode.SET_ORDER, "세트 " + s + ": " + me + "이(가) 뒤에 있는 " + other + "의 결과 " + readsOther
                            + "를 읽는다. " + other + "를 앞으로 옮긴다"));
                } else if (!readByOther.isEmpty() && rels.contains(Relation.AFTER)) {
                    out.add(error(RuleSaveIssueCode.SET_ORDER, "세트 " + s + ": 앞에 있는 " + other + "이(가) 이 룰의 결과 " + readByOther
                            + "를 읽는다. 이 룰을 " + other + " 앞으로 옮긴다"));
                }
                boolean reads = !readsOther.isEmpty() || !readByOther.isEmpty();
                if (reads && rels.contains(Relation.PARALLEL)) {
                    out.add(error(RuleSaveIssueCode.SET_PAR_SIBLING, "세트 " + s + ": " + me + "와(과) " + other
                            + "가 병렬 형제 갈래에서 서로의 결과를 읽는다(" + me + " ← " + readsOther + ", " + other + " ← " + readByOther
                            + ") — 병렬 갈래끼리는 결과를 읽을 수 없다"));
                }
                if (reads && rels.equals(Set.of(Relation.EXCLUSIVE))) {
                    out.add(error(RuleSaveIssueCode.SET_IF_SIBLING, "세트 " + s + ": " + me + "와(과) " + other
                            + "가 같은 IF 의 다른 갈래에 있는데 한쪽이 다른 쪽 결과를 읽는다(" + me + " ← " + readsOther + ", " + other + " ← "
                            + readByOther + ") — 그 갈래를 타면 값이 없다"));
                }
                if (!dup.isEmpty() && rels.contains(Relation.PARALLEL)) {
                    out.add(error(RuleSaveIssueCode.SET_PAR_SIBLING, "세트 " + s + ": 병렬 형제 갈래의 " + other + "도 결과 " + dup + "를 대입한다"));
                } else if (!dup.isEmpty() && seq) {
                    out.add(RuleCheckReport.issue(RuleSaveIssueCode.SET_DUP_RESULT.name(), RuleCheckReport.WARNING, List.of(), null,
                            "세트 " + s + ": " + other + "도 결과 " + dup + "를 대입한다"));
                }
            }
        }
        return out;
    }

    /** 세트의 흐름 트리. FLOW_JSON 이 없으면 RULE_IDS 한 줄 흐름. 형식·구조 오류면 null(건너뛴다). */
    private static FlowTree tree(MdmRuleSet set, List<String> members) {
        FlowDefinition flow;
        try {
            flow = set.getFlowJson() == null ? FlowParser.linear(members) : RuleSetFlowJson.parse(set.getFlowJson());
        } catch (IllegalArgumentException e) {
            return null;
        }
        FlowParse p = FlowParser.parse(flow);
        return p.issues().isEmpty() ? p.tree() : null;
    }

    /** me 의 모든 노드 × other 의 모든 노드 관계(relation(meNode, otherNode)). */
    private static Set<Relation> relations(FlowTree tree, String me, String other) {
        Set<Relation> out = EnumSet.noneOf(Relation.class);
        for (RuleStep a : tree.ruleSteps()) {
            if (!a.ruleId().equals(me)) {
                continue;
            }
            for (RuleStep b : tree.ruleSteps()) {
                if (b.ruleId().equals(other)) {
                    out.add(tree.relation(a.nodeId(), b.nodeId()));
                }
            }
        }
        return out;
    }

    private static Map<String, Object> error(RuleSaveIssueCode code, String message) {
        return RuleCheckReport.issue(code.name(), RuleCheckReport.ERROR, List.of(), null, message);
    }

    private static Set<String> common(Set<String> a, Set<String> b) {
        Set<String> out = new LinkedHashSet<>(a);
        out.retainAll(b);
        return out;
    }
}
