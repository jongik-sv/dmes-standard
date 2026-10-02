package com.dongkuk.dmes.mdm.common.version;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 버전 행 읽기(D-144) — 룰·룰 세트 버전 엔티티가 함께 쓰는 고르기 규칙({@code RuleVersions})의 입력. ver 는 scale 3. */
public interface VersionedRow {

    BigDecimal getVer();

    String getStatus();

    LocalDateTime getApplyFrom();

    LocalDateTime getApplyTo();
}
