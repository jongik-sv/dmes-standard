package com.dongkuk.dmes.mdm.contract.version;

/**
 * 버전 생성·DRAFT 저장 가드 — "미적용 버전 하나" 규칙(원천 04:284·293-301, ADR-0002 D2). 구현 TSK-01-03.
 *
 * <p>미적용 버전 = DRAFT·REQUESTED·APPROVED, 또는 적용 시작 일시가 아직 오지 않은 RELEASED(원천 04:284, BE 리팩토링 2회차 C2).
 * 영역 서비스가 폐기(룰·룰 세트) 직전에 {@link #checkCanCreateVersion}, DRAFT 저장 직전에 {@link #beginDraftWrite} 를 부른다. 새 버전
 * (룰·룰 세트·레이아웃·ERD·마루 코드, 코드 복원 포함)은 이 메서드를 부르지 않고 새 버전 훅({@link VersionStateService#newVersion})이 같은
 * 판정을 한다(BE 리팩토링 2회차 C3).
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
