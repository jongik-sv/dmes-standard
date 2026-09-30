package kr.dongkuk.maru.mdm.engine.rule;

import java.util.Collection;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 테스트 도우미(mdm/api 테스트 소스, 엔진과 같은 패키지) — package-private {@link FlowKeys} 를 실제로 만들어 IF 조건식 변수의 선언 타입
 * ({@code condTypes})을 묻는다. 엔진에는 module-info·jar 봉인이 없어 같은 패키지 이름으로 닿는다. 엔진 main 코드는 바꾸지 않는다.
 */
public final class FlowKeysProbe {

    private FlowKeysProbe() {
    }

    /**
     * {@code candidates} 를 모두 쓰는 조건식({@code A == 1 && B == 1 && ...})을 {@code new FlowKeys(defs, evaluator).condTypes} 에 넣어,
     * 세트 룰이 타입을 선언한 이름만 대문자로 돌려준다.
     */
    public static Set<String> declaredAmong(Map<String, RuleDefinition> defs, MdmEvaluator evaluator, Collection<String> candidates) {
        String cond = candidates.stream().map(n -> n + " == 1").collect(Collectors.joining(" && "));
        Set<String> out = new TreeSet<>();
        new FlowKeys(defs, evaluator).condTypes(cond).keySet().forEach(n -> out.add(n.toUpperCase(Locale.ROOT)));
        return out;
    }
}
