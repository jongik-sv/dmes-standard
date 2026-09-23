package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.time.LocalDateTime;

/** 버전 행 한 줄의 공통 칼럼(TSK-01-03 B13). {@code ref.ver()} 의 scale 은 대상의 versionScale 이다. */
public record VersionRow(VersionRef ref, String status, String ownerId, LocalDateTime applyFrom,
                         LocalDateTime applyTo, long rowVersion) {
}
