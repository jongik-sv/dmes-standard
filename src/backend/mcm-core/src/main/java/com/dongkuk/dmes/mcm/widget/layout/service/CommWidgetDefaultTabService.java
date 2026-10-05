package com.dongkuk.dmes.mcm.widget.layout.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.widget.layout.dto.CommWidgetDefaultTabRequest;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 위젯관리 — 기본 탭 action(design-widget-tabs.md §3.2). BPMN commWidgetMng 이 부르고 메뉴 권한(RBAC)으로 보호된다.
 * 「홈」 기본 배치는 {@link CommWidgetLayoutService} 가 맡는다. 쓰기 원자성은 {@link WidgetDefaultTabWriter} 가 맡는다 —
 * 이 클래스에는 {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 */
@Service("commWidgetDefaultTabService")
public class CommWidgetDefaultTabService {

    /** 키당 기본 탭 수 상한. */
    static final int MAX_TABS_PER_KEY = 5;
    static final int TAB_NM_MAX = 20;

    private final WidgetDefaultTabRepository tabRepository;
    private final WidgetDefaultTabItemRepository itemRepository;
    private final WidgetDefaultTabWriter writer;
    private final DeptInfoRepository deptRepository;

    @Autowired
    public CommWidgetDefaultTabService(WidgetDefaultTabRepository tabRepository,
                                       WidgetDefaultTabItemRepository itemRepository,
                                       WidgetDefaultTabWriter writer,
                                       DeptInfoRepository deptRepository) {
        this.tabRepository = tabRepository;
        this.itemRepository = itemRepository;
        this.writer = writer;
        this.deptRepository = deptRepository;
    }

    /** 그 키의 기본 탭 {@code {layoutKey, tabs:[{tabId, tabNm, tabSeq, items}]}} — 관리자 순서. 상위 부서 대체는 하지 않는다. */
    public Map<String, Object> loadDefaultTabs(CommWidgetDefaultTabRequest request) {
        String layoutKey = CommWidgetLayoutService.requireLayoutKey(request.getLayoutKey());
        Map<String, List<WidgetDefaultTabItem>> byTab = new LinkedHashMap<>();
        for (WidgetDefaultTabItem i : itemRepository.findByLayoutKeyOrderByTabIdAscPosYAscPosXAsc(layoutKey)) {
            byTab.computeIfAbsent(i.getTabId(), k -> new ArrayList<>()).add(i);
        }
        List<Map<String, Object>> tabs = new ArrayList<>();
        for (WidgetDefaultTab t : tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc(layoutKey)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tabId", t.getTabId());
            m.put("tabNm", t.getTabNm());
            m.put("tabSeq", t.getTabSeq());
            m.put("items", toItems(byTab.getOrDefault(t.getTabId(), List.of())));
            tabs.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layoutKey", layoutKey);
        result.put("tabs", tabs);
        return result;
    }

    /**
     * 기본 탭 하나를 통째로 바꾼다. tabId 가 없거나 그 키에 없는 {@code def-N} 이면 새 탭(전역 번호 채번). 위젯 목록은
     * grids.widgets.rows 이고 빈 목록도 저장한다. 키당 {@value #MAX_TABS_PER_KEY}개, 같은 키 안 이름 중복 거절, 이름 20자.
     */
    public Map<String, Object> saveDefaultTab(CommWidgetDefaultTabRequest request, List<Map<String, Object>> widgets) {
        String layoutKey = CommWidgetLayoutService.requireLayoutKey(request.getLayoutKey());
        if (!WidgetDefaultLayout.COMPANY_KEY.equals(layoutKey) && !deptRepository.existsById(layoutKey)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "없는 부서입니다: " + layoutKey);
        }
        String tabNm = trim(request.getTabNm());
        if (tabNm == null || tabNm.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "탭 이름을 입력해 주세요.");
        }
        if (tabNm.length() > TAB_NM_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 이름은 " + TAB_NM_MAX + "자 이하로 정합니다.");
        }
        List<WidgetDefaultTab> existing = tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc(layoutKey);
        String requested = trim(request.getTabId());
        WidgetDefaultTab current = requested == null ? null
                : existing.stream().filter(t -> t.getTabId().equals(requested)).findFirst().orElse(null);
        String tabId = current == null ? null : current.getTabId();
        if (current == null && existing.size() >= MAX_TABS_PER_KEY) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "기본 탭은 키마다 " + MAX_TABS_PER_KEY + "개까지 만들 수 있습니다.");
        }
        if (existing.stream().anyMatch(t -> !t.getTabId().equals(tabId) && tabNm.equals(t.getTabNm()))) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 이름의 기본 탭이 있습니다.");
        }
        List<Map<String, Object>> rows = widgets == null ? List.of() : widgets;
        if (rows.size() > CommWidgetLayoutService.MAX_WIDGETS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "위젯은 탭당 " + CommWidgetLayoutService.MAX_WIDGETS + "개까지 놓을 수 있습니다.");
        }
        List<WidgetLayoutWriter.LayoutItem> items = new ArrayList<>();
        Set<String> instIds = new HashSet<>();
        for (Map<String, Object> row : rows) {
            WidgetLayoutWriter.LayoutItem item = CommWidgetLayoutService.toItem(row == null ? Map.of() : row);
            if (!instIds.add(item.instId())) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 위젯 인스턴스 ID 가 두 번 있습니다: " + item.instId());
            }
            items.add(item);
        }
        int seq = request.getTabSeq() != null ? Math.max(1, request.getTabSeq())
                : current != null ? current.getTabSeq() : existing.size() + 1;
        String saved = writer.save(layoutKey, tabId, tabNm, seq, items);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layoutKey", layoutKey);
        result.put("tabId", saved);
        result.put("count", items.size());
        return result;
    }

    /** 기본 탭 하나를 지운다. 사용자 재정의 행은 남고 사용자 화면에서만 숨는다. 없으면 deleted=false. */
    public Map<String, Object> deleteDefaultTab(CommWidgetDefaultTabRequest request) {
        String layoutKey = CommWidgetLayoutService.requireLayoutKey(request.getLayoutKey());
        String tabId = trim(request.getTabId());
        if (tabId == null || !WidgetDefaultTabs.TAB_ID.matcher(tabId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "기본 탭 ID 형식이 올바르지 않습니다.");
        }
        boolean deleted = writer.delete(layoutKey, tabId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layoutKey", layoutKey);
        result.put("tabId", tabId);
        result.put("deleted", deleted);
        return result;
    }

    /** grids.tabs.rows 의 tabId 순서대로 1부터 매긴다. 그 키에 없는 탭·중복은 건너뛴다. */
    public Map<String, Object> reorderDefaultTabs(CommWidgetDefaultTabRequest request, List<Map<String, Object>> tabs) {
        String layoutKey = CommWidgetLayoutService.requireLayoutKey(request.getLayoutKey());
        Set<String> owned = new HashSet<>();
        for (WidgetDefaultTab t : tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc(layoutKey)) owned.add(t.getTabId());
        Map<String, Integer> seq = new LinkedHashMap<>();
        int n = 1;
        for (Map<String, Object> row : tabs == null ? List.<Map<String, Object>>of() : tabs) {
            String tabId = row == null || row.get("tabId") == null ? null : trim(String.valueOf(row.get("tabId")));
            if (tabId == null || !owned.contains(tabId) || seq.containsKey(tabId)) continue;
            seq.put(tabId, n++);
        }
        writer.reorder(layoutKey, seq);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layoutKey", layoutKey);
        result.put("count", seq.size());
        return result;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static String trim(String s) {
        if (s == null || "null".equals(s)) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /** 응답 목록 — 한 줄은 {@code instId, widgetId, posX, posY, sizeW, sizeH, lockYn}(「홈」 기본 배치 items 와 같은 모양). */
    static List<Map<String, Object>> toItems(List<WidgetDefaultTabItem> rows) {
        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (WidgetDefaultTabItem r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("instId", r.getInstId());
            m.put("widgetId", r.getWidgetId());
            m.put("posX", r.getPosX());
            m.put("posY", r.getPosY());
            m.put("sizeW", r.getSizeW());
            m.put("sizeH", r.getSizeH());
            m.put("lockYn", r.getLockYn());
            items.add(m);
        }
        return items;
    }
}
