package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.dictionary.ColumnDescriptionSanitizer;
import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
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

    /**
     * 입력 순서를 지켜 돌려준다. {@code ver} 는 이 룰의 버전(해석 규칙은 버전과 무관하다). 부를 때마다 도메인 트리·앞 룰 결과 변수·컬럼 사전을
     * 새로 읽는다 — 쓰기 트랜잭션 안에서 방금 flush 한 값이 보여야 하는 호출자(저장 검사 등, I6)는 이것을 쓴다.
     */
    public List<ResolvedVar> resolve(String ruleId, BigDecimal ver, List<MdmRuleVar> vars) {
        return resolve(vars, new Lazy(ruleId));
    }

    /**
     * 읽기 한 번(룰 세트 IO 읽기 한 번, 기록 실행 한 요청)에서 여러 룰을 풀 때 도메인 트리·결과 변수 전체·컬럼 사전 조회를 같이 쓰는 범위.
     * 요청을 넘겨 들고 있지 않는다. 범위 안에서 원장을 고치지 않는 읽기 경로에서만 쓴다 — 범위가 읽은 뒤 바뀐 값은 보이지 않는다.
     */
    public Scope scope() {
        return new Scope();
    }

    private List<ResolvedVar> resolve(List<MdmRuleVar> vars, Source source) {
        List<ResolvedVar> out = new ArrayList<>(vars.size());
        for (MdmRuleVar v : vars) {
            out.add(resolveOne(v, source));
        }
        return out;
    }

    private ResolvedVar resolveOne(MdmRuleVar v, Source lazy) {
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
            Optional<MdmColumn> column = lazy.column(v.getVarName());
            if (column.isPresent() && column.get().getDomainId() != null) {
                MdmColumn c = column.get();
                String label = notBlank(v.getLabel()) ? v.getLabel() : notBlank(c.getLabelMid()) ? c.getLabelMid() : c.getLabelLong();
                // 컬럼 설명이 HTML 이면 글자만 쓴다(D-150). 태그만 있어 글자가 없으면 변수 자신의 설명으로 돌아간다
                String columnText = ColumnDescriptionSanitizer.plainText(c.getDescription());
                String description = notBlank(columnText) ? columnText : v.getDescription();
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
                                             Source lazy) {
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

    /** 해석이 읽는 원장 값 — 도메인 트리·앞 룰 결과 변수(이름 → 결과 변수)·컬럼 사전. */
    private interface Source {
        DomainTreeSnapshot domains();

        Map<String, MdmRuleVar> producers();

        Optional<MdmColumn> column(String physName);
    }

    /** 결과 변수 이름(그룹이면 그룹 이름도) → 결과 변수. 같은 이름이 여럿이면 들어온 순서(룰 ID·seq·var_id 순)로 처음 것. */
    private static Map<String, MdmRuleVar> producersOf(List<MdmRuleVar> resultVars) {
        Map<String, MdmRuleVar> producers = new LinkedHashMap<>();
        for (MdmRuleVar r : resultVars) {
            if (notBlank(r.getVarName())) {
                producers.putIfAbsent(r.getVarName(), r);
            }
            if (notBlank(r.getResGrp())) {
                producers.putIfAbsent(r.getResGrp(), r);
            }
        }
        return producers;
    }

    /** 한 번의 해석에서 도메인 트리·앞 룰 결과 변수를 필요할 때 한 번만 읽는다. 컬럼 사전은 이름마다 읽는다. */
    private final class Lazy implements Source {
        private final String ruleId;
        private DomainTreeSnapshot domains;
        private Map<String, MdmRuleVar> producers;

        Lazy(String ruleId) {
            this.ruleId = ruleId;
        }

        @Override
        public DomainTreeSnapshot domains() {
            if (domains == null) {
                domains = domainTreeReader.load();
            }
            return domains;
        }

        @Override
        public Map<String, MdmRuleVar> producers() {
            if (producers == null) {
                producers = producersOf(ruleQueries.latestReleasedResultVarsExcept(ruleId));
            }
            return producers;
        }

        @Override
        public Optional<MdmColumn> column(String physName) {
            return columnRepository.findByPhysName(physName);
        }
    }

    /**
     * 여러 룰에 걸친 해석 범위({@link #scope}). 도메인 트리·모든 룰의 최신 RELEASED 결과 변수는 처음 필요할 때 한 번 읽고, 룰마다 그 룰을 뺀
     * 결과 변수로 {@link Lazy} 와 같은 이름 → 결과 변수 표를 만든다(읽은 순서를 바꾸지 않고 거르기만 하므로 같은 이름의 승자가 같다).
     * 컬럼 사전은 이름마다 한 번 읽고, {@link #preloadColumns} 로 여러 이름을 한 번에 읽어 둘 수 있다.
     */
    public final class Scope {
        private static final int IN_CHUNK = 500;

        private DomainTreeSnapshot domains;
        private List<MdmRuleVar> resultVars;
        private final Map<String, Map<String, MdmRuleVar>> producers = new HashMap<>();
        private final Map<String, Optional<MdmColumn>> columns = new HashMap<>();

        private Scope() {
        }

        /** {@link RuleVarTypeResolver#resolve} 와 같은 결과를 범위의 읽기로 낸다. */
        public List<ResolvedVar> resolve(String ruleId, BigDecimal ver, List<MdmRuleVar> vars) {
            return RuleVarTypeResolver.this.resolve(vars, new Source() {
                @Override
                public DomainTreeSnapshot domains() {
                    return Scope.this.domains();
                }

                @Override
                public Map<String, MdmRuleVar> producers() {
                    return Scope.this.producers(ruleId);
                }

                @Override
                public Optional<MdmColumn> column(String physName) {
                    return Scope.this.column(physName);
                }
            });
        }

        /** 컬럼 사전에서 물리명 하나 — {@code findByPhysName} 과 같은 일치. 범위 안에서 한 번만 읽는다. */
        public Optional<MdmColumn> column(String physName) {
            Optional<MdmColumn> known = columns.get(physName);
            if (known == null) {
                known = columnRepository.findByPhysName(physName);
                columns.put(physName, known);
            }
            return known;
        }

        /** 아직 읽지 않은 물리명을 한 번에(묶음으로 나눠) 읽어 둔다. 사전에 없는 이름은 없음으로 기억한다. */
        public void preloadColumns(Collection<String> physNames) {
            Set<String> missing = new LinkedHashSet<>();
            for (String n : physNames) {
                if (n != null && !columns.containsKey(n)) {
                    missing.add(n);
                }
            }
            List<String> all = List.copyOf(missing);
            for (int from = 0; from < all.size(); from += IN_CHUNK) {
                List<String> chunk = all.subList(from, Math.min(all.size(), from + IN_CHUNK));
                Map<String, MdmColumn> found = new HashMap<>();
                columnRepository.findByPhysNameIn(chunk).forEach(c -> found.put(c.getPhysName(), c));
                for (String n : chunk) {
                    columns.put(n, Optional.ofNullable(found.get(n)));
                }
            }
        }

        /**
         * 이 룰을 뺀 모든 룰의 최신 RELEASED 결과 변수 — {@link RuleQueries#latestReleasedResultVarsExcept} 와 같은 행·순서다(범위가 한 번 읽은
         * 전체 목록을 거르기만 한다). 해석과 같은 목록을 화면 후보로 쓸 때 다시 읽지 않는다.
         */
        public List<MdmRuleVar> resultVarsExcept(String ruleId) {
            return resultVars().stream().filter(v -> !ruleId.equals(v.getMaruRuleId())).toList();
        }

        private List<MdmRuleVar> resultVars() {
            if (resultVars == null) {
                resultVars = ruleQueries.latestReleasedResultVars();
            }
            return resultVars;
        }

        private DomainTreeSnapshot domains() {
            if (domains == null) {
                domains = domainTreeReader.load();
            }
            return domains;
        }

        private Map<String, MdmRuleVar> producers(String ruleId) {
            Map<String, MdmRuleVar> known = producers.get(ruleId);
            if (known == null) {
                known = producersOf(resultVarsExcept(ruleId));
                producers.put(ruleId, known);
            }
            return known;
        }
    }
}
