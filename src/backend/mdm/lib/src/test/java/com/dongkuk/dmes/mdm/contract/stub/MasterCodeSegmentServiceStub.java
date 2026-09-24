package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentKey;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * TSK-06-01 design.md §3.4 — 06-02(createBaseCategory·fillFrom)·06-03(코드 행·revert·viewAt)·06-04(카테고리·소속) 역의
 * 호출이 {@link MasterCodeSegmentService} 타입으로만 컴파일·동작함을 보이는 흉내. 호출 기록만 남긴다. 가치는 컴파일이다 —
 * 인터페이스 시그니처가 바뀌면 이 클래스가 깨진다.
 */
public class MasterCodeSegmentServiceStub implements MasterCodeSegmentService {

    final List<String> calls = new ArrayList<>();

    @Override
    public MasterCodeVersionView viewAt(VersionRef version) {
        calls.add("viewAt");
        return new MasterCodeVersionView(version, List.of(), List.of(), List.of());
    }

    @Override
    public void createBaseCategory(VersionRef firstDraft) {
        calls.add("createBaseCategory");
    }

    @Override
    public void addItem(VersionRef draft, String code, MasterCodeItemValues values) {
        calls.add("addItem:" + code);
    }

    @Override
    public void changeItem(VersionRef draft, String code, MasterCodeItemValues values) {
        calls.add("changeItem:" + code);
    }

    @Override
    public List<String> removeItem(VersionRef draft, String code) {
        calls.add("removeItem:" + code);
        return List.of("MAJOR");
    }

    @Override
    public void addCategory(VersionRef draft, CategoryDefinition definition) {
        calls.add("addCategory:" + definition.cateId());
    }

    @Override
    public void changeCategory(VersionRef draft, CategoryDefinition definition) {
        calls.add("changeCategory:" + definition.cateId());
    }

    @Override
    public void closeCategory(VersionRef draft, String cateId) {
        calls.add("closeCategory:" + cateId);
    }

    @Override
    public void addCategoryMembers(VersionRef draft, String cateId, Set<String> codes) {
        calls.add("addCategoryMembers:" + cateId);
    }

    @Override
    public void removeCategoryMembers(VersionRef draft, String cateId, Set<String> codes) {
        calls.add("removeCategoryMembers:" + cateId);
    }

    @Override
    public void revert(VersionRef draft, MasterCodeSegmentKey key) {
        calls.add("revert:" + key.table());
    }

    @Override
    public void fillFrom(VersionRef draft, BigDecimal sourceVer) {
        calls.add("fillFrom:" + sourceVer);
    }
}
