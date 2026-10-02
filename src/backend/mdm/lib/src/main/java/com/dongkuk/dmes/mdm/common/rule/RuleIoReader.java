package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionFailure;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.springframework.stereotype.Component;

/**
 * 룰 하나의 입출력을 DB 에서 계산하는 유일한 자리(TSK-08-06 design §6.1, I4~I7, D3·D4). 룰 세트 조회 목록·편집 view·저장 검사·되살리기·룰
 * 검색·구성 지침이 모두 이것을 쓴다.
 *
 * <ul>
 *   <li>버전 — 룰마다 RELEASED 가운데 VER 최대({@link RuleQueries#latestReleasedVers}). 적용 시점은 보지 않는다. 그 버전의 적중 정책·기본 행
 *       여부(hasDefault)는 {@link RuleQueries#releasedHeads} 한 문장으로 읽는다. 세트 확정 검사는 {@link #readAt} 으로 적용 시각의 RELEASED 를
 *       고른다.</li>
 *   <li>results — 결과 열마다 {@code RES_GRP} 가 있으면 그 이름, 없으면 {@code VAR_NAME}(엔진 {@code RuleEvaluator.resultNames} 와 같다).</li>
 *   <li>conds — (Expression 이 아닌 조건 열: 식 변수면 {@code VAR_AST} 참조, 아니면 {@code VAR_NAME}) → (결과 열 {@code GRP_COND_AST} 참조) →
 *       (행 순서대로 DISP {@code Expression} 열의 셀 {@code ast} 참조). EvalEx 상수·자기 결과 이름·이미 나온 이름은 대소문자 무시로 버리고,
 *       처음 나온 표기를 그대로 둔다.</li>
 *   <li>출처 — 컬럼 사전에 있으면 DICT, 아니면 같은 이름의 이름 조건 열에 도메인·데이터 타입을 선언했으면 PROG, 아니면 NONE.
 *       {@link RuleVarTypeResolver} 의 typeSource 로 가르지 않는다(DECLARED 가 COLUMN 보다 먼저라서).</li>
 * </ul>
 * 타입·표시명은 룰마다 해석기를 한 번 불러 푼다. NONE 은 비운다. 한 번의 읽기({@link #read}) 안에서는 해석 범위
 * ({@link RuleVarTypeResolver.Scope}) 하나로 도메인 트리·결과 변수·컬럼 사전 조회를 같이 쓰고, 변수·행은 룰마다가 아니라 한 번에 읽는다.
 */
@Component
public class RuleIoReader {

    private static final String EXPRESSION = "Expression";

    private final MdmRuleRepository ruleRepository;
    private final RuleQueries queries;
    private final RuleVarTypeResolver resolver;
    private final MdmEvaluator evaluator;

    public RuleIoReader(MdmRuleRepository ruleRepository, RuleQueries queries, RuleVarTypeResolver resolver, MdmEvaluator evaluator) {
        this.evaluator = evaluator;
        this.ruleRepository = ruleRepository;
        this.queries = queries;
        this.resolver = resolver;
    }

    /** 입력 순서를 지킨다(같은 ID 는 한 번). 없는 룰은 {@code exists=false}, RELEASED 가 없는 룰은 {@code releasedVer=null}·빈 목록. */
    public Map<String, RuleIo> read(Collection<String> ruleIds) {
        return read(ruleIds, resolver.scope());
    }

    /**
     * 한 요청에서 {@link #read}·{@link #condIo} 를 여러 번 부를 때 같이 쓸 타입 해석 범위(도메인 트리·결과 변수·컬럼 사전 조회를 같이 쓴다).
     * 원장을 고치기 전에 읽는 읽기 경로에서만 쓴다.
     */
    public RuleVarTypeResolver.Scope scope() {
        return resolver.scope();
    }

    /**
     * {@link #read(Collection)} 와 같되 타입 해석 범위 {@code scope} 를 쓴다. 변수·행은 (룰, RELEASED 최대 VER) 쌍으로 한 번에 읽고(룰마다 읽던
     * 것과 같은 행·순서), 컬럼 사전은 모든 룰의 읽는 이름·결과 이름을 한 번에 읽어 둔다.
     */
    public Map<String, RuleIo> read(Collection<String> ruleIds, RuleVarTypeResolver.Scope scope) {
        return read(ruleIds, scope, queries::latestReleasedVers);
    }

    /**
     * {@code at} 에 적용되는 RELEASED 버전(APPLY_FROM <= at < APPLY_TO)으로 계산한 입출력(D-144 2단계 — 세트 확정 검사 2·3). 그 시점 RELEASED 가
     * 없는 룰은 {@code releasedVer=null}·빈 목록이다. 버전 고르기 밖은 {@link #read(Collection, RuleVarTypeResolver.Scope)} 와 같다.
     */
    public Map<String, RuleIo> readAt(Collection<String> ruleIds, LocalDateTime at, RuleVarTypeResolver.Scope scope) {
        return read(ruleIds, scope, ids -> {
            Map<String, List<MdmRuleVer>> byRule = new HashMap<>();
            for (MdmRuleVer v : queries.versionsOf(ids)) {
                byRule.computeIfAbsent(v.getMaruRuleId(), k -> new ArrayList<>()).add(v);
            }
            Map<String, BigDecimal> out = new LinkedHashMap<>();
            byRule.forEach((id, vs) -> RuleVersions.currentReleased(vs, at).ifPresent(v -> out.put(id, v.getVer())));
            return out;
        });
    }

    /** 읽기 본체 — {@code pick} 이 (있는 룰 ID 집합) → (룰 ID → 계산할 RELEASED VER) 을 고른다. 고르지 않은 룰은 RELEASED 없음으로 본다. */
    private Map<String, RuleIo> read(Collection<String> ruleIds, RuleVarTypeResolver.Scope scope,
                                     Function<Set<String>, Map<String, BigDecimal>> pick) {
        Set<String> ids = new LinkedHashSet<>();
        for (String id : ruleIds) {
            if (id != null) {
                ids.add(id);
            }
        }
        Map<String, MdmRule> rules = new HashMap<>();
        ruleRepository.findAllById(ids).forEach(r -> rules.put(r.getMaruRuleId(), r));
        Map<String, BigDecimal> vers = pick.apply(rules.keySet());
        Map<String, RuleQueries.ReleasedHead> heads = new HashMap<>();
        for (RuleQueries.ReleasedHead h : queries.releasedHeads(vers.keySet())) {
            if (VersionNumbers.same(h.ver(), vers.get(h.ruleId()))) {
                heads.put(h.ruleId(), h);
            }
        }
        Map<String, BigDecimal> released = new LinkedHashMap<>();
        for (String id : ids) {
            if (rules.containsKey(id) && vers.containsKey(id)) {
                released.put(id, vers.get(id));
            }
        }
        Map<String, List<MdmRuleVar>> varsByRule = queries.varsOf(released);
        Map<String, BigDecimal> withExpressions = new LinkedHashMap<>();
        released.forEach((id, ver) -> {
            if (varsByRule.get(id).stream().anyMatch(v -> EXPRESSION.equals(v.getDispType()))) {
                withExpressions.put(id, ver);
            }
        });
        Map<String, List<MdmRuleRow>> rowsByRule = queries.rowsOf(withExpressions);
        Map<String, Collected> collected = new LinkedHashMap<>();
        Set<String> names = new LinkedHashSet<>();
        released.forEach((id, ver) -> {
            Collected c = collect(varsByRule.get(id), rowsByRule.getOrDefault(id, List.of()));
            collected.put(id, c);
            names.addAll(c.condNames());
            c.results().values().forEach(v -> names.add(v.getVarName()));
        });
        scope.preloadColumns(names);

        Map<String, RuleIo> out = new LinkedHashMap<>();
        for (String id : ids) {
            MdmRule rule = rules.get(id);
            BigDecimal ver = vers.get(id);
            if (rule == null) {
                out.put(id, new RuleIo(id, null, null, null, false, null, null, List.of(), List.of()));
            } else if (ver == null) {
                out.put(id, new RuleIo(id, rule.getMaruRuleName(), rule.getRuleKind(), rule.getStatus(), true, null, null, List.of(), List.of()));
            } else {
                RuleQueries.ReleasedHead head = heads.get(id);
                out.put(id, compute(rule, ver, head == null ? null : head.hitPolicy(), head != null && head.hasDefault(), varsByRule.get(id),
                        collected.get(id), scope));
            }
        }
        return out;
    }

    /**
     * IF 갈래 조건식 입력(계획 C4) — otherwise 가 아닌 선만, 조건식이 비어 있으면 뺀다(구조 검사가 FLOW_IF_ELSE 로 잡는다). 파싱 실패는
     * {@code ok=false} 와 오류 문구. 변수는 {@code EVAL_TS}·예약 접두어({@code _}) 이름을 빼고, 컬럼 사전에 있으면 DICT, 없으면 NONE.
     * {@code vars} 는 null 이 아니라 빈 목록을 보장한다(분석기가 null 을 받지 못한다).
     */
    public Map<String, CondIo> condIo(FlowDefinition flow) {
        return condIo(flow, resolver.scope());
    }

    /** {@link #condIo(FlowDefinition)} 와 같되 컬럼 사전을 {@code scope} 로 읽는다(모든 갈래의 이름을 한 번에). */
    public Map<String, CondIo> condIo(FlowDefinition flow, RuleVarTypeResolver.Scope scope) {
        Set<String> ifs = new HashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (n.kind() == NodeKind.IF) {
                ifs.add(n.id());
            }
        }
        Map<String, Object> parsed = new LinkedHashMap<>();                 // 선 ID → 읽는 이름 목록 또는 파싱 실패
        Set<String> names = new LinkedHashSet<>();
        for (FlowEdge e : flow.edges()) {
            if (!ifs.contains(e.from()) || e.otherwise() || e.cond() == null || e.cond().isBlank()) {
                continue;
            }
            List<String> used = new ArrayList<>();
            try {
                evaluator.compile(e.cond());
                for (String name : evaluator.usedVariables(e.cond())) {
                    if (ReservedNames.EVAL_TS.equalsIgnoreCase(name) || name.startsWith(ReservedNames.RESERVED_PREFIX)) {
                        continue;
                    }
                    used.add(name);
                }
            } catch (ExpressionFailure f) {
                parsed.put(e.id(), f);
                continue;
            }
            parsed.put(e.id(), used);
            names.addAll(used);
        }
        scope.preloadColumns(names);
        Map<String, CondIo> out = new LinkedHashMap<>();
        parsed.forEach((edgeId, p) -> {
            if (p instanceof ExpressionFailure f) {
                out.put(edgeId, new CondIo(false, f.getMessage(), List.of()));
                return;
            }
            List<IoName> vars = new ArrayList<>();
            for (Object o : (List<?>) p) {
                String name = (String) o;
                boolean dict = scope.column(name).isPresent();
                vars.add(new IoName(name, dict ? RuleIo.DICT : RuleIo.NONE, null, null, null, false, null));
            }
            out.put(edgeId, new CondIo(true, null, vars));
        });
        return out;
    }

    /** 결과 이름 → 그 이름을 만드는 룰 ID(룰 ID 순, 중복 없음). DEPRECATED 가 아니고 RELEASED 가 있는 룰의 최신 RELEASED 만 본다(§6.4, I16). */
    public Map<String, List<String>> producersOfActiveRules() {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (MdmRuleVar v : queries.latestReleasedResultVarsOfActiveRules()) {
            String name = resName(v);
            if (notBlank(name)) {
                List<String> ids = out.computeIfAbsent(name, k -> new ArrayList<>());
                if (!ids.contains(v.getMaruRuleId())) {
                    ids.add(v.getMaruRuleId());
                }
            }
        }
        return out;
    }

    /** 한 룰 버전에서 모은 결과 이름(→ 대표 열)·읽는 이름 — 원장만 보고 정한다. */
    private record Collected(Map<String, MdmRuleVar> results, List<String> condNames) {
    }

    private static Collected collect(List<MdmRuleVar> vars, List<MdmRuleRow> rows) {
        Map<String, MdmRuleVar> results = new LinkedHashMap<>();          // 결과 이름 → 대표 열(그룹이면 첫 열)
        for (MdmRuleVar v : vars) {
            String name = resName(v);
            if ("RESULT".equals(v.getVarKind()) && notBlank(name)) {
                results.putIfAbsent(name, v);
            }
        }
        Names conds = new Names(results.keySet());
        for (MdmRuleVar v : vars) {
            if ("COND".equals(v.getVarKind()) && !EXPRESSION.equals(v.getDispType())) {
                if (notBlank(v.getVarAst())) {
                    collect(DomainJson.readMap(v.getVarAst()), conds);
                } else {
                    conds.add(v.getVarName());
                }
            }
        }
        for (MdmRuleVar v : vars) {
            if ("RESULT".equals(v.getVarKind()) && notBlank(v.getGrpCondAst())) {
                collect(DomainJson.readMap(v.getGrpCondAst()), conds);
            }
        }
        List<MdmRuleVar> expressionColumns = vars.stream().filter(v -> EXPRESSION.equals(v.getDispType())).toList();
        if (!expressionColumns.isEmpty()) {
            for (MdmRuleRow row : rows) {
                Map<Integer, Map<String, Object>> cells = RuleCellsCodec.parse(row.getCells());
                for (MdmRuleVar v : expressionColumns) {
                    Map<String, Object> cell = cells.get(v.getVarId());
                    if (cell != null) {
                        collect(RuleCellsCodec.ast(cell.get("ast")), conds);
                    }
                }
            }
        }
        return new Collected(results, conds.list);
    }

    private RuleIo compute(MdmRule rule, BigDecimal ver, String hitPolicy, boolean hasDefault, List<MdmRuleVar> vars, Collected collected,
                           RuleVarTypeResolver.Scope scope) {
        String id = rule.getMaruRuleId();
        Map<String, MdmRuleVar> results = collected.results();

        // 출처를 가르고, 타입을 풀 열을 한 목록에 모아 resolver 를 한 번 부른다.
        List<String> condNames = collected.condNames();
        List<String> sources = new ArrayList<>(condNames.size());
        List<MdmRuleVar> typed = new ArrayList<>();
        List<Integer> typedIndex = new ArrayList<>();                       // cond 자리 → typed 자리(없으면 -1)
        for (int k = 0; k < condNames.size(); k++) {
            String name = condNames.get(k);
            MdmRuleVar source = null;
            if (scope.column(name).isPresent()) {
                sources.add(RuleIo.DICT);
                source = new MdmRuleVar(id, ver, -(k + 1), "COND", k + 1);
                source.setVarName(name);
            } else {
                source = declaring(vars, name);
                sources.add(source == null ? RuleIo.NONE : RuleIo.PROG);
            }
            typedIndex.add(source == null ? -1 : typed.size());
            if (source != null) {
                typed.add(source);
            }
        }
        int resultStart = typed.size();
        typed.addAll(results.values());
        List<ResolvedVar> resolved = typed.isEmpty() ? List.of() : scope.resolve(id, ver, typed);

        List<IoName> condOut = new ArrayList<>(condNames.size());
        for (int k = 0; k < condNames.size(); k++) {
            int at = typedIndex.get(k);
            condOut.add(at < 0 ? new IoName(condNames.get(k), RuleIo.NONE, null, null, null, false, null)
                    : ioName(condNames.get(k), sources.get(k), resolved.get(at)));
        }
        List<IoName> resultOut = new ArrayList<>(results.size());
        int k = resultStart;
        for (String name : results.keySet()) {
            resultOut.add(ioName(name, null, resolved.get(k++)));
        }
        return new RuleIo(id, rule.getMaruRuleName(), rule.getRuleKind(), rule.getStatus(), true, VersionNumbers.plain(ver), hitPolicy, List.copyOf(condOut),
                List.copyOf(resultOut), hasDefault);
    }

    /** 같은 이름(대소문자 무시)의 이름 조건 열이 도메인·데이터 타입을 선언했으면 그 열. */
    private static MdmRuleVar declaring(List<MdmRuleVar> vars, String name) {
        for (MdmRuleVar v : vars) {
            if ("COND".equals(v.getVarKind()) && !EXPRESSION.equals(v.getDispType()) && !notBlank(v.getVarAst())
                    && name.equalsIgnoreCase(v.getVarName()) && (v.getDomainId() != null || notBlank(v.getDataType()))) {
                return v;
            }
        }
        return null;
    }

    private static IoName ioName(String name, String source, ResolvedVar r) {
        return new IoName(name, source, r.label(), r.dataType(), r.scale(), r.dateString(), r.maruCodeId());
    }

    private static String resName(MdmRuleVar v) {
        return notBlank(v.getResGrp()) ? v.getResGrp() : v.getVarName();
    }

    /** EvalEx AST 의 {@code VARIABLE_OR_CONSTANT} 값을 {@code params} 를 따라 재귀로 모은다. */
    private static void collect(Object node, Names into) {
        if (!(node instanceof Map<?, ?> map)) {
            return;
        }
        if ("VARIABLE_OR_CONSTANT".equals(map.get("type")) && map.get("value") instanceof String name) {
            into.add(name);
        }
        if (map.get("params") instanceof List<?> params) {
            for (Object p : params) {
                collect(p, into);
            }
        }
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /** 읽는 이름 — 상수·자기 결과 이름·이미 나온 이름을 대소문자 무시로 버리고 첫 표기를 남긴다. */
    private static final class Names {
        private final Set<String> selfResults = new HashSet<>();
        private final Set<String> seen = new HashSet<>();
        private final List<String> list = new ArrayList<>();

        Names(Collection<String> results) {
            for (String r : results) {
                selfResults.add(r.toUpperCase(Locale.ROOT));
            }
        }

        void add(String name) {
            if (!notBlank(name)) {
                return;
            }
            String key = name.toUpperCase(Locale.ROOT);
            if (ReservedNames.CONSTANTS.contains(key) || selfResults.contains(key) || !seen.add(key)) {
                return;
            }
            list.add(name);
        }
    }
}
