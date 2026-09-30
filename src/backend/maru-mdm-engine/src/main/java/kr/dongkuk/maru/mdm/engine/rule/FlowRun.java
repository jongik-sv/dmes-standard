package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchOutcome;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 흐름 실행 한 번(룰 세트 흐름도 spec §4, plan C5). 블록 트리를 따라가며 ctx 에 룰 결과를 덮어쓴다. IF 는 처음 참인 갈래 하나,
 * 병렬은 분기 직전 ctx 사본에서 갈래를 order 순으로 하나씩 실행하고 끝나면 갈래 순서대로 합친다(같은 이름이면 뒤 갈래가 이긴다).
 * 실행 중 위반은 {@link EngineEvaluationException} 으로 던진다. {@code tracing} 이면 노드마다 {@link NodeTrace} 를 남기고,
 * 던지기 직전 처리 중이던 노드를 {@link #failed} 로 ERROR 기록할 수 있게 둔다. 이 패키지에는 record·enum 을 새로 두지 않는다.
 */
final class FlowRun {

    private final RuleEvaluator evaluator;
    private final ExpressionRunner runner;
    private final FlowTree tree;
    private final Map<String, RuleDefinition> defs;
    private final FlowKeys keys;
    private final Instant ts;
    private final boolean tracing;

    final Map<String, Object> ctx;
    /** 최상위에서 만든 결과 = RuleSetResult.finalValues / RunTrace.finalValues. */
    final Map<String, Object> finalValues = new LinkedHashMap<>();
    final List<RuleResult> steps = new ArrayList<>();
    final List<PathStep> path = new ArrayList<>();
    final List<EngineWarning> warnings = new ArrayList<>();
    final List<NodeTrace> nodes = new ArrayList<>();

    // 지금 처리 중인 노드 — 실행 중 위반이 나면 traceSet 이 ERROR 노드로 남긴다.
    private String curNodeId;
    private NodeKind curKind;
    private String curRuleId;
    private Integer curVer;
    private Map<String, Object> curReads;
    private List<BranchTrace> curBranches;
    private String curChosen;

    FlowRun(RuleEvaluator evaluator, ExpressionRunner runner, FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys,
            Map<String, Object> record, Instant ts, boolean tracing) {
        this.evaluator = evaluator;
        this.runner = runner;
        this.tree = tree;
        this.defs = defs;
        this.keys = keys;
        this.ts = ts;
        this.tracing = tracing;
        this.ctx = new LinkedHashMap<>(record);
    }

    void run() {
        plain(tree.startId(), NodeKind.START);
        seq(tree.root(), ctx, finalValues);
        plain(tree.endId(), NodeKind.END);
    }

    /** 처리 중이던 노드의 ERROR 기록. */
    NodeTrace failed(List<Violation> violations) {
        return new NodeTrace(nodes.size() + 1, curNodeId, curKind, NodeStatus.ERROR, curRuleId, curVer, curReads, null,
                curBranches == null ? null : List.copyOf(curBranches), curChosen, null, null, null, List.copyOf(violations));
    }

    private void begin(String nodeId, NodeKind kind) {
        curNodeId = nodeId;
        curKind = kind;
        curRuleId = null;
        curVer = null;
        curReads = null;
        curBranches = null;
        curChosen = null;
    }

    private void plain(String nodeId, NodeKind kind) {
        begin(nodeId, kind);
        path.add(new PathStep(nodeId, kind, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, nodeId, kind, NodeStatus.OK, null, null, null, null, null, null, null,
                    null, null, null));
        }
    }

    private void seq(Seq seq, Map<String, Object> ctx, Map<String, Object> made) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> rule(r, ctx, made);
                case Split s when s.kind() == NodeKind.IF -> ifSplit(s, ctx, made);
                case Split s -> parallel(s, ctx, made);
                case Seq inner -> seq(inner, ctx, made);
            }
        }
    }

    private void rule(RuleStep r, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = defs.get(r.ruleId());
        begin(r.nodeId(), NodeKind.RULE);
        curRuleId = r.ruleId();
        curVer = def.ver();
        if (tracing) {
            curReads = FlowKeys.reads(def, ctx);
        }
        List<Violation> missing = new ArrayList<>();
        for (String name : keys.deferred(r.nodeId())) {
            if (!ctx.containsKey(name)) {
                missing.add(FlowKeys.missing(def.ruleId(), name));
            }
        }
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        RuleResult result = evaluator.evaluate(def, ctx, ts);
        int index = steps.size();
        steps.add(result);
        for (Map.Entry<String, Object> e : result.results().entrySet()) {
            RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
            made.put(e.getKey(), e.getValue());
        }
        path.add(new PathStep(r.nodeId(), NodeKind.RULE, null, index));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, r.nodeId(), NodeKind.RULE, NodeStatus.OK, curRuleId, curVer, curReads, result,
                    null, null, null, null, null, null));
        }
    }

    private void ifSplit(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.IF);
        curBranches = new ArrayList<>();
        Branch chosen = null;
        for (Branch br : s.branches()) {
            if (br.otherwise()) {
                continue;
            }
            if (chosen != null) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.NOT_EVALUATED, null));
                continue;
            }
            BranchCondition c = BranchCondition.test(runner, br.cond(), ctx, keys.condTypes(br.cond()), ts);
            if (c.outcome == BranchCondition.TRUE) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.TRUE, null));
                chosen = br;
            } else if (c.outcome == BranchCondition.FALSE) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.FALSE, null));
            } else if (c.outcome == BranchCondition.NULL) {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.NULL, null));
                warnings.add(new EngineWarning(EngineWarning.Code.BRANCH_COND_NULL, null, null, null,
                        "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식 결과가 NULL 이라 거짓으로 봤다"));
            } else {
                curBranches.add(new BranchTrace(br.edgeId(), BranchOutcome.ERROR, c.message));
                throw new EngineEvaluationException(List.of(new Violation(Stage.BRANCH_SELECT, Code.BRANCH_EVAL_ERROR, null, null,
                        br.edgeId(), "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식을 평가하지 못했다: " + c.message)));
            }
        }
        Branch other = s.branches().get(s.branches().size() - 1); // 그 외는 늘 마지막(plan C3)
        if (chosen == null) {
            chosen = other;
        }
        curBranches.add(new BranchTrace(other.edgeId(), chosen == other ? BranchOutcome.TRUE : BranchOutcome.NOT_EVALUATED, null));
        curChosen = chosen.edgeId();
        List<Violation> missing = keys.check(chosen.body(), ctx.keySet());
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        path.add(new PathStep(s.nodeId(), NodeKind.IF, chosen.edgeId(), null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.IF, NodeStatus.OK, null, null, null, null,
                    List.copyOf(curBranches), curChosen, null, null, null, null));
        }
        seq(chosen.body(), ctx, made);
        merge(s, null);
    }

    private void parallel(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.PARALLEL);
        path.add(new PathStep(s.nodeId(), NodeKind.PARALLEL, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.PARALLEL, NodeStatus.OK, null, null, null, null, null,
                    null, s.branches().stream().map(Branch::edgeId).toList(), null, null, null));
        }
        Map<String, Object> base = new LinkedHashMap<>(ctx);
        List<Map<String, Object>> outs = new ArrayList<>();
        for (Branch br : s.branches()) {
            Map<String, Object> branchCtx = new LinkedHashMap<>(base);
            Map<String, Object> branchMade = new LinkedHashMap<>();
            seq(br.body(), branchCtx, branchMade);
            outs.add(branchMade);
        }
        List<String> merged = new ArrayList<>();
        for (Map<String, Object> out : outs) {
            for (Map.Entry<String, Object> e : out.entrySet()) {
                RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
                made.put(e.getKey(), e.getValue());
                if (!merged.contains(e.getKey())) {
                    merged.add(e.getKey());
                }
            }
        }
        merge(s, merged);
    }

    /** 합류 노드. merged 는 병렬 합류에서만(IF 는 null). */
    private void merge(Split s, List<String> merged) {
        begin(s.mergeId(), NodeKind.MERGE);
        path.add(new PathStep(s.mergeId(), NodeKind.MERGE, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                    null, null, s.nodeId(), merged == null ? null : List.copyOf(merged), null));
        }
    }
}
