package com.dongkuk.dmes.mcm.widget.layout.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.layout.dto.CommWidgetLayoutRequest;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 위젯관리 — 「홈」 기본 배치 action(스펙 2026-10-02-widget-admin-generic §4.2·§5.2). BPMN commWidgetMng 이 부른다.
 * 메뉴 권한(RBAC)으로 보호되는 관리자 서비스. 쓰기 원자성은 {@link WidgetLayoutWriter} 가 맡는다 — 이 클래스에는
 * {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 */
@Service("commWidgetLayoutService")
public class CommWidgetLayoutService {

    static final int GRID_COLS = 24;
    static final int MAX_WIDGETS = 30;
    static final int MAX_DEPTS = 50;
    static final String COMPANY_NM = "전사";
    private static final int LAYOUT_KEY_MAX = 30;
    private static final Pattern INST_ID = Pattern.compile("^[A-Za-z0-9_-]{1,40}$");

    private final WidgetDefaultLayoutRepository layoutRepository;
    private final WidgetLayoutWriter writer;
    private final DeptInfoRepository deptRepository;
    private final WidgetUserContextResolver userContextResolver;

    @Autowired
    public CommWidgetLayoutService(WidgetDefaultLayoutRepository layoutRepository,
                                   WidgetLayoutWriter writer,
                                   DeptInfoRepository deptRepository,
                                   WidgetUserContextResolver userContextResolver) {
        this.layoutRepository = layoutRepository;
        this.writer = writer;
        this.deptRepository = deptRepository;
        this.userContextResolver = userContextResolver;
    }

    /** 기본 배치가 있는 키 목록 {@code [{layoutKey, deptNm, count}]} — 전사(「전사」) 먼저, 그다음 부서 이름 순. */
    public Map<String, Object> searchLayouts(CommWidgetLayoutRequest request) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Object[] row : layoutRepository.countGroupByLayoutKey()) {
            counts.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }
        List<String> deptKeys = counts.keySet().stream().filter(k -> !WidgetDefaultLayout.COMPANY_KEY.equals(k)).toList();
        Map<String, String> deptNames = new HashMap<>();
        if (!deptKeys.isEmpty()) {
            for (DeptInfo d : deptRepository.findAllById(deptKeys)) deptNames.put(d.getDeptCd(), d.getDeptNm());
        }
        List<Map<String, Object>> layouts = new ArrayList<>();
        for (Map.Entry<String, Long> e : counts.entrySet()) {
            boolean company = WidgetDefaultLayout.COMPANY_KEY.equals(e.getKey());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("layoutKey", e.getKey());
            m.put("deptNm", company ? COMPANY_NM : deptNames.get(e.getKey()));
            m.put("count", e.getValue());
            layouts.add(m);
        }
        layouts.sort(Comparator
                .comparing((Map<String, Object> m) -> !WidgetDefaultLayout.COMPANY_KEY.equals(m.get("layoutKey")))
                .thenComparing(m -> (String) m.get("deptNm"), Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(m -> (String) m.get("layoutKey")));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layouts", layouts);
        return result;
    }

    /**
     * 그 키의 배치 {@code {layoutKey, sourceKey, items}}. effective=Y 이고 그 키에 행이 없으면 그 부서의 상위 부서 → 전사(*) 순서로
     * 처음 찾은 배치를 돌려주고 sourceKey 에 실제 키를 적는다(새 부서 배치의 시작점). 아무것도 없으면 items=[]·sourceKey=null.
     */
    public Map<String, Object> loadLayout(CommWidgetLayoutRequest request) {
        String layoutKey = requireLayoutKey(request.getLayoutKey());
        boolean effective = "Y".equals(trim(request.getEffective()));
        WidgetDefaultLayouts.Found found = WidgetDefaultLayouts.firstExisting(layoutRepository, List.of(layoutKey));
        if (found == null && effective && !WidgetDefaultLayout.COMPANY_KEY.equals(layoutKey)) {
            Set<String> fallbacks = new LinkedHashSet<>(userContextResolver.deptChain(layoutKey));
            fallbacks.remove(layoutKey);
            fallbacks.add(WidgetDefaultLayout.COMPANY_KEY);
            found = WidgetDefaultLayouts.firstExisting(layoutRepository, List.copyOf(fallbacks));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layoutKey", layoutKey);
        result.put("sourceKey", found == null ? null : found.layoutKey());
        result.put("items", found == null ? new ArrayList<>() : WidgetDefaultLayouts.toItems(found.rows()));
        return result;
    }

    /** 그 키의 배치를 통째로 바꾼다(지우고 다시 넣기, 한 트랜잭션). 위젯 목록은 grids.widgets.rows. 검사는 A 의 탭 저장과 같다. */
    public Map<String, Object> saveLayout(CommWidgetLayoutRequest request, List<Map<String, Object>> widgets) {
        String layoutKey = requireLayoutKey(request.getLayoutKey());
        if (!WidgetDefaultLayout.COMPANY_KEY.equals(layoutKey) && !deptRepository.existsById(layoutKey)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "없는 부서입니다: " + layoutKey);
        }
        List<Map<String, Object>> rows = widgets == null ? List.of() : widgets;
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "위젯이 하나도 없는 기본 배치는 저장할 수 없습니다. 지우려면 기본 배치 지우기를 쓰세요");
        }
        if (rows.size() > MAX_WIDGETS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "위젯은 기본 배치당 " + MAX_WIDGETS + "개까지 놓을 수 있습니다.");
        }
        List<WidgetLayoutWriter.LayoutItem> items = new ArrayList<>();
        Set<String> instIds = new HashSet<>();
        for (Map<String, Object> row : rows) {
            WidgetLayoutWriter.LayoutItem item = toItem(row == null ? Map.of() : row);
            if (!instIds.add(item.instId())) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 위젯 인스턴스 ID 가 두 번 있습니다: " + item.instId());
            }
            items.add(item);
        }
        writer.replace(layoutKey, items);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layoutKey", layoutKey);
        result.put("count", items.size());
        return result;
    }

    /** 그 키의 배치를 지운다(없으면 아무것도 하지 않는다). 부서가 사라진 뒤 남은 배치도 지울 수 있게 부서 존재는 보지 않는다. */
    public Map<String, Object> deleteLayout(CommWidgetLayoutRequest request) {
        String layoutKey = requireLayoutKey(request.getLayoutKey());
        writer.delete(layoutKey);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("layoutKey", layoutKey);
        return result;
    }

    /**
     * 부서 고르기 — 사용 중(USE_TP='Y') 부서 중 코드·이름이 keyword 로 시작하는 것(대소문자 무시), 최대 50개.
     * 기존 부서 조회({@code DeptInfoRepository.searchByDeptKey}, 이름은 포함 일치)를 재사용하고 앞부분 일치로 한 번 더 거른다.
     */
    public Map<String, Object> searchDepts(CommWidgetLayoutRequest request) {
        String keyword = trim(request.getKeyword());
        String kw = keyword == null || keyword.isEmpty() ? null : keyword;
        String upper = kw == null ? null : kw.toUpperCase(Locale.ROOT);
        List<Map<String, Object>> depts = new ArrayList<>();
        for (DeptInfo d : deptRepository.searchByDeptKey(kw)) {
            if (upper != null && !startsWith(d.getDeptCd(), upper) && !startsWith(d.getDeptNm(), upper)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("deptCd", d.getDeptCd());
            m.put("deptNm", d.getDeptNm());
            m.put("upperDeptCd", d.getUpperDeptCd());
            depts.add(m);
            if (depts.size() >= MAX_DEPTS) break;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("depts", depts);
        return result;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static boolean startsWith(String value, String upperPrefix) {
        return value != null && value.toUpperCase(Locale.ROOT).startsWith(upperPrefix);
    }

    private static String requireLayoutKey(String raw) {
        String key = trim(raw);
        if (key == null || key.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "기본 배치 키(layoutKey)가 없습니다.");
        }
        if (key.length() > LAYOUT_KEY_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "기본 배치 키가 너무 깁니다: " + key);
        }
        return key;
    }

    private static String trim(String s) {
        return s == null || "null".equals(s) ? null : s.trim();
    }

    private static String text(Map<String, Object> row, String key) {
        Object v = row.get(key);
        return v == null ? null : trim(String.valueOf(v));
    }

    private static int intOf(Map<String, Object> row, String key, String instId) {
        Object v = row.get(key);
        if (v instanceof Number num) {
            double d = num.doubleValue();
            if (d == Math.rint(d) && !Double.isInfinite(d) && Math.abs(d) <= Integer.MAX_VALUE) return (int) d;
        } else if (v != null) {
            try {
                return Integer.parseInt(String.valueOf(v).trim());
            } catch (NumberFormatException ignored) {
                // 아래에서 거절
            }
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, key + " 는 정수여야 합니다: " + instId);
    }

    private static WidgetLayoutWriter.LayoutItem toItem(Map<String, Object> row) {
        String instId = text(row, "instId");
        String widgetId = text(row, "widgetId");
        if (instId == null || !INST_ID.matcher(instId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 인스턴스 ID 가 올바르지 않습니다: " + instId);
        }
        if (widgetId == null || widgetId.isEmpty() || widgetId.length() > 100) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 ID 가 올바르지 않습니다: " + instId);
        }
        int x = intOf(row, "posX", instId);
        int y = intOf(row, "posY", instId);
        int w = intOf(row, "sizeW", instId);
        int h = intOf(row, "sizeH", instId);
        if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > GRID_COLS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 자리·크기가 격자(" + GRID_COLS + "칸) 밖입니다: " + instId);
        }
        String lockYn = text(row, "lockYn");
        if (lockYn == null || lockYn.isEmpty()) lockYn = "N";
        if (!"Y".equals(lockYn) && !"N".equals(lockYn)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "잠금(lockYn)은 Y 또는 N 이어야 합니다: " + instId);
        }
        return new WidgetLayoutWriter.LayoutItem(instId, widgetId, x, y, w, h, lockYn);
    }
}
