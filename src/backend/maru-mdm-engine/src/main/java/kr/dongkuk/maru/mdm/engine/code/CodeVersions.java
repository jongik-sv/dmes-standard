package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 마루 코드 버전 고르기(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §3.2). {@link DefaultCodeResolver}·MDM 메타 피드 목차·업무 모듈 캐시가 같은
 * 함수를 써 판정 의미를 엔진 한 곳에 둔다.
 */
public final class CodeVersions {

    private static final String RELEASED = "RELEASED";

    private CodeVersions() {}

    /**
     * RELEASED 중 {@code applyFrom <= at < applyTo}(여럿이면 applyFrom 이 가장 이른 것), 없으면 ver 가 가장 작은 RELEASED(버전 소급 — 첫 버전
     * 앞·빈틈·닫힌 끝 뒤 모두). CANCELLED·DRAFT 는 보지 않는다. RELEASED 가 없으면 빈 값.
     */
    public static Optional<BigDecimal> select(List<CodeVersionRow> versions, LocalDateTime at) {
        List<CodeVersionRow> released = versions.stream().filter(v -> RELEASED.equals(v.status())).toList();
        return Segments.covering(released, CodeVersionRow::applyFrom, CodeVersionRow::applyTo, at)
                .or(() -> released.stream().min(Comparator.comparing(CodeVersionRow::ver)))
                .map(CodeVersionRow::ver);
    }
}
