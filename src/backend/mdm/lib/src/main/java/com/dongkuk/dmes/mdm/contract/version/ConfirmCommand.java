package com.dongkuk.dmes.mdm.contract.version;

import java.time.LocalDateTime;

/** 확정 요청 — ADR-0002 D4. warningsAcknowledged 가 false 면 경고가 있을 때 확정하지 않는다. */
public record ConfirmCommand(VersionRef draft, long expectedRowVersion, LocalDateTime applyFrom,
                             String confirmerId, boolean warningsAcknowledged) {
}
