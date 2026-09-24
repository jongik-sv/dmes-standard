package com.dongkuk.dmes.mdm.contract.mastercode;

/**
 * 확정 검사 항목 한 행의 결과. DELEGATED = 공통 서비스({@code ApplyFromOrderCheck})가 검사, DEFERRED = 보류(PRD §2 규칙 7),
 * EXEMPT = 최초 버전 면제(04:411-412).
 */
public enum MasterCodeCheckStatus {
    PASSED,
    WARNED,
    REJECTED,
    EXEMPT,
    DELEGATED,
    DEFERRED
}
