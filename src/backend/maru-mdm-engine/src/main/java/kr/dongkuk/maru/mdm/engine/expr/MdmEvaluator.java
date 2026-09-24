package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.BaseException;
import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.parser.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.BusinessFunction;

/**
 * 식 평가기 — 컴파일 캐시 + {@code copy()} 평가 + {@code EVAL_TS} 주입 + 평가 타임아웃(06:449, 02 안전장치 4,
 * TSK-03-02 design §6.3). 서버·하위 시스템·룰 엔진이 이것 하나로 식을 평가한다.
 *
 * <p>캐시 키는 식 텍스트, 단위는 파싱된 {@link Expression} 이다. 캐시에 넣기 전에 {@code validate()} 로 AST 를 만들어
 * 둔다(지연 파싱은 동기화되지 않는다). 평가는 늘 {@code copy()} 사본에 값을 넣는다 — 사본은 데이터 접근자·상수 맵을
 * 새로 갖고 AST 만 공유하므로 스레드끼리 값이 섞이지 않는다. 캐시 원본은 밖으로 내보내지 않는다.
 *
 * <p>타임아웃: EvalEx 에는 범용 평가 타임아웃이 없어(정규식만 있다) 평가를 가상 스레드에서 돌리고 기다림을 끊는다.
 * 시간을 넘기면 작업을 인터럽트하고 {@code EVALUATION_ERROR}(reason TIMEOUT)를 던진다. 한계: 인터럽트를 보지 않고
 * CPU 만 쓰는 평가는 인터럽트로 멈추지 않는다. 호출자는 타임아웃으로 풀려나지만 그 작업은 끝날 때까지 돈다.
 */
public final class MdmEvaluator {

    public static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(1);

    private final ExpressionConfiguration configuration;
    private final Set<String> businessFunctionNames;
    private final Duration timeout;
    private final Map<String, Expression> cache = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public MdmEvaluator(EngineLookups lookups) {
        this(lookups, DEFAULT_TIMEOUT);
    }

    /** @throws IllegalArgumentException 비즈니스 함수 적재 규칙에 어긋날 때 */
    public MdmEvaluator(EngineLookups lookups, Duration timeout) {
        this.configuration = MdmExpressionConfig.create(lookups);
        this.businessFunctionNames = lookups.functions().functions().stream()
                .map(BusinessFunction::name)
                .map(n -> n.toUpperCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
        this.timeout = Objects.requireNonNull(timeout, "timeout");
    }

    /** {@link MdmExpressionConfig#create} 로 한 번 만든 설정. 저장 시 검사·AST 내보내기가 같은 설정을 쓴다. */
    public ExpressionConfiguration configuration() {
        return configuration;
    }

    /** 적재한 비즈니스 함수 이름(대문자). */
    public Set<String> businessFunctionNames() {
        return businessFunctionNames;
    }

    /** 캐시에 넣기만 한다. 파싱 실패는 {@link ExpressionFailure}(PARSE)이고 캐시에 남지 않는다. */
    public void compile(String text) {
        compiled(text);
    }

    /** 식이 쓰는 변수(상수 제외, 대소문자 무시 정렬). */
    public Set<String> usedVariables(String text) {
        Set<String> out = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        try {
            out.addAll(compiled(text).getUsedVariables());
        } catch (ParseException e) {
            // 캐시 원본은 validate() 로 AST 를 이미 만들었으므로 여기서 파싱하지 않는다.
            throw new IllegalStateException(e);
        }
        return out;
    }

    /**
     * 식 하나를 평가한다. {@code evalTs} 는 초 미만을 잘라 {@code EVAL_TS} 로 넣는다(06:422). 레코드 키 검사
     * ({@link RecordKeys})는 호출자 몫이다 — 룰 엔진은 내부 키 {@code _V<id>} 를 넣으므로 여기서는 보지 않는다.
     *
     * @throws ExpressionFailure 파싱 실패·평가 예외·타임아웃·상수 이름 키
     */
    public EvaluationValue evaluate(String text, Map<String, ?> values, Instant evalTs) {
        Objects.requireNonNull(evalTs, "evalTs");
        Expression original = compiled(text);
        Map<String, ?> input = values == null ? Map.of() : values;
        Instant ts = evalTs.truncatedTo(ChronoUnit.SECONDS);
        Future<EvaluationValue> future = executor.submit(() -> {
            Expression copy = original.copy();
            copy.withValues(input);
            copy.with(ReservedNames.EVAL_TS, ts);
            return copy.evaluate();
        });
        try {
            return future.get(timeout.toNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new ExpressionFailure(Code.EVALUATION_ERROR, ExpressionFailure.TIMEOUT, null,
                    "식 평가가 " + timeout.toMillis() + " ms 안에 끝나지 않았다: " + text, e);
        } catch (ExecutionException e) {
            throw translate(text, input, e.getCause());
        } catch (InterruptedException e) {
            future.cancel(true);
            Thread.currentThread().interrupt();
            throw new ExpressionFailure(Code.EVALUATION_ERROR, ExpressionFailure.EVALUATION, null,
                    "식 평가를 기다리다 인터럽트됐다: " + text, e);
        }
    }

    /** 테스트용 — 캐시한 식 수. */
    int cacheSize() {
        return cache.size();
    }

    /** 테스트용 — 캐시 원본. 밖으로 내보내지 않는다. */
    Expression cachedOriginal(String text) {
        return cache.get(text);
    }

    private Expression compiled(String text) {
        return cache.computeIfAbsent(text, t -> {
            Expression e = new Expression(t, configuration);
            try {
                e.validate();
            } catch (ParseException ex) {
                throw new ExpressionFailure(Code.EVALUATION_ERROR, ExpressionFailure.PARSE, ex.getTokenString(),
                        ex.getMessage(), ex);
            }
            return e;
        });
    }

    private static ExpressionFailure translate(String text, Map<String, ?> values, Throwable cause) {
        if (cause instanceof UnsupportedOperationException) {
            String key = values.keySet().stream()
                    .filter(k -> ReservedNames.CONSTANTS.contains(k.toUpperCase(Locale.ROOT)))
                    .findFirst()
                    .orElse(null);
            if (key != null) {
                return new ExpressionFailure(Code.CONSTANT_KEY, ExpressionFailure.CONSTANT_KEY, key,
                        "레코드 키 '" + key + "' 는 표준 상수 이름이다", cause);
            }
        }
        String name = cause instanceof EvaluationException ee ? ((BaseException) ee).getTokenString() : null;
        return new ExpressionFailure(Code.EVALUATION_ERROR, ExpressionFailure.EVALUATION, name,
                "식 평가 오류: " + text + " — " + cause, cause);
    }
}
