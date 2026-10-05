package kr.dongkuk.maru.mdm.engine.rule;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.TaskStep;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.CaughtException;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchOutcome;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.TraceEdit;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 흐름 실행 한 번(룰 세트 흐름도 spec §4, plan C5). 블록 트리를 따라가며 ctx 에 룰 결과를 덮어쓴다. IF 는 처음 참인 갈래 하나,
 * 병렬은 분기 직전 ctx 사본에서 갈래를 order 순으로 하나씩 실행하고 끝나면 갈래 순서대로 합친다(같은 이름이면 뒤 갈래가 이긴다).
 * 빈 단계(TASK)는 아무것도 읽거나 만들지 않고 지나간다(4단계 spec §1.1).
 * 실행 중 위반은 {@link EngineEvaluationException} 으로 던진다. {@code tracing} 이면 노드마다 {@link NodeTrace} 를 남기고,
 * 던지기 직전 처리 중이던 노드를 {@link #failed} 로 ERROR 기록할 수 있게 둔다.
 *
 * <p>받는 노드 블록(받는 노드 spec §4, implicit-join spec §5): 단계가 실패했거나 결과가 없는데 그 종류를 받는 노드가 있으면 결과를 ctx 에 쓰지 않고
 * 룰 직전 ctx 로 되돌린 뒤 CATCH_* 넷을 넣고 처리 갈래를 실행한다. 블록이 돌아오는 자리(joinId)로 끝나면 CATCH_* 를 룰 직전 값으로 되돌리고
 * (중첩이면 바깥 값, R4) 옛 형식이면 MERGE 를 기록한다. 처리 갈래가 END 에 닿으면 {@link Ended} 로 세트를 끝낸다. 빈 단계 블록은 처리 갈래를 타지 않는다.
 * 끝내는 IF 갈래는 몸을 실행한 뒤 {@code Ended(null)} 을 던진다 — 처리 갈래 안이면 그 받는 노드의 끝냄으로 바꾼다(J-D18).
 *
 * <p>고친 값(4단계 spec §2.2): 노드를 시작할 때 다음 순번({@code nodes.size() + 1})이 {@code beforeSeq} 인 고친 값을 그 노드 범위의 ctx 에
 * {@link RecordKeys#putReplacing} 으로 넣고, 같은 이름(대소문자 무시)이 그 범위 made 에 있으면 made 도 같은 방법으로 바꾼다. 자리의 노드 ID 가
 * 다르면 {@code EDIT_POINT_MISMATCH} 로 멈춘다. 순번은 기록 노드 수로 세므로 고친 값은 {@code tracing} 에서만 받는다.
 */
final class FlowRun {

    /** CATCH_* 넷의 고정 순서 — ctx 에 넣고 되돌릴 때 이 순서로 쓴다. */
    private static final List<String> CATCH_ORDER =
            List.of(ReservedNames.CATCH_KIND, ReservedNames.CATCH_RULE, ReservedNames.CATCH_CODE, ReservedNames.CATCH_MSG);

    /** 끝냄 신호 — 위반이 아닌 제어 신호(R5, implicit-join R6). 처리 갈래 안 끝냄이면 그 받는 노드 ID, 끝내는 IF 갈래면 null. {@link #run} 이 받는다. */
    static final class Ended extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final String catchNodeId;

        Ended(@Nullable String catchNodeId) {
            super(null, null, false, false);
            this.catchNodeId = catchNodeId;
        }
    }

    /** 받는 노드로 넘길 실패 하나. record 가 아니다 — rule 패키지 record 는 계약 대조표(EngineContractSchemaTest)에 올라야 한다. */
    static final class Caught {
        final Guarded.Handler handler;
        final CatchKind kind;
        final String code;
        final String message;
        final List<Violation> violations;

        Caught(Guarded.Handler handler, CatchKind kind, String code, String message, List<Violation> violations) {
            this.handler = handler;
            this.kind = kind;
            this.code = code;
            this.message = message;
            this.violations = violations;
        }
    }

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
    /** 받아 처리한 exception, 실행 순서(받는 노드 spec §6). */
    final List<CaughtException> caught = new ArrayList<>();
    /** 처리 갈래 안에서 끝냈으면 그 받는 노드 ID(끝내는 IF 갈래로 끝나면 null). */
    String endedBy;

    // 지금 처리 중인 노드 — 실행 중 위반이 나면 traceSet 이 ERROR 노드로 남긴다.
    private String curNodeId;
    private NodeKind curKind;
    private String curRuleId;
    private BigDecimal curVer;
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
        try {
            seq(tree.root(), ctx, finalValues);
        } catch (Ended e) {
            endedBy = e.catchNodeId;
        }
        restoreCatch(ctx, Map.of()); // END 에 닿으면 CATCH_* 를 뺀다(R3)
        plain(tree.endId(), NodeKind.END, ctx, finalValues);
    }

    /** 처리 중이던 노드의 ERROR 기록. */
    NodeTrace failed(List<Violation> violations) {
        return new NodeTrace(nodes.size() + 1, curNodeId, curKind, NodeStatus.ERROR, curRuleId, curVer, curReads, null,
                curBranches == null ? null : List.copyOf(curBranches), curChosen, null, null, null, List.copyOf(violations), null, null, null, null, null);
    }

    /** 정상 완료 뒤 쓰이지 않은 고친 값마다 위반 하나(없으면 빈 목록). 실행 중 오류로 멈춘 경우에는 부르지 않는다. 끝냄(R5)은 정상 완료다. */
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
        return new Violation(Stage.INPUT_CHECK, Code.EDIT_POINT_MISMATCH, null, null, e.nodeId(), message, List.of());
    }

    /** 칸 없는 노드(START·END·TASK). */
    private void plain(String nodeId, NodeKind kind, Map<String, Object> ctx, Map<String, Object> made) {
        begin(nodeId, kind);
        edit(ctx, made);
        record(nodeId, kind);
    }

    /** 칸 없는 노드의 path·기록. */
    private void record(String nodeId, NodeKind kind) {
        path.add(new PathStep(nodeId, kind, null, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, nodeId, kind, NodeStatus.OK, null, null, null, null, null, null, null,
                    null, null, null, null, null, null, null, null));
        }
    }

    private void seq(Seq seq, Map<String, Object> ctx, Map<String, Object> made) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> rule(r, ctx, made);
                case TaskStep t -> plain(t.nodeId(), NodeKind.TASK, ctx, made);
                case SetStep s -> throw setNotYet(s); // SEAM(T4) — SET 노드 실행은 하위 세트 계획 Task 4(eng:4)가 넣는다
                case Guarded g -> guarded(g, ctx, made);
                case Split s when s.kind() == NodeKind.IF -> ifSplit(s, ctx, made);
                case Split s -> parallel(s, ctx, made);
                case Seq inner -> seq(inner, ctx, made);
            }
        }
    }

    private void rule(RuleStep r, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = startRule(r, ctx, made);
        throwMissing(r, def, ctx);
        accept(r, evaluator.evaluate(def, ctx, ts), ctx, made);
    }

    /** 룰 노드 시작 — begin·고친 값·읽은 값(기록). */
    private RuleDefinition startRule(RuleStep r, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = defs.get(r.ruleId());
        begin(r.nodeId(), NodeKind.RULE);
        curRuleId = r.ruleId();
        curVer = def.ver();
        edit(ctx, made);
        if (tracing) {
            curReads = FlowKeys.reads(def, ctx);
        }
        return def;
    }

    /** 지연 입력 키(IF 일부 갈래에서만 만든 이름, INPUT_ERROR 를 받는 룰의 입력)가 ctx 에 없으면 SET_CHECK/MISSING_KEY. */
    private void throwMissing(RuleStep r, RuleDefinition def, Map<String, Object> ctx) {
        List<Violation> missing = new ArrayList<>();
        for (String name : keys.deferred(r.nodeId())) {
            if (!ctx.containsKey(name)) {
                missing.add(FlowKeys.missing(def.ruleId(), name));
            }
        }
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
    }

    /** 룰 결과를 ctx·made 에 쓰고 steps·path·기록에 남긴다. */
    private void accept(RuleStep r, RuleResult result, Map<String, Object> ctx, Map<String, Object> made) {
        int index = steps.size();
        steps.add(result);
        for (Map.Entry<String, Object> e : result.results().entrySet()) {
            RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
            RecordKeys.putReplacing(made, e.getKey(), e.getValue());
        }
        path.add(new PathStep(r.nodeId(), NodeKind.RULE, null, index, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, r.nodeId(), NodeKind.RULE, NodeStatus.OK, curRuleId, curVer, curReads, result,
                    null, null, null, null, null, null, null, null, null, null, null));
        }
    }

    /** 받는 노드 블록(받는 노드 spec §4, implicit-join spec §5). */
    private void guarded(Guarded g, Map<String, Object> ctx, Map<String, Object> made) {
        Map<String, Object> outer = catchValues(ctx);
        if (g.step() instanceof TaskStep t) {
            // 빈 단계는 실패하지 않는다 — 처리 갈래를 타지 않는다(J-D4). 정상 갈래 입력 키는 기록 전에 본다(R5).
            begin(t.nodeId(), NodeKind.TASK);
            edit(ctx, made);
            List<Violation> missing = keys.check(g.normal(), ctx.keySet());
            if (!missing.isEmpty()) {
                throw new EngineEvaluationException(missing);
            }
            record(t.nodeId(), NodeKind.TASK);
            seq(g.normal(), ctx, made);
        } else if (g.step() instanceof SetStep s) {
            throw setNotYet(s); // SEAM(T4) — SET 받는 노드 실행은 하위 세트 계획 Task 4(eng:4)가 넣는다
        } else {
            guardedRule((RuleStep) g.step(), g, ctx, made);
        }
        if (g.joinId() != null) {
            restoreCatch(ctx, outer); // R3·R4 — 돌아오는 자리를 시작하기 전에 룰 직전 값으로(중첩이면 바깥 값)
            if (g.mergeId() != null) { // 옛 형식 돌아오는 MERGE 만 기록한다
                begin(g.mergeId(), NodeKind.MERGE);
                edit(ctx, made);
                path.add(new PathStep(g.mergeId(), NodeKind.MERGE, null, null, null));
                if (tracing) {
                    nodes.add(new NodeTrace(nodes.size() + 1, g.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                            null, null, g.nodeId(), null, null, null, null, null, null, null));
                }
            }
        }
    }

    /** SET 노드 실행은 아직 없다(eng:4). 준비 단계가 SET 흐름을 막기 전까지 실행 경로에 오면 분명히 던진다. */
    private static IllegalStateException setNotYet(SetStep s) {
        return new IllegalStateException("SET 노드 실행은 하위 세트 계획 Task 4 가 넣는다: " + s.nodeId());
    }

    /** 룰이 받는 노드 블록의 단계일 때 — 받기 판정·정상 갈래·처리 갈래. */
    private void guardedRule(RuleStep r, Guarded g, Map<String, Object> ctx, Map<String, Object> made) {
        RuleDefinition def = startRule(r, ctx, made);
        Map<String, Object> before = new LinkedHashMap<>(ctx);
        RuleResult ok = null;
        Caught c;
        try {
            throwMissing(r, def, ctx);
            RuleResult result = evaluator.evaluate(def, ctx, ts);
            c = noResult(g, result);
            if (c == null) {
                ok = result;
            }
        } catch (EngineEvaluationException e) {
            c = caughtOf(g, e);
            if (c == null) {
                throw e;
            }
        }
        if (ok != null) {
            // 정상 갈래 입력 키(R6) — 결과를 넣기 전에 "ctx 키 ∪ 결과 이름" 으로 본다. 실패하면 이 룰 노드가 ERROR 다(받기 try 밖).
            Set<String> available = new HashSet<>(ctx.keySet());
            available.addAll(ok.results().keySet());
            List<Violation> missing = keys.check(g.normal(), available);
            if (!missing.isEmpty()) {
                throw new EngineEvaluationException(missing);
            }
            accept(r, ok, ctx, made);
            seq(g.normal(), ctx, made);
            return;
        }
        ctx.clear();
        ctx.putAll(before); // 룰이 바꿔 넣은 입력 타입을 되돌린다(편차 F6)
        caughtRule(r, c);
        catchNode(r, c, ctx, made);
        try {
            seq(c.handler.body(), ctx, made);
        } catch (Ended e) {
            // 처리 갈래 안 IF 끝냄(Ended(null))은 이 받는 노드의 끝냄이다(J-D18). 안쪽 받는 노드 끝냄은 그대로 던진다.
            throw e.catchNodeId == null ? new Ended(c.handler.catchNodeId()) : e;
        }
        if (c.handler.ends()) {
            throw new Ended(c.handler.catchNodeId());
        }
    }

    /** 결과 없음(hits 비고 기본 행 안 씀)인데 NO_RESULT 를 받는 노드가 있으면 그 실패. 없으면 null(지금처럼 NULL 결과로 진행, X-D3). */
    private static Caught noResult(Guarded g, RuleResult result) {
        if (!result.hits().isEmpty() || result.defaultApplied()) {
            return null;
        }
        Guarded.Handler h = g.handlerFor(CatchKind.NO_RESULT);
        return h == null ? null : new Caught(h, CatchKind.NO_RESULT, CatchKind.NO_RESULT_CODE, CatchKind.NO_RESULT_MESSAGE, List.of());
    }

    /** 첫 위반 코드의 종류를 받는 노드가 있으면 그 실패. 받지 않는 코드·받는 노드 없음이면 null(던진다). */
    private static Caught caughtOf(Guarded g, EngineEvaluationException e) {
        if (e.violations().isEmpty()) {
            return null;
        }
        Violation first = e.violations().get(0);
        Optional<CatchKind> kind = CatchKind.ofCode(first.code().name());
        if (kind.isEmpty()) {
            return null;
        }
        Guarded.Handler h = g.handlerFor(kind.get());
        return h == null ? null : new Caught(h, kind.get(), first.code().name(), first.message(), e.violations());
    }

    /** 받은 룰 — path(stepIndex 없음)·caught·CAUGHT 기록(R2). begin 은 startRule 이 이미 했다. */
    private void caughtRule(RuleStep r, Caught c) {
        path.add(new PathStep(r.nodeId(), NodeKind.RULE, null, null, null));
        caught.add(new CaughtException(r.nodeId(), r.ruleId(), c.handler.catchNodeId(), c.kind, c.code, c.message, List.of()));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, r.nodeId(), NodeKind.RULE, NodeStatus.CAUGHT, curRuleId, curVer, curReads, null,
                    null, null, null, null, null, List.copyOf(c.violations), null, null, null, null, null));
        }
    }

    /** CATCH 노드 — begin → 고친 값 → CATCH_* 넣기 → 처리 갈래 입력 키 → path·기록(R1·R3). */
    private void catchNode(RuleStep r, Caught c, Map<String, Object> ctx, Map<String, Object> made) {
        String id = c.handler.catchNodeId();
        begin(id, NodeKind.CATCH);
        curRuleId = r.ruleId();
        edit(ctx, made);
        RecordKeys.putReplacing(ctx, ReservedNames.CATCH_KIND, c.kind.name());
        RecordKeys.putReplacing(ctx, ReservedNames.CATCH_RULE, r.ruleId());
        RecordKeys.putReplacing(ctx, ReservedNames.CATCH_CODE, c.code);
        RecordKeys.putReplacing(ctx, ReservedNames.CATCH_MSG, c.message);
        List<Violation> missing = keys.check(c.handler.body(), ctx.keySet());
        if (!missing.isEmpty()) {
            throw new EngineEvaluationException(missing);
        }
        path.add(new PathStep(id, NodeKind.CATCH, null, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, id, NodeKind.CATCH, NodeStatus.OK, r.ruleId(), null, null, null, null, null, null,
                    null, null, null, c.kind, c.code, c.message, null, null));
        }
    }

    /** ctx 에 있는 CATCH_* 값(고정 순서). */
    private static Map<String, Object> catchValues(Map<String, Object> ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String n : CATCH_ORDER) {
            if (ctx.containsKey(n)) {
                out.put(n, ctx.get(n));
            }
        }
        return out;
    }

    /** CATCH_* 를 지우고 saved 를 넣는다(saved 가 비면 지우기만). */
    private static void restoreCatch(Map<String, Object> ctx, Map<String, Object> saved) {
        CATCH_ORDER.forEach(ctx::remove);
        ctx.putAll(saved);
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
                        br.edgeId(), "IF " + s.nodeId() + " 갈래 " + br.edgeId() + " 조건식을 평가하지 못했다: " + c.message, List.of())));
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
        path.add(new PathStep(s.nodeId(), NodeKind.IF, chosen.edgeId(), null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.IF, NodeStatus.OK, null, null, null, null,
                    List.copyOf(curBranches), curChosen, null, null, null, null, null, null, null, null, null));
        }
        seq(chosen.body(), ctx, made);
        if (chosen.ends()) {
            throw new Ended(null); // 끝내는 IF 갈래 — 정상 완료(J-D17)
        }
        if (s.mergeId() != null) {
            merge(s, null, ctx, made); // 옛 형식 IF 합류만 기록한다
        }
    }

    private void parallel(Split s, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.nodeId(), NodeKind.PARALLEL);
        edit(ctx, made);
        path.add(new PathStep(s.nodeId(), NodeKind.PARALLEL, null, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.nodeId(), NodeKind.PARALLEL, NodeStatus.OK, null, null, null, null, null,
                    null, s.branches().stream().map(Branch::edgeId).toList(), null, null, null, null, null, null, null, null));
        }
        Map<String, Object> base = new LinkedHashMap<>(ctx);
        List<Map<String, Object>> outs = new ArrayList<>();
        for (Branch br : s.branches()) {
            Map<String, Object> branchCtx = new LinkedHashMap<>(base);
            Map<String, Object> branchMade = new LinkedHashMap<>();
            try {
                seq(br.body(), branchCtx, branchMade);
            } catch (Ended e) {
                // 갈래 안에서 끝냄(X-D11) — 남은 형제는 돌지 않고, 끝난 형제 + 지금 갈래 결과를 합류 규칙대로 합친 뒤 끝낸다.
                outs.add(branchMade);
                mergeOuts(outs, ctx, made);
                throw e;
            }
            outs.add(branchMade);
        }
        merge(s, mergeOuts(outs, ctx, made), ctx, made);
    }

    /** 갈래 결과를 갈래 순서대로 바깥 범위에 덮어쓴다(같은 이름이면 뒤 갈래가 이긴다). 합친 이름 목록(처음 나온 순서). */
    private static List<String> mergeOuts(List<Map<String, Object>> outs, Map<String, Object> ctx, Map<String, Object> made) {
        List<String> merged = new ArrayList<>();
        for (Map<String, Object> out : outs) {
            for (Map.Entry<String, Object> e : out.entrySet()) {
                RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
                RecordKeys.putReplacing(made, e.getKey(), e.getValue());
                if (!merged.contains(e.getKey())) {
                    merged.add(e.getKey());
                }
            }
        }
        return merged;
    }

    /** 합류 노드. merged 는 병렬 합류에서만(IF 는 null). ctx·made 는 분기를 감싼 범위다 — 병렬은 갈래를 합친 뒤라 고친 값이 합친 값을 덮는다. */
    private void merge(Split s, List<String> merged, Map<String, Object> ctx, Map<String, Object> made) {
        begin(s.mergeId(), NodeKind.MERGE);
        edit(ctx, made);
        path.add(new PathStep(s.mergeId(), NodeKind.MERGE, null, null, null));
        if (tracing) {
            nodes.add(new NodeTrace(nodes.size() + 1, s.mergeId(), NodeKind.MERGE, NodeStatus.OK, null, null, null, null, null,
                    null, null, s.nodeId(), merged == null ? null : List.copyOf(merged), null, null, null, null, null, null));
        }
    }
}
