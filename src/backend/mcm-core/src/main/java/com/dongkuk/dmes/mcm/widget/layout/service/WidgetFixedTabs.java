package com.dongkuk.dmes.mcm.widget.layout.service;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 사용자의 고정 탭 집합(스펙 2026-10-07-widget-fixed-tabs §1) — 관리자 배치를 사용자 사본 없이 그대로 보인다.
 * 순서: 전사({@code *}) 기본 탭 → 부서 사슬(자기 부서 → 상위, 가까운 순)마다 부서 대표 탭({@code dept-{DEPT_CD}}, 그 부서의
 * 「홈」 배치 행이 있을 때만) + 부서 기본 탭. 「홈」(전사 「홈」 배치)은 화면이 {@code widgetDef/list} 의 homeDefault 로 그리므로 여기 없다.
 * 읽기만 한다.
 */
@Component
public class WidgetFixedTabs {

    /** 부서 대표 탭 ID 접두 — 뒤에 DEPT_CD 가 붙는다. 사용자 테이블에는 저장하지 않는다(saveTab 거절). */
    public static final String DEPT_TAB_PREFIX = "dept-";
    /** 응답 tabSeq 대역 — 전사 기본 탭 100+관리자 순서, 부서 200+단계×10+(대표 0 | 관리자 순서). */
    static final int COMPANY_SEQ_BASE = 100;
    static final int DEPT_SEQ_BASE = 200;
    static final int DEPT_SEQ_STEP = 10;
    static final String COMPANY_ORIGIN = "전사 기본 탭";

    /** 고정 탭 하나 — 위젯은 관리자 항목(위→아래, 왼쪽→오른쪽). */
    public record FixedTab(String tabId, String tabNm, int tabSeq, String origin, List<Item> items) {}

    /** 고정 탭 위젯 한 줄. */
    public record Item(String instId, String widgetId, int posX, int posY, int sizeW, int sizeH, String lockYn) {}

    private final WidgetDefaultTabRepository tabRepository;
    private final WidgetDefaultTabs defaultTabs;
    private final WidgetDefaultLayoutRepository layoutRepository;
    private final DeptInfoRepository deptRepository;

    @Autowired
    public WidgetFixedTabs(WidgetDefaultTabRepository tabRepository,
                           WidgetDefaultTabs defaultTabs,
                           WidgetDefaultLayoutRepository layoutRepository,
                           DeptInfoRepository deptRepository) {
        this.tabRepository = tabRepository;
        this.defaultTabs = defaultTabs;
        this.layoutRepository = layoutRepository;
        this.deptRepository = deptRepository;
    }

    /** 고정 탭 ID 인가 — {@code home}·{@code def-*}·{@code dept-*}. 형식은 보지 않는다. */
    public static boolean isFixedTabId(String tabId) {
        return tabId != null && ("home".equals(tabId) || WidgetDefaultTabs.isDefaultTabId(tabId)
                || tabId.startsWith(DEPT_TAB_PREFIX));
    }

    /** deptChain(자기 부서부터 위로, 중복 없음) 기준 고정 탭 전체. 부서 배치가 없으면 전사 기본 탭만. */
    public List<FixedTab> resolve(List<String> deptChain) {
        List<FixedTab> out = new ArrayList<>();
        addDefaultTabs(out, WidgetDefaultLayout.COMPANY_KEY, COMPANY_SEQ_BASE, COMPANY_ORIGIN);
        Set<String> chain = new LinkedHashSet<>(deptChain == null ? List.of() : deptChain);
        chain.remove(WidgetDefaultLayout.COMPANY_KEY);
        int step = 0;
        for (String deptCd : chain) {
            int base = DEPT_SEQ_BASE + step++ * DEPT_SEQ_STEP;
            String deptNm = deptName(deptCd);
            String origin = deptNm + " 부서 탭";
            List<WidgetDefaultLayout> main = layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc(deptCd);
            if (main != null && !main.isEmpty()) {
                List<Item> items = new ArrayList<>(main.size());
                for (WidgetDefaultLayout l : main) {
                    items.add(new Item(l.getInstId(), l.getWidgetId(), l.getPosX(), l.getPosY(), l.getSizeW(), l.getSizeH(),
                            l.getLockYn()));
                }
                out.add(new FixedTab(DEPT_TAB_PREFIX + deptCd, deptNm, base, origin, items));
            }
            addDefaultTabs(out, deptCd, base, origin);
        }
        return out;
    }

    public static Optional<FixedTab> find(List<FixedTab> tabs, String tabId) {
        return tabs.stream().filter(t -> t.tabId().equals(tabId)).findFirst();
    }

    private void addDefaultTabs(List<FixedTab> out, String layoutKey, int seqBase, String origin) {
        List<WidgetDefaultTab> tabs = tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc(layoutKey);
        if (tabs == null || tabs.isEmpty()) return;
        Map<String, List<WidgetDefaultTabItem>> items = defaultTabs.itemsByTab(layoutKey);
        for (WidgetDefaultTab d : tabs) {
            List<Item> rows = new ArrayList<>();
            for (WidgetDefaultTabItem i : items.getOrDefault(d.getTabId(), List.of())) {
                rows.add(new Item(i.getInstId(), i.getWidgetId(), i.getPosX(), i.getPosY(), i.getSizeW(), i.getSizeH(),
                        i.getLockYn()));
            }
            int seq = seqBase + (d.getTabSeq() == null ? 0 : d.getTabSeq());
            out.add(new FixedTab(d.getTabId(), d.getTabNm(), seq, origin, rows));
        }
    }

    private String deptName(String deptCd) {
        return deptRepository.findById(deptCd).map(DeptInfo::getDeptNm).filter(s -> !s.isBlank()).orElse(deptCd);
    }
}
