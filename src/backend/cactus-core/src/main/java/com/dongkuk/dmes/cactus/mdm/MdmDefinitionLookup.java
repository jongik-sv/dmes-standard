package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
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
 *
 * <p>전문(LAYOUT, D-144 3단계)도 같은 규칙으로 버전을 고른 뒤, 그 버전의 합성 구간 가운데 판정 시각을 담는 것의 스냅샷을 준다
 * ({@link #layout}). 엔진 spi 에는 전문이 없으므로 이 클래스의 공개 메서드다.
 *
 * <p>D-154 — 버전 대상은 목차로 판정 시각의 버전을 고르고 그 본문을 쓴다({@link MdmMetaService#oneAt}). 코드는 {@link #code}(목차 행)·
 * {@link #codeAt}(본문 행)·{@link #codes}(소속 집합). 불변식: 목차가 있는 코드에 대해 {@code codes} 는 빈 값을 주지 않는다(본문을 받아 집합을 주거나
 * 받을 수 없으면 던진다 — 목차에 없는 버전, 소수 넷째 자리 ver 도 던진다). off 의 전 이력 본문만 빈 값이다.
 */
public class MdmDefinitionLookup implements DefinitionLookup, CodeLookup, CodeEffLookup {

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
                .ifPresent(this::prefetchCode);
        return meta.map(m -> toColumnDefinition(m, table));
    }

    /** 버전 경로는 목차 + 지금 시각 본문(스펙 §7.4), off 는 전 이력 한 키(지금 동작 — 목차를 만들지 않는다). */
    private void prefetchCode(String maruCodeId) {
        if (service.versioned()) {
            service.oneAt(MdmTargetType.CODE, maruCodeId, service.now());
        } else {
            service.one(MdmTargetType.CODE, maruCodeId);
        }
    }

    /** off 는 전 이력 목록에서 바로 고른다(지금 동작) — 조회마다 목차를 다시 만들지 않는다. 결과는 버전 경로와 같다({@code MdmVersionedEquivalenceTest}). */
    @Override
    @SuppressWarnings("unchecked")
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        if (!service.versioned()) {
            return service.one(MdmTargetType.RULE, ruleId).flatMap(v -> select((List<RuleDefinition>) v, evalTs));
        }
        return service.oneAt(MdmTargetType.RULE, ruleId, evalTs).map(MdmMetaService.MdmAt::body).map(RuleDefinition.class::cast);
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        if (!service.versioned()) {
            return service.one(MdmTargetType.RULE_SET, setId).flatMap(v -> selectSet((List<RuleSetDefinition>) v, evalTs));
        }
        return service.oneAt(MdmTargetType.RULE_SET, setId, evalTs).map(MdmMetaService.MdmAt::body).map(RuleSetDefinition.class::cast);
    }

    /**
     * 목차 행 {@code (header, versions, [], [], [])} — 버전 선택·DEPRECATED·"마루 코드인가"에 쓴다.
     * off({@code versioned=false}) 면 지금처럼 전 이력 행을 그대로 준다(기존 {@code MdmDefinitionLookupTest} 의 동작 불변 — off 는 {@code guardValue} 가 막지 않는다).
     */
    @Override
    public Optional<CodeRows> code(String maruCodeId) {
        if (!service.versioned()) {
            return service.one(MdmTargetType.CODE, maruCodeId).map(CodeRows.class::cast);
        }
        return service.toc(MdmTargetType.CODE, maruCodeId).map(MdmToc::codeRows);
    }

    /** 버전 본문 행 — 그 버전 1행·유효 items·고른 정의·합성 cateItems(off 면 전 이력 행). 목차에 없는 버전이면 {@link MdmUnavailableException}. */
    @Override
    public Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) {
        return service.body(MdmTargetType.CODE, maruCodeId, verKey(maruCodeId, ver)).map(b -> ((MdmCodeVersion) b).rows());
    }

    /**
     * 소속 집합 색인(결정 P4) — 본문에 없는 cateId 는 빈 집합. off 의 전 이력이면 빈 값(해석기가 계산한다). 목차에 없는 버전이면
     * {@link MdmUnavailableException}(빈 값 금지 불변식).
     */
    @Override
    public Optional<Set<String>> codes(String maruCodeId, BigDecimal ver, String cateId) {
        return service.body(MdmTargetType.CODE, maruCodeId, verKey(maruCodeId, ver)).flatMap(b -> ((MdmCodeVersion) b).members(cateId));
    }

    /** 본문 키 ver — 소수 넷째 자리 등 키로 만들 수 없으면 받을 수 없음(원장은 DECIMAL(7,3) 이라 드물다). */
    static String verKey(String maruCodeId, BigDecimal ver) {
        try {
            return MdmVersions.key(ver);
        } catch (IllegalArgumentException e) {
            throw new MdmUnavailableException("MDM 정의를 해석할 수 없습니다: " + MdmTargetType.CODE + " " + maruCodeId + " — " + e.getMessage(), e);
        }
    }

    /**
     * 전문의 판정 시각 스냅샷({@code MdmLayoutSnapshot} 모양의 맵) — 그 시각에 적용되는 RELEASED 버전과, 그 버전 안에서 시각을 담는 합성
     * 구간. 전문이 없거나 그 시각에 적용되는 버전이 없으면 빈 값, 받을 수 없으면(MDM 이 합성하지 못한 전문 포함) {@link MdmUnavailableException}.
     */
    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> layout(String layoutId, Instant evalTs) {
        if (!service.versioned()) {
            return service.one(MdmTargetType.LAYOUT, layoutId).flatMap(v -> selectLayout((List<MdmLayoutVersion>) v, evalTs));
        }
        return service.oneAt(MdmTargetType.LAYOUT, layoutId, evalTs).map(MdmMetaService.MdmAt::body).map(MdmLayoutVersion.class::cast)
                .flatMap(v -> segmentAt(v, LocalDateTime.ofInstant(evalTs, KST)));
    }

    /** 전문 RELEASED 버전 목록에서 판정 시각의 스냅샷 — 버전은 룰과 같은 규칙, 구간은 같은 {@code [from, to)} 판정. */
    public static Optional<Map<String, Object>> selectLayout(List<MdmLayoutVersion> released, Instant evalTs) {
        return select(released, MdmLayoutVersion::ver, MdmLayoutVersion::applyFrom, MdmLayoutVersion::applyTo, evalTs)
                .flatMap(v -> segmentAt(v, LocalDateTime.ofInstant(evalTs, KST)));
    }

    /** 전문 버전 하나 안에서 시각을 담는 합성 구간의 스냅샷. */
    public static Optional<Map<String, Object>> segmentAt(MdmLayoutVersion v, LocalDateTime t) {
        return v.segments().stream().filter(s -> covers(s.applyFrom(), s.applyTo(), t)).findFirst().map(MdmLayoutVersion.Segment::snapshot);
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
                .filter(d -> covers(applyFrom.apply(d), applyTo.apply(d), now))
                .max(Comparator.comparing(ver)); // BigDecimal compareTo — 9.000 < 10.000, 1.009 < 1.010, 1.0 == 1.000
    }

    /** {@code from <= t < to}(KST 벽시계). 시작이 없으면 담지 않고, 끝 null 은 열린 끝이다. */
    static boolean covers(LocalDateTime from, LocalDateTime to, LocalDateTime t) {
        return from != null && !from.isAfter(t) && (to == null || t.isBefore(to));
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
