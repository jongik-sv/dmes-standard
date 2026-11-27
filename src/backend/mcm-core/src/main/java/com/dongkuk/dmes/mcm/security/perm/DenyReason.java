package com.dongkuk.dmes.mcm.security.perm;

/**
 * 권한 거부 사유.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 버튼·오브젝트가 왜 빠졌는지 설명({@link Explain})에 쓰는 사유 코드.
 */
public enum DenyReason {
    /** 어떤 역할도 이 코드를 주지 않았다. */
    NO_PERM,
    /** 퍼미션에는 있으나 오브젝트 허용 값(BTN·POPUP)에서 빠졌다(D15). */
    NOT_IN_OBJ,
    /** 퍼미션을 준 역할이 사용 안 함이거나 유효 기간 밖이다. */
    ROLE_UNUSED,
    /** 역할을 준 그룹이 사용 안 함이거나 유효 기간 밖이다. */
    GROUP_UNUSED,
    /** 오브젝트가 사용 안 함이거나 유효 기간 밖이다. */
    OBJ_UNUSED,
    /** 메뉴가 숨김이거나 사용 안 함이다. */
    MENU_HIDDEN,
    /** 사용자에게 연결된 역할이 하나도 없다. */
    NO_ROLE
}
