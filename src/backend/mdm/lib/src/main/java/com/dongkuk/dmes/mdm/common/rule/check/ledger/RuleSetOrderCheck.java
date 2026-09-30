package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetPathState;
import com.dongkuk.dmes.mdm.common.rule.RuleSetPathState.At;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads;
import com.dongkuk.dmes.mdm.common.rule.check.RuleDefinitionReads.Names;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
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
 *
 * <p>형제 읽기(SET_IF_SIBLING·SET_PAR_SIBLING 의 읽기 판정)는 2단계 계획 P4 로 노드 쌍 단위다 — 세트 저장 검사와 같은 경로 상태
 * ({@link RuleSetPathState#before})로, 읽는 노드 직전 경로에서 이미 정의됐을 수 있는 이름(defined·maybe)은 형제가 만들어도 문제 삼지 않는다.
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

    /**
     * P4 대조용 — 형제 읽기 판정 한 건(세트의 me 노드·other 노드 쌍, 관계는 EXCLUSIVE 또는 PARALLEL). {@code meReads} = me 노드가 읽고 other 가 만들며
     * {@code before(meNode)} 의 defined·maybe 에 없는 이름, {@code otherReads} = other 노드가 읽고 me 가 만들며 {@code before(otherNode)} 에 없는 이름.
     * 둘 다 비면 적지 않는다. {@link #check} 의 SET_IF_SIBLING·SET_PAR_SIBLING(읽기)은 이 쌍들을 룰 쌍마다 합친 것이다.
     */
    public record SiblingRead(String setId, Relation relation, String meNode, String otherRuleId, String otherNode, Set<String> meReads,
                              Set<String> otherReads) {
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        return run(ctx).issues();
    }

    /** P4 대조용 — {@link #check} 와 같은 경로로 계산한 노드 쌍 형제 읽기 판정(세트 ID 순, 세트 안에서는 룰 목록·깊이 우선 순). */
    public List<SiblingRead> siblingReads(RuleSaveContext ctx) {
        return run(ctx).siblings();
    }

    private record Run(List<Map<String, Object>> issues, List<SiblingRead> siblings) {
    }

    private Run run(RuleSaveContext ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        List<SiblingRead> siblings = new ArrayList<>();
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
            Map<String, Names> others = new LinkedHashMap<>();
            for (String other : members) {
                if (other.equals(me) || !released.containsKey(other)) {
                    continue;
                }
                int ver = released.get(other);
                others.put(other, RuleDefinitionReads.of(queries.vars(other, ver),
                        queries.rows(other, ver).stream().map(r -> RuleCellsCodec.parse(r.getCells())).toList()));
            }
            // P4 — 노드마다 직전 경로 상태. me 는 저장하려는 정의, 다른 룰은 최신 RELEASED(없으면 만드는 이름 없음).
            Map<String, At> before = RuleSetPathState.before(tree, id -> id.equals(me) ? self.produces()
                    : others.containsKey(id) ? others.get(id).produces() : Set.of());
            for (Map.Entry<String, Names> e : others.entrySet()) {
                String other = e.getKey();
                Names o = e.getValue();
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
                // P4 — 형제 읽기는 노드 쌍 단위로, 읽는 노드 직전 경로에서 이미 정의됐을 수 있는 이름을 뺀다.
                List<SiblingRead> pairs = siblingPairs(s, tree, before, me, other, readsOther, readByOther);
                siblings.addAll(pairs);
                Set<String> parMe = filtered(readsOther, pairs, Relation.PARALLEL, true);
                Set<String> parOther = filtered(readByOther, pairs, Relation.PARALLEL, false);
                if (!parMe.isEmpty() || !parOther.isEmpty()) {
                    out.add(error(RuleSaveIssueCode.SET_PAR_SIBLING, "세트 " + s + ": " + me + "와(과) " + other
                            + "가 병렬 형제 갈래에서 서로의 결과를 읽는다(" + me + " ← " + parMe + ", " + other + " ← " + parOther
                            + ") — 병렬 갈래끼리는 결과를 읽을 수 없다"));
                }
                Set<String> ifMe = filtered(readsOther, pairs, Relation.EXCLUSIVE, true);
                Set<String> ifOther = filtered(readByOther, pairs, Relation.EXCLUSIVE, false);
                if (!ifMe.isEmpty() || !ifOther.isEmpty()) {
                    out.add(error(RuleSaveIssueCode.SET_IF_SIBLING, "세트 " + s + ": " + me + "와(과) " + other
                            + "가 같은 IF 의 다른 갈래에 있는데 한쪽이 다른 쪽 결과를 읽는다(" + me + " ← " + ifMe + ", " + other + " ← "
                            + ifOther + ") — 그 갈래를 타면 값이 없다"));
                }
                if (!dup.isEmpty() && rels.contains(Relation.PARALLEL)) {
                    out.add(error(RuleSaveIssueCode.SET_PAR_SIBLING, "세트 " + s + ": 병렬 형제 갈래의 " + other + "도 결과 " + dup + "를 대입한다"));
                } else if (!dup.isEmpty() && seq) {
                    out.add(RuleCheckReport.issue(RuleSaveIssueCode.SET_DUP_RESULT.name(), RuleCheckReport.WARNING, List.of(), null,
                            "세트 " + s + ": " + other + "도 결과 " + dup + "를 대입한다"));
                }
            }
        }
        return new Run(out, siblings);
    }

    /**
     * P4 — me 노드 a·other 노드 b 가 EXCLUSIVE·PARALLEL 인 쌍마다: a 가 읽는 이름(readsOther) 가운데 {@code before(a)} 에 없는 것, b 가 읽는 이름
     * (readByOther) 가운데 {@code before(b)} 에 없는 것.
     */
    private static List<SiblingRead> siblingPairs(String setId, FlowTree tree, Map<String, At> before, String me, String other,
            Set<String> readsOther, Set<String> readByOther) {
        List<SiblingRead> out = new ArrayList<>();
        if (readsOther.isEmpty() && readByOther.isEmpty()) {
            return out;
        }
        for (RuleStep a : tree.ruleSteps()) {
            if (!a.ruleId().equals(me)) {
                continue;
            }
            for (RuleStep b : tree.ruleSteps()) {
                if (!b.ruleId().equals(other)) {
                    continue;
                }
                Relation rel = tree.relation(a.nodeId(), b.nodeId());
                if (rel != Relation.EXCLUSIVE && rel != Relation.PARALLEL) {
                    continue;
                }
                Set<String> meReads = unseen(readsOther, before.get(a.nodeId()));
                Set<String> otherReads = unseen(readByOther, before.get(b.nodeId()));
                if (!meReads.isEmpty() || !otherReads.isEmpty()) {
                    out.add(new SiblingRead(setId, rel, a.nodeId(), other, b.nodeId(), meReads, otherReads));
                }
            }
        }
        return out;
    }

    /** names 가운데 그 지점 경로에서 아직 정의되지 않은(defined·maybe 어디에도 없는) 이름(순서 유지). */
    private static Set<String> unseen(Set<String> names, At at) {
        Set<String> out = new LinkedHashSet<>();
        for (String n : names) {
            if (!at.seen(n)) {
                out.add(n);
            }
        }
        return Collections.unmodifiableSet(out);
    }

    /** names(순서 유지) 가운데 관계가 rel 인 쌍 어느 하나에서 걸러지고 남은 이름 — mine 이면 meReads, 아니면 otherReads 기준. */
    private static Set<String> filtered(Set<String> names, List<SiblingRead> pairs, Relation rel, boolean mine) {
        Set<String> out = new LinkedHashSet<>();
        for (String n : names) {
            if (pairs.stream().anyMatch(p -> p.relation() == rel && (mine ? p.meReads() : p.otherReads()).contains(n))) {
                out.add(n);
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
