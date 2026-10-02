package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 사용자 위젯 탭·배치 저장 — OASIS {@code secWidget}(스펙 2026-10-02-widget-foundation §4.2).
 * 사용자는 늘 인증 컨텍스트에서 얻는다(IDOR). 쓰기 원자성은 {@link SecWidgetTabWriter} 가 맡는다 — 이 클래스에는
 * {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 */
@Service("secWidgetService")
public class SecWidgetService {

    static final String HOME_TAB_ID = "home";
    static final String HOME_TAB_NM = "홈";
    static final int GRID_COLS = 24;
    static final int MAX_TABS = 10;
    static final int MAX_WIDGETS = 30;
    static final int TAB_NM_MAX = 20;
    private static final Pattern TAB_ID = Pattern.compile("^(home|tab-\\d{1,6})$");

    private final SecUserWidgetTabRepository tabRepository;
    private final SecUserWidgetRepository widgetRepository;
    private final SecWidgetTabWriter writer;
    private final SecurityIdentity securityIdentity;

    @Autowired
    public SecWidgetService(SecUserWidgetTabRepository tabRepository,
                            SecUserWidgetRepository widgetRepository,
                            SecWidgetTabWriter writer,
                            SecurityIdentity securityIdentity) {
        this.tabRepository = tabRepository;
        this.widgetRepository = widgetRepository;
        this.writer = writer;
        this.securityIdentity = securityIdentity;
    }

    /** 사용자 탭 전체와 위젯 전체. */
    public Map<String, Object> search(SecWidgetSearchRequest request) {
        String userId = requireUser();
        List<Map<String, Object>> tabs = new ArrayList<>();
        for (SecUserWidgetTab t : tabRepository.findByUserIdOrderByTabSeqAsc(userId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tabId", t.getTabId());
            m.put("tabNm", HOME_TAB_ID.equals(t.getTabId()) ? HOME_TAB_NM : t.getTabNm());
            m.put("tabSeq", t.getTabSeq());
            m.put("lockYn", t.getLockYn());
            tabs.add(m);
        }
        List<Map<String, Object>> widgets = new ArrayList<>();
        for (SecUserWidget w : widgetRepository.findByUserId(userId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tabId", w.getTabId());
            m.put("instId", w.getInstId());
            m.put("widgetId", w.getWidgetId());
            m.put("posX", w.getPosX());
            m.put("posY", w.getPosY());
            m.put("sizeW", w.getSizeW());
            m.put("sizeH", w.getSizeH());
            m.put("lockYn", w.getLockYn());
            m.put("configJson", w.getConfigJson());
            widgets.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabs", tabs);
        result.put("widgets", widgets);
        return result;
    }

    /** 탭 하나를 통째로 바꾼다. 위젯 목록은 grids.widgets.rows. */
    public Map<String, Object> saveTab(SecWidgetTabSaveRequest request, List<Map<String, Object>> widgets) {
        String userId = requireUser();
        String tabId = trim(request.getTabId());
        if (tabId == null || !TAB_ID.matcher(tabId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 ID 형식이 올바르지 않습니다.");
        }
        boolean home = HOME_TAB_ID.equals(tabId);
        String tabNm = home ? HOME_TAB_NM : trim(request.getTabNm());
        if (tabNm == null || tabNm.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "탭 이름을 입력해 주세요.");
        }
        if (tabNm.length() > TAB_NM_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 이름은 " + TAB_NM_MAX + "자 이하로 정합니다.");
        }
        List<SecUserWidgetTab> existing = tabRepository.findByUserIdOrderByTabSeqAsc(userId);
        boolean isNew = existing.stream().noneMatch(t -> t.getTabId().equals(tabId));
        if (isNew && existing.size() >= MAX_TABS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "탭은 " + MAX_TABS + "개까지 만들 수 있습니다.");
        }
        if (!home && existing.stream().anyMatch(t -> !t.getTabId().equals(tabId) && tabNm.equals(t.getTabNm()))) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 이름의 탭이 있습니다.");
        }
        List<Map<String, Object>> rows = widgets == null ? List.of() : widgets;
        if (rows.size() > MAX_WIDGETS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "위젯은 탭당 " + MAX_WIDGETS + "개까지 놓을 수 있습니다.");
        }
        List<SecWidgetTabWriter.WidgetValues> values = new ArrayList<>();
        Set<String> instIds = new HashSet<>();
        for (Map<String, Object> row : rows) {
            SecWidgetTabWriter.WidgetValues v = toWidget(row);
            if (!instIds.add(v.instId())) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 위젯 인스턴스 ID 가 두 번 있습니다: " + v.instId());
            }
            values.add(v);
        }
        int seq = home ? 0 : Math.max(1, request.getTabSeq() == null ? existing.size() : request.getTabSeq());
        String lockYn = "Y".equals(request.getLockYn()) ? "Y" : "N";
        writer.replaceTab(userId, new SecWidgetTabWriter.TabValues(tabId, tabNm, seq, lockYn), values);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", tabId);
        result.put("savedCount", values.size());
        return result;
    }

    public Map<String, Object> deleteTab(SecWidgetTabRequest request) {
        String userId = requireUser();
        String tabId = trim(request.getTabId());
        if (tabId == null || !TAB_ID.matcher(tabId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 ID 형식이 올바르지 않습니다.");
        }
        if (HOME_TAB_ID.equals(tabId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "「홈」 탭은 지울 수 없습니다.");
        }
        writer.deleteTab(userId, tabId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", tabId);
        result.put("deleted", true);
        return result;
    }

    /** grids.tabs.rows 의 tabId 순서대로 1부터 매긴다. home 은 늘 0 이라 건너뛴다. */
    public Map<String, Object> reorderTabs(List<Map<String, Object>> tabs) {
        String userId = requireUser();
        Set<String> owned = new HashSet<>();
        for (SecUserWidgetTab t : tabRepository.findByUserIdOrderByTabSeqAsc(userId)) owned.add(t.getTabId());
        Map<String, Integer> seq = new LinkedHashMap<>();
        int n = 1;
        for (Map<String, Object> row : tabs == null ? List.<Map<String, Object>>of() : tabs) {
            String tabId = row == null || row.get("tabId") == null ? null : trim(String.valueOf(row.get("tabId")));
            if (tabId == null || HOME_TAB_ID.equals(tabId) || !owned.contains(tabId) || seq.containsKey(tabId)) continue;
            seq.put(tabId, n++);
        }
        writer.reorder(userId, seq);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", seq.size());
        return result;
    }

    public Map<String, Object> resetHome(SecWidgetSearchRequest request) {
        String userId = requireUser();
        writer.deleteTab(userId, HOME_TAB_ID);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("deleted", 1);
        return result;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private String requireUser() {
        String userId = securityIdentity.currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        return userId;
    }

    private static String trim(String s) {
        return s == null || "null".equals(s) ? null : s.trim();
    }

    private static int intOf(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v instanceof Number num) return num.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, key + " 는 정수여야 합니다.");
        }
    }

    private static SecWidgetTabWriter.WidgetValues toWidget(Map<String, Object> row) {
        String instId = trim(row.get("instId") == null ? null : String.valueOf(row.get("instId")));
        String widgetId = trim(row.get("widgetId") == null ? null : String.valueOf(row.get("widgetId")));
        if (instId == null || instId.isEmpty() || instId.length() > 40) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 인스턴스 ID 가 올바르지 않습니다.");
        }
        if (widgetId == null || widgetId.isEmpty() || widgetId.length() > 100) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 ID 가 올바르지 않습니다.");
        }
        int x = intOf(row, "posX");
        int y = intOf(row, "posY");
        int w = intOf(row, "sizeW");
        int h = intOf(row, "sizeH");
        if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > GRID_COLS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 자리·크기가 격자(" + GRID_COLS + "칸) 밖입니다: " + instId);
        }
        String lockYn = "Y".equals(row.get("lockYn")) ? "Y" : "N";
        Object config = row.get("configJson");
        String configJson = config == null ? null : String.valueOf(config);
        if (configJson != null && configJson.length() > 4000) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 설정이 너무 깁니다: " + instId);
        }
        return new SecWidgetTabWriter.WidgetValues(instId, widgetId, x, y, w, h, lockYn, configJson);
    }
}
