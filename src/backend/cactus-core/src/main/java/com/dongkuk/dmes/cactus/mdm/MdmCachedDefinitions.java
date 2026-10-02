package com.dongkuk.dmes.cactus.mdm;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * 캐시만 읽는 엔진 조회기(하위 프로젝트 C spec §6.2-4, C6) — 저장 검증({@link MdmValidator})의 엔진 평가가 쓴다. MDM 을 부르지 않는다:
 * 검증기가 평가 전에 호출자 스레드에서 필요한 정의를 미리 받아 두고, 평가는 이 조회기로 캐시만 본다. 엔진 평가 제한(1초)이 HTTP 읽기 제한(5초)보다
 * 짧아, 평가 중에 MDM 을 부르면 느린 MDM 이 시간 초과(평가 오류)로 바뀌기 때문이다.
 *
 * <p><b>부재 기록</b>: 캐시에 없는 키를 만나면 지금 검증의 부재 기록기({@link MissLog})에 {@code 종류:키} 로 남긴다. 엔진의
 * {@code EngineEvaluationException} 은 원인을 잃으므로 검증기는 예외 문구가 아니라 이 기록으로 "검증 불가"를 가린다. 기록기는
 * {@link InheritableThreadLocal} 로 건넨다 — {@code MdmEvaluator} 는 식마다 {@code newVirtualThreadPerTaskExecutor} 로 가상 스레드를
 * {@code submit} 하는 그 순간(호출자 스레드 안)에 만들고, 가상 스레드는 기본으로 상속 값을 물려받는다(평범한 ThreadLocal 은 물려받지 않는다).
 * 검증기는 엔진 호출 앞뒤로만 기록기를 걸고 풀어 미리 받기 HTTP 등 다른 스레드에 새지 않게 한다. 시험 {@code MdmValidatorTest} 가 진짜
 * 평가기로 이 전달을 확인한다(가상 스레드 부재 기록·동시 검증 분리).
 *
 * <p>캐시에 없는 코드는 기록기 유무와 상관없이 {@link MdmUnavailableException} 을 던진다 — 빈 값을 주면 엔진 {@code MASTER} 가 그 ID 를
 * 마루 데이터로 보고 {@code MasterLookup.NONE} 의 거짓을 내 "허용되지 않은 코드"라는 틀린 오류가 된다. 컬럼·룰·룰 세트의 부재는 빈 값이다(엔진이
 * NOT_DEFINED·RULE_NOT_FOUND·SET_NOT_FOUND 로 바꾸고, 검증기는 기록을 보고 검증 불가로 돌린다).
 *
 * <p>상태가 없다(기록기는 스레드 상속 값). 검증기가 자기 엔진을 만들 때만 쓴다 — {@code DefinitionLookup} 빈으로도, 이것으로 만든 엔진을
 * 일반 엔진 빈({@code MdmEvaluator}·{@code DomainValidator}·{@code RuleEngine})으로도 등록하지 않는다(그 자리는 {@link MdmDefinitionLookup}).
 */
public final class MdmCachedDefinitions implements DefinitionLookup, CodeLookup {

    private static final InheritableThreadLocal<MissLog> CURRENT = new InheritableThreadLocal<>();

    private final MdmMetaService service;

    public MdmCachedDefinitions(MdmMetaService service) {
        this.service = service;
    }

    /**
     * 검증 한 번의 부재 기록. 평가 스레드(가상 스레드)가 쓰고 호출자 스레드가 읽는다. 같은 키도 만날 때마다 쌓는다 — 호출자는 엔진 호출 앞뒤의
     * {@link #size()} 차이로 "이 호출에서 놓쳤다"를 가리므로, 앞 행에서 이미 놓친 키를 다음 행에서 또 놓쳐도 늘어나야 한다.
     */
    static final class MissLog {

        private final List<String> events = new ArrayList<>();

        synchronized void add(MdmTargetType type, String key) {
            events.add(type.name() + ':' + key);
        }

        synchronized int size() {
            return events.size();
        }

        /** {@code from} 번째(0부터) 뒤의 기록, 중복 제거. */
        synchronized Set<String> since(int from) {
            return new LinkedHashSet<>(events.subList(Math.min(from, events.size()), events.size()));
        }
    }

    /** {@code log} 를 걸고 {@code body} 를 부른다. 끝나면 앞의 값으로 되돌린다. */
    static <T> T recording(MissLog log, Supplier<T> body) {
        MissLog previous = CURRENT.get();
        CURRENT.set(log);
        try {
            return body.get();
        } finally {
            if (previous == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(previous);
            }
        }
    }

    /** 캐시 읽기 결과 — {@code cached} 가 거짓이면 캐시에 없음(부재 기록함), 참이면 {@code value} 가 값(null = MDM 에 없음으로 캐시됨). */
    private record Read(boolean cached, Object value) {

        <T> Optional<T> map(Function<Object, Optional<T>> f) {
            return cached && value != null ? f.apply(value) : Optional.empty();
        }
    }

    private Read read(MdmTargetType type, String key) {
        Optional<MdmMetaCache.Entry> hit = service.cached(type, key);
        if (hit.isEmpty()) {
            MissLog log = CURRENT.get();
            if (log != null && key != null) {
                log.add(type, key);
            }
            return new Read(false, null);
        }
        return new Read(true, hit.get().value());
    }

    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        String phys = MdmNames.toPhysName(column);
        if (phys == null) {
            return Optional.empty();
        }
        return read(MdmTargetType.COLUMN, phys).map(m -> Optional.of(MdmDefinitionLookup.toColumnDefinition((MdmColumnMeta) m, table)));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        return read(MdmTargetType.RULE, ruleId).map(list -> MdmDefinitionLookup.select((List<RuleDefinition>) list, evalTs));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        return read(MdmTargetType.RULE_SET, setId).map(list -> MdmDefinitionLookup.selectSet((List<RuleSetDefinition>) list, evalTs));
    }

    @Override
    public Optional<CodeRows> code(String maruCodeId) {
        Read r = read(MdmTargetType.CODE, maruCodeId);
        if (!r.cached()) {
            throw new MdmUnavailableException("캐시에 없는 마루 코드입니다(평가 중에는 MDM 을 부르지 않습니다): " + maruCodeId);
        }
        return r.map(rows -> Optional.of((CodeRows) rows));
    }
}
