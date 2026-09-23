package kr.dongkuk.maru.mdm.engine.code;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * 04·05 공용 "선분 고르기 + 최초 소급"(TSK-03-02 design §6.10·§6.11). 선분은 {@code from <= at < to} 다.
 * 04 는 버전 축(from_ver–to_ver), 05 는 일시 축(valid_from–valid_to)에 같은 규칙을 쓴다.
 */
final class Segments {

    private Segments() {}

    /** {@code from <= at < to} 인 행. 둘 이상이면(데이터 오류) from 이 가장 이른 행. */
    static <T, K extends Comparable<? super K>> Optional<T> covering(
            List<T> rows, Function<T, K> from, Function<T, K> to, K at) {
        return rows.stream()
                .filter(r -> from.apply(r).compareTo(at) <= 0 && at.compareTo(to.apply(r)) < 0)
                .min(Comparator.comparing(from));
    }

    /**
     * {@link #covering} 이 없고 {@code at} 이 가장 이른 행의 from 보다 앞이면 그 행(최초 소급, 04:716·05:237).
     * 가장 이른 행보다 뒤인데 덮는 행이 없으면(닫혔거나 빈 구간) 빈 값이다.
     */
    static <T, K extends Comparable<? super K>> Optional<T> coveringOrEarliest(
            List<T> rows, Function<T, K> from, Function<T, K> to, K at) {
        Optional<T> hit = covering(rows, from, to, at);
        if (hit.isPresent()) {
            return hit;
        }
        return rows.stream()
                .min(Comparator.comparing(from))
                .filter(earliest -> at.compareTo(from.apply(earliest)) < 0);
    }
}
