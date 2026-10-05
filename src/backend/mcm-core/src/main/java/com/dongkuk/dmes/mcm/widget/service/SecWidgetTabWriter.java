package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 위젯 탭 쓰기의 트랜잭션 경계. OASIS 서비스 빈({@link SecWidgetService})에는 {@code @Transactional} 을 붙일 수 없어
 * (CGLIB 프록시가 파라미터명 메타데이터를 잃는다, BackEnd 표준 §6-B-1) 원자성이 필요한 쓰기를 이 빈에 모은다.
 * 기존 탭 행은 찾아서 고쳐 감사 컬럼(C_AT 등)을 보존한다.
 */
@Component("secWidgetTabWriter")
public class SecWidgetTabWriter {

    /** 검증을 마친 탭 값. */
    public record TabValues(String tabId, String tabNm, int tabSeq, String lockYn) {}

    /** 검증을 마친 위젯 값. */
    public record WidgetValues(String instId, String widgetId, int posX, int posY, int sizeW, int sizeH,
                               String lockYn, String configJson) {}

    private final SecUserWidgetTabRepository tabRepository;
    private final SecUserWidgetRepository widgetRepository;

    @Autowired
    public SecWidgetTabWriter(SecUserWidgetTabRepository tabRepository, SecUserWidgetRepository widgetRepository) {
        this.tabRepository = tabRepository;
        this.widgetRepository = widgetRepository;
    }

    /** 탭 하나를 통째로 바꾼다 — 탭 행 upsert, 위젯 행 지우고 다시 넣기. */
    @Transactional
    public void replaceTab(String userId, TabValues tab, List<WidgetValues> widgets) {
        SecUserWidgetTab row = tabRepository.findById(new SecUserWidgetTabId(userId, tab.tabId()))
                .orElseGet(SecUserWidgetTab::new);
        row.setUserId(userId);
        row.setTabId(tab.tabId());
        row.setTabNm(tab.tabNm());
        row.setTabSeq(tab.tabSeq());
        row.setLockYn(tab.lockYn());
        tabRepository.save(row);

        widgetRepository.deleteByUserIdAndTabId(userId, tab.tabId());
        widgetRepository.flush();
        widgetRepository.saveAll(widgets.stream().map(w -> {
            SecUserWidget e = new SecUserWidget();
            e.setUserId(userId);
            e.setTabId(tab.tabId());
            e.setInstId(w.instId());
            e.setWidgetId(w.widgetId());
            e.setPosX(w.posX());
            e.setPosY(w.posY());
            e.setSizeW(w.sizeW());
            e.setSizeH(w.sizeH());
            e.setLockYn(w.lockYn());
            e.setConfigJson(w.configJson());
            return e;
        }).toList());
    }

    /** 다른 사용자에게 줄 탭 사본 하나 — 검증·이름·새 탭 ID·새 instId 를 마친 값. */
    public record TabCopy(String userId, TabValues tab, List<WidgetValues> widgets) {}

    /** 탭 공유 — 받는 사람들의 새 탭을 한 트랜잭션으로 넣는다(design-widget-tabs.md §3.1 shareTab). */
    @Transactional
    public void copyTabs(List<TabCopy> copies) {
        for (TabCopy c : copies) replaceTab(c.userId(), c.tab(), c.widgets());
    }

    /** 탭과 그 위젯을 지운다. 없으면 아무것도 하지 않는다. */
    @Transactional
    public void deleteTab(String userId, String tabId) {
        widgetRepository.deleteByUserIdAndTabId(userId, tabId);
        tabRepository.findById(new SecUserWidgetTabId(userId, tabId)).ifPresent(tabRepository::delete);
    }

    /** tabId → 새 순서. 사용자에게 없는 탭은 건너뛴다. */
    @Transactional
    public void reorder(String userId, Map<String, Integer> seqByTabId) {
        List<SecUserWidgetTab> tabs = tabRepository.findByUserIdOrderByTabSeqAsc(userId);
        for (SecUserWidgetTab t : tabs) {
            Integer seq = seqByTabId.get(t.getTabId());
            if (seq != null) t.setTabSeq(seq);
        }
        tabRepository.saveAll(tabs);
    }
}
