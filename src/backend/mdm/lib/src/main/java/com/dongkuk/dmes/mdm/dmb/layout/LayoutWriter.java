package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.repository.MdmLayoutConstRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutHeaderRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * 03 레이아웃 쓰기 한 곳(TSK-05-02 design.md §2·§6.4 — 불변 I23). D-144 3단계: 항목·헤더 구성·재정의는 (레이아웃, 버전) 단위로만
 * 쓴다 — 저장은 내 DRAFT 의 행만 바꾸고, 헤더 저장이 그 헤더를 쌓은 전문을 다시 계산하지 않는다(I18 폐지 — 헤더 변경은 판정 시각
 * 해석으로 전문에 반영된다).
 *
 * <p>모든 쓰기는 리포지토리 {@code save}·{@code saveAll}·{@code deleteAll} 과 {@code flush} 로 명시한다 — 변경 감지에 기대지
 * 않는다. 서비스 빈을 직접 부르는 테스트에는 OASIS 트랜잭션이 없어 JPQL 로 읽은 엔티티가 분리 상태이고, setter 만 부른 변경은
 * 버려진다. 같은 PK 를 지웠다 다시 넣으므로 지운 뒤 반드시 flush 한다(Hibernate 는 flush 때 INSERT 를 DELETE 보다 먼저 낸다).
 * FK 순서: CONST → HEADER → ITEM 순으로 지우고 반대로 넣는다(F3). 레이아웃 표에는 CASCADE 가 없다(V4 불변 규칙 11).
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

    /** 한 버전의 헤더 구성·재정의·항목을 통째로 바꾼다. FK 순서: CONST → HEADER → ITEM 지우고 반대로 넣는다(F3). */
    public void replaceVersionRows(Long layoutId, BigDecimal ver, List<Long> headerIds, List<MdmLayoutConst> consts,
                                   List<MdmLayoutItem> items) {
        deleteVersionRows(layoutId, ver);
        itemRepository.saveAll(items);
        itemRepository.flush();
        List<MdmLayoutHeader> stack = new ArrayList<>(headerIds.size());
        for (int i = 0; i < headerIds.size(); i++) {
            stack.add(new MdmLayoutHeader(layoutId, ver, i + 1, headerIds.get(i)));
        }
        headerRepository.saveAll(stack);
        headerRepository.flush();
        constRepository.saveAll(consts);
        constRepository.flush();
    }

    /** 헤더 레이아웃 한 버전의 항목만 바꾼다. 전문 행은 건드리지 않는다(I18 폐지 — 헤더 변경은 판정 시각 해석으로 전문에 반영된다). */
    public void replaceItems(Long layoutId, BigDecimal ver, List<MdmLayoutItem> items) {
        itemRepository.deleteAll(queries.itemsOf(layoutId, ver));
        itemRepository.flush();
        itemRepository.saveAll(items);
        itemRepository.flush();
    }

    /** 새 버전 — from 의 항목·헤더 구성·재정의를 칼럼 그대로 to 로 복사한다(번호를 새로 매기지 않는다). */
    public void copyVersionRows(Long layoutId, BigDecimal from, BigDecimal to) {
        List<MdmLayoutItem> items = new ArrayList<>();
        for (MdmLayoutItem s : queries.itemsOf(layoutId, from)) {
            MdmLayoutItem c = new MdmLayoutItem(layoutId, to, s.getSeq(), s.getFillKind());
            c.setColumnPhys(s.getColumnPhys());
            c.setTransUnit(s.getTransUnit());
            c.setUnitItem(s.getUnitItem());
            c.setNumFormat(s.getNumFormat());
            c.setDefaultValue(s.getDefaultValue());
            c.setFillerLength(s.getFillerLength());
            c.setOffset(s.getOffset());
            c.setLength(s.getLength());
            items.add(c);
        }
        List<Long> headerIds = queries.headersOf(layoutId, from).stream().map(MdmLayoutHeader::getHeaderLayoutId).toList();
        List<MdmLayoutConst> consts = queries.constsOf(layoutId, from).stream()
                .map(c -> new MdmLayoutConst(layoutId, to, c.getHeaderLayoutId(), c.getHeaderColumnPhys(), c.getConstValue())).toList();
        replaceVersionRows(layoutId, to, headerIds, consts, items);
    }

    /** DRAFT 삭제 정리(LayoutDraftDeletion) — CASCADE 가 없으므로 자식부터 지운다. */
    public void deleteVersionRows(Long layoutId, BigDecimal ver) {
        constRepository.deleteAll(queries.constsOf(layoutId, ver));
        constRepository.flush();
        headerRepository.deleteAll(queries.headersOf(layoutId, ver));
        headerRepository.flush();
        itemRepository.deleteAll(queries.itemsOf(layoutId, ver));
        itemRepository.flush();
    }
}
