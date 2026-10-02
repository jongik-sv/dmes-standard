package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
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

    @Mock SecMenuRepository secMenuRepository;
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
        when(secMenuRepository.findAll()).thenReturn(List.of(
                menu("commUserMng", "csa", "commUserMng", "사용자 관리", "Y", "Y"),
                menu("hidden", "csa", "hiddenScreen", "숨김 화면", "N", "Y"),
                menu("stopped", "csa", "stoppedScreen", "중지 화면", "Y", "N"),
                menu("noObj", "csa", null, "객체 없음", "Y", "Y")));

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
        when(secMenuRepository.findAll()).thenReturn(List.of(
                menu("old", "csa", "commUserMng", "옛 메뉴", "N", "Y"),
                menu("new", "csa", "commUserMng", "사용자 관리", "Y", "Y")));

        assertThat(catalog.load().get("csa/commUserMng").menuNm()).isEqualTo("사용자 관리");
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
