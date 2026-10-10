package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.naming.DomainEntry;
import com.dongkuk.dmes.mdm.dma.support.TermDictionaryLoader;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 요청마다 사전을 새로 읽는다(불변 규칙 I26, 계획 P3). 요청 하나 안에서는 이 묶음 하나로 모든 컬럼을 판정한다. */
@Component
public class ErdDictionaryLoader {

    private final MdmTermRepository terms;
    private final MdmColumnRepository columns;
    private final MdmColumnSystemRepository aliases;
    private final MdmDomainRepository domains;

    public ErdDictionaryLoader(MdmTermRepository terms, MdmColumnRepository columns,
                               MdmColumnSystemRepository aliases, MdmDomainRepository domains) {
        this.terms = terms;
        this.columns = columns;
        this.aliases = aliases;
        this.domains = domains;
    }

    @Transactional(readOnly = true)
    public ErdDictionary load() {
        var domainList = domains.findAll();
        Map<Long, ErdDomainSpec> specs = domainList.stream().collect(Collectors.toMap(
                d -> d.getDomainId(),
                d -> new ErdDomainSpec(d.getDomainId(), d.getDomainName(), d.getDataType(), d.getLength(), d.getScale())));
        List<DomainEntry> entries = domainList.stream()
                .map(d -> new DomainEntry(d.getDomainId(), d.getDomainName(), d.getStdName())).toList();
        Set<String> phys = columns.findAll().stream().map(c -> c.getPhysName()).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Set<String> alias = aliases.findAll().stream().map(a -> a.getPhysName()).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        return new ErdDictionary(TermDictionaryLoader.load(terms), phys, alias, specs, entries);
    }
}
