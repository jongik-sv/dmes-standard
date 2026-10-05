package kr.dongkuk.maru.mdm.engine.rule;

import java.util.Map;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 판정 준비된 세트 하나(하위 세트 계획 Task 4) — 정의에만 의존하는 부분(흐름 트리·룰 정의·입력 키 검사기 원본·하위 세트 준비·겉모양).
 * {@code MdmRuleEngine} 이 만들어 세트 ID 마다 기억하고 {@code FlowRun} 이 실행한다. 판정마다 바뀌는 지연 목록은 여기 두지 않는다 — 실행은 늘
 * {@link FlowKeys#forRun} 사본을 쓴다. 하위 세트는 SET 노드 ID 마다 따로 준비한다(깊이·순환 판정이 호출 경로마다 다르다).
 *
 * <p>record 가 아니다: {@code EngineContractSchemaTest} 가 rule 패키지의 모든 record·enum 을 계약 대조표와 견준다.
 */
final class PreparedSet {

    /** 이 준비를 만든 세트 정의 객체 — 기억 적중은 객체 동일성으로 본다. */
    final RuleSetDefinition set;
    final String setId;
    final FlowTree tree;
    /** 룰 ID → 정의. 조회에 실패한 룰은 없다(그때는 준비가 RULE_NOT_FOUND 를 모은다). */
    final Map<String, RuleDefinition> defs;
    /** 입력 키 검사기 원본 — {@link FlowKeys#check} 를 직접 부르지 않고 사본을 쓴다. */
    final FlowKeys keys;
    /** SET 노드 ID → 준비된 하위 세트. 준비에 실패한 노드(없음·폐기·순환·깊이·구조·룰 없음 밖의 실패)는 없다. */
    final Map<String, PreparedSet> calls;
    /** 이 세트를 하위 세트로 부를 때의 겉모양. 최상위 준비는 쓰지 않으므로 null 이다. */
    final SetShape shape;
    /** 받는 노드 ID → label(없으면 노드 ID) — 이 세트를 끝낸 받는 노드의 SUBSET_ENDED CATCH_MSG(Ruling 5). 최상위 준비는 빈 맵. */
    final Map<String, String> catchLabels;

    PreparedSet(RuleSetDefinition set, FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys, Map<String, PreparedSet> calls,
            @Nullable SetShape shape, Map<String, String> catchLabels) {
        this.set = set;
        this.setId = set.setId();
        this.tree = tree;
        this.defs = defs;
        this.keys = keys;
        this.calls = calls;
        this.shape = shape;
        this.catchLabels = catchLabels;
    }

    /** 이번 호출이 고른 룰 정의가 이 준비를 만든 정의와 같은 객체들인가(룰 ID·순서·객체 동일성). */
    boolean sameDefs(Map<String, RuleDefinition> current) {
        if (current.size() != defs.size()) {
            return false;
        }
        var a = defs.entrySet().iterator();
        var b = current.entrySet().iterator();
        while (a.hasNext()) {
            Map.Entry<String, RuleDefinition> x = a.next();
            Map.Entry<String, RuleDefinition> y = b.next();
            if (!x.getKey().equals(y.getKey()) || x.getValue() != y.getValue()) {
                return false;
            }
        }
        return true;
    }
}
