package com.dongkuk.dmes.mcm.menu;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 화면 코드 경로 규칙 — OBJECT.FORM_URL 이 먼저, 없으면 PARENT_MENU_ID/OBJECT_ID. */
class MenuCodePathTest {

    private static SecMenu menu(String parent, String objectId) {
        SecMenu m = new SecMenu();
        m.setMenuId("M1");
        m.setParentMenuId(parent);
        m.setObjectId(objectId);
        return m;
    }

    private static SecObj obj(String objectId, String formUrl) {
        SecObj o = new SecObj();
        o.setObjectId(objectId);
        o.setFormUrl(formUrl);
        return o;
    }

    @Test
    @DisplayName("FORM_URL 에 '/' 가 있으면 그 값(공백 제거) — 메뉴의 폴더와 무관하다")
    void formUrlWins() {
        assertThat(MenuCodePath.of(menu("cmq", "commMenuMng"), obj("commMenuMng", " csa/commMenuMng ")))
                .isEqualTo("csa/commMenuMng");
        assertThat(MenuCodePath.of(menu(null, "commMenuMng"), obj("commMenuMng", "csa/commMenuMng")))
                .as("폴더가 비어도 FORM_URL 로 정해진다").isEqualTo("csa/commMenuMng");
    }

    @Test
    @DisplayName("FORM_URL 이 비었거나 '/' 가 없거나 OBJECT 가 없으면 PARENT_MENU_ID/OBJECT_ID 로 물러난다")
    void fallsBackToParentAndObject() {
        assertThat(MenuCodePath.of(menu("csa", "commMenuMng"), obj("commMenuMng", null))).isEqualTo("csa/commMenuMng");
        assertThat(MenuCodePath.of(menu("csa", "commMenuMng"), obj("commMenuMng", "  "))).isEqualTo("csa/commMenuMng");
        assertThat(MenuCodePath.of(menu("csa", "commMenuMng"), obj("commMenuMng", "commMenuMng.xfdl")))
                .isEqualTo("csa/commMenuMng");
        assertThat(MenuCodePath.of(menu("csa", "commMenuMng"), (SecObj) null)).isEqualTo("csa/commMenuMng");
    }

    @Test
    @DisplayName("물러날 값도 비면 null — 메뉴가 null 이어도 null")
    void nullWhenPartsMissing() {
        assertThat(MenuCodePath.of(menu(null, "commMenuMng"), obj("commMenuMng", null))).isNull();
        assertThat(MenuCodePath.of(menu("csa", " "), (SecObj) null)).isNull();
        assertThat(MenuCodePath.of((SecMenu) null, obj("x", "a/b"))).isNull();
    }

    @Test
    @DisplayName("맵·스냅샷 오버로드는 메뉴의 OBJECT_ID 로 OBJECT 를 찾는다")
    void lookupOverloads() {
        SecMenu m = menu("cmq", "commMenuMng");
        SecObj o = obj("commMenuMng", "csa/commMenuMng");
        assertThat(MenuCodePath.of(m, Map.of("commMenuMng", o))).isEqualTo("csa/commMenuMng");
        assertThat(MenuCodePath.of(m, Map.of())).isEqualTo("cmq/commMenuMng");
        assertThat(MenuCatalog.Snapshot.of(List.of(m), List.of(o)).codePathOf(m)).isEqualTo("csa/commMenuMng");
    }
}
