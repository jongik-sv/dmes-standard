package com.dongkuk.dmes.mcm.menu;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import java.util.Map;

/**
 * 메뉴 한 행의 화면 코드 경로(componentPath = fullId = pageId 의 경로 부분, 예: {@code csa/commMenuMng})를 정하는 단일 규칙.
 *
 * <p>2026-11-26 사용자 결정 — 메뉴가 OBJECT 를 참조하고 OBJECT 는 메뉴 정보를 갖지 않는다. 화면 코드 경로는 OBJECT 의 것이다.
 * 그래서 메뉴를 다른 폴더로 옮겨도 화면이 그대로 열려야 한다.
 * <ol>
 *   <li>OBJECT 의 {@code FORM_URL} 이 비어 있지 않고 {@code /} 를 담으면 그 값(앞뒤 공백 제거)을 쓴다.</li>
 *   <li>아니면 옛 규칙 {@code PARENT_MENU_ID + "/" + OBJECT_ID} 로 물러난다. 둘 중 하나라도 비면 null(열 화면 없음).</li>
 * </ol>
 * 기존 DB 는 mcm-core Flyway {@code V22__backfill_obj_form_url} 과 기동 시드 마무리({@code MenuFinalizer})가 2번 값을
 * FORM_URL 에 채워 두므로, 이미 저장된 즐겨찾기·기본 화면의 fullId 와 화면 사용 통계의 pageId 가 그대로 맞는다.
 *
 * <p>내 메뉴({@code SecUserService.getMyMenus} componentPath)·즐겨찾기·기본 화면(fullId 저장)·pageId 매칭
 * ({@code PortalPageMenuMatcher})·화면 사용 통계({@code ScreenMenuCatalog})가 모두 이 규칙 하나를 쓴다. 한 곳만 바꾸면
 * 저장된 fullId 와 매칭이 어긋나므로 경로를 새로 조립하지 말고 여기를 부른다.
 *
 * <p>패키지 — {@link MenuCatalog} 와 같은 첫 단계 패키지 {@code mcm.menu} 에 둔다. entity 만 쓴다(사이클 없음).
 */
public final class MenuCodePath {

    private MenuCodePath() {}

    /**
     * @param menu 메뉴 행(null 이면 null)
     * @param obj  그 메뉴의 OBJECT({@code OBJECT_ID} 로 찾은 것, 없으면 null)
     * @return 화면 코드 경로 또는 null
     */
    public static String of(SecMenu menu, SecObj obj) {
        if (menu == null) return null;
        String fromObject = fromFormUrl(obj);
        if (fromObject != null) return fromObject;
        return fallback(menu.getParentMenuId(), menu.getObjectId());
    }

    /** {@link #of(SecMenu, SecObj)} — OBJECT 를 {@code objectsById}(예: {@link MenuCatalog.Snapshot#objectsById()})에서 찾는다. */
    public static String of(SecMenu menu, Map<String, SecObj> objectsById) {
        if (menu == null) return null;
        String objectId = menu.getObjectId();
        SecObj obj = (objectId == null || objectsById == null) ? null : objectsById.get(objectId);
        return of(menu, obj);
    }

    /** OBJECT 의 FORM_URL 이 코드 경로로 쓸 만하면(비어 있지 않고 {@code /} 포함) 공백을 걷은 값, 아니면 null. */
    static String fromFormUrl(SecObj obj) {
        if (obj == null || obj.getFormUrl() == null) return null;
        String url = obj.getFormUrl().trim();
        return (!url.isEmpty() && url.indexOf('/') >= 0) ? url : null;
    }

    /** 옛 규칙 {@code PARENT_MENU_ID/OBJECT_ID} — 둘 중 하나라도 비면 null. */
    static String fallback(String parentMenuId, String objectId) {
        if (parentMenuId == null || parentMenuId.isBlank() || objectId == null || objectId.isBlank()) return null;
        return parentMenuId + "/" + objectId;
    }
}
