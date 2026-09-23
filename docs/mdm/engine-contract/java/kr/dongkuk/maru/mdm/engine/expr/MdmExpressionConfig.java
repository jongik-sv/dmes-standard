package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.config.ExpressionConfiguration;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.ZoneId;
import java.util.Locale;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;

/**
 * EvalEx 설정 고정값과 설정 팩토리(06-business-rule.md:442, evalex-guide §6).
 *
 * <p>설정은 이 클래스 하나가 만든다. 서버·하위 시스템·정합성 테스트가 같은 값을 써야 결과가 같다(06:438).
 * 빌더 메서드 이름은 EvalEx 3.7.0 jar 를 javap 로 확인했다(TSK-02-02 design §0).
 */
public final class MdmExpressionConfig {

    /** precision 68, HALF_EVEN — EvalEx 기본값과 같지만 명시해 고정한다(06:442). */
    public static final MathContext MATH_CONTEXT = new MathContext(68, RoundingMode.HALF_EVEN);

    /** MDM 기본 시간대(02:401). EvalEx 기본값은 JVM 기본 시간대라 호스트마다 달라진다. */
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    /** EvalEx 기본값은 JVM 기본 로캘이다. 로캘을 읽는 함수는 넣지 않지만 호스트 의존을 없애려고 고정한다. */
    public static final Locale LOCALE = Locale.ROOT;

    /** STR_MATCHES 정규식 타임아웃(ms). EvalEx 3.7.0 기본값 100 을 명시 고정(06:442). */
    public static final int REGEX_TIMEOUT_MILLIS = 100;

    /** 중첩 깊이 제한. EvalEx 기본값 2000 을 명시 고정. */
    public static final int MAX_RECURSION_DEPTH = 2000;

    private MdmExpressionConfig() {}

    /**
     * 함수 사전을 뺀 고정 설정. 문법을 줄인다 — 배열·구조체·암묵 곱셈·작은따옴표·2진 값을 끈다(design D1).
     * lenientMode 는 끈다(06:197). allowOverwriteConstants 는 false(06:199).
     */
    public static ExpressionConfiguration.ExpressionConfigurationBuilder baseBuilder() {
        return ExpressionConfiguration.builder()
                .mathContext(MATH_CONTEXT)
                .zoneId(ZONE)
                .locale(LOCALE)
                .regexTimeoutMillis(REGEX_TIMEOUT_MILLIS)
                .maxRecursionDepth(MAX_RECURSION_DEPTH)
                .allowOverwriteConstants(false)
                .lenientMode(false)
                .arraysAllowed(false)
                .structuresAllowed(false)
                .implicitMultiplicationAllowed(false)
                .singleQuoteStringLiteralsAllowed(false)
                .binaryAllowed(false)
                .stripTrailingZeros(true)
                .decimalPlacesRounding(ExpressionConfiguration.DECIMAL_PLACES_ROUNDING_UNLIMITED);
    }

    /**
     * 엔진 설정 — {@link #baseBuilder()} + 함수 사전({@link FunctionSets#STANDARD} ∪ 비즈니스 함수).
     * 사전 밖 함수는 파싱 단계에서 {@code ParseException("Undefined function")} 으로 거부된다(EvalEx 3.7.0 실측).
     * 칸별 제한은 저장 시 검사가 {@link FunctionSets.Slot} 으로 한다(06:443).
     */
    public static ExpressionConfiguration create(EngineLookups lookups) {
        throw new UnsupportedOperationException("TSK-03-02 에서 구현");
    }
}
