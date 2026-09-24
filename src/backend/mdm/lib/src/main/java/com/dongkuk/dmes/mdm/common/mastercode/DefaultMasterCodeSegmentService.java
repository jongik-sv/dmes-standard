package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentKey;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * 계약 {@link MasterCodeSegmentService} 의 유일한 구현 빈(TSK-06-03 design.md D2). 06-03 몫(코드 행 5개·{@code revert} 의
 * ITEM·CATE_ITEM)은 {@link MasterCodeItemSegmentOps} 로 위임하고, 남은 메서드는 담당 Task 를 적은
 * {@link UnsupportedOperationException} 을 던진다 — 조용히 무시하지 않는다(불변 규칙 42).
 *
 * <p>머지 해소 규칙(D2): 형제 Task 가 같은 인터페이스의 구현 클래스를 먼저 머지했으면 06-03 위임과 {@code revert} 분기를 그
 * 클래스로 옮기고 이 클래스를 지운다. 반대 순서면 형제가 아래 예외 줄을 자기 위임으로 바꾼다. 구현 빈은 하나만 남긴다.
 */
@Service
public class DefaultMasterCodeSegmentService implements MasterCodeSegmentService {

    private final MasterCodeItemSegmentOps items;

    public DefaultMasterCodeSegmentService(MasterCodeItemSegmentOps items) {
        this.items = items;
    }

    @Override
    public MasterCodeVersionView viewAt(VersionRef version) {
        return items.viewAt(version);
    }

    @Override
    public void createBaseCategory(VersionRef firstDraft) {
        throw new UnsupportedOperationException("TSK-06-02 가 구현한다: createBaseCategory");
    }

    @Override
    public void addItem(VersionRef draft, String code, MasterCodeItemValues values) {
        items.addItem(draft, code, values);
    }

    @Override
    public void changeItem(VersionRef draft, String code, MasterCodeItemValues values) {
        items.changeItem(draft, code, values);
    }

    @Override
    public List<String> removeItem(VersionRef draft, String code) {
        return items.removeItem(draft, code);
    }

    @Override
    public void addCategory(VersionRef draft, CategoryDefinition definition) {
        throw new UnsupportedOperationException("TSK-06-04 가 구현한다: addCategory");
    }

    @Override
    public void changeCategory(VersionRef draft, CategoryDefinition definition) {
        throw new UnsupportedOperationException("TSK-06-04 가 구현한다: changeCategory");
    }

    @Override
    public void closeCategory(VersionRef draft, String cateId) {
        throw new UnsupportedOperationException("TSK-06-04 가 구현한다: closeCategory");
    }

    @Override
    public void addCategoryMembers(VersionRef draft, String cateId, Set<String> codes) {
        throw new UnsupportedOperationException("TSK-06-04 가 구현한다: addCategoryMembers");
    }

    @Override
    public void removeCategoryMembers(VersionRef draft, String cateId, Set<String> codes) {
        throw new UnsupportedOperationException("TSK-06-04 가 구현한다: removeCategoryMembers");
    }

    /** ITEM·CATE_ITEM 은 06-03 이 구현하고, CATE 는 TSK-06-04 몫이다(D3). */
    @Override
    public void revert(VersionRef draft, MasterCodeSegmentKey key) {
        items.revert(draft, key);
    }

    @Override
    public void fillFrom(VersionRef draft, BigDecimal sourceVer) {
        throw new UnsupportedOperationException("TSK-06-02 가 구현한다: fillFrom");
    }
}
