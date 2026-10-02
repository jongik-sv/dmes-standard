package com.dongkuk.dmes.mdm.dma.columnMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainImpactQueries;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 컬럼 상세({@code columnMng.view})에 싣는 도메인 상세 — 이름·표준명·종류와 상속 체인으로 조립한 유효 타입·길이·소수·단위.
 *
 * <p>컬럼에는 타입·길이 칸이 없어 모두 도메인에서 온다. 조상 체인 CTE 로 체인 id 만 골라 읽고(SQL 2문, 도메인 전체를 읽지 않는다)
 * {@link DomainChainAssembler} 로 조립한다 — 상속 규칙을 다시 구현하지 않는다(레이아웃 {@code LayoutDictionary} 와 같은 조립 경로).
 * 순환·깨진 체인은 이름·표준명만 싣고 파생값은 null 이다.
 */
@Component
public class ColumnDomainDetailReader {

    private final DomainImpactQueries queries;
    private final MdmDomainRepository repository;
    private final DomainChainAssembler assembler;

    public ColumnDomainDetailReader(DomainImpactQueries queries, MdmDomainRepository repository,
                                    DomainChainAssembler assembler) {
        this.queries = queries;
        this.repository = repository;
        this.assembler = assembler;
    }

    /** 도메인이 없거나 지워졌으면 null. */
    public Map<String, Object> read(Long domainId) {
        if (domainId == null) {
            return null;
        }
        List<DomainImpactQueries.AncestorRow> up = queries.ancestors(domainId);
        if (up.isEmpty()) {
            return null;
        }
        List<Long> ids = up.stream().map(DomainImpactQueries.AncestorRow::domainId).distinct().toList();
        DomainTreeSnapshot chain = DomainTreeSnapshot.of(repository.findAllById(ids).stream().map(DomainNode::from).toList());
        DomainNode self = chain.find(domainId).orElse(null);
        if (self == null) {
            return null;
        }
        EffectiveDomainView view = null;
        if (up.get(up.size() - 1).depth() < DomainTreeSnapshot.MAX_DEPTH) {
            try {
                view = assembler.assemble(chain.chainRootFirst(domainId));
            } catch (DomainTreeSnapshot.CycleException | IllegalArgumentException e) {
                view = null;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domainId", self.domainId());
        out.put("domainName", self.domainName());
        out.put("stdName", self.stdName());
        out.put("domainKind", view != null ? view.domainKind() : self.domainKind());
        out.put("dataType", view == null ? null : view.dataType());
        out.put("length", view == null ? null : view.length());
        out.put("scale", view == null ? null : view.scale());
        out.put("unitCode", view == null ? null : view.unitCode());
        return out;
    }
}
