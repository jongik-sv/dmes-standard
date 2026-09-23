package com.dongkuk.dmes.mdm.contract.version;

/**
 * 대상별 확정 검사 SPI — 04(TSK-06-01 선언·06-05 구현)·06(TSK-08-01 선언·08-05 구현)이 구현하고
 * {@link VersionStateService} 구현이 확정 때 부른다.
 */
public interface VersionConfirmCheckSpi {

    VersionTarget target();

    /** 직전 RELEASED 대비 draft 의 diff. 최초 버전이면 base 가 null. */
    VersionDiff diff(VersionRef draft);

    /** 대상별 확정 검사. apply_from 순서는 VersionStateService 가 ApplyFromOrderCheck 로 공통 검사하므로 SPI 가 반복하지 않는다. */
    ConfirmCheckResult check(ConfirmCheckRequest request);
}
