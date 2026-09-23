package com.dongkuk.dmes.mdm.contract.version;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * 확정 시 apply_from 순서 검사 — ADR-0002 D4-3: 직전 RELEASED 의 apply_from 보다 엄격히 뒤, 최초 버전 면제.
 * 구현 TSK-01-03, 실구현 테스트는 test 의 ApplyFromOrderCheckContract 를 상속한다.
 */
public interface ApplyFromOrderCheck {

    /** previousReleasedApplyFrom 이 null 이면 최초 버전이라 통과. 통과면 Optional.empty(), 아니면 MDM008 이슈. */
    Optional<MdmCheckIssue> check(LocalDateTime previousReleasedApplyFrom, LocalDateTime requestedApplyFrom);
}
