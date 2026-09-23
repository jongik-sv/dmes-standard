package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.config.FunctionDictionaryIfc;
import com.ezylang.evalex.config.MapBasedFunctionDictionary;
import com.ezylang.evalex.functions.FunctionIfc;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.BusinessFunction;

/**
 * 함수 사전 조립(TSK-03-02 design §6.1). {@link MdmExpressionConfig} 는 상수 홀더라 몸체를 여기에 위임한다.
 * 표준 사전을 그대로 쓰지 않고 허용 함수만 넣는다(06:442). 사전 밖 함수는 파싱 단계에서 거부된다.
 */
final class FunctionDictionaries {

    private static final Pattern BUSINESS_NAME = Pattern.compile("^[A-Z][A-Z0-9_]*$");

    /** EvalEx 3.7.0 표준 사전. 함수 객체는 상태가 없어 공유한다. */
    private static final FunctionDictionaryIfc EVALEX_STANDARD =
            ExpressionConfiguration.defaultConfiguration().getFunctionDictionary();

    private static final Set<String> EVALEX_STANDARD_NAMES = EVALEX_STANDARD.getAvailableFunctionNames().stream()
            .map(n -> n.toUpperCase(Locale.ROOT))
            .collect(Collectors.toUnmodifiableSet());

    private FunctionDictionaries() {}

    /** {@link FunctionSets#BASE} 24종 — 표준 사전에서 이름으로 고른다(D3). */
    static FunctionDictionaryIfc base() {
        return dictionary(baseFunctions());
    }

    /**
     * 엔진 사전 = BASE + INSTR + MASTER + MASTER_AT + 비즈니스 함수(06:443). 칸별 제한은 저장 시 검사가 한다.
     *
     * @throws IllegalArgumentException 비즈니스 함수 이름이 형식에 어긋나거나 표준·MDM·EvalEx 표준 사전·다른 비즈니스 함수와 겹칠 때
     */
    static FunctionDictionaryIfc engine(EngineLookups lookups) {
        Map<String, FunctionIfc> functions = baseFunctions();
        MasterQuery query = new MasterQuery(lookups.codes(),
                new DefaultCodeResolver(lookups.codes(), lookups.codeEff()), lookups.masters());
        functions.put("INSTR", new InstrFunction());
        functions.put("MASTER", new MasterFunction(query));
        functions.put("MASTER_AT", new MasterAtFunction(query));
        Set<String> seen = new TreeSet<>();
        for (BusinessFunction fn : lookups.functions().functions()) {
            String name = fn.name();
            if (name == null || !BUSINESS_NAME.matcher(name).matches()) {
                throw new IllegalArgumentException("비즈니스 함수 이름은 [A-Z][A-Z0-9_]* 이어야 한다: " + name);
            }
            if (FunctionSets.STANDARD.contains(name) || FunctionSets.GENERATED.contains(name)
                    || EVALEX_STANDARD_NAMES.contains(name)) {
                throw new IllegalArgumentException("비즈니스 함수 이름이 표준·MDM 함수와 겹친다: " + name);
            }
            if (!seen.add(name)) {
                throw new IllegalArgumentException("비즈니스 함수 이름이 두 번 나온다: " + name);
            }
            functions.put(name, new BusinessFunctionAdapter(fn));
        }
        return dictionary(functions);
    }

    private static Map<String, FunctionIfc> baseFunctions() {
        Map<String, FunctionIfc> out = new LinkedHashMap<>();
        new TreeSet<>(FunctionSets.BASE).forEach(name -> out.put(name, EVALEX_STANDARD.getFunction(name)));
        return out;
    }

    @SuppressWarnings("unchecked")
    private static FunctionDictionaryIfc dictionary(Map<String, FunctionIfc> functions) {
        return MapBasedFunctionDictionary.ofFunctions(functions.entrySet().toArray(new Map.Entry[0]));
    }
}
