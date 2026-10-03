package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlicer;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;

/**
 * 전 이력 값(지금 피드 값 모양) → 목차·본문(D-154, 스펙 §5.8 물러남). 옛 MDM 응답과 {@code versioned-feed: off} 가 쓴다. CODE 본문은 엔진
 * {@link CodeRowsProjection#releasedOnly} + {@link CodeVersionSlicer#slice} — MDM 피드 본문 생성과 같은 함수다. CODE 목차는 버전 표만 RELEASED 로
 * 거른다(투영의 versions 와 같은 결과, 행 수에 비례하는 투영을 하지 않는다).
 */
final class MdmLegacyValues {

    private static final String RELEASED = "RELEASED";

    private MdmLegacyValues() {
    }

    @SuppressWarnings("unchecked")
    static MdmToc toc(MdmTargetType type, Object full) {
        return switch (type) {
            case CODE -> {
                CodeRows rows = (CodeRows) full;
                yield new MdmToc(rows.header(), rows.versions().stream()
                        .filter(v -> RELEASED.equals(v.status()))
                        .sorted(Comparator.comparing(v -> v.ver()))
                        .map(v -> new MdmTocVersion(v.ver(), v.status(), v.applyFrom(), v.applyTo()))
                        .toList());
            }
            case RULE -> listToc((List<RuleDefinition>) full, RuleDefinition::ver, RuleDefinition::applyFrom, RuleDefinition::applyTo);
            case RULE_SET -> listToc((List<RuleSetDefinition>) full, RuleSetDefinition::ver, RuleSetDefinition::applyFrom,
                    RuleSetDefinition::applyTo);
            case LAYOUT -> listToc((List<MdmLayoutVersion>) full, MdmLayoutVersion::ver, MdmLayoutVersion::applyFrom, MdmLayoutVersion::applyTo);
            case COLUMN, DOMAIN -> throw new IllegalArgumentException("버전이 없는 대상입니다: " + type);
        };
    }

    /** 고른 ver 의 원시 본문 — CODE 는 {@link CodeVersionSlice}, 나머지는 목록 원소. 그 ver 가 RELEASED 가 아니면 빈 값. */
    @SuppressWarnings("unchecked")
    static Optional<Object> rawBody(MdmTargetType type, Object full, String ver) {
        return switch (type) {
            case CODE -> {
                CodeRows projected = CodeRowsProjection.releasedOnly((CodeRows) full);
                yield projected.versions().stream()
                        .filter(v -> MdmVersions.key(v.ver()).equals(ver))
                        .findFirst()
                        .map(v -> (Object) CodeVersionSlicer.slice(projected, v.ver()));
            }
            case RULE -> pick((List<RuleDefinition>) full, RuleDefinition::ver, ver);
            case RULE_SET -> pick((List<RuleSetDefinition>) full, RuleSetDefinition::ver, ver);
            case LAYOUT -> pick((List<MdmLayoutVersion>) full, MdmLayoutVersion::ver, ver);
            case COLUMN, DOMAIN -> throw new IllegalArgumentException("버전이 없는 대상입니다: " + type);
        };
    }

    /** 캐시 값으로 쓸 본문 — CODE 는 색인을 단 {@link MdmCodeVersion}. */
    static Optional<Object> body(MdmTargetType type, Object full, String ver) {
        return rawBody(type, full, ver).map(raw -> {
            if (type != MdmTargetType.CODE) {
                return raw;
            }
            MdmToc toc = toc(type, full);
            return MdmCodeVersion.sliced((CodeVersionSlice) raw, toc.header(), toc.version(ver).orElseThrow());
        });
    }

    private static <T> MdmToc listToc(List<T> list, Function<T, BigDecimal> ver, Function<T, LocalDateTime> from,
                                      Function<T, LocalDateTime> to) {
        return new MdmToc(null, list.stream()
                .sorted(Comparator.comparing(ver))
                .map(d -> new MdmTocVersion(ver.apply(d), RELEASED, from.apply(d), to.apply(d)))
                .toList());
    }

    private static <T> Optional<Object> pick(List<T> list, Function<T, BigDecimal> ver, String key) {
        return list.stream().filter(d -> MdmVersions.key(ver.apply(d)).equals(key)).findFirst().map(d -> (Object) d);
    }
}
