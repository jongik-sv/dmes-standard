package com.dongkuk.dmes.mdm.contract.version;

import java.time.LocalDateTime;

/** 확정 검사 SPI 입력. previousReleasedApplyFrom 은 최초 버전이면 null, now 는 애플리케이션 시각(규칙표 #16). */
public record ConfirmCheckRequest(VersionRef draft, LocalDateTime requestedApplyFrom,
                                  LocalDateTime previousReleasedApplyFrom, String confirmerId, LocalDateTime now) {
}
