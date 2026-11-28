package com.dongkuk.dmes.mcm.menu;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 2026-11-27 FULL_SEQ 삭제 — 메뉴 순서는 MENU_SEQ(숫자) → MENU_ID 하나로 정한다. */
class MenuOrderTest {

    private static SecMenu menu(String id, String seq) {
        SecMenu m = new SecMenu();
        m.setMenuId(id);
        m.setMenuSeq(seq);
        return m;
    }

    private static Map<String, Object> row(String id, Object seq) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("menuId", id);
        r.put("menuSeq", seq);
        return r;
    }

    @Test
    @DisplayName("MENU_SEQ 를 숫자로 비교한다 — 8자리 0 채움과 채우지 않은 값이 섞여도 9 가 10 보다 앞")
    void menus_numericSeq() {
        List<SecMenu> list = new ArrayList<>(List.of(
                menu("c", "00000010"), menu("a", "9"), menu("b", "00000002"), menu("z", null), menu("x", "abc")));
        list.sort(MenuOrder.MENUS);
        assertThat(list).extracting(SecMenu::getMenuId).containsExactly("b", "a", "c", "x", "z");
    }

    @Test
    @DisplayName("순서가 같으면 MENU_ID 순")
    void menus_tieBreakById() {
        List<SecMenu> list = new ArrayList<>(List.of(menu("m2", "10"), menu("m1", "00000010")));
        list.sort(MenuOrder.MENUS);
        assertThat(list).extracting(SecMenu::getMenuId).containsExactly("m1", "m2");
    }

    @Test
    @DisplayName("응답 맵 행 — 폴더(숫자형)와 화면(문자형) 순서가 섞여도 숫자로 비교한다")
    void rows_mixedTypes() {
        List<Map<String, Object>> list = new ArrayList<>(List.of(
                row("g2", new BigDecimal("20")), row("s1", "00000015"), row("g1", 10L)));
        list.sort(MenuOrder.rows("menuSeq", "menuId"));
        assertThat(list).extracting(r -> r.get("menuId")).containsExactly("g1", "s1", "g2");
    }
}
