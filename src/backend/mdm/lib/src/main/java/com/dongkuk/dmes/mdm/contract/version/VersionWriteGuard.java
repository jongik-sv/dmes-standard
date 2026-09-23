package com.dongkuk.dmes.mdm.contract.version;

/**
 * 버전 생성·DRAFT 저장 가드 — "미적용 버전 하나" 규칙(원천 04:284·293-301, ADR-0002 D2). 구현 TSK-01-03.
 *
 * <p>미적용 버전 = DRAFT, 또는 적용 시작 일시가 아직 오지 않은 RELEASED. 영역 서비스(TSK-06-02·08-02)가
 * 새 버전 INSERT 직전에 {@link #checkCanCreateVersion}, DRAFT 저장 직전에 {@link #beginDraftWrite} 를 부른다.
 */
public interface VersionWriteGuard {

    /** 같은 객체에 미적용 버전이 하나라도 있으면 MDM006. 쓰기는 없다(DRAFT INSERT 는 영역이 한다). */
    void checkCanCreateVersion(VersionTarget target, String objectId);

    /**
     * DRAFT 저장 직전 검사. 소유자(MDM003)·row_version(MDM001)·상태(MDM002)·다른 미적용 버전(MDM007)을 보고
     * ROW_VERSION 을 1 올린 뒤 새 값을 돌려준다.
     */
    long beginDraftWrite(VersionRef draft, long expectedRowVersion, String userId);
}
