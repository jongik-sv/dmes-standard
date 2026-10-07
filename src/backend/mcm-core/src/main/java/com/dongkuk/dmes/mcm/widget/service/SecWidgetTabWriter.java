package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
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
     * 정했으므로, 그사이 같은 ID 의 탭 행이나 위젯 행이 생겼으면 덮어쓰지 않고 다음 빈 {@code tab-N} 으로 옮긴다. 행은 persist 로만
     * 넣으므로 그래도 PK 가 겹치면(동시 커밋) 오류가 나고 이 트랜잭션의 모든 사본이 함께 롤백된다.
     */
    @Transactional
    public void copyTabs(List<TabCopy> copies) {
        for (TabCopy c : copies) {
            TabValues tab = c.tab();
            String tabId = freeTabId(c.userId(), tab.tabId());
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

    /** 옛 고정 탭 행 하나를 개인 탭으로 옮기는 값(스펙 2026-10-07-widget-fixed-tabs §4). toTabId 는 바랄 번호 — 차 있으면 다음 빈 번호. */
    public record TabMove(String fromTabId, String toTabId, String tabNm, int tabSeq) {}

    /**
     * 옛 고정 탭 행(home·def-*)을 개인 탭으로 옮긴다 — 한 트랜잭션, 행 삭제 없이 TAB_ID·이름·순서만 바꾼다(감사 칸 U_AT·U_USR_ID 갱신).
     * 원래 행이 없으면(다른 요청이 먼저 옮김) 건너뛴다. 옮길 ID 는 이 트랜잭션 안에서 탭 행·위젯 행이 모두 없는 첫 {@code tab-N} 으로
     * 고른다(동시에 생긴 공유 사본·탭 행 없는 위젯과 겹치지 않게). 부르는 쪽은 OASIS 바깥 트랜잭션을 내려놓고 부른다(합류하면
     * 여기 예외가 바깥을 rollback-only 로 만든다).
     * @return 실제로 옮긴 탭 수
     */
    @Transactional
    public int moveTabs(String userId, List<TabMove> moves) {
        int moved = 0;
        Instant now = Instant.now();
        for (TabMove m : moves) {
            if (!tabRepository.existsById(new SecUserWidgetTabId(userId, m.fromTabId()))) continue;
            String to = freeTabId(userId, m.toTabId());
            if (tabRepository.moveTab(userId, m.fromTabId(), to, m.tabNm(), m.tabSeq(), now) == 0) continue;
            widgetRepository.moveTab(userId, m.fromTabId(), to, now);
            moved++;
        }
        return moved;
    }

    /**
     * 새 개인 탭을 넣는다 — 기존 행을 덮어쓰지 않는다. 바랄 ID 에 탭 행이나 위젯 행이 있으면(그사이 생긴 공유 사본·옮긴 「내 홈」 등)
     * 다음 빈 {@code tab-N} 으로 넣는다. 행은 persist 로만 넣는다.
     * @return 실제로 쓴 탭 ID
     */
    @Transactional
    public String insertTab(String userId, TabValues tab, List<WidgetValues> widgets) {
        String tabId = freeTabId(userId, tab.tabId());
        copyTabs(List.of(new TabCopy(userId, new TabValues(tabId, tab.tabNm(), tab.tabSeq(), tab.lockYn()), widgets)));
        return tabId;
    }

    /** start({@code tab-N}) 부터 탭 행·위젯 행이 모두 없는 첫 개인 탭 ID. */
    private String freeTabId(String userId, String start) {
        int n = Integer.parseInt(start.substring(TAB_PREFIX.length()));
        while (tabRepository.existsById(new SecUserWidgetTabId(userId, TAB_PREFIX + n))
                || widgetRepository.existsByUserIdAndTabId(userId, TAB_PREFIX + n)) n++;
        return TAB_PREFIX + n;
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
