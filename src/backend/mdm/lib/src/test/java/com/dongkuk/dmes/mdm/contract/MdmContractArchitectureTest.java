package com.dongkuk.dmes.mdm.contract;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import java.lang.reflect.RecordComponent;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-02 design.md §3.1 T1 — 계약 패키지({@code com.dongkuk.dmes.mdm.contract..})가 "실행 로직 없음"
 * (spec 수용 기준 1)을 지키는지, mdm 코드가 mcm-core As-Is 마스터 자산을 쓰지 않는지(ADR-0003 D4-2) 고정한다.
 *
 * <p>test 소스셋은 가져오지 않는다(DO_NOT_INCLUDE_TESTS) — 계약 구현 스텁은 test 에만 있어야 하고,
 * main 으로 옮기면 규칙 1 이 잡는다(불변 규칙 I16).
 */
class MdmContractArchitectureTest {

    private static final String CONTRACT = "com.dongkuk.dmes.mdm.contract..";

    private static final JavaClasses MDM = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.dongkuk.dmes.mdm");

    @Test
    void 계약_패키지가_비어_있지_않다() {
        long count = MDM.stream().filter(c -> c.getPackageName().startsWith("com.dongkuk.dmes.mdm.contract")).count();
        assertTrue(count > 0, "계약 패키지 클래스가 하나도 가져와지지 않았다 — 규칙이 공허하게 통과한다");
    }

    @Test
    void 계약_패키지에는_인터페이스_enum_record_상수클래스만_있다() {
        ArchRule rule = classes().that().resideInAPackage(CONTRACT)
                .and().doNotHaveSimpleName("package-info")
                .should(beContractKind())
                .as("계약 패키지에는 인터페이스·enum·record·상수 클래스만 둔다(design.md D9, 불변 규칙 I14)");
        rule.check(MDM);
    }

    @Test
    void 계약_인터페이스의_메서드는_모두_추상이다() {
        ArchRule rule = classes().that().resideInAPackage(CONTRACT).and().areInterfaces()
                .should(haveOnlyAbstractMethods())
                .as("계약 인터페이스에는 default·static 메서드를 두지 않는다(design.md §2.9)");
        rule.check(MDM);
    }

    /**
     * design.md §2.9 — record 는 구성 요소 접근자와 자동 생성 equals·hashCode·toString 만, enum 은 values·valueOf 와
     * 인자 없는 접근자만 둔다. 인자를 받는 판정 메서드(예: {@code canTransit(VersionStatus)})가 계약에 들어오는 것을 막는다.
     * 한계: 인자 없는 enum 메서드의 본문(예: {@code isTerminal()})까지는 보지 않는다.
     */
    @Test
    void 계약_record_와_enum_에는_접근자만_있다() {
        ArchRule rule = classes().that().resideInAPackage(CONTRACT)
                .and(recordOrEnum())
                .should(haveOnlyAccessorMethods())
                .as("계약 record·enum 에는 접근자만 둔다(design.md §2.9)");
        rule.check(MDM);
    }

    /**
     * 상수 필드·enum 필드·record 구성 요소에 함수 객체(람다)를 담아 실행 로직을 들여오는 것을 막는다.
     * ArchUnit 1.x 는 람다 본문을 합성 메서드가 아니라 감싸는 코드 단위로 모델링하므로 규칙 1(메서드 없음)만으로는
     * {@code static final Function<…> F = s -> …} 를 잡지 못한다(Build 변이 검증에서 확인).
     */
    @Test
    void 계약_패키지의_필드는_함수_객체를_담지_않는다() {
        ArchRule rule = noFields().that().areDeclaredInClassesThat().resideInAPackage(CONTRACT)
                .should().haveRawType(functionalType())
                .as("계약 패키지의 필드는 데이터만 담는다 — 함수 객체(java.util.function·Runnable·Callable) 금지");
        rule.check(MDM);
    }

    @Test
    void 계약_패키지는_Spring_JPA_Hibernate_JDBC_에_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage(CONTRACT)
                .should().dependOnClassesThat().resideInAnyPackage(
                        "org.springframework..",
                        "jakarta.persistence..",
                        "org.hibernate..",
                        "java.sql..",
                        "javax.sql..")
                .as("계약 패키지는 java.* 와 cactus ErrorCode 만 쓴다(design.md §2.9)");
        rule.check(MDM);
    }

    @Test
    void mdm_코드는_mcm_core_AsIs_마스터_자산에_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage("com.dongkuk.dmes.mdm..")
                .should().dependOnClassesThat(asIsMasterAsset())
                .as("mdm 은 mcm-core 의 As-Is 마스터 엔티티·리포지토리·화면 패키지를 쓰지 않는다(ADR-0003 D4-2)");
        rule.check(MDM);
    }

    private static DescribedPredicate<JavaClass> recordOrEnum() {
        return new DescribedPredicate<>("records or enums") {
            @Override
            public boolean test(JavaClass type) {
                return type.isRecord() || type.isEnum();
            }
        };
    }

    private static ArchCondition<JavaClass> haveOnlyAccessorMethods() {
        return new ArchCondition<>("have only accessor methods") {
            @Override
            public void check(JavaClass item, ConditionEvents events) {
                Set<String> accessors = new HashSet<>(Set.of("hashCode", "toString"));
                if (item.isRecord()) {
                    for (RecordComponent component : item.reflect().getRecordComponents()) {
                        accessors.add(component.getName());
                    }
                }
                for (JavaMethod method : item.getMethods()) {
                    String name = method.getName();
                    int params = method.getRawParameterTypes().size();
                    // record: 구성 요소 접근자·hashCode·toString(인자 0) + equals(인자 1)
                    // enum: 인자 없는 메서드(values·$values·접근자) + valueOf(String)
                    boolean ok = item.isRecord()
                            ? (params == 0 && accessors.contains(name)) || (params == 1 && name.equals("equals"))
                            : params == 0 || (params == 1 && name.equals("valueOf"));
                    if (!ok) {
                        events.add(SimpleConditionEvent.violated(item,
                                item.getName() + "." + method.getName() + " 은(는) 접근자가 아니다"));
                    }
                }
            }
        };
    }

    private static DescribedPredicate<JavaClass> functionalType() {
        return new DescribedPredicate<>("함수 객체 타입") {
            @Override
            public boolean test(JavaClass type) {
                return type.getPackageName().equals("java.util.function")
                        || type.isEquivalentTo(Runnable.class)
                        || type.isEquivalentTo(java.util.concurrent.Callable.class);
            }
        };
    }

    private static DescribedPredicate<JavaClass> asIsMasterAsset() {
        return new DescribedPredicate<>("mcm-core As-Is 마스터 자산(cma·cmb·cme·code 패키지, entity·repository 의 Master*·RuleMaster*)") {
            @Override
            public boolean test(JavaClass target) {
                String pkg = target.getPackageName();
                if (pkg.equals("com.dongkuk.dmes.mcm.cma") || pkg.startsWith("com.dongkuk.dmes.mcm.cma.")
                        || pkg.equals("com.dongkuk.dmes.mcm.cmb") || pkg.startsWith("com.dongkuk.dmes.mcm.cmb.")
                        || pkg.equals("com.dongkuk.dmes.mcm.cme") || pkg.startsWith("com.dongkuk.dmes.mcm.cme.")
                        || pkg.equals("com.dongkuk.dmes.mcm.code") || pkg.startsWith("com.dongkuk.dmes.mcm.code.")) {
                    return true;
                }
                if (pkg.equals("com.dongkuk.dmes.mcm.entity") || pkg.equals("com.dongkuk.dmes.mcm.repository")) {
                    String name = target.getSimpleName();
                    return name.startsWith("Master") || name.startsWith("RuleMaster");
                }
                return false;
            }
        };
    }

    private static ArchCondition<JavaClass> beContractKind() {
        return new ArchCondition<>("be an interface, enum, record or constant class") {
            @Override
            public void check(JavaClass item, ConditionEvents events) {
                if (item.isInterface() || item.isEnum() || item.isRecord()) {
                    return;
                }
                String violation = constantClassViolation(item);
                if (violation != null) {
                    events.add(SimpleConditionEvent.violated(item,
                            item.getName() + " 은(는) 인터페이스·enum·record 가 아니고 상수 클래스 조건도 어긴다: " + violation));
                }
            }
        };
    }

    /** 상수 클래스 = final, 필드 전부 static final, 생성자 전부 private, 생성자 외 메서드 없음. 통과면 null. */
    private static String constantClassViolation(JavaClass item) {
        if (!item.getModifiers().contains(JavaModifier.FINAL)) {
            return "final 이 아니다";
        }
        boolean nonStaticFinalField = item.getFields().stream().anyMatch(f ->
                !f.getModifiers().contains(JavaModifier.STATIC) || !f.getModifiers().contains(JavaModifier.FINAL));
        if (nonStaticFinalField) {
            return "static final 이 아닌 필드가 있다";
        }
        boolean nonPrivateConstructor = item.getConstructors().stream().anyMatch(c ->
                !c.getModifiers().contains(JavaModifier.PRIVATE));
        if (nonPrivateConstructor) {
            return "private 이 아닌 생성자가 있다";
        }
        if (!item.getMethods().isEmpty()) {
            return "메서드가 있다 " + item.getMethods().stream().map(JavaMethod::getName).sorted().toList();
        }
        return null;
    }

    private static ArchCondition<JavaClass> haveOnlyAbstractMethods() {
        return new ArchCondition<>("have only abstract methods") {
            @Override
            public void check(JavaClass item, ConditionEvents events) {
                for (JavaMethod method : item.getMethods()) {
                    if (!method.getModifiers().contains(JavaModifier.ABSTRACT)) {
                        events.add(SimpleConditionEvent.violated(item,
                                item.getName() + "." + method.getName() + " 이(가) 추상 메서드가 아니다(default·static)"));
                    }
                }
            }
        };
    }
}
