package com.dongkuk.dmes.mcm.widget.chat.service;

import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.service.SecUserService;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 챗봇 find_screen — 포털 사이드바와 같은 {@link SecUserService#getMyMenus}(현재 인증 사용자, 역할 권한 거름)로 화면을 찾는다.
 * <ul>
 *   <li>대상: 화면 행(objId·sysCd 있음), 숨김({@code hiddenYn=Y}, 팝업 부속 화면)·폴더 제외.</li>
 *   <li>찾기: 메뉴 이름에 keyword 가 들었는지(대소문자·공백 무시), 메뉴 순서대로 최대 limit 개.</li>
 *   <li>pageId: 포털 셸 {@code getPortalMenuItemPageId} 와 같은 규칙 —
 *       {@code sysCd + ":" + (componentPath 에 "/" 가 있으면 componentPath, 아니면 objId)}.</li>
 *   <li>path: 상위 폴더 이름을 「 > 」 로 이은 경로(최대 10단).</li>
 * </ul>
 */
@Component("myMenuChatScreenFinder")
public class MyMenuChatScreenFinder implements ChatScreenFinder {

    private static final int MAX_DEPTH = 10;

    private final SecUserService secUserService;

    @Autowired
    public MyMenuChatScreenFinder(SecUserService secUserService) {
        this.secUserService = secUserService;
    }

    @Override
    public List<Screen> find(String keyword, int limit) {
        String needle = normalize(keyword);
        if (needle.isEmpty() || limit <= 0) return List.of();
        List<Map<String, Object>> rows = secUserService.getMyMenus(new MyMenusRequest());
        Map<String, Map<String, Object>> byId = new HashMap<>();
        for (Map<String, Object> row : rows) {
            String id = str(row.get("menuId"));
            if (id != null) byId.put(id, row);
        }
        List<Screen> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (out.size() >= limit) break;
            String objId = str(row.get("objId"));
            String sysCd = str(row.get("sysCd"));
            String name = str(row.get("menuNm"));
            if (objId == null || sysCd == null || name == null) continue;
            if ("Y".equals(str(row.get("hiddenYn"))) || "dir".equals(str(row.get("menuType")))) continue;
            if (!normalize(name).contains(needle)) continue;
            String componentPath = str(row.get("componentPath"));
            String pageName = componentPath != null && componentPath.contains("/") ? componentPath : objId;
            out.add(new Screen(sysCd + ":" + pageName, name, path(row, byId)));
        }
        return out;
    }

    private static String path(Map<String, Object> row, Map<String, Map<String, Object>> byId) {
        List<String> names = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        String parent = str(row.get("uprLvMenuId"));
        while (parent != null && names.size() < MAX_DEPTH && seen.add(parent)) {
            Map<String, Object> p = byId.get(parent);
            if (p == null) break;
            String nm = str(p.get("menuNm"));
            if (nm != null) names.add(0, nm);
            parent = str(p.get("uprLvMenuId"));
        }
        return String.join(" > ", names);
    }

    private static String normalize(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
