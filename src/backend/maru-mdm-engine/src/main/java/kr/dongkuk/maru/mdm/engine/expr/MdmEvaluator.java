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
import java.util.Iterator;
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
 *
 * <p>캐시 크기에는 상한({@link #MAX_CACHED})이 있다. 다 차면 새 식을 넣기 전에 아무 항목 하나를 비운다 — 캐시는 다시 파싱하지 않으려는 것일
 * 뿐이라 비운 식은 다음에 다시 컴파일되고 결과는 같다(메모리 안전, 식 텍스트가 끝없이 늘어나는 호출자 대비).
 *
 * <p>룰 엔진도 이 평가기로 평가한다(TSK-03-03 D20).
 */
public final class MdmEvaluator {

    public static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(1);

    /** 컴파일 캐시에 두는 식 수의 상한. */
    public static final int MAX_CACHED = 10_000;

    private final ExpressionConfiguration configuration;
    private final Set<String> businessFunctionNames;
    private final Duration timeout;
    private final int maxCached;
    private final Map<String, Expression> cache = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public MdmEvaluator(EngineLookups lookups) {
        this(lookups, DEFAULT_TIMEOUT);
    }

    /** @throws IllegalArgumentException 비즈니스 함수 적재 규칙에 어긋날 때 */
    public MdmEvaluator(EngineLookups lookups, Duration timeout) {
        this(MdmExpressionConfig.create(lookups), businessFunctionNames(lookups), timeout);
    }

    /**
     * 패키지 전용 — 룰 엔진 테스트가 fixture 설정을 이 평가기의 캐시·{@code copy()}·가상 스레드 경로에 태울 때만 쓴다
     * (TSK-03-03 D21). 공개 생성자가 실제로 위임하는 경로라 테스트 전용 뒷문이 아니다. 부르는 곳은
     * {@code kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures}(test) 하나다.
     */
    MdmEvaluator(ExpressionConfiguration configuration, Set<String> businessFunctionNames, Duration timeout) {
        this(configuration, businessFunctionNames, timeout, MAX_CACHED);
    }

    /** 패키지 전용 — 캐시 상한을 작게 잡아 비우기를 시험할 때만 쓴다({@code MdmEvaluatorFixtures}). */
    MdmEvaluator(ExpressionConfiguration configuration, Set<String> businessFunctionNames, Duration timeout, int maxCached) {
        this.configuration = Objects.requireNonNull(configuration, "configuration");
        this.businessFunctionNames = Set.copyOf(Objects.requireNonNull(businessFunctionNames, "businessFunctionNames"));
        this.timeout = Objects.requireNonNull(timeout, "timeout");
        if (maxCached < 1) {
            throw new IllegalArgumentException("maxCached 는 1 이상이어야 한다: " + maxCached);
        }
        this.maxCached = maxCached;
    }

    private static Set<String> businessFunctionNames(EngineLookups lookups) {
        return lookups.functions().functions().stream()
                .map(BusinessFunction::name)
                .map(n -> n.toUpperCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
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
        Expression hit = cache.get(text);
        if (hit != null) {
            return hit;
        }
        if (cache.size() >= maxCached) {
            evictOne(); // computeIfAbsent 밖에서 비운다 — 매핑 함수 안에서 맵을 고치면 ConcurrentHashMap 이 던진다
        }
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

    /** 아무 항목 하나를 비운다. 여러 스레드가 동시에 비우면 상한보다 조금 적어질 수 있다(정확한 LRU 가 아니다). */
    private void evictOne() {
        Iterator<String> it = cache.keySet().iterator();
        if (it.hasNext()) {
            it.next();
            it.remove();
        }
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
