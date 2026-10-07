package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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

    private static final String TAB_PREFIX = "tab-";

    /** 검증을 마친 탭 값. */
    public record TabValues(String tabId, String tabNm, int tabSeq, String lockYn) {}

    /** 검증을 마친 위젯 값. */
    public record WidgetValues(String instId, String widgetId, int posX, int posY, int sizeW, int sizeH,
                               String lockYn, String configJson) {}

    private final SecUserWidgetTabRepository tabRepository;
    private final SecUserWidgetRepository widgetRepository;

    /** 공유 사본은 merge(upsert)가 아니라 persist 로 넣어 PK 충돌을 오류로 드러낸다. */
    @PersistenceContext(unitName = "default")
    private EntityManager em;

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

    /**
     * 탭 공유 — 받는 사람들의 새 탭을 한 트랜잭션으로 넣는다(design-widget-tabs.md §3.1 shareTab). 새 탭 ID 는 서비스가 읽기 시점에
     * 정했으므로, 그사이 같은 ID 가 생겼으면 덮어쓰지 않고 다음 빈 {@code tab-N} 으로 옮긴다. 행은 persist 로만 넣으므로
     * 그래도 PK 가 겹치면(남은 위젯 행 등) 오류가 나고 이 트랜잭션의 모든 사본이 함께 롤백된다.
     */
    @Transactional
    public void copyTabs(List<TabCopy> copies) {
        for (TabCopy c : copies) {
            TabValues tab = c.tab();
            int n = Integer.parseInt(tab.tabId().substring(TAB_PREFIX.length()));
            while (tabRepository.existsById(new SecUserWidgetTabId(c.userId(), TAB_PREFIX + n))) n++;
            String tabId = TAB_PREFIX + n;
            SecUserWidgetTab row = new SecUserWidgetTab();
            row.setUserId(c.userId());
            row.setTabId(tabId);
            row.setTabNm(tab.tabNm());
            row.setTabSeq(tab.tabSeq());
            row.setLockYn(tab.lockYn());
            em.persist(row);
            for (WidgetValues w : c.widgets()) {
                SecUserWidget e = new SecUserWidget();
                e.setUserId(c.userId());
                e.setTabId(tabId);
                e.setInstId(w.instId());
                e.setWidgetId(w.widgetId());
                e.setPosX(w.posX());
                e.setPosY(w.posY());
                e.setSizeW(w.sizeW());
                e.setSizeH(w.sizeH());
                e.setLockYn(w.lockYn());
                e.setConfigJson(w.configJson());
                em.persist(e);
            }
        }
        em.flush();
    }

    /** 옛 고정 탭 행 하나를 개인 탭으로 옮기는 값(스펙 2026-10-07-widget-fixed-tabs §4). */
    public record TabMove(String fromTabId, String toTabId, String tabNm, int tabSeq) {}

    /**
     * 옛 고정 탭 행(home·def-*)을 개인 탭으로 옮긴다 — 한 트랜잭션, 행 삭제 없이 TAB_ID 만 바꾼다. 탭 행이 이미 옮겨졌으면(갱신 0)
     * 그 탭의 위젯은 건드리지 않는다. 옮길 ID 에 행이 이미 있으면(동시에 생긴 공유 사본) 예외로 되돌린다 — 부르는 쪽이 다시 읽고 다시 시도한다.
     * @return 실제로 옮긴 탭 수
     */
    @Transactional
    public int moveTabs(String userId, List<TabMove> moves) {
        int moved = 0;
        for (TabMove m : moves) {
            // 원래 행이 없으면 이미 옮겼다(멱등) — 대상 ID 검사보다 먼저 본다.
            if (!tabRepository.existsById(new SecUserWidgetTabId(userId, m.fromTabId()))) continue;
            if (tabRepository.existsById(new SecUserWidgetTabId(userId, m.toTabId()))) {
                throw new IllegalStateException("옮길 탭 ID 가 이미 있습니다: " + m.toTabId());
            }
            if (tabRepository.moveTab(userId, m.fromTabId(), m.toTabId(), m.tabNm(), m.tabSeq()) == 0) continue;
            widgetRepository.moveTab(userId, m.fromTabId(), m.toTabId());
            moved++;
        }
        return moved;
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
