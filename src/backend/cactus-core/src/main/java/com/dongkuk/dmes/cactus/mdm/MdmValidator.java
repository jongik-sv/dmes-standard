package com.dongkuk.dmes.cactus.mdm;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator.ValidationResult;
import kr.dongkuk.maru.mdm.engine.domain.EffectiveExpressions;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 서버 저장 검증기(하위 프로젝트 C spec docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md §6, C4~C9). 업무 서비스
 * {@code save()} 가 명시적으로 부른다 — 검사할 컬럼·룰 세트를 요청에 적는다.
 *
 * <p>순서(§6.2): 행 거르기(삭제 행 건너뜀) → 키 정규화(물리명, 예약 키 제외) → <b>미리 받기</b>(호출자 스레드, 종류마다 묶음 한 번 — 컬럼·룰 세트와
 * 그 룰·식이 참조하는 코드) → 컬럼마다 길이·소수(cactus) → {@link DomainValidator}(엔진) → 룰 세트마다 {@link RuleEngine#evaluateSet}(엔진).
 * 엔진 평가는 캐시 전용 조회기({@link MdmCachedDefinitions})로만 한다 — 평가 중에 MDM 을 부르지 않는다(C6). 평가 중 캐시 부재는 검증 한 번의
 * 부재 기록기로 잡아 "검증 불가"로 돌린다(엔진 예외 문구에 기대지 않는다).
 *
 * <p>검증 불가 정책(C7): {@link OnUnavailable#REJECT}(기본)면 {@link #check} 가 {@code MDM_UNAVAILABLE} 로 저장을 막고,
 * {@link OnUnavailable#PASS} 면 WARN 을 남기고 그 항목만 건너뛴다.
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

    /**
     * @param evaluator 엔진 식 평가기 — 식 텍스트를 AST 로 풀어 참조 코드를 찾을 때 그 설정을 쓴다. {@code domains}·{@code rules} 와 함께 캐시 전용
     *                  조회기({@link MdmCachedDefinitions})로 만든 것이어야 한다
     */
    public MdmValidator(MdmMetaService service, MdmEvaluator evaluator, DomainValidator domains, RuleEngine rules,
                        OnUnavailable onUnavailable, Clock clock) {
        this.service = Objects.requireNonNull(service, "service");
        this.evaluator = Objects.requireNonNull(evaluator, "evaluator");
        this.domains = Objects.requireNonNull(domains, "domains");
        this.rules = Objects.requireNonNull(rules, "rules");
        this.onUnavailable = onUnavailable == null ? OnUnavailable.REJECT : onUnavailable;
        this.clock = Objects.requireNonNull(clock, "clock");
        this.refs = new MdmExprRefs(evaluator.configuration());
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

    /** 검사만 한다(던지지 않는다 — 단, 사전에 없는 컬럼·룰 세트는 프로그램 결함이라 {@code IllegalArgumentException}). */
    public MdmValidationResult validate(MdmValidationRequest request) {
        Objects.requireNonNull(request, "request");
        Instant ts = request.evalTs() != null ? request.evalTs() : clock.instant();
        Plan plan = prefetch(request, ts);
        List<ErrorDetail> errors = new ArrayList<>();
        Set<String> unavailable = new LinkedHashSet<>(plan.unavailable);
        Map<Integer, List<RuleSetResult>> results = new LinkedHashMap<>();
        MdmCachedDefinitions.MissLog misses = new MdmCachedDefinitions.MissLog();

        List<Map<String, Object>> rows = request.rows();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i) == null ? Map.of() : rows.get(i);
            if (deleted(row)) {
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
        return new MdmValidationResult(errors, new ArrayList<>(unavailable), results);
    }

    // ------------------------------------------------------------------ 미리 받기

    /**
     * 미리 받은 결과.
     *
     * @param columns      요청 컬럼 이름 → 물리명(요청 순서, 물리명 중복 제거)
     * @param skippedItems 검증 불가로 건너뛸 항목({@code COLUMN:물리명}·{@code RULE_SET:ID})
     * @param unavailable  검증 불가 원인 {@code 종류:키}
     */
    private record Plan(Map<String, String> columns, Map<String, MdmColumnMeta> metas, Set<String> skippedItems, Set<String> unavailable) {
    }

    @SuppressWarnings("unchecked")
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
        Set<String> skipped = new LinkedHashSet<>();
        Map<String, Set<String>> codesByItem = new LinkedHashMap<>(); // 항목 → 그 항목이 참조하는 마루 코드 ID

        // 컬럼
        Map<String, MdmColumnMeta> metas = new LinkedHashMap<>();
        if (!physSeen.isEmpty()) {
            MdmMetaService.MdmLookup found = service.lookup(MdmTargetType.COLUMN, physSeen);
            if (!found.missing().isEmpty()) {
                throw new IllegalArgumentException("컬럼 사전에 없는 컬럼입니다: " + found.missing());
            }
            for (String phys : found.unavailable()) {
                skip(item(MdmTargetType.COLUMN, phys), item(MdmTargetType.COLUMN, phys), skipped, unavailable);
            }
            found.found().forEach((phys, v) -> {
                MdmColumnMeta m = (MdmColumnMeta) v;
                metas.put(phys, m);
                codesByItem.put(item(MdmTargetType.COLUMN, phys), refs.columnCodes(m));
            });
        }

        // 룰 세트와 그 룰
        Set<String> setIds = new LinkedHashSet<>(request.ruleSets());
        if (!setIds.isEmpty()) {
            MdmMetaService.MdmLookup sets = service.lookup(MdmTargetType.RULE_SET, setIds);
            if (!sets.missing().isEmpty()) {
                throw new IllegalArgumentException("MDM 에 없는 룰 세트입니다: " + sets.missing());
            }
            for (String setId : sets.unavailable()) {
                skip(item(MdmTargetType.RULE_SET, setId), item(MdmTargetType.RULE_SET, setId), skipped, unavailable);
            }
            Map<String, Set<String>> rulesBySet = new LinkedHashMap<>();
            sets.found().forEach((setId, v) -> MdmDefinitionLookup.selectSet((List<RuleSetDefinition>) v, ts).ifPresent(set -> {
                rulesBySet.put(setId, MdmExprRefs.ruleIds(set));
                codesByItem.put(item(MdmTargetType.RULE_SET, setId), new LinkedHashSet<>(refs.flowCodes(set)));
            })); // 판정 시각에 적용되는 버전이 없으면 엔진이 SET_NOT_FOUND 로 행 오류를 낸다
            Set<String> ruleIds = new LinkedHashSet<>();
            rulesBySet.values().forEach(ruleIds::addAll);
            if (!ruleIds.isEmpty()) {
                MdmMetaService.MdmLookup ruleDefs = service.lookup(MdmTargetType.RULE, ruleIds);
                rulesBySet.forEach((setId, ids) -> {
                    String setItem = item(MdmTargetType.RULE_SET, setId);
                    for (String ruleId : ids) {
                        if (ruleDefs.unavailable().contains(ruleId)) {
                            skip(setItem, item(MdmTargetType.RULE, ruleId), skipped, unavailable);
                        }
                        Object def = ruleDefs.found().get(ruleId); // MDM 에 없는 룰은 엔진이 RULE_NOT_FOUND 로 행 오류를 낸다
                        if (def != null) {
                            MdmDefinitionLookup.select((List<RuleDefinition>) def, ts)
                                    .ifPresent(rule -> codesByItem.get(setItem).addAll(refs.ruleCodes(rule)));
                        }
                    }
                });
            }
        }

        // 식이 참조하는 마루 코드
        Set<String> codeIds = new LinkedHashSet<>();
        codesByItem.forEach((itemKey, ids) -> {
            if (!skipped.contains(itemKey)) {
                codeIds.addAll(ids);
            }
        });
        if (!codeIds.isEmpty()) {
            MdmMetaService.MdmLookup codes = service.lookup(MdmTargetType.CODE, codeIds);
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
        return new Plan(columns, metas, skipped, unavailable);
    }

    private static void skip(String itemKey, String cause, Set<String> skipped, Set<String> unavailable) {
        skipped.add(itemKey);
        unavailable.add(cause);
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
     * 행 하나를 물리명 키로 본 것. 예약 키({@code rowStatus}·{@code rowKey}·{@code _} 접두·EvalEx 상수·{@code EVAL_TS}·받는 노드 이름)와
     * 스칼라가 아닌 값은 뺀다. 물리명이 겹치면 앞의 키를 쓴다.
     */
    private static final class RowView {

        final String grid;
        final int index;
        final String rowKey;
        /** 물리명 → 원래 키. */
        final Map<String, String> original = new LinkedHashMap<>();
        /** 물리명 → 값(Double·Float 는 BigDecimal 로). */
        final Map<String, Object> values = new LinkedHashMap<>();

        RowView(String grid, int index, Map<String, Object> row) {
            this.grid = grid;
            this.index = index;
            Object key = row.get("rowKey");
            this.rowKey = key == null ? null : key.toString();
            row.forEach((k, v) -> {
                String phys = MdmNames.toPhysName(k);
                if (phys == null || reserved(k, phys) || !scalar(v) || original.containsKey(phys)) {
                    return;
                }
                original.put(phys, k);
                values.put(phys, normalize(v));
            });
        }

        boolean has(String phys) {
            return values.containsKey(phys);
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
        String phys = meta.physName() != null ? MdmNames.toPhysName(meta.physName()) : MdmNames.toPhysName(requestName);
        String field = row.original.getOrDefault(phys, requestName);
        String caption = MdmValueChecks.caption(meta, field);
        Object raw = row.values.get(phys);
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
        for (String n : need) {
            String p = MdmNames.toPhysName(n);
            if (p != null && row.has(p)) {
                record.putIfAbsent(p, row.values.get(p));
            } else {
                absent.add(n);
            }
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
        Map<String, Object> record = Collections.unmodifiableMap(new LinkedHashMap<>(row.values));
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

    /** 받는 노드가 받지 않은 엔진 위반 하나 → 행 오류(C8). field 는 위반 이름의 원래 키, 행에 없으면 null. */
    private ErrorDetail ruleError(RowView row, String setId, Violation v) {
        String phys = v.name() == null ? null : MdmNames.toPhysName(v.name());
        String field = phys == null ? null : row.original.get(phys);
        String label = phys == null ? null : service.cached(MdmTargetType.COLUMN, phys) // 캐시만 — 캡션을 얻으려고 MDM 을 부르지 않는다
                .filter(e -> !e.absent()).map(e -> MdmValueChecks.caption((MdmColumnMeta) e.value(), field != null ? field : v.name()))
                .orElse(field != null ? field : v.name());
        if (label != null && (v.code() == Code.MISSING_KEY || v.code() == Code.REQUIRED_NULL)) {
            return row.error(field, REQUIRED, MdmValueChecks.requiredMessage(label));
        }
        String prefix = label != null ? label : "룰 세트 " + setId;
        return row.error(field, INVALID, prefix + ": " + v.message());
    }
}
