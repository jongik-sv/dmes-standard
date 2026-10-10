package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 통계용 메뉴 카탈로그 — pageId({@code PARENT_MENU_ID/OBJECT_ID}) → 메뉴명·메뉴 경로·표시 여부.
 *
 * <p>메뉴 경로는 새 계층 SQL 을 쓰지 않고 기존 {@link SecMenuNativeRepository#searchMenuFld()}(재귀 WITH CTE)
 * 결과의 PARENT_MENU_ID 사슬을 Java 에서 잇는다. 미사용 판정 대상(viewable)은 MENU_VIEW_YN='Y' 이고 USE_TP='Y' 인 화면.
 */
@Component
public class ScreenMenuCatalog {

    public record MenuInfo(String pageId, String menuNm, String menuPath, boolean viewable) {}

    private final MenuCatalog menuCatalog;
    private final SecMenuNativeRepository secMenuNativeRepository;

    public ScreenMenuCatalog(MenuCatalog menuCatalog, SecMenuNativeRepository secMenuNativeRepository) {
        this.menuCatalog = menuCatalog;
        this.secMenuNativeRepository = secMenuNativeRepository;
    }

    public Map<String, MenuInfo> load() {
        Map<String, String[]> folders = new HashMap<>(); // MENU_ID → {MENU_NM, PARENT_MENU_ID}
        for (Map<String, Object> f : secMenuNativeRepository.searchMenuFld()) {
            String id = str(f.get("MENU_ID"));
            if (id != null) {
                folders.put(id, new String[]{str(f.get("MENU_NM")), str(f.get("PARENT_MENU_ID"))});
            }
        }
        Map<String, MenuInfo> out = new LinkedHashMap<>();
        for (SecMenu m : menuCatalog.menus()) {
            if (isBlank(m.getParentMenuId()) || isBlank(m.getObjectId())) {
                continue;
            }
            String pageId = m.getParentMenuId() + "/" + m.getObjectId();
            boolean viewable = "Y".equals(m.getMenuViewYn()) && "Y".equals(m.getUseTp());
            MenuInfo info = new MenuInfo(pageId, m.getMenuNm(), folderPath(m.getParentMenuId(), folders), viewable);
            out.merge(pageId, info, (a, b) -> a.viewable() ? a : b);
        }
        return out;
    }

    /** 폴더 ID 에서 루트까지 이름을 이어 "루트 > … > 폴더". 순환은 끊고, 알 수 없는 폴더면 null. */
    static String folderPath(String folderId, Map<String, String[]> folders) {
        Deque<String> names = new ArrayDeque<>();
        Set<String> seen = new HashSet<>();
        String cur = folderId;
        while (cur != null && seen.add(cur)) {
            String[] f = folders.get(cur);
            if (f == null) {
                break;
            }
            names.addFirst(f[0] == null ? cur : f[0]);
            cur = f[1];
        }
        return names.isEmpty() ? null : String.join(" > ", names);
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
