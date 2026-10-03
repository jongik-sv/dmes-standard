package com.dongkuk.dmes.mcm.common.event;

/**
 * 메뉴·메뉴 폴더·OBJECT 변경 이벤트 — mcm-core 자체 클래스 (cactus 무관).
 *
 * <p>발행처 (실제로 바뀐 행이 있을 때만):
 * <ul>
 *   <li>{@code CommMenuMngService.saveCmMenu} — TB_MCM_SEC_MENU 저장·삭제 ({@link #MENU})</li>
 *   <li>{@code CommMenuMngService.saveCmMenuFld} — TB_MCM_SEC_MENU_FLD 저장·삭제 ({@link #MENU_FOLDER}).
 *       뒤이은 FULL_SEQ 재계산이 TB_MCM_SEC_MENU 도 바꾸므로 메뉴 카탈로그도 비워야 한다.</li>
 *   <li>{@code CommObjMngService.saveCmObj} — TB_MCM_SEC_OBJ 저장·삭제 ({@link #OBJECT})</li>
 * </ul>
 *
 * <p>구독처: {@code MenuCatalog} — SEC_MENU·SEC_OBJ 전수 스냅샷을 비운다.
 * 이벤트는 같은 JVM 안에서만 전달된다. 다른 인스턴스·DB 직접 변경은 카탈로그 TTL 로 따라잡는다.
 *
 * @param source 변경 대상 구분 ({@link #MENU} / {@link #MENU_FOLDER} / {@link #OBJECT}) — 로그용
 */
public record MenuChangedEvent(String source) {

    public static final String MENU = "MENU";
    public static final String MENU_FOLDER = "MENU_FOLDER";
    public static final String OBJECT = "OBJECT";
}
