package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.config.ExpressionConfiguration;
import java.time.Duration;
import java.util.Set;

/**
 * 룰 엔진 테스트가 fixture 설정을 {@link MdmEvaluator} 의 캐시·{@code copy()}·가상 스레드 경로에 태우는 유일한 길
 * (TSK-03-03 D21). {@code MdmEvaluator} 의 패키지 전용 생성자·{@code cacheSize()}·{@code cachedOriginal()} 을 여기서만
 * 부른다 — rule test 는 리플렉션으로 열지 않는다.
 */
public final class MdmEvaluatorFixtures {

    /** 엔진 단위 테스트 기본 타임아웃 — 전체 스위트 부하에서 거짓 타임아웃을 막는다(03-02 와 같은 이유). */
    public static final Duration FIXTURE_TIMEOUT = Duration.ofSeconds(10);

    private MdmEvaluatorFixtures() {}

    public static MdmEvaluator of(ExpressionConfiguration configuration) {
        return of(configuration, FIXTURE_TIMEOUT);
    }

    public static MdmEvaluator of(ExpressionConfiguration configuration, Duration timeout) {
        return new MdmEvaluator(configuration, Set.of(), timeout);
    }

    /** 캐시 상한을 작게 잡은 평가기(비우기 시험용). */
    public static MdmEvaluator withCacheLimit(ExpressionConfiguration configuration, int maxCached) {
        return new MdmEvaluator(configuration, Set.of(), FIXTURE_TIMEOUT, maxCached);
    }

    /** 테스트용 — 캐시한 식 수. */
    public static int cacheSize(MdmEvaluator evaluator) {
        return evaluator.cacheSize();
    }

    /** 텍스트가 캐시에 있는지. */
    public static boolean isCached(MdmEvaluator evaluator, String text) {
        return evaluator.cachedOriginal(text) != null;
    }
}
