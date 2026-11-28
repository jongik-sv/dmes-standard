package com.dongkuk.dmes.mcm.favorite.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.menu.MenuCodePath;
import com.dongkuk.dmes.mcm.menu.MenuOrder;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * portal-shell pageId({@code "{sysCd}:{componentPath}"}) → 활성 메뉴 매칭 공용 규칙.
 *
 * <p>즐겨찾기({@link SecFavoriteService})와 기본 화면({@code SecStartPgmService})이 같은 규칙을 쓴다.
 * componentPath 는 {@link MenuCodePath}(OBJECT.FORM_URL, 없으면 {@code PARENT_MENU_ID/OBJECT_ID}) 이고
 * (= mui {@code FULL_ID} 등가), 메뉴 OBJECT 의 {@code SYSTEM_CODE} 가 sysCd 와 같아야 한다. 같은 경로가 여럿이면 MENU_SEQ → MENU_ID 순 첫 행({@link MenuOrder}).
 */
public final class PortalPageMenuMatcher {

    private PortalPageMenuMatcher() {}

    /** pageId 를 (sysCd, componentPath) 로 나눈다. 형식이 틀리면 {@link BusinessException}. */
    public static String[] splitPageId(String pageId) {
        if (pageId == null || pageId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "pageId 는 필수입니다.");
        }
        int colon = pageId.indexOf(':');
        if (colon <= 0 || colon == pageId.length() - 1) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "pageId 는 'moduleId:componentPath' 형식이어야 합니다: " + pageId);
        }
        return new String[]{pageId.substring(0, colon), pageId.substring(colon + 1)};
    }

    /** sysCd + componentPath({@link MenuCodePath}) 로 활성(USE_TP=Y) 메뉴 매칭. 없으면 null. */
    public static SecMenu findMenuByComponentPath(Collection<SecMenu> menus, Collection<SecObj> objs,
                                                  String targetSysCd, String targetComponentPath) {
        Map<String, SecObj> objById = new HashMap<>();
        for (SecObj o : objs) {
            objById.put(o.getObjectId(), o);
        }
        List<SecMenu> activeMenus = menus.stream()
                .filter(m -> "Y".equals(m.getUseTp()))
                .sorted(MenuOrder.MENUS)
                .toList();
        for (SecMenu m : activeMenus) {
            String objectId = m.getObjectId();
            if (objectId == null || objectId.isBlank()) {
                continue;
            }
            SecObj obj = objById.get(objectId);
            if (obj == null || !targetSysCd.equals(obj.getSystemCode())) {
                continue;
            }
            if (targetComponentPath.equals(MenuCodePath.of(m, obj))) {
                return m;
            }
        }
        return null;
    }
}
