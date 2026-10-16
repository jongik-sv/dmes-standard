package com.dongkuk.dmes.mdm.contract.version;

/**
 * 대상별 「RELEASED 변경」 SPI(BE 리팩토링 2회차 C4) — 확정·확정 취소가 그 대상의 RELEASED 버전 집합을 바꾼 <b>뒤</b>(같은 트랜잭션, 메타
 * 기록 자리)에 {@link VersionStateService} 구현이 부른다. 공통 버전 서비스가 화면·대상 패키지를 직접 알지 않게, 대상마다 더 할 일을 여기서
 * 한다 — 레이아웃은 헤더의 RELEASED 가 바뀌면 그 헤더를 쌓은 전문까지 메타 기록을 펼친다. 던지면 확정·확정 취소 전체가 되돌아간다.
 *
 * <p>등록은 대상마다 많아야 하나다(둘이면 기동이 실패한다). 지금은 레이아웃만 등록한다 — 룰·룰 세트·코드는 공통 서비스가 직접 기록하고
 * ERD 모델은 기록할 것이 없다. 공통 서비스가 이 SPI 를 부르는 대상에 등록이 없으면 그 확정·확정 취소는 실패한다(메타 기록이 조용히
 * 빠지지 않게, fail-closed).
 */
public interface VersionReleasedChangeSpi {

    VersionTarget target();

    /** @param changed 방금 확정했거나 확정 취소한 버전 */
    void afterReleasedChange(VersionRef changed);
}
