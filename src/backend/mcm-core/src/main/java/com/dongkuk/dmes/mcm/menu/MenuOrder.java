package com.dongkuk.dmes.mcm.menu;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.Map;

/**
 * 메뉴 순서의 단일 규칙 — 같은 부모 안에서 {@code MENU_SEQ} 를 숫자로 비교하고, 같으면 {@code MENU_ID} 로 비교한다.
 *
 * <p>2026-11-27 사용자 결정 — FULL_SEQ(트리 위치를 7자리로 인코딩해 따로 저장한 값)를 없앤다. 트리는 PARENT_MENU_ID 로
 * 이미 만들어지고 형제끼리의 순서는 MENU_SEQ 만으로 정해지므로 따로 저장할 필요가 없다. FULL_SEQ 는 모듈 9개·그룹 99개·
 * 폴더당 화면 90개 한도와 3단 깊이에 묶였고, 저장할 때마다 트리 전체를 다시 매겨야 했다.
 *
 * <p>MENU_SEQ 는 화면(TB_MCM_SEC_MENU)이 0 을 채운 8자리 문자열, 폴더(TB_MCM_SEC_MENU_FLD)가 숫자라 글자로 비교하면
 * 어긋난다. 그래서 숫자로 읽는다. 비었거나 숫자가 아니면 맨 뒤로 보낸다.
 *
 * <p>내 메뉴 트리({@code SecUserService})와 pageId 매칭({@code PortalPageMenuMatcher})이 이 규칙을 쓴다.
 */
public final class MenuOrder {

    private MenuOrder() {}

    /** MENU_SEQ 값을 숫자로. 비었거나 숫자가 아니면 null(맨 뒤). */
    public static BigDecimal seqOf(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        if (s.isEmpty()) return null;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static final Comparator<BigDecimal> SEQ = Comparator.nullsLast(Comparator.naturalOrder());
    private static final Comparator<String> ID = Comparator.nullsLast(Comparator.naturalOrder());

    /** 화면 메뉴 행 순서: MENU_SEQ(숫자) → MENU_ID. */
    public static final Comparator<SecMenu> MENUS = Comparator
            .comparing((SecMenu m) -> seqOf(m.getMenuSeq()), SEQ)
            .thenComparing(SecMenu::getMenuId, ID);

    /**
     * 응답 맵 행 순서: {@code seqKey}(숫자) → {@code idKey}. 폴더 행과 화면 행이 섞인 형제 목록에도 쓴다.
     */
    public static Comparator<Map<String, Object>> rows(String seqKey, String idKey) {
        return Comparator
                .comparing((Map<String, Object> r) -> seqOf(r.get(seqKey)), SEQ)
                .thenComparing(r -> r.get(idKey) == null ? null : r.get(idKey).toString(), ID);
    }
}
