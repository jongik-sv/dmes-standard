package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.repository.MdmLayoutConstRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutHeaderRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 03 레이아웃 쓰기 한 곳(TSK-05-02 design.md §2·§6.4 — 불변 I12·I17·I23).
 *
 * <p>모든 쓰기는 리포지토리 {@code save}·{@code saveAll}·{@code deleteAll} 과 {@code flush} 로 명시한다 — 변경 감지에 기대지
 * 않는다. 서비스 빈을 직접 부르는 테스트에는 OASIS 트랜잭션이 없어 JPQL 로 읽은 엔티티가 분리 상태이고, setter 만 부른 변경은
 * 버려진다. 같은 PK 를 지웠다 다시 넣으므로 지운 뒤 반드시 flush 한다(Hibernate 는 flush 때 INSERT 를 DELETE 보다 먼저 낸다).
 * FK 순서: CONST → HEADER → ITEM 순으로 지우고 반대로 넣는다(F3).
 */
@Component
public class LayoutWriter {

    private final LayoutQueries queries;
    private final MdmLayoutRepository layoutRepository;
    private final MdmLayoutItemRepository itemRepository;
    private final MdmLayoutHeaderRepository headerRepository;
    private final MdmLayoutConstRepository constRepository;

    public LayoutWriter(LayoutQueries queries, MdmLayoutRepository layoutRepository, MdmLayoutItemRepository itemRepository,
                        MdmLayoutHeaderRepository headerRepository, MdmLayoutConstRepository constRepository) {
        this.queries = queries;
        this.layoutRepository = layoutRepository;
        this.itemRepository = itemRepository;
        this.headerRepository = headerRepository;
        this.constRepository = constRepository;
    }

    public MdmLayout saveLayout(MdmLayout layout) {
        return layoutRepository.saveAndFlush(layout);
    }

    /** 항목을 통째로 바꾼다. 이 레이아웃 항목을 가리키는 CONST 행은 호출자가 먼저 지운다. */
    public void replaceItems(Long layoutId, List<MdmLayoutItem> items) {
        itemRepository.deleteAll(queries.itemsOf(layoutId));
        itemRepository.flush();
        itemRepository.saveAll(items);
        itemRepository.flush();
    }

    /** 전문의 헤더 적층과 상수 재정의를 통째로 바꾼다. */
    public void replaceStack(Long messageId, List<Long> headerIds, List<MdmLayoutConst> consts) {
        constRepository.deleteAll(queries.constsOf(messageId));
        constRepository.flush();
        headerRepository.deleteAll(queries.headersOf(messageId));
        headerRepository.flush();
        List<MdmLayoutHeader> stack = new ArrayList<>(headerIds.size());
        for (int i = 0; i < headerIds.size(); i++) {
            stack.add(new MdmLayoutHeader(messageId, i + 1, headerIds.get(i)));
        }
        headerRepository.saveAll(stack);
        headerRepository.flush();
        constRepository.saveAll(consts);
        constRepository.flush();
    }

    public void deleteConsts(List<MdmLayoutConst> consts) {
        constRepository.deleteAll(consts);
        constRepository.flush();
    }

    public void insertConsts(List<MdmLayoutConst> consts) {
        constRepository.saveAll(consts);
        constRepository.flush();
    }

    /**
     * 이 헤더를 쌓은 전문 전체의 본문 오프셋·총 길이를 다시 민다(§6.4, 불변 I12). 본문 항목 길이는 저장된 LENGTH 를 그대로 쓴다.
     * 업무 버전({@code VERSION})은 여기서 올리지 않는다 — 호출자가 같은 action 에서 {@link LayoutVersioner} 로 기록한다(TSK-05-03 I18).
     *
     * @return 바뀐 전문 {@code [LAYOUT_ID, LAYOUT_NAME, TOTAL_LENGTH_BEFORE, TOTAL_LENGTH_AFTER]}
     */
    public List<Map<String, Object>> recalculateUsers(Long headerLayoutId) {
        LinkedHashSet<Long> messageIds = new LinkedHashSet<>();
        for (MdmLayoutHeader h : queries.stacksUsing(headerLayoutId)) {
            messageIds.add(h.getLayoutId());
        }
        List<Map<String, Object>> changed = new ArrayList<>();
        for (Long messageId : messageIds) {
            MdmLayout message = layoutRepository.findById(messageId).orElse(null);
            if (message == null) {
                continue;
            }
            List<Integer> headerTotals = new ArrayList<>();
            for (MdmLayoutHeader h : queries.headersOf(messageId)) {
                headerTotals.add(layoutRepository.findById(h.getHeaderLayoutId()).map(MdmLayout::getTotalLength).orElse(0));
            }
            List<MdmLayoutItem> body = queries.itemsOf(messageId);
            List<Integer> lengths = body.stream().map(MdmLayoutItem::getLength).toList();
            LayoutOffsetCalculator.Stacked s = LayoutOffsetCalculator.placeMessage(headerTotals, lengths);
            for (int i = 0; i < body.size(); i++) {
                body.get(i).setOffset(s.bodyOffsets().get(i));
            }
            itemRepository.saveAll(body);
            itemRepository.flush();
            int before = message.getTotalLength();
            message.setTotalLength(s.total());
            layoutRepository.saveAndFlush(message);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", messageId);
            row.put("LAYOUT_NAME", message.getLayoutName());
            row.put("TOTAL_LENGTH_BEFORE", before);
            row.put("TOTAL_LENGTH_AFTER", s.total());
            changed.add(row);
        }
        return changed;
    }
}
