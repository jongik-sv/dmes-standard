package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import java.util.List;
import java.util.Map;

/**
 * 표 저장 뒤 검사 — 확장 지점(TSK-08-02 design §6.8, D3). {@link RuleTableService} 가 분석 이슈 뒤에 결과를 이어 붙인다. 이 Task 는
 * 구현을 두지 않는다. TSK-08-04 가 저장 시 검사 20여 종과 거부 정책을 이 자리에 더한다.
 */
public interface RuleSaveCheck {

    List<Map<String, Object>> check(RuleSaveContext context);
}
