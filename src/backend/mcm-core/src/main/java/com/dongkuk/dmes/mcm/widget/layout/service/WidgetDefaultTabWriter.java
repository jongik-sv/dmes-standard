package com.dongkuk.dmes.mcm.widget.layout.service;

import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabId;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 기본 탭 쓰기의 트랜잭션 경계 — {@link WidgetLayoutWriter} 와 같은 방식(BackEnd 표준 §6-B-1).
 * 새 탭 ID 는 이 트랜잭션 안에서 채번한다: 기본 탭 테이블과 사용자 재정의 행에 남은 {@code def-N} 중 가장 큰 N + 1.
 * 지운 탭의 번호를 다시 주면 사용자에게 남은 옛 재정의 행이 새 탭에 되살아나므로 사용자 행 번호까지 피한다.
 * 동시에 두 관리자가 채번해 같은 번호가 나면 TAB_ID 유일 제약이 뒤 저장을 막는다.
 */
@Component("widgetDefaultTabWriter")
public class WidgetDefaultTabWriter {

    private final WidgetDefaultTabRepository tabRepository;
    private final WidgetDefaultTabItemRepository itemRepository;
    private final WidgetDefaultLayoutRepository layoutRepository;
    private final SecUserWidgetTabRepository userTabRepository;

    @Autowired
    public WidgetDefaultTabWriter(WidgetDefaultTabRepository tabRepository,
                                  WidgetDefaultTabItemRepository itemRepository,
                                  WidgetDefaultLayoutRepository layoutRepository,
                                  SecUserWidgetTabRepository userTabRepository) {
        this.tabRepository = tabRepository;
        this.itemRepository = itemRepository;
        this.layoutRepository = layoutRepository;
        this.userTabRepository = userTabRepository;
    }

    /**
     * 기본 탭 하나를 통째로 바꾼다 — 탭 행 upsert, 위젯 행 지우고 다시 넣기. tabId 가 null 이면 새 ID 를 채번한다.
     * 기존 탭 행은 찾아서 고쳐 감사 컬럼을 보존한다. 저장한 탭 ID 를 돌려준다.
     */
    @Transactional
    public String save(String layoutKey, String tabId, String tabNm, int tabSeq, List<WidgetLayoutWriter.LayoutItem> items) {
        String id = tabId == null ? nextTabId() : tabId;
        WidgetDefaultTab row = tabRepository.findById(new WidgetDefaultTabId(layoutKey, id)).orElseGet(WidgetDefaultTab::new);
        row.setLayoutKey(layoutKey);
        row.setTabId(id);
        row.setTabNm(tabNm);
        row.setTabSeq(tabSeq);
        tabRepository.save(row);

        itemRepository.deleteByLayoutKeyAndTabId(layoutKey, id);
        itemRepository.flush();
        itemRepository.saveAll(items.stream().map(i -> {
            WidgetDefaultTabItem e = new WidgetDefaultTabItem();
            e.setLayoutKey(layoutKey);
            e.setTabId(id);
            e.setInstId(i.instId());
            e.setWidgetId(i.widgetId());
            e.setPosX(i.posX());
            e.setPosY(i.posY());
            e.setSizeW(i.sizeW());
            e.setSizeH(i.sizeH());
            e.setLockYn(i.lockYn());
            return e;
        }).toList());
        return id;
    }

    /** 기본 탭과 그 위젯을 지운다. 사용자 재정의 행은 두고 화면에서만 숨긴다(§1). 탭이 있었으면 true. */
    @Transactional
    public boolean delete(String layoutKey, String tabId) {
        itemRepository.deleteByLayoutKeyAndTabId(layoutKey, tabId);
        Optional<WidgetDefaultTab> row = tabRepository.findById(new WidgetDefaultTabId(layoutKey, tabId));
        row.ifPresent(tabRepository::delete);
        return row.isPresent();
    }

    /** tabId → 새 순서. 그 키에 없는 탭은 건너뛴다. */
    @Transactional
    public void reorder(String layoutKey, Map<String, Integer> seqByTabId) {
        List<WidgetDefaultTab> tabs = tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc(layoutKey);
        for (WidgetDefaultTab t : tabs) {
            Integer seq = seqByTabId.get(t.getTabId());
            if (seq != null) t.setTabSeq(seq);
        }
        tabRepository.saveAll(tabs);
    }

    /** 한 키의 「홈」 기본 배치와 기본 탭을 모두 지운다(commWidgetMng deleteLayout, §3.2). */
    @Transactional
    public void deleteKey(String layoutKey) {
        layoutRepository.deleteByLayoutKey(layoutKey);
        itemRepository.deleteByLayoutKey(layoutKey);
        tabRepository.deleteByLayoutKey(layoutKey);
    }

    private String nextTabId() {
        long max = 0;
        for (String id : tabRepository.findAllTabIds()) max = Math.max(max, WidgetDefaultTabs.number(id));
        for (String id : userTabRepository.findDistinctDefaultTabIds()) max = Math.max(max, WidgetDefaultTabs.number(id));
        return WidgetDefaultTab.TAB_ID_PREFIX + (max + 1);
    }
}
