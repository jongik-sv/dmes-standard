package com.dongkuk.dmes.mdm.contract.mastercode;

import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;

/**
 * 04 확정 검사 SPI 구현 대상(구현 TSK-06-05). {@code target()} 은 MASTER_CODE 이고 target 당 구현은 하나다.
 *
 * <p>{@code check()} 는 {@link #report} 의 REJECTED 이슈를 errors 로, WARNED 이슈를 warnings 로 편 것과 같아야 한다.
 * {@link #report} 는 {@link MasterCodeConfirmCheckItem} 순서대로 10행을 모두 담는다. {@code MdmCheckIssue.code} 는 항목
 * enum 의 {@code name()}, itemKey 는 {@link MasterCodeDiffConventions} 키다. {@code diff()} 는 V 의 diff
 * (from_ver = V 또는 to_ver = V 인 행, 04:48)를 세 표에 대해 돌려주고 SAME 을 내지 않는다 — 미적용 버전이 하나뿐이라
 * (04:284) 이것이 곧 직전 RELEASED 대비 diff 다.
 */
public interface MasterCodeConfirmCheckSpi extends VersionConfirmCheckSpi {

    MasterCodeConfirmCheckReport report(ConfirmCheckRequest request);
}
