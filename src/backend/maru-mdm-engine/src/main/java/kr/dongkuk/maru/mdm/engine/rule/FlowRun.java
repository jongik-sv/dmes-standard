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
import kr.dongkuk.maru.mdm.engine.flow.TaskStep;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchOutcome;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.TraceEdit;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 흐름 실행 한 번(룰 세트 흐름도 spec §4, plan C5). 블록 트리를 따라가며 ctx 에 룰 결과를 덮어쓴다. IF 는 처음 참인 갈래 하나,
 * 병렬은 분기 직전 ctx 사본에서 갈래를 order 순으로 하나씩 실행하고 끝나면 갈래 순서대로 합친다(같은 이름이면 뒤 갈래가 이긴다).
 * 빈 단계(TASK)는 아무것도 읽거나 만들지 않고 지나간다(4단계 spec §1.1).
 * 실행 중 위반은 {@link EngineEvaluationException} 으로 던진다. {@code tracing} 이면 노드마다 {@link NodeTrace} 를 남기고,
 * 던지기 직전 처리 중이던 노드를 {@link #failed} 로 ERROR 기록할 수 있게 둔다.
 *
 * <p>고친 값(4단계 spec §2.2): 노드를 시작할 때 다음 순번({@code nodes.size() + 1})이 {@code beforeSeq} 인 고친 값을 그 노드 범위의 ctx 에
 * {@link RecordKeys#putReplacing} 으로 넣고, 같은 이름(대소문자 무시)이 그 범위 made 에 있으면 made 도 같은 방법으로 바꾼다. 자리의 노드 ID 가
 * 다르면 {@code EDIT_POINT_MISMATCH} 로 멈춘다. 순번은 기록 노드 수로 세므로 고친 값은 {@code tracing} 에서만 받는다.
 */
final class FlowRun {

    private final RuleEvaluator evaluator;
    private final ExpressionRunner runner;
    private final FlowTree tree;
    private final Map<String, RuleDefinition> defs;
    private final FlowKeys keys;
    private final Instant ts;
    private final boolean tracing;
    private final List<TraceEdit> edits;
    /** edits 와 같은 자리 — 그 고친 값을 넣었는가. */
    private final boolean[] used;

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
            Map<String, Object> record, Instant ts, boolean tracing, List<TraceEdit> edits) {
        if (!tracing && !edits.isEmpty()) {
            throw new IllegalArgumentException("고친 값은 기록 실행(traceSet)에서만 쓴다");
        }
        this.evaluator = evaluator;
        this.runner = runner;
        this.tree = tree;
        this.defs = defs;
        this.keys = keys;
        this.ts = ts;
        this.tracing = tracing;
        this.edits = List.copyOf(edits);
        this.used = new boolean[this.edits.size()];
        this.ctx = new LinkedHashMap<>(record);
    }

    void run() {
        plain(tree.startId(), NodeKind.START, ctx, finalValues);
        seq(tree.root(), ctx, finalValues);
        plain(tree.endId(), NodeKind.END, ctx, finalValues);
    }

    /** 처리 중이던 노드의 ERROR 기록. */
    NodeTrace failed(List<Violation> violations) {
        return new NodeTrace(nodes.size() + 1, curNodeId, curKind, NodeStatus.ERROR, curRuleId, curVer, curReads, null,
                curBranches == null ? null : List.copyOf(curBranches), curChosen, null, null, null, List.copyOf(violations));
    }

    /** 정상 완료 뒤 쓰이지 않은 고친 값마다 위반 하나(없으면 빈 목록). 실행 중 오류로 멈춘 경우에는 부르지 않는다. */
    List<Violation> unusedEdits() {
        List<Violation> out = new ArrayList<>();
        for (int i = 0; i < edits.size(); i++) {
            if (!used[i]) {
                TraceEdit e = edits.get(i);
                out.add(editViolation(e, "고친 값이 쓰이지 않았다: " + e.beforeSeq() + "번째 노드(" + e.nodeId() + ") 앞에 닿기 전에 실행이 끝났다"));
            }
        }
        return out;
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

    /** 지금 시작한 노드(순번 nodes.size()+1)에 걸린 고친 값을 그 범위 ctx·made 에 넣는다(4단계 spec §2.2 퍼짐 규칙). */
    private void edit(Map<String, Object> ctx, Map<String, Object> made) {
        if (edits.isEmpty()) {
            return;
        }
        int seq = nodes.size() + 1;
        for (int i = 0; i < edits.size(); i++) {
            TraceEdit e = edits.get(i);
            if (e.beforeSeq() != seq) {
                continue;
            }
            if (!curNodeId.equals(e.nodeId())) {
                throw new EngineEvaluationException(List.of(editViolation(e, "고친 값 자리가 어긋났다: " + seq + "번째 노드는 " + curNodeId
                        + " 인데 고친 값은 " + e.nodeId() + " 앞에 걸려 있다")));
            }
            used[i] = true;
            for (Map.Entry<String, Object> v : e.values().entrySet()) {
                RecordKeys.putReplacing(ctx, v.getKey(), v.getValue());
                if (hasIgnoreCase(made, v.getKey())) {
                    RecordKeys.putReplacing(made, v.getKey(), v.getValue());
                }
            }
        }
    }

    private static boolean hasIgnoreCase(Map<String, Object> m, String name) {
        for (String k : m.keySet()) {
            if (k.equalsIgnoreCase(name)) {
                return true;
            }
        }
        return false;
    }

    private static Violation editViolation(TraceEdit e, String message) {
        return new Violation(Stage.INPUT_CHECK, Code.EDIT_POINT_MISMATCH, null, null, e.nodeId(), message);
    }

    /** 칸 없는 노드(START·END·TASK). */
    private void plain(String nodeId, NodeKind kind, Map<String, Object> ctx, Map<String, Object> made) {
        begin(nodeId, kind);
        edit(ctx, made);
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
                case TaskStep t -> plain(t.nodeId(), NodeKind.TASK, ctx, made);
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
        edit(ctx, made);
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
        edit(ctx, made);
        curBranches = new ArrayList<>();
        Branch chosen = null;
        for (int i = 0; i < s.branches().size(); i++) {
            Branch br = s.branches().get(i);
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
                // 뒤 선(그 외 포함)은 평가하지 않았다 — branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 둔다.
                for (Branch rest : s.branches().subList(i + 1, s.branches().size())) {
                    curBranches.add(new BranchTrace(rest.edgeId(), BranchOutcome.NOT_EVALUATED, null));
                }
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
        merge(s, null, ctx, made);
    }

    private void parallel(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.PARALLEL);
        edit(ctx, made);
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
        merge(s, merged, ctx, made);
    }

    /** 합류 노드. merged 는 병렬 합류에서만(IF 는 null). ctx·made 는 분기를 감싼 범위다 — 병렬은 갈래를 합친 뒤라 고친 값이 합친 값을 덮는다. */
    private void merge(Split s, List<String> merged, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.mergeId(), NodeKind.MERGE);
        edit(ctx, made);
        path.add(new PathStep(s.mergeId(), NodeKind.MERGE, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                    null, null, s.nodeId(), merged == null ? null : List.copyOf(merged), null));
        }
    }
}
