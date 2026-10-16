package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.naming.DomainEntry;
import com.dongkuk.dmes.mdm.dma.support.TermDictionaryLoader;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
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
        Map<Long, ErdDomainSpec> specs = specs(domainList.stream().map(ErdDictionaryLoader::typeNode).toList());
        List<DomainEntry> entries = domainList.stream()
                .map(d -> new DomainEntry(d.getDomainId(), d.getDomainName(), d.getStdName())).toList();
        var columnList = columns.findAll();
        var aliasList = aliases.findAll();
        Set<String> phys = columnList.stream().map(c -> c.getPhysName()).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Set<String> alias = aliasList.stream().map(a -> a.getPhysName()).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, ErdDictionary.ColumnEntry> byPhys = ErdDictionary.index(
                columnList.stream().map(c -> new ErdDictionary.ColumnRow(c.getColumnId(), c.getPhysName(),
                        c.getColumnName(), c.getDomainId())).toList(),
                aliasList.stream().map(a -> new ErdDictionary.AliasRow(a.getColumnId(), a.getPhysName())).toList());
        return new ErdDictionary(TermDictionaryLoader.load(terms), phys, alias, specs, entries, byPhys);
    }

    /** 도메인 행마다 스펙 하나. */
    static Map<Long, ErdDomainSpec> specs(List<DomainNode> nodes) {
        return nodes.stream().collect(Collectors.toMap(DomainNode::domainId,
                n -> new ErdDomainSpec(n.domainId(), n.domainName(), n.dataType(), n.length(), n.scale())));
    }

    /**
     * 타입 판정에 쓰는 칸만 담은 노드. {@link DomainNode#from} 은 STD_AST·BIZ_AST JSON 을 읽는데, 이 적재는 식을 쓰지 않고
     * 깨진 JSON 행 하나로 ERD 사전 전체가 실패하면 안 되므로 그 칸은 비운다.
     */
    private static DomainNode typeNode(MdmDomain d) {
        return new DomainNode(d.getDomainId(), d.getParentDomainId(), d.getDomainName(), d.getStdName(),
                d.getDomainKind(), d.getDataType(), d.getLength(), d.getScale(), null, null, null,
                null, null, null, null, null, null, null, null);
    }
}
