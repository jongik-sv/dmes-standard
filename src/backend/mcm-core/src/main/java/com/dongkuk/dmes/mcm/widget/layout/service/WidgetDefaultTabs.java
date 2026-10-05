package com.dongkuk.dmes.mcm.widget.layout.service;

import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 사용자의 기본 탭 집합 해석(design-widget-tabs.md §1) — 부서 사슬(자기 부서 → 상위, 최대 10단) → 전사({@code *}) 중
 * 기본 탭이 하나라도 있는 첫 키의 탭 전체. 사용자 탭 서비스(secWidget)가 쓴다. 읽기만 한다.
 */
@Component
public class WidgetDefaultTabs {

    /** {@code def-N} 형식(N 은 1~6자리). */
    public static final Pattern TAB_ID = Pattern.compile("^def-(\\d{1,6})$");

    /** 해석된 집합 — 탭은 관리자 순서. 기본 탭이 없으면 layoutKey=null·tabs=[]. */
    public record Resolved(String layoutKey, List<WidgetDefaultTab> tabs) {

        public static final Resolved EMPTY = new Resolved(null, List.of());

        public Optional<WidgetDefaultTab> find(String tabId) {
            return tabs.stream().filter(t -> t.getTabId().equals(tabId)).findFirst();
        }

        public int size() {
            return tabs.size();
        }
    }

    private final WidgetDefaultTabRepository tabRepository;
    private final WidgetDefaultTabItemRepository itemRepository;

    @Autowired
    public WidgetDefaultTabs(WidgetDefaultTabRepository tabRepository, WidgetDefaultTabItemRepository itemRepository) {
        this.tabRepository = tabRepository;
        this.itemRepository = itemRepository;
    }

    /** {@code def-} 로 시작하는 ID 인가(형식은 보지 않는다). */
    public static boolean isDefaultTabId(String tabId) {
        return tabId != null && tabId.startsWith(WidgetDefaultTab.TAB_ID_PREFIX);
    }

    /** {@code def-N} 의 N. 형식이 아니면 -1. */
    public static long number(String tabId) {
        if (tabId == null) return -1;
        var m = TAB_ID.matcher(tabId);
        return m.matches() ? Long.parseLong(m.group(1)) : -1;
    }

    /** deptChain(자기 부서부터 위로) → 전사 순서로 보며 기본 탭이 있는 첫 키의 집합. */
    public Resolved resolve(List<String> deptChain) {
        Set<String> keys = new LinkedHashSet<>();
        if (deptChain != null) keys.addAll(deptChain);
        keys.add(WidgetDefaultLayout.COMPANY_KEY);
        for (String key : keys) {
            List<WidgetDefaultTab> tabs = tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc(key);
            if (tabs != null && !tabs.isEmpty()) return new Resolved(key, List.copyOf(tabs));
        }
        return Resolved.EMPTY;
    }

    /** 키의 기본 탭 위젯을 탭 ID 별로(탭 안에서는 위→아래, 왼쪽→오른쪽). */
    public Map<String, List<WidgetDefaultTabItem>> itemsByTab(String layoutKey) {
        Map<String, List<WidgetDefaultTabItem>> out = new LinkedHashMap<>();
        if (layoutKey == null) return out;
        for (WidgetDefaultTabItem i : itemRepository.findByLayoutKeyOrderByTabIdAscPosYAscPosXAsc(layoutKey)) {
            out.computeIfAbsent(i.getTabId(), k -> new ArrayList<>()).add(i);
        }
        return out;
    }

    /** 기본 탭 하나의 위젯. */
    public List<WidgetDefaultTabItem> items(String layoutKey, String tabId) {
        return itemRepository.findByLayoutKeyAndTabIdOrderByPosYAscPosXAsc(layoutKey, tabId);
    }
}
