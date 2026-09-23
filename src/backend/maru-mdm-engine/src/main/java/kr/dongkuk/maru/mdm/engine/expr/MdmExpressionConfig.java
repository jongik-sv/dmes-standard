package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.config.ExpressionConfiguration;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.ZoneId;
import java.util.Locale;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;

/**
 * EvalEx 설정 고정값과 설정 팩토리 시그니처(06-business-rule.md:442, evalex-guide §6).
 *
 * <p>설정은 이 클래스 하나가 만든다. 서버·하위 시스템·정합성 테스트가 같은 값을 써야 결과가 같다(06:438).
 * TSK-03-01 은 계약 전용이라 고정값을 상수로만 두고, 두 팩토리는 시그니처만 둔다(TSK-03-01 design D1).
 * 몸체는 TSK-03-02 가 채운다 — 상수마다 적힌 빌더 메서드에 그 상수를 하나씩 넣으면 된다.
 * 빌더 메서드 이름은 EvalEx 3.7.0 jar 를 javap 로 확인했다(TSK-02-02 design §0).
 */
public final class MdmExpressionConfig {

    /** {@code mathContext} — precision 68, HALF_EVEN. EvalEx 기본값과 같지만 명시해 고정한다(06:442). */
    public static final MathContext MATH_CONTEXT = new MathContext(68, RoundingMode.HALF_EVEN);

    /** {@code zoneId} — MDM 기본 시간대(02:401). EvalEx 기본값은 JVM 기본 시간대라 호스트마다 달라진다. */
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    /** {@code locale} — EvalEx 기본값은 JVM 기본 로캘이다. 로캘을 읽는 함수는 넣지 않지만 호스트 의존을 없애려고 고정한다. */
    public static final Locale LOCALE = Locale.ROOT;

    /** {@code regexTimeoutMillis} — STR_MATCHES 정규식 타임아웃(ms). EvalEx 3.7.0 기본값 100 을 명시 고정(06:442). */
    public static final int REGEX_TIMEOUT_MILLIS = 100;

    /** {@code maxRecursionDepth} — 중첩 깊이 제한. EvalEx 기본값 2000 을 명시 고정. */
    public static final int MAX_RECURSION_DEPTH = 2000;

    /** {@code allowOverwriteConstants} — 표준 상수를 레코드 키로 덮지 못한다(06:199). */
    public static final boolean ALLOW_OVERWRITE_CONSTANTS = false;

    /** {@code lenientMode} — 끈다(06:197). */
    public static final boolean LENIENT_MODE = false;

    /** {@code arraysAllowed} — 배열 문법을 끈다(TSK-02-02 design D1). */
    public static final boolean ARRAYS_ALLOWED = false;

    /** {@code structuresAllowed} — 구조체 문법을 끈다(TSK-02-02 design D1). */
    public static final boolean STRUCTURES_ALLOWED = false;

    /** {@code implicitMultiplicationAllowed} — 암묵 곱셈({@code 2x})을 끈다(TSK-02-02 design D1). */
    public static final boolean IMPLICIT_MULTIPLICATION_ALLOWED = false;

    /** {@code singleQuoteStringLiteralsAllowed} — 작은따옴표 문자열을 끈다(TSK-02-02 design D1). */
    public static final boolean SINGLE_QUOTE_STRING_LITERALS_ALLOWED = false;

    /** {@code binaryAllowed} — 2진 값을 끈다(TSK-02-02 design D1). */
    public static final boolean BINARY_ALLOWED = false;

    /** {@code stripTrailingZeros} — 결과 숫자의 끝 0 을 뗀다(TSK-02-02 engine-contract.md §4). */
    public static final boolean STRIP_TRAILING_ZEROS = true;

    /** {@code decimalPlacesRounding} — 소수 자리 반올림을 하지 않는다(TSK-02-02 engine-contract.md §4). */
    public static final int DECIMAL_PLACES_ROUNDING = ExpressionConfiguration.DECIMAL_PLACES_ROUNDING_UNLIMITED;

    private MdmExpressionConfig() {}

    /**
     * 함수 사전을 뺀 고정 설정 — 위 상수를 빌더에 그대로 넣는다(TSK-03-02 구현).
     * 문법을 줄인다 — 배열·구조체·암묵 곱셈·작은따옴표·2진 값을 끈다.
     */
    public static ExpressionConfiguration.ExpressionConfigurationBuilder baseBuilder() {
        throw new UnsupportedOperationException("TSK-03-02 에서 구현한다");
    }

    /**
     * 엔진 설정 — {@link #baseBuilder()} + 함수 사전({@link FunctionSets#STANDARD} ∪ 비즈니스 함수)(TSK-03-02 구현).
     * 사전 밖 함수는 파싱 단계에서 {@code ParseException("Undefined function")} 으로 거부된다(EvalEx 3.7.0 실측).
     * 칸별 제한은 저장 시 검사가 {@link FunctionSets.Slot} 으로 한다(06:443).
     */
    public static ExpressionConfiguration create(EngineLookups lookups) {
        throw new UnsupportedOperationException("TSK-03-02 에서 구현한다");
    }
}
