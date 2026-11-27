package com.dongkuk.dmes.mcm.security.perm;

/**
 * 권한 부여 사유.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 버튼이 왜 허용됐는지 설명({@link Explain})에 쓰는 사유 코드.
 */
public enum GrantReason {
    /** 역할 퍼미션 행으로 허용. */
    PERM,
    /** SYSADMIN 역할(퍼미션 행 없이 전부 허용, D13). */
    SYSADMIN
}
