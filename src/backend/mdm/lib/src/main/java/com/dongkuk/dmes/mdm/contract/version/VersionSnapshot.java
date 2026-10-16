package com.dongkuk.dmes.mdm.contract.version;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 새 버전 원천 고르기({@link SourcePicker})에 넘기는 버전 한 행 — 번호·상태·적용 시작 일시(C3). */
public record VersionSnapshot(BigDecimal ver, String status, LocalDateTime applyFrom) {
}
