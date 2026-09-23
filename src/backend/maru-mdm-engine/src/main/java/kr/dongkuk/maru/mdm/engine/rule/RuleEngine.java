package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

/**
 * 룰 판정·정의 조회 입구(06-business-rule.md:394-430 엔진 골격, 06:473-498 정의 조회 입구).
 *
 * <p>{@code evalTs} 는 필수다. 엔진은 시계를 읽지 않는다. 원천의 "주지 않으면 현재 시각"(06:401·422)은
 * 엔진을 부르는 서버 API 층이 채운다(TSK-02-02 design §6.2 이탈 1). 엔진은 초 미만을 잘라 {@code EVAL_TS} 로 ctx 에 넣는다.
 *
 * <p>레코드 값은 {@code BigDecimal}·{@code String}·{@code Boolean}·null(또는 변환 가능한 Number·String)이고,
 * 엔진이 입력 계약의 데이터 타입으로 바꾼다(06:198 엔진 계약 2). 키는 표준 물리명 그대로다(EvalEx 변수 조회는 대소문자를 가리지 않는다, evalex-guide §1).
 */
public interface RuleEngine {

    /** 룰 하나 판정. 판정 오류는 {@code EngineEvaluationException}. */
    RuleResult evaluate(String ruleId, Map<String, Object> record, Instant evalTs);

    /** 룰 세트 순차 판정. 첫 룰 전에 세트 입력 키를 한꺼번에 본다(06:420). 폐기 세트는 판정 오류(06:419). */
    RuleSetResult evaluateSet(String setId, Map<String, Object> record, Instant evalTs);

    /** 정의 조회(06:480). 계산하지 않고 스냅샷의 것을 꺼낸다. */
    RuleView view(String ruleId, Instant evalTs, EnumSet<Part> parts);

    /** 세트 안 룰마다 차례로(06:483). */
    List<RuleView> setView(String setId, Instant evalTs, EnumSet<Part> parts);

    default RuleView text(String ruleId, Instant evalTs) {
        return view(ruleId, evalTs, EnumSet.of(Part.TEXT));
    }

    default RuleView textAndAst(String ruleId, Instant evalTs) {
        return view(ruleId, evalTs, EnumSet.of(Part.TEXT, Part.AST));
    }

    enum Part { TEXT, AST, CONTRACT }
}
