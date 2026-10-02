package com.dongkuk.dmes.mdm.contract.version;

/**
 * 대상별 확정 취소 검사 SPI(D-144 3단계, Ruling P3-22·P3-23) — 확정 취소 트랜잭션 안에서 상태를 DRAFT 로 되돌리고 직전 RELEASED 의 적용
 * 구간까지 다시 연 <b>직후</b>(메타 기록 전)에 {@link VersionStateService} 구현이 부른다. 그래서 구현은 "취소 뒤 상태" 를 원장에서 그대로
 * 읽어 판정한다. 거부하려면 {@code BusinessException} 을 던진다 — 취소 전체가 되돌아간다.
 *
 * <p>확정 검사 SPI·DRAFT 삭제 훅과 달리 등록은 선택이다 — target 에 구현이 없으면 아무것도 하지 않는다(룰·룰 세트·코드는 지금 없다).
 * 같은 target 에 둘이면 기동이 실패한다.
 */
public interface VersionConfirmCancelCheckSpi {

    VersionTarget target();

    /** @param cancelled 방금 DRAFT 로 되돌린 버전 */
    void afterConfirmCancel(VersionRef cancelled);
}
