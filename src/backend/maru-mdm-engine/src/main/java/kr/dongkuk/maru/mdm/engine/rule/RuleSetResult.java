package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * 룰 세트 판정 결과 — 룰마다 중간 결과와 최종 ctx(06-business-rule.md:429, wbs TSK-03-03 "최종·중간 결과 반환").
 *
 * @param steps       실행 순서대로 룰마다 결과
 * @param finalValues 마지막 룰 뒤 결과 변수 전체(입력 레코드 키는 뺀다)
 */
public record RuleSetResult(String setId, Instant evalTs, List<RuleResult> steps, Map<String, Object> finalValues) {}
