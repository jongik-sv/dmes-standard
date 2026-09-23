package com.dongkuk.dmes.mdm.contract.common;

import java.util.List;

/**
 * 공통 관리 속성(감사) 9칼럼 이름과 순서 — 규칙표 §2, ADR-0001 D2. {@code CactusAuditEntity} 매핑과 같다.
 * 엔티티를 거치지 않는 네이티브 쓰기는 이 목록을 명시한다({@link MdmNativeAuditSupport}).
 */
public final class MdmAuditColumns {

    public static final String C_USR_ID = "C_USR_ID";
    public static final String C_AT = "C_AT";
    public static final String C_SVC_ID = "C_SVC_ID";
    public static final String C_PGM_ID = "C_PGM_ID";
    public static final String U_USR_ID = "U_USR_ID";
    public static final String U_AT = "U_AT";
    public static final String U_SVC_ID = "U_SVC_ID";
    public static final String U_PGM_ID = "U_PGM_ID";
    public static final String VER = "VER";

    public static final List<String> ALL = List.of(C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER);

    /** 네이티브 INSERT 칼럼 목록. {@link #ALL} 을 ", " 로 이은 값과 같다. */
    public static final String NATIVE_COLUMN_LIST = "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";

    private MdmAuditColumns() {
    }
}
