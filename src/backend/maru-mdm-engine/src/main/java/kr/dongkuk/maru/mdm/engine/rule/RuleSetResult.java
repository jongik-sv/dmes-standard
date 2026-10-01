package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 세트 판정 결과 — 룰마다 중간 결과와 최종 ctx(06-business-rule.md:429, wbs TSK-03-03 "최종·중간 결과 반환"),
 * 흐름에서 방문한 노드(룰 세트 흐름도 spec §4.1)와 세트 경고, 받는 노드가 받아 처리한 exception(받는 노드 spec §6).
 *
 * @param steps       실행 순서대로 룰마다 결과(실제로 결과를 쓴 룰만 — 받는 노드로 넘긴 룰은 없다)
 * @param finalValues 마지막 룰 뒤 결과 변수 전체(입력 레코드 키는 뺀다)
 * @param path        방문한 노드(START·RULE·CATCH·IF·PARALLEL·MERGE·END) 순서
 * @param warnings    세트 경고 — IF 조건식 NULL({@code BRANCH_COND_NULL}). 룰 경고는 steps 의 RuleResult 에 있다
 * @param caught      받는 노드가 받아 처리 갈래로 넘긴 exception, 실행 순서. 없으면 빈 목록
 * @param endedBy     처리 갈래 안에서 END 에 닿아 끝났으면(처리 갈래 안 IF 의 끝내는 갈래 포함) 가장 안쪽 처리 갈래의 받는 노드 ID, 아니면 null(끝내는 IF 갈래로 끝난 실행 포함, D-136)
 */
public record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues,
        List<PathStep> path, List<EngineWarning> warnings, List<CaughtException> caught, @Nullable String endedBy) {

    /**
     * 방문한 노드 하나.
     *
     * @param chosenEdgeId IF 에서 고른 선. 그 밖은 null
     * @param stepIndex    RULE 이면 그 결과가 {@code steps} 의 몇 번째인지. 받는 노드로 넘긴 RULE·그 밖은 null
     */
    public record PathStep(String nodeId, NodeKind kind, @Nullable String chosenEdgeId, @Nullable Integer stepIndex) {}

    /**
     * 받아 처리한 exception 하나(받는 노드 spec §6).
     *
     * @param code    첫 위반 코드 이름. 결과 없음이면 {@code NO_RESULT}
     * @param message 첫 위반 문구. 결과 없음이면 {@link CatchKind#NO_RESULT_MESSAGE}
     */
    public record CaughtException(String ruleNodeId, String ruleId, String catchNodeId, CatchKind kind, String code, String message) {}
}
