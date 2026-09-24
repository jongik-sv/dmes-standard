package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReference;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReferenceSpi;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 03 이 구현하는 도메인 참조 SPI(TSK-05-03 design.md D12, TSK-04-01 D9). domainMng 영향도의 "레이아웃" 행({@code LAYOUT_ITEM})을
 * 코드 수정 없이 채운다 — 영향 전문 목록({@link LayoutImpactFinder})과 같은 조회다. refKey =
 * {@code "{LAYOUT_NAME}#{SEQ} {COLUMN_PHYS} ({OFFSET}/{LENGTH})"}, 헤더 항목이면 앞에 {@code "(헤더) "}.
 */
@Component
public class LayoutItemReferenceSpi implements MdmDomainReferenceSpi {

    public static final String REF_KIND = "LAYOUT_ITEM";

    private final LayoutImpactFinder finder;

    public LayoutItemReferenceSpi(LayoutImpactFinder finder) {
        this.finder = finder;
    }

    @Override
    public List<MdmDomainReference> referencesTo(Set<Long> domainIds, Set<String> columnPhysNames) {
        List<MdmDomainReference> out = new ArrayList<>();
        if (columnPhysNames == null || columnPhysNames.isEmpty()) {
            return out;
        }
        for (LayoutImpactFinder.Usage u : finder.itemsUsing(columnPhysNames)) {
            out.add(new MdmDomainReference(REF_KIND, (u.header() ? "(헤더) " : "") + u.layout().getLayoutName() + "#" + u.item().getSeq()
                    + " " + u.item().getColumnPhys() + " (" + u.item().getOffset() + "/" + u.item().getLength() + ")"));
        }
        return out;
    }
}
