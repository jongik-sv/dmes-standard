package com.dongkuk.dmes.mcm.security.service;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link SecUserService#collectAncestorFolderIds} 단위 테스트 — 권한 없는(보이는 자식 없는) 메뉴 폴더 숨김.
 */
class SecUserMenuFolderTest {

    private static Map<String, Object> fld(String menuId, String parent) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("MENU_ID", menuId);
        m.put("PARENT_MENU_ID", parent);
        return m;
    }

    private static SecMenu leaf(String parentMenuId) {
        SecMenu m = mock(SecMenu.class);
        when(m.getParentMenuId()).thenReturn(parentMenuId);
        return m;
    }

    @Test
    @DisplayName("보이는 leaf 의 조상 폴더만 수집 — 권한 없는 그룹(cma) 제외")
    void onlyAncestorsOfVisibleLeaves() {
        List<Map<String, Object>> flds = List.of(
                fld("MOD", null), fld("cic", "MOD"), fld("cia", "MOD"), fld("cma", "MOD"));
        // 보이는 leaf 는 cic, cia 그룹 아래만 (cma 그룹은 권한 없음)
        Set<String> needed = SecUserService.collectAncestorFolderIds(
                List.of(leaf("cic"), leaf("cia")), flds);
        assertThat(needed).containsExactlyInAnyOrder("cic", "cia", "MOD");
        assertThat(needed).doesNotContain("cma");
    }

    @Test
    @DisplayName("보이는 leaf 없으면 빈 집합 (모든 폴더 숨김)")
    void noVisibleLeaves() {
        List<Map<String, Object>> flds = List.of(fld("MOD", null), fld("cic", "MOD"));
        assertThat(SecUserService.collectAncestorFolderIds(List.of(), flds)).isEmpty();
    }

    @Test
    @DisplayName("SYSADMIN(전체 leaf 가시) → 자식 있는 모든 폴더 포함")
    void allLeavesVisible() {
        List<Map<String, Object>> flds = List.of(
                fld("MOD", null), fld("cic", "MOD"), fld("cma", "MOD"));
        Set<String> needed = SecUserService.collectAncestorFolderIds(
                List.of(leaf("cic"), leaf("cma")), flds);
        assertThat(needed).containsExactlyInAnyOrder("cic", "cma", "MOD");
    }
}
