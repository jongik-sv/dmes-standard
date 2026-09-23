package com.dongkuk.dmes.mdm.contract.common;

/**
 * 감사 칼럼 명시 헬퍼 계약 — 엔티티를 거치지 않는 네이티브 쓰기용(규칙표 §2, TSK-02-01 인계).
 * 구현은 첫 소비자 TSK-01-03 이 이 패키지 밖에 둔다(design.md D3).
 */
public interface MdmNativeAuditSupport {

    /** 현재 요청 문맥(AuditHolder)의 감사 값. OASIS 밖 호출이면 userId·serviceId·programId 는 null 일 수 있다. */
    AuditStamp currentStamp();
}
