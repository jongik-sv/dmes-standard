package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
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
 */
public record RunTrace(String setId, Instant evalTs, Map<String, Object> input, List<NodeTrace> nodes,
        Map<String, Object> finalValues, @Nullable List<Violation> violations, @Nullable List<TraceEdit> edits) {

    /**
     * 노드 하나의 기록. 종류마다 쓰는 칸만 채우고 나머지는 null 이다.
     * RULE: ruleId·ver·reads(실행 직전 ctx 에서 이 룰이 읽은 값)·result(OK 인 RULE 에만 있다. 없으면 JSON 에서 키를 뺀다).
     * IF: branches·chosenEdgeId. PARALLEL: order.
     * MERGE: splitId·merged(병렬 합류에서 합친 결과 이름). TASK: 칸 없이 status 만. ERROR 노드: violations.
     *
     * @param seq 1부터
     */
    public record NodeTrace(int seq, String nodeId, NodeKind kind, NodeStatus status,
            @Nullable String ruleId, @Nullable Integer ver, @Nullable Map<String, Object> reads, @Nullable RuleResult result,
            @Nullable List<BranchTrace> branches, @Nullable String chosenEdgeId,
            @Nullable List<String> order, @Nullable String splitId, @Nullable List<String> merged,
            @Nullable List<Violation> violations) {}

    /** IF 갈래 선 하나의 평가. {@code message} 는 ERROR 일 때 원인. */
    public record BranchTrace(String edgeId, BranchOutcome outcome, @Nullable String message) {}

    /**
     * 디버거에서 고친 값 하나(4단계 spec §2.2). {@code beforeSeq} 번째 노드(1부터, {@link NodeTrace#seq} 와 같은 수)를 시작하기 직전에
     * 그 노드 범위의 ctx 에 {@code values} 를 넣는다. 값이 null 이면 비우기, ctx 에 없던 이름이면 추가다. {@code values} 의 값은 null 일 수 있다.
     */
    public record TraceEdit(int beforeSeq, String nodeId, Map<String, Object> values) {}

    public enum NodeStatus { OK, ERROR }

    /**
     * NOT_EVALUATED = 앞 갈래가 참이었거나 앞 갈래 평가가 오류로 멈춰 평가하지 않았다(그 외 선은 안 골랐을 때 포함).
     * 그래서 IF 의 branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 있다.
     */
    public enum BranchOutcome { TRUE, FALSE, NULL, ERROR, NOT_EVALUATED }
}
