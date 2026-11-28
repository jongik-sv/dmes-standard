package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ScreenMenuCatalogTest {

    @Mock MenuCatalog menuCatalog;
    @Mock SecMenuNativeRepository secMenuNativeRepository;
    @InjectMocks ScreenMenuCatalog catalog;

    private static SecMenu menu(String menuId, String parent, String objectId, String nm, String viewYn, String useTp) {
        SecMenu m = new SecMenu();
        m.setMenuId(menuId);
        m.setParentMenuId(parent);
        m.setObjectId(objectId);
        m.setMenuNm(nm);
        m.setMenuViewYn(viewYn);
        m.setUseTp(useTp);
        return m;
    }

    private static Map<String, Object> folder(String id, String nm, String parent) {
        Map<String, Object> m = new HashMap<>();
        m.put("MENU_ID", id);
        m.put("MENU_NM", nm);
        m.put("PARENT_MENU_ID", parent);
        return m;
    }

    @Test
    @DisplayName("pageId = PARENT_MENU_ID/OBJECT_ID, 경로는 폴더 이름 사슬, 표시 여부는 MENU_VIEW_YN·USE_TP 가 모두 Y")
    void buildsCatalog() {
        when(secMenuNativeRepository.searchMenuFld()).thenReturn(List.of(
                folder("mcm", "공통관리", null), folder("csa", "시스템관리", "mcm")));
        when(menuCatalog.snapshot()).thenReturn(snapshot(List.of(
                menu("commUserMng", "csa", "commUserMng", "사용자 관리", "Y", "Y"),
                menu("hidden", "csa", "hiddenScreen", "숨김 화면", "N", "Y"),
                menu("stopped", "csa", "stoppedScreen", "중지 화면", "Y", "N"),
                menu("noObj", "csa", null, "객체 없음", "Y", "Y")), List.of()));

        Map<String, MenuInfo> menus = catalog.load();

        assertThat(menus).containsOnlyKeys("csa/commUserMng", "csa/hiddenScreen", "csa/stoppedScreen");
        assertThat(menus.get("csa/commUserMng"))
                .isEqualTo(new MenuInfo("csa/commUserMng", "사용자 관리", "공통관리 > 시스템관리", true));
        assertThat(menus.get("csa/hiddenScreen").viewable()).isFalse();
        assertThat(menus.get("csa/stoppedScreen").viewable()).isFalse();
    }

    @Test
    @DisplayName("같은 pageId 가 둘이면 표시되는 메뉴를 고른다")
    void prefersViewableDuplicate() {
        when(secMenuNativeRepository.searchMenuFld()).thenReturn(List.of(folder("csa", "시스템관리", null)));
        when(menuCatalog.snapshot()).thenReturn(snapshot(List.of(
                menu("old", "csa", "commUserMng", "옛 메뉴", "N", "Y"),
                menu("new", "csa", "commUserMng", "사용자 관리", "Y", "Y")), List.of()));

        assertThat(catalog.load().get("csa/commUserMng").menuNm()).isEqualTo("사용자 관리");
    }

    @Test
    @DisplayName("pageId 는 OBJECT 의 FORM_URL 이 먼저다 — 메뉴를 다른 폴더로 옮겨도 pageId 는 그대로, 메뉴 경로만 바뀐다")
    void pageIdFollowsObjectFormUrl() {
        when(secMenuNativeRepository.searchMenuFld()).thenReturn(List.of(
                folder("mcm", "공통관리", null), folder("csa", "시스템관리", "mcm"), folder("cmq", "맞춤 레포트", "mcm")));
        SecObj moved = new SecObj();
        moved.setObjectId("commUserMng");
        moved.setFormUrl("csa/commUserMng");
        when(menuCatalog.snapshot()).thenReturn(snapshot(List.of(
                menu("commUserMng", "cmq", "commUserMng", "사용자 관리", "Y", "Y")), List.of(moved)));

        Map<String, MenuInfo> menus = catalog.load();

        assertThat(menus).containsOnlyKeys("csa/commUserMng");
        assertThat(menus.get("csa/commUserMng").menuPath()).isEqualTo("공통관리 > 맞춤 레포트");
    }

    private static MenuCatalog.Snapshot snapshot(List<SecMenu> menus, List<SecObj> objects) {
        return MenuCatalog.Snapshot.of(menus, objects);
    }

    @Test
    @DisplayName("폴더가 순환해도 멈추고, 알 수 없는 폴더면 경로는 null")
    void folderPathGuards() {
        Map<String, String[]> folders = new HashMap<>();
        folders.put("a", new String[]{"폴더A", "b"});
        folders.put("b", new String[]{"폴더B", "a"});

        assertThat(ScreenMenuCatalog.folderPath("a", folders)).isEqualTo("폴더B > 폴더A");
        assertThat(ScreenMenuCatalog.folderPath("zzz", folders)).isNull();
    }
}
