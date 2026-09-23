package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmColumnDictionaryEntry;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmColumnDictionaryLookup;
import java.util.Optional;

/**
 * 03(레이아웃) 소비자 흉내(TSK-04-01 design.md §3.4) — {@link MdmColumnDictionaryLookup} 만 알아 화면
 * 라벨을 조립할 수 있음을 컴파일로 보인다. 값 자체는 in-memory 로만 흉내 낸다.
 */
public class ColumnDictionaryConsumerStub implements MdmColumnDictionaryLookup {

    private final MdmColumnDictionaryEntry entry;

    public ColumnDictionaryConsumerStub(MdmColumnDictionaryEntry entry) {
        this.entry = entry;
    }

    @Override
    public Optional<MdmColumnDictionaryEntry> byPhysName(String physName) {
        return entry != null && entry.physName().equals(physName) ? Optional.of(entry) : Optional.empty();
    }

    @Override
    public Optional<MdmColumnDictionaryEntry> byColumnId(Long columnId) {
        return entry != null && entry.columnId().equals(columnId) ? Optional.of(entry) : Optional.empty();
    }

    @Override
    public java.util.List<MdmColumnDictionaryEntry> byDomainId(Long domainId) {
        return entry != null && entry.domainId().equals(domainId) ? java.util.List.of(entry) : java.util.List.of();
    }

    /** 03 이 실제로 하게 될 흉내 — labelLong·domainId·refKind 를 읽어 화면 라벨 문자열을 조립한다. */
    public String composeScreenLabel(String physName) {
        return byPhysName(physName)
                .map(e -> e.labelLong() + "(domain=" + e.domainId() + ", ref=" + e.refKind() + ")")
                .orElse(physName);
    }
}
