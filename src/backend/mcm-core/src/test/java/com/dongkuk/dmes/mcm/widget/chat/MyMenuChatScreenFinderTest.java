package com.dongkuk.dmes.mcm.widget.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.service.SecUserService;
import com.dongkuk.dmes.mcm.widget.chat.service.ChatScreenFinder.Screen;
import com.dongkuk.dmes.mcm.widget.chat.service.MyMenuChatScreenFinder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link MyMenuChatScreenFinder} — 사용자 메뉴(secUser/myMenus 와 같은 조회)에서 화면 찾기.
 * pageId 규칙은 포털 셸 {@code getPortalMenuItemPageId} 와 같다: {@code sysCd + ":" + (componentPath 에 / 가 있으면 componentPath, 아니면 objId)}.
 */
class MyMenuChatScreenFinderTest {

    private SecUserService secUserService;
    private MyMenuChatScreenFinder finder;

    @BeforeEach
    void setUp() {
        secUserService = mock(SecUserService.class);
        finder = new MyMenuChatScreenFinder(secUserService);
    }

    private static Map<String, Object> folder(String id, String nm, String parent) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("menuId", id);
        m.put("menuNm", nm);
        m.put("menuType", "dir");
        m.put("uprLvMenuId", parent);
        m.put("objId", null);
        m.put("hiddenYn", "N");
        m.put("sysCd", null);
        m.put("componentPath", null);
        return m;
    }

    private static Map<String, Object> page(String id, String nm, String parent, String objId, String sysCd,
                                            String componentPath, String hiddenYn) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("menuId", id);
        m.put("menuNm", nm);
        m.put("menuType", "page");
        m.put("uprLvMenuId", parent);
        m.put("objId", objId);
        m.put("hiddenYn", hiddenYn);
        m.put("sysCd", sysCd);
        m.put("componentPath", componentPath);
        return m;
    }

    private void menus(List<Map<String, Object>> rows) {
        when(secUserService.getMyMenus(any(MyMenusRequest.class))).thenReturn(rows);
    }

    @Test
    @DisplayName("이름에 keyword 가 든 화면만, pageId·title·상위 메뉴 경로로 돌려준다(대소문자·공백 무시)")
    void findsByNameWithPageIdAndPath() {
        menus(List.of(
                folder("mcm", "공통관리", null),
                folder("csa", "시스템관리", "mcm"),
                page("m1", "위젯 관리", "csa", "commWidgetMng", "mcm", "csa/commWidgetMng", "N"),
                page("m2", "메뉴관리", "csa", "commMenuMng", "mcm", "csa/commMenuMng", "N"),
                page("m3", "Widget Log", "csa", "widgetLog", "mcm", null, "N")));

        List<Screen> found = finder.find("위젯관리", 10);
        assertThat(found).containsExactly(new Screen("mcm:csa/commWidgetMng", "위젯 관리", "공통관리 > 시스템관리"));

        assertThat(finder.find("widget", 10)).extracting(Screen::pageId)
                .as("componentPath 가 없으면 objId 로 만든다").containsExactly("mcm:widgetLog");
    }

    @Test
    @DisplayName("숨김 화면·폴더·sysCd 없는 행은 빼고, 최대 limit 개까지만")
    void skipsHiddenFoldersAndLimits() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(folder("rpt", "보고서 폴더", null));
        rows.add(page("h", "보고서 팝업", "rpt", "rptPopup", "mcm", "rpt/rptPopup", "Y"));
        rows.add(page("n", "보고서 무시스템", "rpt", "rptNoSys", null, "rpt/rptNoSys", "N"));
        for (int i = 0; i < 15; i++) {
            rows.add(page("p" + i, "보고서 " + i, "rpt", "rpt" + i, "mls", "rpt/rpt" + i, "N"));
        }
        menus(rows);

        List<Screen> found = finder.find("보고서", 10);

        assertThat(found).hasSize(10);
        assertThat(found).extracting(Screen::pageId).doesNotContain("mcm:rpt/rptPopup").allMatch(id -> id.startsWith("mls:"));
        assertThat(found.get(0).path()).isEqualTo("보고서 폴더");
    }

    @Test
    @DisplayName("keyword 가 비면 메뉴를 읽지 않고 빈 목록")
    void blankKeywordReturnsEmpty() {
        assertThat(finder.find("  ", 10)).isEmpty();
        assertThat(finder.find(null, 10)).isEmpty();
        verify(secUserService, never()).getMyMenus(any());
    }
}
