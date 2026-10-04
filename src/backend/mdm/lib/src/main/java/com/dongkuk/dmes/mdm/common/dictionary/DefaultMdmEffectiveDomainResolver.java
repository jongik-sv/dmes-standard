package com.dongkuk.dmes.mdm.common.dictionary;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.blankToNull;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainDraft;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomain;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomainResolver;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.ezylang.evalex.parser.ParseException;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.springframework.stereotype.Component;

/**
 * {@link MdmEffectiveDomainResolver} 구현(TSK-04-03 design.md §2, TSK-04-01 §7.2). 조립은 {@link DomainChainAssembler}
 * 하나가 한다 — 목록·저장·계약이 같은 답을 낸다(불변 I3).
 *
 * <p>{@code resolve(id)} 는 조상 체인 CTE 로 체인 id 만 골라 읽는다(단건 조회). 깊이 가드 행이 나오면 순환 데이터다.
 * {@code resolveDraft} 는 전체 스냅샷에 초안을 얹어 저장 없이 조립한다.
 */
@Component
public class DefaultMdmEffectiveDomainResolver implements MdmEffectiveDomainResolver {

    private final DomainImpactQueries queries;
    private final MdmDomainRepository repository;
    private final DomainTreeReader reader;
    private final DomainChainAssembler assembler;
    private final MdmEvaluator evaluator;

    public DefaultMdmEffectiveDomainResolver(DomainImpactQueries queries, MdmDomainRepository repository,
                                             DomainTreeReader reader, DomainChainAssembler assembler,
                                             MdmEvaluator evaluator) {
        this.queries = queries;
        this.repository = repository;
        this.reader = reader;
        this.assembler = assembler;
        this.evaluator = evaluator;
    }

    @Override
    public MdmEffectiveDomain resolve(Long domainId) {
        List<DomainImpactQueries.AncestorRow> up = queries.ancestors(domainId);
        if (up.isEmpty()) {
            throw new NoSuchElementException("도메인이 없다: " + domainId);
        }
        if (up.get(up.size() - 1).depth() >= DomainTreeSnapshot.MAX_DEPTH) {
            throw new DomainTreeSnapshot.CycleException(domainId);
        }
        List<Long> ids = up.stream().map(DomainImpactQueries.AncestorRow::domainId).toList();
        DomainTreeSnapshot chain = DomainTreeSnapshot.of(repository.findAllById(ids).stream().map(DomainNode::from).toList());
        return assembler.assemble(chain.chainRootFirst(domainId)).toContract();
    }

    @Override
    public MdmEffectiveDomain resolveDraft(MdmDomainDraft draft) {
        DomainTreeSnapshot snapshot = reader.load();
        Long id = draft.domainId() != null ? draft.domainId() : DomainTreeSnapshot.DRAFT_ID;
        DomainNode stored = snapshot.find(id).orElse(null);
        String kind = draft.domainKind() != null ? draft.domainKind().name() : stored == null ? null : stored.domainKind();
        DomainNode node = new DomainNode(id, draft.parentDomainId(),
                stored == null ? null : stored.domainName(), stored == null ? null : stored.stdName(), kind,
                stored == null ? null : stored.dataType(), stored == null ? null : stored.length(),
                stored == null ? null : stored.scale(), stored == null ? null : stored.unitCode(),
                draft.codeRef() == null ? null : draft.codeRef().maruCodeId(),
                draft.codeRef() == null ? null : draft.codeRef().cateId(),
                blankToNull(draft.stdRule()), ast(draft.stdRule()), blankToNull(draft.bizRule()), ast(draft.bizRule()),
                null, null, null, null);
        return assembler.assemble(snapshot.withDraft(node).chainRootFirst(id)).toContract();
    }

    private Map<String, Object> ast(String text) {
        String t = blankToNull(text);
        if (t == null) {
            return null;
        }
        try {
            return AstExporter.export(t, evaluator.configuration());
        } catch (ParseException e) {
            return null;
        }
    }
}
