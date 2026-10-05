package kr.dongkuk.maru.mdm.engine.rule;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 세트 실행 기록(룰 세트 흐름도 spec §4.2, plan C5) — 디버거와 나중의 운영 기록 재생이 같은 형식을 쓴다.
 * 판정 오류는 던지지 않고 {@code violations} 에 담는다(plan D7 — 스키마 전용 EngineError 대신 목록).
 *
 * @param input       받은 레코드 사본
 * @param nodes       실행 순서대로 노드 기록. 실행 전(구조·존재·입력 키) 오류면 빈 목록
 * @param finalValues 멈춘 시점(또는 끝)까지 최상위에서 만든 결과 변수
 * @param violations  멈췄으면 위반 목록, 끝까지 갔으면 null
 * @param edits       고친 값을 끼워 다시 실행했으면 받은 고친 값 그대로(4단계 spec §2.3), 아니면 null. JSON 에서는 null 이면 키를 뺀다
 * @param endedBy     처리 갈래 안에서 END 에 닿아 끝났으면(처리 갈래 안 IF 의 끝내는 갈래 포함) 가장 안쪽 처리 갈래의 받는 노드 ID, 아니면 null(끝내는 IF 갈래로 끝난 실행 포함, D-136). JSON 에서는 null 이면 키를 뺀다
 */
public record RunTrace(String setId, Instant evalTs, Map<String, Object> input, List<NodeTrace> nodes,
        Map<String, Object> finalValues, @Nullable List<Violation> violations, @Nullable List<TraceEdit> edits,
        @Nullable String endedBy) {

    /**
     * 노드 하나의 기록. 종류마다 쓰는 칸만 채우고 나머지는 null 이다.
     * RULE: ruleId·ver·reads(실행 직전 ctx 에서 이 룰이 읽은 값)·result(OK 인 RULE 에만 있다. 없으면 JSON 에서 키를 뺀다).
     * IF: branches·chosenEdgeId. PARALLEL: order.
     * MERGE: splitId(짝 PARALLEL, 옛 형식이면 IF·받는 노드가 붙은 노드)·merged(병렬 합류에서 합친 결과 이름). TASK: 칸 없이 status 만. ERROR 노드: violations.
     * CAUGHT RULE(받는 노드로 넘긴 룰): ruleId·ver·reads·violations(결과 없음이면 빈 목록), result 는 null.
     * CATCH: ruleId(실패한 룰 ID)·catchKind·code·message, status 는 OK. 세 칸은 CATCH 가 아니면 null 이고 JSON 에서 키를 뺀다.
     * SET: setId 는 ruleId 칸이 아니라 sub.setId 로 본다. reads(부모 ctx 에서 하위 입력 이름의 값)·outputs(넘겨받은 이름 → 값)·sub(하위 세트 기록).
     *
     * @param seq 1부터
     */
    public record NodeTrace(int seq, String nodeId, NodeKind kind, NodeStatus status,
            @Nullable String ruleId, @Nullable BigDecimal ver, @Nullable Map<String, Object> reads, @Nullable RuleResult result,
            @Nullable List<BranchTrace> branches, @Nullable String chosenEdgeId,
            @Nullable List<String> order, @Nullable String splitId, @Nullable List<String> merged,
            @Nullable List<Violation> violations, @Nullable CatchKind catchKind, @Nullable String code, @Nullable String message,
            @Nullable Map<String, Object> outputs, @Nullable RunTrace sub) {}

    /** IF 갈래 선 하나의 평가. {@code message} 는 ERROR 일 때 원인. */
    public record BranchTrace(String edgeId, BranchOutcome outcome, @Nullable String message) {}

    /**
     * 디버거에서 고친 값 하나(4단계 spec §2.2). {@code beforeSeq} 번째 노드(1부터, {@link NodeTrace#seq} 와 같은 수)를 시작하기 직전에
     * 그 노드 범위의 ctx 에 {@code values} 를 넣는다. 값이 null 이면 비우기, ctx 에 없던 이름이면 추가다. {@code values} 의 값은 null 일 수 있다.
     */
    public record TraceEdit(int beforeSeq, String nodeId, Map<String, Object> values) {}

    /** CAUGHT = 받는 노드로 넘긴 RULE(받는 노드 spec §6). 처리되지 않은 실패는 ERROR. */
    public enum NodeStatus { OK, ERROR, CAUGHT }

    /**
     * NOT_EVALUATED = 앞 갈래가 참이었거나 앞 갈래 평가가 오류로 멈춰 평가하지 않았다(그 외 선은 안 골랐을 때 포함).
     * 그래서 IF 의 branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 있다.
     */
    public enum BranchOutcome { TRUE, FALSE, NULL, ERROR, NOT_EVALUATED }
}
