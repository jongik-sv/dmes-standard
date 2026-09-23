package kr.dongkuk.maru.mdm.engine.arch;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.equivalentTo;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static kr.dongkuk.maru.mdm.engine.arch.ContractTypeShapeTest.CONTRACT_TYPES;
import static kr.dongkuk.maru.mdm.engine.arch.ContractTypeShapeTest.ENGINE;
import static kr.dongkuk.maru.mdm.engine.arch.ContractTypeShapeTest.PREFIX;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.config.ExpressionConfiguration;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.domain.JavaMethod;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-01 design.md §3.1·§5 I8-I10 — "계약 전용(실행 로직 없음)" 폐쇄 규칙. <b>임시 규칙이다.</b>
 *
 * <p>TSK-03-02·03-03·03-04 중 main 구현 클래스를 먼저 넣는 Task 가 그 커밋에서 이 파일을 지운다(design D2).
 * 세 Task 는 모두 TSK-03-01 에만 의존해 병렬로 진행되므로 삭제 주체를 특정 Task 로 못 박지 않는다.
 * 계약 타입의 모양을 지키는 영구 규칙은 {@link ContractTypeShapeTest} 에 있고, 이 파일을 지워도 남는다.
 */
class ContractOnlyPhaseTest {

    /** TSK-01-01 스캐폴드 — TSK-03-02 가 교체한다. */
    private static final String SCAFFOLD = PREFIX + "expr.ExpressionEvaluator";

    /** {@code MasterLookup.NONE} 익명 클래스(design §6.1 허용 예외). 추상 메서드가 둘이라 람다로 쓸 수 없다. */
    private static final String MASTER_LOOKUP_NONE = PREFIX + "spi.MasterLookup$1";

    private static final String CONFIG = PREFIX + "expr.MdmExpressionConfig";

    @Test
    void main_클래스_집합이_계약_타입과_스캐폴드로_닫혀_있다() {
        Set<String> actual = new TreeSet<>();
        for (JavaClass c : ENGINE) {
            if (!c.getSimpleName().equals("package-info")) {
                actual.add(c.getName());
            }
        }
        Set<String> expected = new TreeSet<>(CONTRACT_TYPES);
        expected.add(SCAFFOLD);
        expected.add(MASTER_LOOKUP_NONE);

        Set<String> added = new TreeSet<>(actual);
        added.removeAll(expected);
        Set<String> missing = new TreeSet<>(expected);
        missing.removeAll(actual);
        assertTrue(added.isEmpty() && missing.isEmpty(),
                "main 클래스 집합이 계약 타입 + 스캐폴드와 다르다 — 더해진 것 " + added + ", 빠진 것 " + missing);

        JavaClass none = ENGINE.get(MASTER_LOOKUP_NONE);
        assertTrue(none.isAnonymousClass()
                        && none.getEnclosingClass().map(JavaClass::getName).orElse("").equals(PREFIX + "spi.MasterLookup"),
                "MasterLookup$1 은 MasterLookup 안의 익명 클래스(NONE)여야 한다");
    }

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
    void EvalEx_실행_타입은_스캐폴드_ExpressionEvaluator_만_쓴다() {
        DescribedPredicate<JavaClass> evalExExecution = resideInAPackage("com.ezylang..")
                .and(DescribedPredicate.not(equivalentTo(ExpressionConfiguration.class)
                        .or(equivalentTo(ExpressionConfiguration.ExpressionConfigurationBuilder.class))));
        noClasses().that().resideInAPackage("kr.dongkuk.maru.mdm.engine..")
                .and().doNotHaveFullyQualifiedName(SCAFFOLD)
                .should().dependOnClassesThat(evalExExecution)
                .as("계약 전용 단계에서 EvalEx 는 설정 타입(시그니처)만 쓴다 — 평가는 스캐폴드뿐이다")
                .check(ENGINE);
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
