package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdNaming;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.naming.ColumnNameComposer;
import com.dongkuk.dmes.mdm.dma.naming.DomainEntry;
import com.dongkuk.dmes.mdm.dma.naming.DomainSuggester;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** 요청 하나 동안 쓰는 사전 묶음(계획 P3). 엔진에는 {@link ErdNaming} 으로 들어간다. */
public final class ErdDictionary implements ErdNaming {

    private final ColumnNameComposer composer;
    final Set<String> columnPhys;
    final Set<String> aliasPhys;
    private final Map<Long, ErdDomainSpec> domains;
    private final List<DomainEntry> domainEntries;

    public ErdDictionary(TermDictionary terms, Set<String> columnPhys, Set<String> aliasPhys,
                         Map<Long, ErdDomainSpec> domains, List<DomainEntry> domainEntries) {
        this.composer = new ColumnNameComposer(terms);
        this.columnPhys = columnPhys;
        this.aliasPhys = aliasPhys;
        this.domains = domains;
        this.domainEntries = domainEntries;
    }

    @Override
    public Optional<NameComposition> forward(String logical) {
        return Optional.of(composer.forward(logical));
    }

    public NameComposition reverse(String phys) {
        return composer.reverse(phys);
    }

    @Override
    public Optional<ErdDomainSpec> domain(Long domainId) {
        return Optional.ofNullable(domains.get(domainId));
    }

    @Override
    public Optional<ErdDomainSpec> recommendDomain(String physName) {
        DomainEntry rec = DomainSuggester.recommended(DomainSuggester.suggest(physName, domainEntries));
        return rec == null ? Optional.empty() : domain(rec.domainId());
    }

    @Override
    public List<ErdWarning> warnings(ErdModel model, List<String> columnIds) {
        List<ErdWarning> out = new ArrayList<>();
        ErdStandardJudge.judge(model, this, columnIds).forEach((id, st) -> {
            switch (st) {
                case MISS -> out.add(new ErdWarning("STD_MISS", id, "사전에 없는 단어가 있습니다(***)"));
                case DOMAIN -> out.add(new ErdWarning("STD_DOMAIN", id, "도메인의 타입·길이와 다릅니다"));
                case TYPE -> out.add(new ErdWarning("STD_TYPE", id, "같은 물리명의 다른 컬럼과 타입이 다릅니다"));
                case NEW -> out.add(new ErdWarning("STD_NEW", id, "컬럼 사전에 아직 없는 이름입니다"));
                default -> { }
            }
        });
        return out;
    }
}
