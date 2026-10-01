package com.dongkuk.dmes.mdm.common.rule.definition;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler.Assembled;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import org.springframework.stereotype.Component;

/**
 * 원장에서 (룰, 버전)의 정의를 읽어 조립한다(06 {@code MdmRuleDefinitionSource.STORED_VERSION}, TSK-08-04 design §2.3). DRAFT 도 읽는다.
 * 읽기만 한다 — 엔티티를 고치지 않는다(I19). {@code DefinitionLookup} 을 구현하지 않는다(정의 조회 빈 0개 가드, I20).
 */
@Component
public class StoredRuleDefinitions {

    private final RuleQueries queries;
    private final RuleVarTypeResolver resolver;

    public StoredRuleDefinitions(RuleQueries queries, RuleVarTypeResolver resolver) {
        this.queries = queries;
        this.resolver = resolver;
    }

    /** 원장에서 읽은 버전 하나 — 버전 행, 변수(원장·해석), 행(셀 파싱, 저장 순서). */
    public record Stored(MdmRuleVer version, List<MdmRuleVar> rawVars, List<ResolvedVar> vars, List<DraftRow> rows) {
    }

    /** 여러 룰을 한 번에 읽는 읽기 경로가 쓰는 타입 해석 범위({@link RuleVarTypeResolver#scope}). */
    public RuleVarTypeResolver.Scope scope() {
        return resolver.scope();
    }

    public Optional<MdmRuleVer> version(String ruleId, int ver) {
        return queries.versions(ruleId).stream().filter(v -> v.getVer() == ver).findFirst();
    }

    /** 버전이 없으면 빈 값. */
    public Optional<Stored> read(String ruleId, int ver) {
        return version(ruleId, ver).map(v -> read(ruleId, v, resolver::resolve));
    }

    /**
     * 이미 읽은 버전 행으로 읽는다(버전 목록을 다시 읽지 않는다). 타입은 해석 범위 {@code scope} 로 푼다 — 여러 룰을 한 번에 읽는 읽기 경로
     * ({@link StoredDefinitionLookup})가 도메인 트리·결과 변수·컬럼 사전 조회를 같이 쓴다.
     */
    public Stored read(String ruleId, MdmRuleVer v, RuleVarTypeResolver.Scope scope) {
        return read(ruleId, v, scope::resolve);
    }

    /** {@link #read(String, MdmRuleVer, RuleVarTypeResolver.Scope)} 와 같되 이미 읽은 변수·행({@link RuleQueries#vars}·{@link RuleQueries#rows} 순서)을 쓴다. */
    public Stored read(String ruleId, MdmRuleVer v, List<MdmRuleVar> raw, List<MdmRuleRow> rows, RuleVarTypeResolver.Scope scope) {
        return stored(ruleId, v, raw, rows, scope::resolve);
    }

    private Stored read(String ruleId, MdmRuleVer v, Resolve resolve) {
        int ver = v.getVer();
        return stored(ruleId, v, queries.vars(ruleId, ver), queries.rows(ruleId, ver), resolve);
    }

    private static Stored stored(String ruleId, MdmRuleVer v, List<MdmRuleVar> raw, List<MdmRuleRow> rawRows, Resolve resolve) {
        List<DraftRow> rows = rawRows.stream().map(StoredRuleDefinitions::draftRow).toList();
        return new Stored(v, raw, resolve.resolve(ruleId, v.getVer(), raw), rows);
    }

    /** 저장된 버전을 엔진 정의로. */
    public Assembled assemble(String ruleId, String ruleKind, Stored s) {
        return assemble(ruleId, ruleKind, s, externalTypes(ruleId, s.version().getVer()));
    }

    /** {@link #assemble(String, String, Stored)} 와 같되 룰 밖 이름의 타입을 해석 범위 {@code scope} 로 푼다. */
    public Assembled assemble(String ruleId, String ruleKind, Stored s, RuleVarTypeResolver.Scope scope) {
        return assemble(ruleId, ruleKind, s, externalTypes(ruleId, s.version().getVer(), scope::resolve));
    }

    private static Assembled assemble(String ruleId, String ruleKind, Stored s, Function<String, VarType> externalTypes) {
        return RuleDefinitionAssembler.assemble(ruleId, s.version().getVer(), ruleKind, s.version().getHitPolicy(), s.version().getApplyFrom(),
                s.version().getApplyTo(), s.rawVars(), s.vars(), s.rows(), externalTypes);
    }

    /**
     * 룰 밖 이름의 타입 — 컬럼 사전 또는 다른 룰의 최신 RELEASED 결과. 해석기에 이름 하나짜리 임시 변수를 물어 본다(08-03 {@code typeSourceOf}·
     * {@code RuleSaveValidator} 와 같은 방식). 모르면 null. 한 요청 안에서 캐시한다.
     */
    public Function<String, VarType> externalTypes(String ruleId, int ver) {
        return externalTypes(ruleId, ver, resolver::resolve);
    }

    private static Function<String, VarType> externalTypes(String ruleId, int ver, Resolve resolve) {
        Map<String, Optional<VarType>> cache = new HashMap<>();
        return name -> cache.computeIfAbsent(name, n -> {
            MdmRuleVar probe = new MdmRuleVar(ruleId, ver, 0, "COND", 1);
            probe.setDispType("Equal");
            probe.setVarName(n);
            return Optional.ofNullable(resolve.resolve(ruleId, ver, List.of(probe))).filter(l -> !l.isEmpty()).map(l -> l.get(0))
                    .filter(v -> RuleVarTypeResolver.COLUMN.equals(v.typeSource()) || RuleVarTypeResolver.RULE_RESULT.equals(v.typeSource()))
                    .map(v -> new VarType(n, v.dataType() == null ? DataType.STRING : DataType.valueOf(v.dataType()), v.scale(),
                            v.domainId() == null ? null : String.valueOf(v.domainId())));
        }).orElse(null);
    }

    /** 타입 해석 한 번 — 호출마다 새로 읽는 {@link RuleVarTypeResolver#resolve} 또는 범위의 {@link RuleVarTypeResolver.Scope#resolve}. */
    @FunctionalInterface
    private interface Resolve {
        List<ResolvedVar> resolve(String ruleId, int ver, List<MdmRuleVar> vars);
    }

    private static DraftRow draftRow(MdmRuleRow r) {
        return new DraftRow(r.getRowId(), r.getSeq(), r.getRowKind(), RuleCellsCodec.parse(r.getCells()));
    }
}
