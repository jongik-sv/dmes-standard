package com.dongkuk.dmes.mdm.contract.version;

import java.math.BigDecimal;

/** 버전 식별자. objectId = maru_code_id(04) 또는 maru_rule_id(06), ver 의 scale 은 {@link VersionTarget#versionScale()}. */
public record VersionRef(VersionTarget target, String objectId, BigDecimal ver) {
}
