package com.dongkuk.dmes.mdm.common.security;

/**
 * 다른 사용자가 담당자(MDM_STEWARD) 역할을 가졌는지 조회하는 포트(TSK-01-03 B8, D7).
 * DRAFT 넘기기 대상 검사(MDM005)에만 쓴다. 실제 조회 어댑터는 첫 소유권 화면 Task 가 만든다.
 */
public interface MdmStewardDirectory {

    boolean isSteward(String userId);
}
