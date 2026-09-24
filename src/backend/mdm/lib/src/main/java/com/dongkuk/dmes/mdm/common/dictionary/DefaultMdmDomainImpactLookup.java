package com.dongkuk.dmes.mdm.common.dictionary;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainImpact;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainImpactLookup;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReference;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReferenceSpi;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * {@link MdmDomainImpactLookup} 구현(TSK-04-03 design.md §3.6, TSK-04-01 D9). 하위 도메인·참조 컬럼은 02 자신의
 * 테이블을 재귀 CTE 로 읽고, 03·06 참조는 {@link MdmDomainReferenceSpi} 빈 목록(0개 가능)을 모아 합친다 — 03·06 테이블이
 * 없든 비어 있든 같은 코드로 0건이다(수용 기준 6, 불변 I12). 배포 시스템은 배포 보류라 빈 목록(D1).
 */
@Component
public class DefaultMdmDomainImpactLookup implements MdmDomainImpactLookup {

    private final DomainImpactQueries queries;
    private final ObjectProvider<MdmDomainReferenceSpi> spis;

    public DefaultMdmDomainImpactLookup(DomainImpactQueries queries, ObjectProvider<MdmDomainReferenceSpi> spis) {
        this.queries = queries;
        this.spis = spis;
    }

    @Override
    public MdmDomainImpact impact(Long domainId) {
        List<DomainImpactQueries.SubtreeRow> rows = queries.subtree(domainId);
        Set<Long> subtreeIds = new LinkedHashSet<>();
        Set<Long> descendants = new LinkedHashSet<>();
        Set<Long> columns = new LinkedHashSet<>();
        Set<String> physNames = new LinkedHashSet<>();
        for (DomainImpactQueries.SubtreeRow r : rows) {
            subtreeIds.add(r.domainId());
            if (r.depth() >= 1 && !r.domainId().equals(domainId)) {
                descendants.add(r.domainId());
            }
            if (r.columnId() != null) {
                columns.add(r.columnId());
                physNames.add(r.physName());
            }
        }
        List<MdmDomainReference> external = new ArrayList<>();
        if (!subtreeIds.isEmpty()) {
            spis.orderedStream().forEach(spi -> external.addAll(spi.referencesTo(Set.copyOf(subtreeIds), Set.copyOf(physNames))));
        }
        return new MdmDomainImpact(domainId, List.copyOf(descendants), List.copyOf(columns), List.copyOf(external), List.of());
    }
}
