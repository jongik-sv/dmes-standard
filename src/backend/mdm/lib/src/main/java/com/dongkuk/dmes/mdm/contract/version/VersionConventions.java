package com.dongkuk.dmes.mdm.contract.version;

import java.time.LocalDateTime;

/**
 * row_version 낙관적 잠금 규약과 열린 끝 일시 — 원천 04:305·1008, 규칙표 §2·#16.
 * 생성 시 0, 저장·전이마다 +1, 기대값과 다르면 {@code MdmErrorCode.ROW_VERSION_CONFLICT}.
 */
public final class VersionConventions {

    public static final String ROW_VERSION_COLUMN = "ROW_VERSION";
    public static final long INITIAL_ROW_VERSION = 0L;
    public static final long ROW_VERSION_STEP = 1L;
    /** apply_to 의 열린 끝(규칙표 #16 '9999-12-31 00:00:00'). */
    public static final LocalDateTime OPEN_END = LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private VersionConventions() {
    }
}
