package com.dongkuk.dmes.mdm.dma.domainMng.service;

import java.util.Map;

/**
 * 테스트 케이스 한 건(TSK-04-03 design D4) — {@code {"value": "<문자열>", "expect": true|false, "vars"?, "memo"?}}.
 * 값은 소수 오차를 피하려고 문자열로 둔다.
 *
 * @param expect  기대값. 화면이 불린이 아닌 값을 보냈으면 null(이때 {@code problem} 이 있다)
 * @param vars    비즈니스식 요구 변수 값(표준 물리명 → 값). 없으면 빈 맵
 * @param problem 행 모양 오류(S06) 설명. 없으면 null
 */
public record DomainTestCase(String value, Boolean expect, Map<String, Object> vars, String memo, String problem) {
}
