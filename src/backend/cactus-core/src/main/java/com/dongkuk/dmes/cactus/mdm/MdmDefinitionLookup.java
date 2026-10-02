package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * 엔진 spi 의 업무 모듈 구현(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2) — 정의를 {@link MdmMetaService}(로컬 캐시,
 * 없으면 MDM)에서 꺼낸다. 받을 수 없으면 {@link MdmUnavailableException} 이 엔진 호출자까지 올라간다(정책은 하위 프로젝트 C).
 *
 * <p>룰과 룰 세트(D-144 2단계부터 버전이 있다)는 캐시된 RELEASED 버전 가운데 판정 시각(KST 벽시계)이 {@code APPLY_FROM <= t < APPLY_TO} 인
 * 것, 여럿이면 VER 가 가장 큰 것을 고른다 — MDM {@code RuleVersions.currentReleased} 와 같은 규칙({@link #select(List, Function, Function,
 * Function, Instant)} 하나). "현재 버전"을 캐시하지 않는다(적용 시작일 도래는 쓰기가 없어 기록이 남지 않는다). VER 는 major/minor 소수
 * ({@code BigDecimal}, D-144 — 예 {@code 1.000}·{@code 1.001})라 크기 비교는 {@code compareTo}(수 비교)로 한다.
 */
public class MdmDefinitionLookup implements DefinitionLookup, CodeLookup {

    public static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final MdmMetaService service;

    public MdmDefinitionLookup(MdmMetaService service) {
        this.service = service;
    }

    /**
     * 코드 참조가 있는 컬럼은 코드 원본도 여기서(호출자 스레드) 받아 둔다. 검증기의 자동 MASTER 식은 엔진 평가 스레드에서 {@link #code} 를 부르는데,
     * 그 평가는 시간 한도({@code MdmEvaluator.DEFAULT_TIMEOUT} 1초)가 있고 예외를 평가 오류로 감싼다 — 캐시에 없는 코드를 거기서 MDM 에 받으면
     * 느린 MDM 이 시간 초과로, 받을 수 없음이 평가 오류로 바뀐다. 미리 받아 두면 받을 수 없음은 {@link MdmUnavailableException} 그대로 올라간다.
     */
    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        String phys = MdmNames.toPhysName(column);
        if (phys == null) {
            return Optional.empty();
        }
        Optional<MdmColumnMeta> meta = service.one(MdmTargetType.COLUMN, phys).map(MdmColumnMeta.class::cast);
        meta.map(MdmColumnMeta::codeRef).map(MdmColumnMeta.CodeRefMeta::maruCodeId).filter(id -> !id.isBlank())
                .ifPresent(id -> service.one(MdmTargetType.CODE, id));
        return meta.map(m -> toColumnDefinition(m, table));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        return service.one(MdmTargetType.RULE, ruleId).flatMap(v -> select((List<RuleDefinition>) v, evalTs));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        return service.one(MdmTargetType.RULE_SET, setId).flatMap(v -> selectSet((List<RuleSetDefinition>) v, evalTs));
    }

    @Override
    public Optional<CodeRows> code(String maruCodeId) {
        return service.one(MdmTargetType.CODE, maruCodeId).map(CodeRows.class::cast);
    }

    /** 룰 RELEASED 버전 목록에서 판정 시각에 적용되는 것. */
    public static Optional<RuleDefinition> select(List<RuleDefinition> released, Instant evalTs) {
        return select(released, RuleDefinition::ver, RuleDefinition::applyFrom, RuleDefinition::applyTo, evalTs);
    }

    /** 룰 세트 RELEASED 버전 목록에서 판정 시각에 적용되는 것(룰과 같은 규칙). */
    public static Optional<RuleSetDefinition> selectSet(List<RuleSetDefinition> released, Instant evalTs) {
        return select(released, RuleSetDefinition::ver, RuleSetDefinition::applyFrom, RuleSetDefinition::applyTo, evalTs);
    }

    /**
     * 판정 시각 고르기 한 곳 — {@code APPLY_FROM <= t < APPLY_TO}(KST, 끝 null 은 열린 끝), 여럿이면 VER 최대. 적용 시작이 없는 버전은 고르지 않는다.
     */
    static <T> Optional<T> select(List<T> released, Function<T, BigDecimal> ver, Function<T, LocalDateTime> applyFrom,
                                  Function<T, LocalDateTime> applyTo, Instant evalTs) {
        LocalDateTime now = LocalDateTime.ofInstant(evalTs, KST);
        return released.stream()
                .filter(d -> {
                    LocalDateTime from = applyFrom.apply(d);
                    LocalDateTime to = applyTo.apply(d);
                    return from != null && !from.isAfter(now) && (to == null || now.isBefore(to));
                })
                .max(Comparator.comparing(ver)); // BigDecimal compareTo — 9.000 < 10.000, 1.009 < 1.010, 1.0 == 1.000
    }

    /**
     * 컬럼 메타 → 엔진 정의(spec §4.2). 테이블 인자는 그대로 싣지만 판정에 쓰지 않는다 — 컬럼사전은 테이블과 무관한 표준 컬럼이다.
     * 도메인이 없으면 TEXT·STRING(DomainTestCaseRunner 와 같은 기본값). CODE 종류의 MASTER 식은 엔진 검증기가 codeRef 로 스스로 붙인다.
     */
    public static ColumnDefinition toColumnDefinition(MdmColumnMeta m, String table) {
        DomainKind kind = m.domain() == null ? DomainKind.TEXT : parse(DomainKind.class, m.domain().domainKind(), DomainKind.TEXT);
        DataType type = parse(DataType.class, m.dataType(), DataType.STRING);
        return new ColumnDefinition(table, m.physName(), kind, type, m.scale(), m.required(),
                m.stdExpr() == null ? null : m.stdExpr().text(),
                m.bizExpr() == null ? null : m.bizExpr().text(),
                m.bizRequiredVars() == null ? List.of() : m.bizRequiredVars(),
                m.codeRef() == null ? null : new CodeRef(m.codeRef().maruCodeId(), m.codeRef().cateId()),
                m.refKind(), m.refTarget(), m.refCateId());
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String text, E fallback) {
        if (text == null || text.isBlank()) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, text.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }
}
