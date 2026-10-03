package com.dongkuk.dmes.cactus.mdm;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.ValidationResult;
import kr.dongkuk.maru.mdm.engine.domain.EffectiveExpressions;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MasterBaseDt;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 서버 저장 검증기(하위 프로젝트 C spec docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md §6, C4~C9). 업무 서비스
 * {@code save()} 가 명시적으로 부른다 — 검사할 컬럼·룰 세트를 요청에 적는다.
 *
 * <p>순서(§6.2): 행 거르기(삭제 행 건너뜀) → 키 정규화(물리명, 예약 키 제외) → <b>미리 받기</b>(호출자 스레드, 종류마다 묶음 한 번 — 컬럼·룰 세트와
 * 그 룰·식이 참조하는 코드) → 컬럼마다 길이·소수(cactus) → {@link DomainValidator}(엔진) → 룰 세트마다 {@link RuleEngine#evaluateSet}(엔진).
 * 엔진 평가는 캐시 전용 조회기({@link MdmCachedDefinitions})로만 한다 — 평가 중에 MDM 을 부르지 않는다(C6). 그 엔진은 검증기가 스스로 만들고
 * 빈으로 받지도 내놓지도 않는다(모듈의 엔진 빈과 섞이지 않게). 평가 중 캐시 부재는 검증 한 번의
 * 부재 기록기로 잡아 "검증 불가"로 돌린다(엔진 예외 문구에 기대지 않는다).
 *
 * <p>검증 불가 정책(C7): {@link OnUnavailable#REJECT}(기본)면 {@link #check} 가 {@code MDM_UNAVAILABLE} 로 저장을 막고,
 * {@link OnUnavailable#PASS} 면 WARN 을 남기고 그 항목만 건너뛴다.
 *
 * <p>사전에 없는 정의(2026-10-03 결정): 요청한 컬럼·룰 세트가 MDM 에 없으면(받을 수 없음과 다르다) 예외 없이 검사에서 빼고
 * {@link MdmValidationResult#missing()} 에 담으며 WARN 을 한 번 남긴다. 업무 서비스의 예외는 일반 오류 경로로 문구가 그대로 화면에 나가고,
 * MDM 관리자가 컬럼 이름을 바꾸거나 지우기만 해도 업무 저장이 막히기 때문이다. 이 정의는 검증 불가(unavailable)가 아니라 {@link #check} 도
 * REJECT 에서 던지지 않는다.
 */
public class MdmValidator {

    private static final Logger log = LoggerFactory.getLogger(MdmValidator.class);

    /** 검증 불가 시 동작(spec C7, {@code cactus.mdm.validation.on-unavailable}). */
    public enum OnUnavailable { REJECT, PASS }

    public static final String UNAVAILABLE_CODE = "MDM_UNAVAILABLE";
    public static final String UNAVAILABLE_MESSAGE = "MDM 정의를 받을 수 없어 검증하지 못했습니다. 잠시 뒤 다시 시도하세요";
    public static final String INVALID_MESSAGE = "입력값을 확인해주세요.";

    private static final String REQUIRED = ErrorCode.REQUIRED_VALUE.getCode();
    private static final String INVALID = ErrorCode.INVALID_VALUE.getCode();
    /** 엔진에 넘기지 않는 저장 목록 키(물리명으로 바꾼 뒤 비교). */
    private static final Set<String> ROW_META_KEYS = Set.of("ROW_STATUS", "ROW_KEY");

    private final MdmMetaService service;
    private final MdmEvaluator evaluator;
    private final DomainValidator domains;
    private final RuleEngine rules;
    private final OnUnavailable onUnavailable;
    private final Clock clock;
    private final MdmExprRefs refs;
    /** 로그에 싣는 이 모듈 코드(mls 등). 모르면 "-". */
    private final String module;

    /**
     * 캐시 전용 엔진(평가기·도메인 검증기·룰 엔진)을 스스로 만든다 — 모두 {@link MdmCachedDefinitions} 위에서. 엔진을 밖에서 받지 않는 것은 평가 중
     * MDM 호출 금지(C6)와 캐시 부재 = 검증 불가(C7)를 빈 배선에 맡기지 않기 위해서다: 모듈이 자기 업무 룰용으로 {@code MdmDefinitionLookup} 위에
     * 만든 엔진(평가 중 MDM 을 부를 수 있다)이 검증기에 끼어들 수 없다.
     *
     * @param functions 비즈니스 함수 공급자(없으면 {@link FunctionProvider#NONE}). 마루 데이터 대상 MASTER 는 지원하지 않는다(MasterLookup.NONE, §6.4)
     */
    public MdmValidator(MdmMetaService service, FunctionProvider functions, OnUnavailable onUnavailable, Clock clock) {
        this(service, functions, onUnavailable, clock, null);
    }

    /** @param module 이 모듈 코드 — 사전에 없는 정의를 건너뛰며 남기는 WARN 로그에 싣는다(null 이면 "-"). 자동 설정이 {@code cactus.mdm.module} 을 준다 */
    public MdmValidator(MdmMetaService service, FunctionProvider functions, OnUnavailable onUnavailable, Clock clock, String module) {
        this(service, cacheOnlyEvaluator(service, functions), onUnavailable, clock, module);
    }

    private MdmValidator(MdmMetaService service, MdmEvaluator evaluator, OnUnavailable onUnavailable, Clock clock, String module) {
        this.module = module == null || module.isBlank() ? "-" : module.trim();
        this.service = Objects.requireNonNull(service, "service");
        this.evaluator = evaluator;
        MdmCachedDefinitions cached = new MdmCachedDefinitions(service);
        this.domains = new DefaultDomainValidator(cached, evaluator);
        this.rules = new MdmRuleEngine(evaluator, cached);
        this.onUnavailable = onUnavailable == null ? OnUnavailable.REJECT : onUnavailable;
        this.clock = Objects.requireNonNull(clock, "clock");
        this.refs = new MdmExprRefs(evaluator.configuration());
    }

    private static MdmEvaluator cacheOnlyEvaluator(MdmMetaService service, FunctionProvider functions) {
        MdmCachedDefinitions cached = new MdmCachedDefinitions(Objects.requireNonNull(service, "service"));
        return new MdmEvaluator(new EngineLookups(cached, cached, cached, MasterLookup.NONE,
                functions == null ? FunctionProvider.NONE : functions));
    }

    public OnUnavailable onUnavailable() {
        return onUnavailable;
    }

    /**
     * 오류가 있으면 {@code BusinessException(INVALID_VALUE, "입력값을 확인해주세요.", errors)}. 검증 불가가 있으면 C7 정책 — REJECT 는
     * {@code BusinessException(BUSINESS_ERROR, UNAVAILABLE_MESSAGE, [MDM_UNAVAILABLE, …값 오류])}(첫 상세가 검증 불가, 그 뒤에 찾은 값 오류를
     * 함께 싣는다), PASS 는 WARN 을 남기고 넘어간다.
     */
    public MdmValidationResult check(MdmValidationRequest request) {
        MdmValidationResult r = validate(request);
        if (!r.unavailable().isEmpty()) {
            if (onUnavailable == OnUnavailable.REJECT) {
                List<ErrorDetail> details = new ArrayList<>();
                details.add(new ErrorDetail(request.grid(), null, null, null, UNAVAILABLE_CODE, UNAVAILABLE_MESSAGE));
                details.addAll(r.errors());
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, UNAVAILABLE_MESSAGE, details);
            }
            log.warn("[mdm] 검증하지 못한 정의를 건너뛰고 저장을 통과시킨다(on-unavailable=PASS) — grid={} {}", request.grid(), r.unavailable());
        }
        if (!r.errors().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, INVALID_MESSAGE, r.errors());
        }
        return r;
    }

    /**
     * 검사만 한다(던지지 않는다). MDM 에 없는 컬럼·룰 세트는 검사에서 빼고 {@link MdmValidationResult#missing()} 에 담으며 WARN 을 한 번 남긴다 —
     * MDM 관리자가 컬럼 이름을 바꾸거나 지워도 업무 저장이 막히지 않게(예외를 던지면 일반 오류 경로로 문구가 그대로 화면에 나간다). 컬럼 이름이 빈
     * 값이면 호출 코드의 결함이라 {@code IllegalArgumentException}.
     */
    public MdmValidationResult validate(MdmValidationRequest request) {
        Objects.requireNonNull(request, "request");
        Instant ts = request.evalTs() != null ? request.evalTs() : clock.instant();
        Plan plan = prefetch(request, ts);
        if (!plan.missing.isEmpty()) {
            log.warn("[mdm] MDM 에 없는 정의를 검사에서 뺀다(MDM 에서 이름이 바뀌었거나 지워졌는지 확인) — module={} grid={} missing={}",
                    module, request.grid(), plan.missing);
        }
        List<ErrorDetail> errors = new ArrayList<>();
        Set<String> unavailable = new LinkedHashSet<>(plan.unavailable);
        Map<Integer, List<RuleSetResult>> results = new LinkedHashMap<>();
        MdmCachedDefinitions.MissLog misses = new MdmCachedDefinitions.MissLog();

        List<Map<String, Object>> rows = request.rows();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            if (row == null || deleted(row)) { // null 행은 빈 행으로 검사하지 않는다(필수 칸마다 E001 이 난다) — 서비스가 저장하지 않는 자리다
                continue;
            }
            RowView view = new RowView(request.grid(), i, row);
            for (Map.Entry<String, String> col : plan.columns.entrySet()) {
                if (!plan.skippedItems.contains(item(MdmTargetType.COLUMN, col.getValue()))) {
                    checkColumn(view, col.getKey(), plan.metas.get(col.getValue()), ts, misses, errors, unavailable);
                }
            }
            for (String setId : request.ruleSets()) {
                if (!plan.skippedItems.contains(item(MdmTargetType.RULE_SET, setId))) {
                    checkRuleSet(view, setId, ts, misses, errors, unavailable, results);
                }
            }
        }
        return new MdmValidationResult(errors, new ArrayList<>(unavailable), results, new ArrayList<>(plan.missing));
    }

    // ------------------------------------------------------------------ 미리 받기

    /**
     * 미리 받은 결과.
     *
     * @param columns      요청 컬럼 이름 → 물리명(요청 순서, 물리명 중복 제거)
     * @param skippedItems 검사에서 뺄 항목({@code COLUMN:물리명}·{@code RULE_SET:ID}) — 검증 불가(unavailable)이거나 MDM 에 없는(missing) 것
     * @param unavailable  검증 불가 원인 {@code 종류:키}
     * @param missing      MDM 에 없어 뺀 항목 {@code 종류:키}(검증 불가가 아니다 — REJECT 에서도 저장을 막지 않는다)
     */
    private record Plan(Map<String, String> columns, Map<String, MdmColumnMeta> metas, Set<String> skippedItems, Set<String> unavailable,
                        Set<String> missing) {
    }

    private Plan prefetch(MdmValidationRequest request, Instant ts) {
        Map<String, String> columns = new LinkedHashMap<>();
        Set<String> physSeen = new LinkedHashSet<>();
        for (String name : request.columns()) {
            String phys = MdmNames.toPhysName(name);
            if (phys == null) {
                throw new IllegalArgumentException("검사할 컬럼 이름이 비었습니다");
            }
            if (physSeen.add(phys)) {
                columns.put(name, phys);
            }
        }
        Set<String> unavailable = new LinkedHashSet<>();
        Set<String> missing = new LinkedHashSet<>();
        Set<String> skipped = new LinkedHashSet<>();
        Map<String, Set<String>> codesByItem = new LinkedHashMap<>(); // 항목 → 그 항목이 참조하는 마루 코드 ID
        Map<String, Set<MdmExprRefs.MasterAtRef>> atByItem = new LinkedHashMap<>(); // 항목 → 그 항목의 MASTER_AT 기준 시각

        // 컬럼
        Map<String, MdmColumnMeta> metas = new LinkedHashMap<>();
        if (!physSeen.isEmpty()) {
            MdmMetaService.MdmLookup found = service.lookup(MdmTargetType.COLUMN, physSeen);
            for (String phys : found.missing()) {
                skipMissing(item(MdmTargetType.COLUMN, phys), skipped, missing);
            }
            for (String phys : found.unavailable()) {
                skip(item(MdmTargetType.COLUMN, phys), item(MdmTargetType.COLUMN, phys), skipped, unavailable);
            }
            found.found().forEach((phys, v) -> {
                MdmColumnMeta m = (MdmColumnMeta) v;
                metas.put(phys, m);
                codesByItem.put(item(MdmTargetType.COLUMN, phys), refs.columnCodes(m));
                atByItem.put(item(MdmTargetType.COLUMN, phys), new LinkedHashSet<>(refs.columnMasterAt(m)));
            });
        }

        // 룰 세트와 그 룰 — 판정 시각 ts 의 버전(목차로 고른다, D-154 스펙 §7.2)
        Set<String> setIds = new LinkedHashSet<>(request.ruleSets());
        if (!setIds.isEmpty()) {
            MdmMetaService.MdmAtLookup sets = service.lookupAt(MdmTargetType.RULE_SET, setIds, ts);
            for (String setId : sets.missing()) {
                skipMissing(item(MdmTargetType.RULE_SET, setId), skipped, missing);
            }
            for (String setId : sets.unavailable()) {
                skip(item(MdmTargetType.RULE_SET, setId), item(MdmTargetType.RULE_SET, setId), skipped, unavailable);
            }
            Map<String, Set<String>> rulesBySet = new LinkedHashMap<>();
            sets.found().forEach((setId, at) -> {
                if (at.body() instanceof RuleSetDefinition set) { // 적용 버전이 없으면 엔진이 SET_NOT_FOUND 로 행 오류를 낸다
                    rulesBySet.put(setId, MdmExprRefs.ruleIds(set));
                    codesByItem.put(item(MdmTargetType.RULE_SET, setId), new LinkedHashSet<>(refs.flowCodes(set)));
                    atByItem.put(item(MdmTargetType.RULE_SET, setId), new LinkedHashSet<>(refs.flowMasterAt(set)));
                }
            });
            Set<String> ruleIds = new LinkedHashSet<>();
            rulesBySet.values().forEach(ruleIds::addAll);
            if (!ruleIds.isEmpty()) {
                MdmMetaService.MdmAtLookup ruleDefs = service.lookupAt(MdmTargetType.RULE, ruleIds, ts);
                rulesBySet.forEach((setId, ids) -> {
                    String setItem = item(MdmTargetType.RULE_SET, setId);
                    for (String ruleId : ids) {
                        if (ruleDefs.unavailable().contains(ruleId)) {
                            skip(setItem, item(MdmTargetType.RULE, ruleId), skipped, unavailable);
                        }
                        MdmMetaService.MdmAt at = ruleDefs.found().get(ruleId); // MDM 에 없는 룰은 엔진이 RULE_NOT_FOUND 로 행 오류를 낸다
                        if (at != null && at.body() instanceof RuleDefinition rule) {
                            codesByItem.get(setItem).addAll(refs.ruleCodes(rule));
                            atByItem.get(setItem).addAll(refs.ruleMasterAt(rule));
                        }
                    }
                });
            }
        }

        // 식이 참조하는 마루 코드 — 목차 + 판정 시각 본문
        Set<String> codeIds = new LinkedHashSet<>();
        codesByItem.forEach((itemKey, ids) -> {
            if (!skipped.contains(itemKey)) {
                codeIds.addAll(ids);
            }
        });
        if (!codeIds.isEmpty()) {
            MdmMetaService.MdmAtLookup codes = service.lookupAt(MdmTargetType.CODE, codeIds, ts);
            codesByItem.forEach((itemKey, ids) -> {
                for (String id : ids) {
                    if (codes.unavailable().contains(id)) {
                        skip(itemKey, item(MdmTargetType.CODE, id), skipped, unavailable);
                    } else if (codes.missing().contains(id)) {
                        // 마루 코드가 아니면 마루 데이터 대상 MASTER — 지원하지 않는다(§6.4, MasterLookup.NONE)
                        skip(itemKey, "MASTER:" + id, skipped, unavailable);
                    }
                }
            });
        }
        // MASTER_AT 기준 시각의 본문(스펙 §7.3, 결정 P8) — 상수는 그 시각, 행 칸 변수는 행들의 그 칸 값마다. 풀 수 없는 값은 엔진 평가에 맡긴다
        Map<LocalDateTime, Map<String, Set<String>>> byTime = new TreeMap<>(); // 시각 → 코드 → 항목
        atByItem.forEach((itemKey, ats) -> {
            if (skipped.contains(itemKey)) {
                return;
            }
            for (MdmExprRefs.MasterAtRef ref : ats) {
                for (LocalDateTime dt : baseTimes(ref, request.rows())) {
                    byTime.computeIfAbsent(dt, k -> new LinkedHashMap<>()).computeIfAbsent(ref.codeId(), k -> new LinkedHashSet<>()).add(itemKey);
                }
            }
        });
        byTime.forEach((dt, byCode) -> {
            MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.CODE, byCode.keySet(), dt.atZone(MdmDefinitionLookup.KST).toInstant());
            byCode.forEach((id, items) -> {
                if (r.unavailable().contains(id)) {
                    items.forEach(itemKey -> skip(itemKey, item(MdmTargetType.CODE, id), skipped, unavailable));
                }
            });
        });
        return new Plan(columns, metas, skipped, unavailable, missing);
    }

    /** MASTER_AT 기준 시각 — 상수면 그 시각, 변수면 삭제가 아닌 행마다 그 물리명 칸이 하나뿐이고 문자열이며 풀리는 값. */
    private static Set<LocalDateTime> baseTimes(MdmExprRefs.MasterAtRef ref, List<Map<String, Object>> rows) {
        if (ref.at() != null) {
            return Set.of(ref.at());
        }
        String phys = MdmNames.toPhysName(ref.var());
        Set<LocalDateTime> out = new LinkedHashSet<>();
        if (phys == null) {
            return out;
        }
        for (Map<String, Object> row : rows) {
            if (row == null || deleted(row)) {
                continue;
            }
            Object value = null;
            int n = 0;
            for (Map.Entry<String, Object> e : row.entrySet()) {
                if (phys.equals(MdmNames.toPhysName(e.getKey()))) {
                    n++;
                    value = e.getValue();
                }
            }
            if (n == 1 && value instanceof String s) { // 칸이 겹치면 미리 받지 않는다 — 검사 단계가 형식 오류로 잡는다
                MasterBaseDt.parse(s).ifPresent(out::add);
            }
        }
        return out;
    }

    private static void skip(String itemKey, String cause, Set<String> skipped, Set<String> unavailable) {
        skipped.add(itemKey);
        unavailable.add(cause);
    }

    /** MDM 에 없는 항목 — 검사에서 빼되 검증 불가(unavailable)로 세지 않는다. */
    private static void skipMissing(String itemKey, Set<String> skipped, Set<String> missing) {
        skipped.add(itemKey);
        missing.add(itemKey);
    }

    private static String item(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }

    // ------------------------------------------------------------------ 행

    /** {@code rowStatus} 가 D·deleted 면 삭제 행(대소문자 무시). 없으면(폼) 검사한다. */
    private static boolean deleted(Map<String, Object> row) {
        Object status = row.get("rowStatus");
        if (status == null) {
            return false;
        }
        String s = status.toString().trim();
        return s.equalsIgnoreCase("D") || s.equalsIgnoreCase("deleted");
    }

    /**
     * 행 하나를 물리명 키로 본 것. 예약 키({@code rowStatus}·{@code rowKey}·{@code _} 접두·EvalEx 상수·{@code EVAL_TS}·받는 노드 이름)는 뺀다.
     *
     * <p>칸 하나를 풀 때({@link #cell}) 같은 물리명으로 바뀌는 행 키가 둘 이상이면(예: {@code title}·{@code TITLE}·{@code " TITLE"}) 하나를 고르지
     * 않는다 — 서비스가 저장하는 키와 검증기가 검사하는 키가 갈리면 서버 검증을 우회당한다(행 키 순서는 요청자가 정한다). 값이 스칼라가 아니면(배열·
     * 목록·객체) 빈 값으로 보지 않는다 — 검사 대상 칸이면 둘 다 형식 오류(E002)다. 검사 대상이 아닌 칸은 룰 세트 레코드({@link #scalarRecord})에서
     * 스칼라가 아니면 빠진다.
     */
    private static final class RowView {

        final String grid;
        final int index;
        final String rowKey;
        private final Map<String, Object> row;
        /** 물리명 → 그 물리명으로 바뀌는 원래 키(행 순서). 값이 스칼라가 아닌 키도 담는다. */
        private final Map<String, List<String>> keys = new LinkedHashMap<>();
        /** 형식 오류를 이미 낸 물리명 — 컬럼·비즈니스식 요구 변수·룰 세트가 같은 칸을 봐도 한 번만. */
        private final Set<String> reported = new HashSet<>();

        RowView(String grid, int index, Map<String, Object> row) {
            this.grid = grid;
            this.index = index;
            this.row = row;
            Object key = row.get("rowKey");
            this.rowKey = key == null ? null : key.toString();
            row.forEach((k, v) -> {
                String phys = MdmNames.toPhysName(k);
                if (phys != null && !reserved(k, phys)) {
                    keys.computeIfAbsent(phys, p -> new ArrayList<>(1)).add(k);
                }
            });
        }

        /**
         * 칸 하나. {@code name} 은 요청에 적은 이름(오류 field 를 고를 때 쓴다). 키가 없으면 빈 값, 하나면 그 값, 여럿이면 {@link CellKind#AMBIGUOUS}
         * (field 는 이름·물리명과 글자까지 같은 키, 없으면 이름).
         */
        Cell cell(String name, String phys) {
            List<String> ks = keys.get(phys);
            if (ks == null) {
                return new Cell(CellKind.ABSENT, name, null, List.of());
            }
            if (ks.size() > 1) {
                return new Cell(CellKind.AMBIGUOUS, ks.contains(name) ? name : ks.contains(phys) ? phys : name, null, ks);
            }
            String k = ks.get(0);
            Object v = row.get(k);
            return scalar(v) ? new Cell(CellKind.VALUE, k, normalize(v), ks) : new Cell(CellKind.NON_SCALAR, k, null, ks);
        }

        /** 그 물리명의 원래 키 — 하나뿐일 때만, 아니면 null. */
        String field(String phys) {
            List<String> ks = keys.get(phys);
            return ks != null && ks.size() == 1 ? ks.get(0) : null;
        }

        /** 같은 물리명으로 바뀌는 키가 둘 이상인 물리명. */
        List<String> ambiguous() {
            List<String> out = new ArrayList<>();
            keys.forEach((phys, ks) -> {
                if (ks.size() > 1) {
                    out.add(phys);
                }
            });
            return out;
        }

        /** 룰 세트 레코드 — 키가 하나뿐이고 값이 스칼라인 칸을 물리명 키로(Double·Float 는 BigDecimal 로). */
        Map<String, Object> scalarRecord() {
            Map<String, Object> out = new LinkedHashMap<>();
            keys.forEach((phys, ks) -> {
                if (ks.size() == 1 && scalar(row.get(ks.get(0)))) {
                    out.put(phys, normalize(row.get(ks.get(0))));
                }
            });
            return out;
        }

        /** 이 칸의 형식 오류를 처음 낼 때만 참. */
        boolean firstReport(String phys) {
            return reported.add(phys);
        }

        ErrorDetail error(String field, String code, String message) {
            return new ErrorDetail(grid, rowKey, index, field, code, message);
        }

        private static boolean reserved(String key, String phys) {
            return key.startsWith(ReservedNames.RESERVED_PREFIX) || ROW_META_KEYS.contains(phys) || ReservedNames.CONSTANTS.contains(phys)
                    || phys.equals(ReservedNames.EVAL_TS) || ReservedNames.CATCH_NAMES.contains(phys);
        }

        private static boolean scalar(Object v) {
            return !(v instanceof Map<?, ?> || v instanceof Collection<?> || (v != null && v.getClass().isArray()));
        }
    }

    private enum CellKind { ABSENT, VALUE, AMBIGUOUS, NON_SCALAR }

    /** 행에서 푼 칸 하나 — {@code field} 는 오류에 실을 원래 키, {@code keys} 는 그 물리명으로 바뀌는 행 키 전부. */
    private record Cell(CellKind kind, String field, Object value, List<String> keys) {

        boolean malformed() {
            return kind == CellKind.AMBIGUOUS || kind == CellKind.NON_SCALAR;
        }
    }

    /** 형식 오류(E002) — 별칭 충돌·스칼라가 아닌 값. 같은 행·같은 칸은 한 번만. */
    private static void formatError(RowView row, String phys, Cell cell, String label, List<ErrorDetail> errors) {
        if (!row.firstReport(phys)) {
            return;
        }
        String message = label + ": 값 형식이 올바르지 않습니다";
        if (cell.kind() == CellKind.AMBIGUOUS) {
            message += "(같은 칸을 가리키는 키가 여럿입니다: " + String.join(", ", cell.keys()) + ")";
        }
        errors.add(row.error(cell.field(), INVALID, message));
    }

    /** 캡션 — 캐시에 있는 컬럼 메타로만(MDM 을 부르지 않는다), 없으면 {@code fallback}. */
    private String cachedLabel(String phys, String fallback) {
        return service.cached(MdmTargetType.COLUMN, phys).filter(e -> !e.absent())
                .map(e -> MdmValueChecks.caption((MdmColumnMeta) e.value(), fallback)).orElse(fallback);
    }

    /** JSON 의 Double·Float 를 엔진이 받는 BigDecimal 로(문자열 표기 그대로). */
    static Object normalize(Object v) {
        if ((v instanceof Double || v instanceof Float) && Double.isFinite(((Number) v).doubleValue())) {
            return new BigDecimal(v.toString());
        }
        return v;
    }

    // ------------------------------------------------------------------ 컬럼

    private void checkColumn(RowView row, String requestName, MdmColumnMeta meta, Instant ts, MdmCachedDefinitions.MissLog misses,
                             List<ErrorDetail> errors, Set<String> unavailable) {
        // 행·캐시·엔진에서 이 컬럼을 부르는 이름은 요청 이름이다. 시스템 별칭으로 맞았으면 meta.physName 은 표준 이름이라 행의 별칭 키 칸을 못 찾는다
        // (별칭 매칭 spec L4 — 엔진 정의는 표준 그대로, 이름은 요청 이름).
        String phys = MdmNames.toPhysName(requestName);
        Cell cell = row.cell(requestName, phys);
        String field = cell.field();
        String caption = MdmValueChecks.caption(meta, field);
        if (cell.malformed()) {
            formatError(row, phys, cell, caption, errors);
            return;
        }
        Object raw = cell.value();
        if (raw instanceof String s && s.isBlank()) {
            raw = null;
        }
        Object value = raw;
        if (raw != null) {
            MdmValueChecks.Checked checked = MdmValueChecks.check(meta, raw, caption);
            if (checked.message() != null) {
                errors.add(row.error(field, INVALID, checked.message()));
                return;
            }
            value = checked.value();
        }
        Map<String, Object> record = new LinkedHashMap<>();
        record.put(phys, value);
        Set<String> need = bizVars(meta);
        List<String> absent = new ArrayList<>();
        boolean malformedVar = false;
        for (String n : need) {
            String p = MdmNames.toPhysName(n);
            Cell var = p == null ? null : row.cell(n, p);
            if (var == null || var.kind() == CellKind.ABSENT) {
                absent.add(n);
            } else if (var.malformed()) {
                formatError(row, p, var, cachedLabel(p, var.field()), errors);
                malformedVar = true;
            } else {
                record.putIfAbsent(p, var.value());
            }
        }
        if (malformedVar) {
            return;
        }
        int before = misses.size();
        ValidationResult result;
        try {
            result = MdmCachedDefinitions.recording(misses, () -> domains.validate(null, phys, record, ts));
        } catch (RuntimeException e) {
            if (misses.size() > before) {
                unavailable.addAll(misses.since(before));
                return;
            }
            if (!(e instanceof EngineEvaluationException ee)) {
                throw e;
            }
            log.warn("[mdm] 검증식을 평가하지 못했다 — {} {}", phys, ee.violations());
            errors.add(row.error(field, INVALID, caption + ": 검증 규칙을 평가하지 못했습니다(관리자 확인 필요)"));
            return;
        }
        if (misses.size() > before) {
            unavailable.addAll(misses.since(before));
            return;
        }
        if (result.valid() || result.failures().isEmpty()) {
            return;
        }
        DomainValidator.Failure f = result.failures().get(0);
        switch (f.step()) {
            case REQUIRED -> errors.add(row.error(field, REQUIRED, MdmValueChecks.requiredMessage(caption)));
            case TYPE_CONVERSION -> errors.add(row.error(field, INVALID, MdmValueChecks.typeMessage(meta, caption)));
            case STD_EXPR -> errors.add(row.error(field, INVALID, stdMessage(meta, caption)));
            case BIZ_VAR_MISSING -> errors.add(row.error(field, INVALID,
                    caption + ": 업무 규칙에 필요한 값이 없습니다(" + String.join(", ", absent.isEmpty() ? need : absent) + ")"));
            case BIZ_EXPR -> errors.add(row.error(field, INVALID, caption + ": 업무 규칙을 만족하지 않습니다"));
            case NOT_DEFINED -> unavailable.add(item(MdmTargetType.COLUMN, phys)); // 미리 받은 뒤 캐시에서 빠졌다(기록기에 안 잡힌 경우의 안전망)
        }
    }

    /** 표준식 문구 — 표준식이 없고 코드 참조만 있으면 자동 MASTER(허용 코드) 실패다. */
    private static String stdMessage(MdmColumnMeta meta, String caption) {
        String text = meta.stdExpr() == null ? null : meta.stdExpr().text();
        if ((text == null || text.isBlank()) && meta.codeRef() != null) {
            return caption + ": 허용되지 않은 코드입니다";
        }
        return caption + ": 표준 규칙을 만족하지 않습니다(" + text + ")";
    }

    /** 비즈니스식 요구 변수 — 메타의 목록 ∪ 엔진이 식에서 다시 뽑는 이름(엔진 DefaultDomainValidator 와 같은 합집합). */
    private Set<String> bizVars(MdmColumnMeta meta) {
        Set<String> need = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        String biz = meta.bizExpr() == null ? null : meta.bizExpr().text();
        if (biz == null || biz.isBlank()) {
            return need;
        }
        if (meta.bizRequiredVars() != null) {
            need.addAll(meta.bizRequiredVars());
        }
        try {
            need.addAll(EffectiveExpressions.bizRequiredVars(biz, evaluator));
        } catch (RuntimeException e) {
            // 식이 파싱되지 않으면 엔진이 판정 오류로 알린다
        }
        return need;
    }

    // ------------------------------------------------------------------ 룰 세트

    private void checkRuleSet(RowView row, String setId, Instant ts, MdmCachedDefinitions.MissLog misses, List<ErrorDetail> errors,
                              Set<String> unavailable, Map<Integer, List<RuleSetResult>> results) {
        List<String> ambiguous = row.ambiguous();
        if (!ambiguous.isEmpty()) {
            // 별칭 충돌 칸은 하나를 골라 넘기지도, 빼지도 않는다(빼면 선택 변수로 보고 통과할 수 있다) — 형식 오류로 막고 이 행은 판정하지 않는다
            for (String phys : ambiguous) {
                Cell cell = row.cell(phys, phys);
                formatError(row, phys, cell, cachedLabel(phys, cell.field()), errors);
            }
            return;
        }
        Map<String, Object> record = Collections.unmodifiableMap(row.scalarRecord());
        int before = misses.size();
        RuleSetResult result;
        try {
            result = MdmCachedDefinitions.recording(misses, () -> rules.evaluateSet(setId, record, ts));
        } catch (RuntimeException e) {
            if (misses.size() > before) {
                unavailable.addAll(misses.since(before));
                return;
            }
            if (!(e instanceof EngineEvaluationException ee)) {
                throw e;
            }
            for (Violation v : ee.violations()) {
                errors.add(ruleError(row, setId, v));
            }
            return;
        }
        if (misses.size() > before) {
            unavailable.addAll(misses.since(before));
            return;
        }
        results.computeIfAbsent(row.index, k -> new ArrayList<>()).add(result);
    }

    /**
     * 받는 노드가 받지 않은 엔진 위반 하나 → 행 오류(C8). field 는 위반 이름의 원래 키, 행에 없으면 null.
     *
     * <p>문구는 위반 코드마다 고정이다 — 엔진 문구({@link Violation#message()})에는 룰·조건 식 원문과 Java 예외 문구가 들어 있어 화면에 보내지 않고
     * WARN 로그에만 남긴다(spec B3·§6.2-5, 컬럼 경로의 "검증 규칙을 평가하지 못했습니다" 와 같은 방침).
     */
    private ErrorDetail ruleError(RowView row, String setId, Violation v) {
        log.warn("[mdm] 룰 세트 위반 — set={} grid={} row={} code={} rule={} name={} {}", setId, row.grid, row.index, v.code(), v.ruleId(),
                v.name(), v.message());
        String phys = v.name() == null ? null : MdmNames.toPhysName(v.name());
        String field = phys == null ? null : row.field(phys);
        String label = phys == null ? null : cachedLabel(phys, field != null ? field : v.name()); // 캐시만 — 캡션을 얻으려고 MDM 을 부르지 않는다
        String setLabel = "룰 세트 " + setId;
        return switch (v.code()) {
            case MISSING_KEY, REQUIRED_NULL -> label != null
                    ? row.error(field, REQUIRED, MdmValueChecks.requiredMessage(label))
                    : row.error(field, REQUIRED, setLabel + ": 필수 입력값이 없습니다");
            case TYPE_CONVERSION -> row.error(field, INVALID, (label != null ? label : setLabel) + ": 값 형식이 올바르지 않습니다");
            // 평가 오류의 name 은 행 변수가 아니라 함수 이름일 수 있다 — 행 키와 맞을 때만 캡션을 쓰고 아니면 룰 세트 ID 로 적는다
            default -> row.error(field, INVALID, (field != null ? label : setLabel) + ": 업무 규칙을 평가하지 못했습니다(관리자 확인 필요)");
        };
    }
}
