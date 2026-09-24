package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 룰 변수 타입 해석의 유일한 자리(TSK-08-02 design §6.4, D13, I16). 조건 열은 타입을 저장하지 않으므로(06:125) 아래 순서로 푼다.
 *
 * <ol>
 *   <li>COND 이고 {@code DISP_TYPE='Expression'} → STRING, EXPRESSION_COLUMN</li>
 *   <li>{@code DOMAIN_ID} 가 있다 → 그 도메인, DECLARED</li>
 *   <li>{@code DATA_TYPE} 이 있다 → 그 값, DECLARED</li>
 *   <li>이름 변수이고 컬럼 사전에 있다 → 컬럼의 도메인, COLUMN(라벨이 비면 컬럼 중간명·긴 이름, 설명은 컬럼 설명)</li>
 *   <li>이름 변수이고 다른 룰의 최신 RELEASED 결과 변수 이름(또는 결과 열 그룹)이다 → 그 결과 변수의 DOMAIN_ID/DATA_TYPE, RULE_RESULT</li>
 *   <li>그 밖 → STRING, UNRESOLVED</li>
 * </ol>
 * 도메인 → 타입은 도메인 화면·계약과 같은 조립기({@link DomainChainAssembler})의 유효 값(종류·데이터 타입은 최상위, 길이·scale 은 가까운
 * 조상부터)으로 푼다. 일자 String = 종류 DATE·데이터 타입 STRING·길이 4·6·8(06:127). 코드 도메인은 유효 마루 코드를 싣는다.
 */
@Component
public class RuleVarTypeResolver {

    public static final String COLUMN = "COLUMN";
    public static final String RULE_RESULT = "RULE_RESULT";
    public static final String DECLARED = "DECLARED";
    public static final String EXPRESSION_COLUMN = "EXPRESSION_COLUMN";
    public static final String UNRESOLVED = "UNRESOLVED";

    private static final Set<Integer> DATE_STRING_LENGTHS = Set.of(4, 6, 8);

    private final MdmColumnRepository columnRepository;
    private final DomainTreeReader domainTreeReader;
    private final DomainChainAssembler assembler;
    private final RuleQueries ruleQueries;

    public RuleVarTypeResolver(MdmColumnRepository columnRepository, DomainTreeReader domainTreeReader, DomainChainAssembler assembler,
                               RuleQueries ruleQueries) {
        this.columnRepository = columnRepository;
        this.domainTreeReader = domainTreeReader;
        this.assembler = assembler;
        this.ruleQueries = ruleQueries;
    }

    /** 입력 순서를 지켜 돌려준다. {@code ver} 는 이 룰의 버전(해석 규칙은 버전과 무관하다). */
    public List<ResolvedVar> resolve(String ruleId, int ver, List<MdmRuleVar> vars) {
        Lazy lazy = new Lazy(ruleId);
        List<ResolvedVar> out = new ArrayList<>(vars.size());
        for (MdmRuleVar v : vars) {
            out.add(resolveOne(v, lazy));
        }
        return out;
    }

    private ResolvedVar resolveOne(MdmRuleVar v, Lazy lazy) {
        boolean exprVar = v.getVarAst() != null && !v.getVarAst().isBlank();
        if ("COND".equals(v.getVarKind()) && "Expression".equals(v.getDispType())) {
            return build(v, exprVar, "STRING", null, false, null, null, null, EXPRESSION_COLUMN, v.getLabel(), v.getDescription());
        }
        if (v.getDomainId() != null) {
            Optional<ResolvedVar> byDomain = fromDomain(v, exprVar, v.getDomainId(), DECLARED, v.getLabel(), v.getDescription(), lazy);
            if (byDomain.isPresent()) {
                return byDomain.get();
            }
        }
        if (notBlank(v.getDataType())) {
            return build(v, exprVar, v.getDataType(), null, false, null, null, null, DECLARED, v.getLabel(), v.getDescription());
        }
        if (!exprVar && notBlank(v.getVarName())) {
            Optional<MdmColumn> column = columnRepository.findByPhysName(v.getVarName());
            if (column.isPresent() && column.get().getDomainId() != null) {
                MdmColumn c = column.get();
                String label = notBlank(v.getLabel()) ? v.getLabel() : notBlank(c.getLabelMid()) ? c.getLabelMid() : c.getLabelLong();
                String description = notBlank(c.getDescription()) ? c.getDescription() : v.getDescription();
                Optional<ResolvedVar> byColumn = fromDomain(v, false, c.getDomainId(), COLUMN, label, description, lazy);
                if (byColumn.isPresent()) {
                    return byColumn.get();
                }
            }
            MdmRuleVar producer = lazy.producers().get(v.getVarName());
            if (producer != null) {
                if (producer.getDomainId() != null) {
                    Optional<ResolvedVar> byResult = fromDomain(v, false, producer.getDomainId(), RULE_RESULT, v.getLabel(), v.getDescription(), lazy);
                    if (byResult.isPresent()) {
                        return byResult.get();
                    }
                }
                if (notBlank(producer.getDataType())) {
                    return build(v, false, producer.getDataType(), null, false, null, null, null, RULE_RESULT, v.getLabel(), v.getDescription());
                }
            }
        }
        return build(v, exprVar, "STRING", null, false, null, null, null, UNRESOLVED, v.getLabel(), v.getDescription());
    }

    private Optional<ResolvedVar> fromDomain(MdmRuleVar v, boolean exprVar, Long domainId, String source, String label, String description,
                                             Lazy lazy) {
        DomainTreeSnapshot snapshot = lazy.domains();
        Optional<DomainNode> node = snapshot.find(domainId);
        if (node.isEmpty() || snapshot.cyclic(domainId)) {
            return Optional.empty();
        }
        EffectiveDomainView eff = assembler.assemble(snapshot.chainRootFirst(domainId));
        String dataType = notBlank(eff.dataType()) ? eff.dataType() : "STRING";
        boolean dateString = "DATE".equals(eff.domainKind()) && "STRING".equals(dataType) && eff.length() != null
                && DATE_STRING_LENGTHS.contains(eff.length());
        String maruCodeId = "CODE".equals(eff.domainKind()) && eff.codeRef() != null ? eff.codeRef().maruCodeId() : null;
        return Optional.of(build(v, exprVar, dataType, eff.scale(), dateString, maruCodeId, domainId, node.get().domainName(), source,
                label, description));
    }

    private static ResolvedVar build(MdmRuleVar v, boolean exprVar, String dataType, Integer scale, boolean dateString, String maruCodeId,
                                     Long domainId, String domainName, String source, String label, String description) {
        return new ResolvedVar(v.getVarId(), v.getVarKind(), v.getDispType(), v.getSeq(), v.getVarName(), exprVar, label, dataType, scale,
                dateString, maruCodeId, domainId, domainName, source, description);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /** 한 번의 해석에서 도메인 트리·앞 룰 결과 변수를 필요할 때 한 번만 읽는다. */
    private final class Lazy {
        private final String ruleId;
        private DomainTreeSnapshot domains;
        private Map<String, MdmRuleVar> producers;

        Lazy(String ruleId) {
            this.ruleId = ruleId;
        }

        DomainTreeSnapshot domains() {
            if (domains == null) {
                domains = domainTreeReader.load();
            }
            return domains;
        }

        /** 결과 변수 이름(그룹이면 그룹 이름도) → 결과 변수. 같은 이름이 여럿이면 룰 ID·seq 순으로 처음 것. */
        Map<String, MdmRuleVar> producers() {
            if (producers == null) {
                producers = new LinkedHashMap<>();
                for (MdmRuleVar r : ruleQueries.latestReleasedResultVarsExcept(ruleId)) {
                    if (notBlank(r.getVarName())) {
                        producers.putIfAbsent(r.getVarName(), r);
                    }
                    if (notBlank(r.getResGrp())) {
                        producers.putIfAbsent(r.getResGrp(), r);
                    }
                }
            }
            return producers;
        }
    }
}
