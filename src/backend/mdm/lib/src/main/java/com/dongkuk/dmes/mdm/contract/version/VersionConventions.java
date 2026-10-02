package com.dongkuk.dmes.mdm.contract.version;

import java.math.BigDecimal;
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

    /** 최초 버전(04:95). */
    public static final BigDecimal FIRST_VER = new BigDecimal("1.000");
    /** minor 상한(04:277). */
    public static final int MAX_MINOR = 999;
    /** major 상한. 9999 는 열린 to_ver 라 발급하지 않는다(04:278). */
    public static final int MAX_MAJOR = 9998;

    private VersionConventions() {
    }
}
