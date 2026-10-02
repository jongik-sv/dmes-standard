package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 전문(LAYOUT) RELEASED 버전 하나(MDM metaFeed LAYOUT, D-144 3단계 · ADR-0007 D6). 캐시 값은 이 목록(VER 오름차순)이고, 판정 시각으로
 * {@link MdmDefinitionLookup#layout} 이 고른다. {@code ver} 는 MDM 이 문자열 {@code "1.000"} 으로 보내 자리수(scale 3)를 지킨다.
 *
 * <p>{@code segments} 는 버전 구간 {@code [applyFrom, applyTo)} 를 쌓은 헤더의 버전 경계로 나눈 합성 구간이다(시각 순, 빈틈 없음). 구간마다
 * 그 시각의 헤더 버전으로 MDM 이 미리 합성한 스냅샷({@code MdmLayoutSnapshot} 모양의 맵)을 싣는다 — 업무 모듈은 다시 합성하지 않는다.
 */
public record MdmLayoutVersion(BigDecimal ver, LocalDateTime applyFrom, LocalDateTime applyTo, List<Segment> segments) {

    public MdmLayoutVersion {
        segments = segments == null ? List.of() : List.copyOf(segments);
    }

    /** 합성 구간 하나 — {@code [applyFrom, applyTo)} 동안의 스냅샷. */
    public record Segment(LocalDateTime applyFrom, LocalDateTime applyTo, Map<String, Object> snapshot) {
    }
}
