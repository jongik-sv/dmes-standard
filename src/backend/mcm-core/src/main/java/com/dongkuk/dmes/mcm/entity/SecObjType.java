/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 오브젝트 유형(TB_MCM_SEC_OBJ.OBJECT_TYPE) 코드 — 메뉴 화면·팝업·화면 안 기능·도구 위젯
 */
package com.dongkuk.dmes.mcm.entity;

import java.util.Locale;
import java.util.Optional;

/**
 * 오브젝트 유형 — {@code TB_MCM_SEC_OBJ.OBJECT_TYPE} 에 대문자 코드로 저장한다(2026-11-28, V28 이 옛 'web' 을 'WEB' 으로 바꿨다).
 *
 * <p>공통 코드(코드 관리 LOV)가 아니라 상수다. 같은 표의 접속 경로(ACCESS_TP 내부·외부)·메뉴 셋(MENU_TP WEB·MOBIL)도 상수라 그 관례를 따른다.
 * 값이 바뀌면 화면 commObjMng 의 선택 목록(ObjDetailForm {@code OBJECT_TYPE_OPTIONS})도 함께 고친다.
 *
 * <ul>
 *   <li>{@link #WEB} 메뉴 화면 — 포털이 메뉴로 여는 화면. 메뉴에 넣을 수 있다. 빈 값도 이것으로 본다.</li>
 *   <li>{@link #POPUP} 팝업 — 다른 화면 안에서 여는 창(모달). 자기 화면 경로가 없어 메뉴에 넣지 않는다.</li>
 *   <li>{@link #SUB} 화면 안 기능 — 다른 화면의 탭·상세·단추가 부르는 서비스 권한 키(그 화면에 합쳐진 옛 화면 포함).
 *       자기 화면이 없어 메뉴에 넣지 않는다.</li>
 *   <li>{@link #WIDGET} 도구 위젯 — 포털 홈·위젯 틀에서 쓰는 부품. 메뉴에 넣지 않는다.</li>
 * </ul>
 *
 * <p>메뉴 관리(commMenuMng)는 {@link #isMenuPlaceable()} 이 거짓인 유형을 「놓이지 않은 오브젝트」 목록에서 빼고, 메뉴 저장에서 거부한다.
 * 권한(직무 퍼미션·권한 작업대)은 유형과 상관없이 그대로다.
 */
public enum SecObjType {

    WEB("메뉴 화면"),
    POPUP("팝업"),
    SUB("화면 안 기능"),
    WIDGET("도구 위젯");

    /** 메뉴 저장 거부 문구 — 팝업·도구 위젯·화면 안 기능 오브젝트를 메뉴에 넣으려 할 때. */
    public static final String NOT_PLACEABLE_MESSAGE = "팝업·도구 위젯·화면 안 기능은 메뉴에 넣을 수 없습니다";

    private final String label;

    SecObjType(String label) {
        this.label = label;
    }

    /** 화면에 보이는 한글 이름. */
    public String label() {
        return label;
    }

    /** 메뉴에 넣을 수 있는 유형인가(메뉴 화면만). */
    public boolean isMenuPlaceable() {
        return this == WEB;
    }

    /**
     * 저장된 값 또는 입력 값을 유형으로 읽는다. 앞뒤 공백·대소문자는 무시한다. 빈 값(null 포함)은 {@link #WEB} 이다.
     *
     * @return 알 수 없는 값이면 빈 Optional
     */
    public static Optional<SecObjType> parse(String value) {
        if (value == null || value.isBlank()) return Optional.of(WEB);
        String v = value.trim().toUpperCase(Locale.ROOT);
        for (SecObjType t : values()) {
            if (t.name().equals(v)) return Optional.of(t);
        }
        return Optional.empty();
    }

    /** 저장된 값이 메뉴에 넣을 수 없는 유형(팝업·도구 위젯·화면 안 기능)인가. 알 수 없는 값은 막지 않는다(저장 검증이 따로 막는다). */
    public static boolean isNotPlaceable(String value) {
        return parse(value).map(t -> !t.isMenuPlaceable()).orElse(false);
    }
}
