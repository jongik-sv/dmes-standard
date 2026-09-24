package com.dongkuk.dmes.mdm.contract.mastercode;

import java.math.BigDecimal;

/**
 * 04 선분·번호 상수 — 원천 04:32·95·106·271-278. 버전 칼럼 scale 은 {@code VersionTarget.MASTER_CODE.versionScale()}(=3)
 * 을 그대로 쓰며 여기에 복제하지 않는다.
 */
public final class MasterCodeConventions {

    /** 최초 버전(04:95). */
    public static final BigDecimal FIRST_VER = new BigDecimal("1.000");
    /** 열린 행의 to_ver(04:32). 실제 버전이 아니다 — FK 를 걸지 않는다(04:958). */
    public static final BigDecimal OPEN_TO_VER = new BigDecimal("9999.000");
    /** minor 상한(04:277). */
    public static final int MAX_MINOR = 999;
    /** major 상한. 9999 는 발급하지 않는다(04:278). */
    public static final int MAX_MAJOR = 9998;
    /** lvl_cnt 범위와 기본값(04:106, CK_TB_MDM_CODE_LVL_CNT). */
    public static final int LVL_CNT_MIN = 0;
    public static final int LVL_CNT_MAX = 5;
    public static final int LVL_CNT_DEFAULT = 0;
    /** 계층 칸 lvl1~lvl5, 속성 칸 attr01~attr10 개수. */
    public static final int LVL_SLOTS = 5;
    public static final int ATTR_SLOTS = 10;
    /** 코드값·계층 칸 값 금지 문자(콤마·공백, 04:109·197). maru_code_id·cate_id 규칙은 MaruIdRules 를 쓴다. */
    public static final String CODE_FORBIDDEN_CHAR_PATTERN = "[,\\s]";

    private MasterCodeConventions() {
    }
}
