package com.dongkuk.dmes.mcm.widget.layout.service;

import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 기본 탭({@code def-N}) 읽기 도우미(design-widget-tabs.md §1) — ID 판정과 키별 위젯 조회. 사용자에게 보일 고정 탭 집합은
 * {@link WidgetFixedTabs} 가 전사·부서 사슬 전부로 만든다(스펙 2026-10-07-widget-fixed-tabs §1). 읽기만 한다.
 */
@Component
public class WidgetDefaultTabs {

    /** {@code def-N} 형식(N 은 1~6자리). */
    public static final Pattern TAB_ID = Pattern.compile("^def-(\\d{1,6})$");

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
