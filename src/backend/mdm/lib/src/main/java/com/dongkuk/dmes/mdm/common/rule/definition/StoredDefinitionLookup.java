package com.dongkuk.dmes.mdm.common.rule.definition;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * 운영 정의 조회기(spec §6.1, 계획 Task 11) — MDM 앱 안에서 원장을 직접 읽는다. 룰은 판정 시각(KST 벽시계)에 적용되는 RELEASED 버전
 * ({@link RuleVersions#currentReleased}: {@code APPLY_FROM <= now < APPLY_TO}), 세트는 판정 시각에 적용되는 RELEASED 버전(D-144 2단계, 룰과 같은
 * 해석. FLOW_JSON 이 없으면 흐름 null = 한 줄 흐름)과 부모의 계산 상태({@link RuleVersions#effectiveStatus}).
 *
 * <p><b>스프링 빈이 아니다</b> — {@code MdmBusinessRuleMigrationTest} 가 {@code DefinitionLookup} 빈 0개를 요구한다. {@code RuleSetRunner} 가 호출마다
 * (테스트 케이스 일괄 실행이면 한 요청에 하나) 만든다. 한 인스턴스 안에서 룰 헤더·버전 목록·(룰, 버전) 정의·(룰, 판정 시각) 결과를 캐시하고,
 * 타입 해석은 해석 범위 하나({@link RuleVarTypeResolver.Scope})로 도메인 트리·결과 변수·컬럼 사전 조회를 같이 쓴다. 정의는 버전 행만으로 정해지고
 * 판정 시각과 무관하므로, 판정 시각이 다른 호출은 시각마다 버전을 고르고 같은 버전이면 정의를 같이 쓴다. 원장을 고치는 경로에서 쓰지 않는다.
 * 컬럼 검증 정의는 이 조회기의 몫이 아니라 빈 값이다.
 *
 * <p>저장 데이터가 깨졌으면 판정하지 않고 {@link StoredDefinitionException} 을 던진다(P-D9, spec §9.1-9). 원인은 행 셀 읽기·행 조립 실패
 * {@code BusinessException}(MDM021), 저장된 AST 읽기 실패 {@code IllegalStateException}(조립기), FLOW_JSON·RULE_IDS 읽기 실패
 * {@code IllegalArgumentException}(코덱)이다. 감싸는 범위는 저장값 읽기뿐이다 — 엔진 호출은 감싸지 않는다. OASIS 입구가 이 예외만 MDM026 으로 바꾼다.
 */
public final class StoredDefinitionLookup implements DefinitionLookup {

    private final RuleQueries queries;
    private final StoredRuleDefinitions stored;
    private final MdmRuleRepository rules;
    private final RuleSetVersionQueries setVersions;
    private final MdmRuleSetRepository sets;
    private final Map<String, Optional<RuleDefinition>> cache = new HashMap<>();
    private final Map<String, Optional<MdmRule>> headers = new HashMap<>();
    private final Map<String, List<MdmRuleVer>> versions = new HashMap<>();
    private final Map<String, Optional<RuleDefinition>> definitions = new HashMap<>();
    private final Map<String, Optional<RuleSetDefinition>> setCache = new HashMap<>();
    private final Map<String, Raw> prefetched = new HashMap<>();
    private RuleVarTypeResolver.Scope scope;

    /** 미리 읽어 둔 (룰, 버전)의 변수·행 — 아직 해석하지 않은 원장 행 그대로. */
    private record Raw(List<MdmRuleVar> vars, List<MdmRuleRow> rows) {
    }

    public StoredDefinitionLookup(RuleQueries queries, StoredRuleDefinitions stored, MdmRuleRepository rules,
                                  RuleSetVersionQueries setVersions, MdmRuleSetRepository sets) {
        this.queries = queries;
        this.stored = stored;
        this.rules = rules;
        this.setVersions = setVersions;
        this.sets = sets;
    }

    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        return Optional.empty();
    }

    @Override
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        String key = ruleId + "@" + evalTs;
        Optional<RuleDefinition> known = cache.get(key);
        if (known == null) {
            known = load(ruleId, evalTs);
            cache.put(key, known);
        }
        return known;
    }

    /**
     * 판정 시각 {@code evalTs} 로 {@link #rule} 을 부를 룰들을 미리 한 번에 읽어 둔다 — 헤더·버전 목록, 그 시각에 고를 RELEASED 버전의 변수·행.
     * 룰마다 따로 읽을 것을 묶을 뿐 읽는 행은 같다. 저장값을 해석하지 않으므로 손상으로 던지지 않는다(손상 판단은 {@link #rule} 이 지금처럼 한다).
     * 엔진이 실제로 정의를 물을 룰만 넘긴다(흐름 구조가 올바를 때 트리의 룰).
     */
    public void prefetch(Collection<String> ruleIds, Instant evalTs) {
        headers(ruleIds);
        List<String> missing = ruleIds.stream().filter(id -> headers.get(id).isPresent() && !versions.containsKey(id)).distinct().toList();
        if (!missing.isEmpty()) {
            Map<String, List<MdmRuleVer>> found = new HashMap<>();
            for (MdmRuleVer v : queries.versionsOf(missing)) {            // 룰 ID·VER 내림차순 — 룰마다 versions(ruleId) 와 같은 순서
                found.computeIfAbsent(v.getMaruRuleId(), k -> new ArrayList<>()).add(v);
            }
            missing.forEach(id -> versions.put(id, found.getOrDefault(id, List.of())));
        }
        LocalDateTime now = LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST);
        Map<String, BigDecimal> pairs = new LinkedHashMap<>();
        for (String id : ruleIds) {
            if (headers.get(id).isEmpty() || pairs.containsKey(id)) {
                continue;
            }
            RuleVersions.currentReleased(versions.get(id), now).map(MdmRuleVer::getVer)
                    .filter(ver -> !definitions.containsKey(key(id, ver)) && !prefetched.containsKey(key(id, ver)))
                    .ifPresent(ver -> pairs.put(id, ver));
        }
        if (pairs.isEmpty()) {
            return;
        }
        Map<String, List<MdmRuleVar>> vars = queries.varsOf(pairs);
        Map<String, List<MdmRuleRow>> rows = queries.rowsOf(pairs);
        pairs.forEach((id, ver) -> prefetched.put(key(id, ver), new Raw(vars.get(id), rows.get(id))));
    }

    /**
     * 룰 헤더 — 이 조회기가 이미 읽은 것은 다시 읽지 않고, 나머지만 한 번에 읽는다. 없는 룰은 빠진다. 폐기 룰 경고({@code RuleSetRunner})가 판정 때
     * 읽은 헤더를 다시 읽지 않게 한다.
     */
    public Map<String, MdmRule> headers(Collection<String> ruleIds) {
        List<String> missing = ruleIds.stream().filter(id -> !headers.containsKey(id)).distinct().toList();
        if (!missing.isEmpty()) {
            Map<String, MdmRule> found = new HashMap<>();
            rules.findAllById(missing).forEach(r -> found.put(r.getMaruRuleId(), r));
            missing.forEach(id -> headers.put(id, Optional.ofNullable(found.get(id))));
        }
        Map<String, MdmRule> out = new LinkedHashMap<>();
        for (String id : ruleIds) {
            headers.get(id).ifPresent(r -> out.put(id, r));
        }
        return out;
    }

    /** 판정 시각에 적용되는 RELEASED 세트 버전({@link RuleVersions#currentReleased}). 한 인스턴스 안에서 (세트, 시각)마다 캐시한다. */
    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        String key = setId + "@" + evalTs;
        Optional<RuleSetDefinition> known = setCache.get(key);
        if (known == null) {
            known = loadSet(setId, evalTs);
            setCache.put(key, known);
        }
        return known;
    }

    private Optional<RuleSetDefinition> loadSet(String setId, Instant evalTs) {
        Optional<MdmRuleSet> parent = sets.findById(setId);
        if (parent.isEmpty()) {
            return Optional.empty();
        }
        LocalDateTime at = LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST);
        List<MdmRuleSetVer> versions = setVersions.versions(setId);
        String status = RuleVersions.effectiveStatus(parent.get().getStatus(), versions, at);
        return RuleVersions.currentReleased(versions, at).map(v -> toDefinition(setId, status, v));
    }

    /**
     * 세트의 RELEASED 버전 전부(적용 시작이 있는 것), VER 오름차순 — MDM 메타 피드(spec 2026-10-02-mdm-meta-cache-design §4.1)가 업무 모듈 캐시에
     * 보낸다. 받는 쪽은 {@link #ruleSet} 과 같은 규칙({@code APPLY_FROM <= t < APPLY_TO}, 여럿이면 VER 최대)으로 판정 시각마다 고른다.
     * 상태는 버전마다 그 적용 시작 시각의 계산 상태다 — 고를 수 있는 시각 t({@code >= APPLY_FROM})의 {@link RuleVersions#effectiveStatus} 와 늘 같다
     * (저장 CREATED 는 INUSE, 그 밖에는 저장값). 세트가 없으면 빈 값, 있는데 RELEASED 가 없으면 빈 목록이다. 정의 조립은 {@link #ruleSet} 과 같은 길이다.
     */
    public Optional<List<RuleSetDefinition>> releasedSets(String setId) {
        Optional<MdmRuleSet> parent = sets.findById(setId);
        if (parent.isEmpty()) {
            return Optional.empty();
        }
        List<MdmRuleSetVer> versions = setVersions.versions(setId);
        List<RuleSetDefinition> out = new ArrayList<>();
        for (MdmRuleSetVer v : versions) {
            if ("RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null) {
                out.add(toDefinition(setId, RuleVersions.effectiveStatus(parent.get().getStatus(), versions, v.getApplyFrom()), v));
            }
        }
        out.sort(Comparator.comparing(RuleSetDefinition::ver)); // scale 3 BigDecimal — compareTo 수 비교
        return Optional.of(out);
    }

    /** 저장값 읽기 — 저장된 값이 깨져 난 예외를 {@link StoredDefinitionException} 으로 감싼다(메시지는 원인 그대로). */
    private static <T> T readStored(Supplier<T> read) {
        try {
            return read.get();
        } catch (IllegalArgumentException | IllegalStateException | BusinessException e) {
            throw new StoredDefinitionException(e.getMessage(), e);
        }
    }

    private Optional<RuleDefinition> load(String ruleId, Instant evalTs) {
        MdmRule rule = header(ruleId).orElse(null);
        if (rule == null) {
            return Optional.empty();
        }
        LocalDateTime now = LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST);
        Optional<MdmRuleVer> ver = RuleVersions.currentReleased(versions(ruleId), now);
        if (ver.isEmpty()) {
            return Optional.empty();
        }
        MdmRuleVer v = ver.get();
        String key = key(ruleId, v.getVer());
        Optional<RuleDefinition> known = definitions.get(key);
        if (known == null) {
            // 저장값 손상은 캐시하지 않는다 — 던지면 다음 호출이 다시 읽는다(예전과 같다).
            Raw raw = prefetched.remove(key);
            known = Optional.of(readStored(() -> definition(ruleId, rule.getRuleKind(),
                    raw == null ? stored.read(ruleId, v, scope()) : stored.read(ruleId, v, raw.vars(), raw.rows(), scope()))));
            definitions.put(key, known);
        }
        return known;
    }

    /** 정의 캐시 키 — 버전은 scale 3 문자열({@code R@1.001})이라 SQLite 가 돌려준 scale 과 무관하다. */
    private static String key(String ruleId, BigDecimal ver) {
        return ruleId + "@" + VersionNumbers.plain(ver);
    }

    private Optional<MdmRule> header(String ruleId) {
        Optional<MdmRule> known = headers.get(ruleId);
        if (known == null) {
            known = rules.findById(ruleId);
            headers.put(ruleId, known);
        }
        return known;
    }

    private List<MdmRuleVer> versions(String ruleId) {
        List<MdmRuleVer> known = versions.get(ruleId);
        if (known == null) {
            known = queries.versions(ruleId);
            versions.put(ruleId, known);
        }
        return known;
    }

    private RuleVarTypeResolver.Scope scope() {
        if (scope == null) {
            scope = stored.scope();
        }
        return scope;
    }

    /**
     * 조립한 정의. 셀을 만들지 못한 행이 있으면 던진다 — 조립기는 그 행을 빼고({@code skippedRows}, 실패가 난 행과 같은 집합) 정의를 만들므로
     * 그대로 쓰면 운영 판정이 깨진 행을 조용히 건너뛰어 다른 행(기본 행 등)으로 넘어간다.
     */
    private RuleDefinition definition(String ruleId, String ruleKind, StoredRuleDefinitions.Stored s) {
        RuleDefinitionAssembler.Assembled a = stored.assemble(ruleId, ruleKind, s, scope());
        if (!a.failures().isEmpty() || !a.skippedRows().isEmpty()) {
            String detail = a.failures().stream().map(f -> "row " + f.rowId() + " var_id " + f.varId() + ": " + f.message())
                    .collect(Collectors.joining("; "));
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "룰 " + ruleId + " 버전 " + s.version().getVer()
                    + " 의 저장된 행을 조립할 수 없어 판정하지 않습니다 — " + (detail.isEmpty() ? "행 " + a.skippedRows() : detail), List.of());
        }
        return a.definition();
    }

    private static RuleSetDefinition toDefinition(String setId, String status, MdmRuleSetVer v) {
        List<String> ids = readStored(() -> DomainJson.readList(v.getRuleIds()).stream().map(String::valueOf).toList());
        return new RuleSetDefinition(setId, v.getVer(), v.getApplyFrom(), v.getApplyTo(), ids, SetStatus.valueOf(status),
                v.getFlowJson() == null ? null : readStored(() -> RuleSetFlowJson.parse(v.getFlowJson())));
    }
}
