package com.dongkuk.dmes.cactus.mdm;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.code.CodeVersions;

/**
 * 목차로 판정 시각의 버전 고르기(D-154, 스펙 §3.2) — 대상마다 지금 쓰는 함수를 그대로 쓴다. 코드는 엔진 {@link CodeVersions#select}(소급 있음),
 * 룰·룰 세트·전문은 {@link MdmDefinitionLookup#covers} + ver 최대(소급 없음) — status 는 보지 않는다(목차는 RELEASED 만 싣는다, {@link MdmTocVersion}).
 * 코드는 {@link MdmToc#codeRows()} 의 행(null 일시를 엔진 모양으로 바꾼 것)으로 고른다. 시각은 KST 벽시계다.
 */
public final class MdmVersionSelector {

    private MdmVersionSelector() {
    }

    /** @return 고른 버전의 키(scale 3), 없으면 빈 값 — 룰·세트·전문은 "적용 버전 없음"일 수 있다 */
    public static Optional<String> select(MdmTargetType type, MdmToc toc, LocalDateTime t) {
        if (type == MdmTargetType.CODE) {
            return CodeVersions.select(toc.codeRows().versions(), t).map(MdmVersions::key);
        }
        return toc.versions().stream()
                .filter(v -> MdmDefinitionLookup.covers(v.applyFrom(), v.applyTo(), t))
                .max(Comparator.comparing(MdmTocVersion::ver))
                .map(v -> MdmVersions.key(v.ver()));
    }

    /**
     * {@code t} 보다 뒤인 가장 이른 applyFrom·applyTo — 두 선택 규칙 모두 결과가 이 경계에서만 바뀐다. 캐시는 이 시각 전까지 고른 버전을 기억한다
     * (이 계획의 「스펙과 다르게 정한 점」). 없으면 {@link LocalDateTime#MAX}.
     */
    public static LocalDateTime nextBoundary(MdmToc toc, LocalDateTime t) {
        LocalDateTime next = LocalDateTime.MAX;
        for (MdmTocVersion v : toc.versions()) {
            for (LocalDateTime b : new LocalDateTime[] {v.applyFrom(), v.applyTo()}) {
                if (b != null && b.isAfter(t) && b.isBefore(next)) {
                    next = b;
                }
            }
        }
        return next;
    }
}
