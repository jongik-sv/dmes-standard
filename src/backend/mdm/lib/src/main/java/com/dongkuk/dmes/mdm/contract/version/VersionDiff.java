package com.dongkuk.dmes.mdm.contract.version;

import java.util.List;

/** 버전 diff 전체. base 는 직전 RELEASED(최초 버전이면 null), target 은 비교 대상 draft. */
public record VersionDiff(VersionRef base, VersionRef target, List<VersionDiffEntry> entries) {
}
