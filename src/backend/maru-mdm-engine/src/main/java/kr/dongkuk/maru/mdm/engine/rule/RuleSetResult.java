package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 세트 판정 결과 — 룰마다 중간 결과와 최종 ctx(06-business-rule.md:429, wbs TSK-03-03 "최종·중간 결과 반환"),
 * 흐름에서 방문한 노드(룰 세트 흐름도 spec §4.1)와 세트 경고.
 *
 * @param steps       실행 순서대로 룰마다 결과(실제로 실행한 룰만)
 * @param finalValues 마지막 룰 뒤 결과 변수 전체(입력 레코드 키는 뺀다)
 * @param path        방문한 노드(START·RULE·IF·PARALLEL·MERGE·END) 순서
 * @param warnings    세트 경고 — IF 조건식 NULL({@code BRANCH_COND_NULL}). 룰 경고는 steps 의 RuleResult 에 있다
 */
public record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues,
        List<PathStep> path, List<EngineWarning> warnings) {

    /**
     * 방문한 노드 하나.
     *
     * @param chosenEdgeId IF 에서 고른 선. 그 밖은 null
     * @param stepIndex    RULE 이면 그 결과가 {@code steps} 의 몇 번째인지. 그 밖은 null
     */
    public record PathStep(String nodeId, NodeKind kind, @Nullable String chosenEdgeId, @Nullable Integer stepIndex) {}
}
