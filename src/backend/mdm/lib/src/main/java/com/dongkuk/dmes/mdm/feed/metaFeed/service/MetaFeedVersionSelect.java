package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * MDM 쪽 {@code current} 버전 고르기(D-154, 스펙 §3.2·§4.1) — 룰·룰 세트·전문 규칙: RELEASED 중 {@code applyFrom <= at < applyTo}(applyFrom null 제외,
 * applyTo null 은 열린 끝), 여럿이면 ver 최대, 소급 없음. cactus {@code MdmDefinitionLookup.select} 와 같은 규칙이고, 고른 결과는 cactus 가 목차로
 * 다시 확인한다. 코드는 엔진 {@code CodeVersions.select} 를 쓴다.
 */
final class MetaFeedVersionSelect {

    private MetaFeedVersionSelect() {
    }

    static <T> Optional<T> releasedAt(List<T> released, Function<T, BigDecimal> ver, Function<T, LocalDateTime> from,
                                      Function<T, LocalDateTime> to, LocalDateTime at) {
        if (at == null) {
            return Optional.empty();
        }
        return released.stream()
                .filter(d -> from.apply(d) != null && !from.apply(d).isAfter(at) && (to.apply(d) == null || at.isBefore(to.apply(d))))
                .max(Comparator.comparing(ver));
    }
}
