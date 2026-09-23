package kr.dongkuk.maru.mdm.engine.arch;

import static kr.dongkuk.maru.mdm.engine.arch.ContractTypeShapeTest.ENGINE;
import static kr.dongkuk.maru.mdm.engine.arch.ContractTypeShapeTest.PREFIX;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.domain.JavaMethod;
import java.util.ArrayList;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-01 design.md §3.1·§5 I8-I10 — "계약 전용(실행 로직 없음)" 폐쇄 규칙. <b>임시 규칙이다.</b>
 *
 * <p>TSK-03-02·03-03·03-04 중 main 구현 클래스를 먼저 넣는 Task 가 그 커밋에서 이 파일을 지운다(design D2).
 * 세 Task 는 모두 TSK-03-01 에만 의존해 병렬로 진행되므로 삭제 주체를 특정 Task 로 못 박지 않는다.
 * 계약 타입의 모양을 지키는 영구 규칙은 {@link ContractTypeShapeTest} 에 있고, 이 파일을 지워도 남는다.
 * TSK-03-03 이 구현 클래스를 넣으며 무효가 된 2건을 지웠다(TSK-03-01 D2, 팀장 지시). 나머지 3건은 TSK-03-02 가 지운다.
 */
class ContractOnlyPhaseTest {

    private static final String CONFIG = PREFIX + "expr.MdmExpressionConfig";

    @Test
    void MdmExpressionConfig_의_메서드는_UnsupportedOperationException_만_던진다() {
        List<String> violations = new ArrayList<>();
        for (JavaMethod m : ENGINE.get(CONFIG).getMethods()) {
            if (!m.getMethodCallsFromSelf().isEmpty()) {
                violations.add(m.getName() + " 가 메서드를 부른다: " + m.getMethodCallsFromSelf());
            }
            if (!m.getFieldAccesses().isEmpty()) {
                violations.add(m.getName() + " 가 필드를 읽는다: " + m.getFieldAccesses());
            }
            if (!m.getCodeUnitReferencesFromSelf().isEmpty()) {
                violations.add(m.getName() + " 가 메서드 참조를 만든다: " + m.getCodeUnitReferencesFromSelf());
            }
            List<String> ctorTargets = m.getConstructorCallsFromSelf().stream()
                    .map(JavaConstructorCall::getTarget)
                    .map(t -> t.getOwner().getName())
                    .toList();
            if (!ctorTargets.equals(List.of(UnsupportedOperationException.class.getName()))) {
                violations.add(m.getName() + " 의 생성자 호출이 UnsupportedOperationException 하나가 아니다: " + ctorTargets);
            }
        }
        assertEquals(List.of(), violations, "MdmExpressionConfig 메서드는 몸체 없이 UOE 만 던져야 한다(TSK-03-02 몫)");
    }

    @Test
    void baseBuilder_는_UnsupportedOperationException_을_던진다() {
        assertThrows(UnsupportedOperationException.class, MdmExpressionConfig::baseBuilder);
    }

    @Test
    void create_는_UnsupportedOperationException_을_던진다() {
        assertThrows(UnsupportedOperationException.class, () -> MdmExpressionConfig.create(null));
    }
}
