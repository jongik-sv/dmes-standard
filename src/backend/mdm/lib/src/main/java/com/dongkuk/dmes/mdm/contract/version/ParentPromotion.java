package com.dongkuk.dmes.mdm.contract.version;

/**
 * 새 버전 때 부모 CREATED → INUSE 올리기 — 새 버전 훅의 대상별 손잡이(C3). 적용된 RELEASED 가 하나라도 있을 때만 불린다. 룰·룰 세트·ERD 는
 * 공통 저장소의 native UPDATE(확정과 같은 쿼리)를, 레이아웃은 아무것도 하지 않는 구현을 넘긴다. 마루 코드는 관리 중인 엔티티가 저장 CREATED 일
 * 때만 INUSE 로 바꾸는 구현을 넘긴다(훅은 저장 상태를 보지 않는다).
 */
public interface ParentPromotion {

    void promote(VersionTarget target, String objectId);
}
