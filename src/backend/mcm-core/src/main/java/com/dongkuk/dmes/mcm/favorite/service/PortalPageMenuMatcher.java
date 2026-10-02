package com.dongkuk.dmes.mcm.favorite.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * portal-shell pageId({@code "{sysCd}:{componentPath}"}) → 활성 메뉴 매칭 공용 규칙.
 *
 * <p>즐겨찾기({@link SecFavoriteService})와 기본 화면({@code SecStartPgmService})이 같은 규칙을 쓴다.
 * {@code componentPath = ${PARENT_MENU_ID}/${OBJECT_ID}} (= mui {@code FULL_ID} 등가) 이고,
 * 메뉴 OBJECT 의 {@code SYSTEM_CODE} 가 sysCd 와 같아야 한다. 같은 경로가 여럿이면 FULL_SEQ 순 첫 행.
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

    /** sysCd + componentPath({@code parentMenuId/objectId}) 로 활성(USE_TP=Y) 메뉴 매칭. 없으면 null. */
    public static SecMenu findMenuByComponentPath(Collection<SecMenu> menus, Collection<SecObj> objs,
                                                  String targetSysCd, String targetComponentPath) {
        Map<String, SecObj> objById = new HashMap<>();
        for (SecObj o : objs) {
            objById.put(o.getObjectId(), o);
        }
        List<SecMenu> activeMenus = menus.stream()
                .filter(m -> "Y".equals(m.getUseTp()))
                .sorted(Comparator.comparing(SecMenu::getFullSeq,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        for (SecMenu m : activeMenus) {
            String objectId = m.getObjectId();
            String parentMenuId = m.getParentMenuId();
            if (objectId == null || objectId.isBlank()
                    || parentMenuId == null || parentMenuId.isBlank()) {
                continue;
            }
            SecObj obj = objById.get(objectId);
            if (obj == null || !targetSysCd.equals(obj.getSystemCode())) {
                continue;
            }
            if ((parentMenuId + "/" + objectId).equals(targetComponentPath)) {
                return m;
            }
        }
        return null;
    }
}
