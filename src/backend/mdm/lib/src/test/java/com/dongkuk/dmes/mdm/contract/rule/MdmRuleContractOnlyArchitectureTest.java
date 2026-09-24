package com.dongkuk.dmes.mdm.contract.rule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleRowRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleTestCaseRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVarRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVerRepository;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-01 design.md §3.7 — "실행 로직 없음(contract-only)" 정적 가드. 06 식별자 발급기 구현이 main 에 없고, 06
 * 리포지토리 6개가 메서드를 선언하지 않는다. 런타임 빈 가드(§3.1-12, {@code MdmBusinessRuleMigrationTest})와 함께
 * 수용 기준을 증명한다.
 *
 * <p>{@code DefinitionLookup} 은 정적 규칙으로 막지 않는다: 02 영역이 빈 등록 없는 익명 구현을 main 에 둘 예정이다(F32).
 * 해제 조건은 design.md §7(TSK-08-02 가 발급기를 넣을 때 1번 규칙을 지운다).
 */
class MdmRuleContractOnlyArchitectureTest {

    private static final JavaClasses MDM = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.dongkuk.dmes.mdm");

    private static final List<Class<?>> RULE_REPOSITORIES = List.of(
            MdmRuleRepository.class, MdmRuleVerRepository.class, MdmRuleVarRepository.class,
            MdmRuleRowRepository.class, MdmRuleTestCaseRepository.class, MdmRuleSetRepository.class);

    private static ArchRule noIssuerImplementation() {
        return noClasses().should().implement(MdmRuleIdIssuer.class)
                .as("06 식별자 발급기 구현은 TSK-08-02 몫이다 — 이 Task(계약 전용)는 main 에 구현을 두지 않는다(불변 규칙 21)");
    }

    @Test
    void main_에_MdmRuleIdIssuer_구현_클래스가_없다() {
        noIssuerImplementation().check(MDM);
    }

    @Test
    void _06_리포지토리는_메서드를_선언하지_않는다() {
        for (Class<?> repository : RULE_REPOSITORIES) {
            assertEquals(0, repository.getDeclaredMethods().length,
                    repository.getSimpleName() + " 이 메서드를 선언했다: " + Arrays.toString(repository.getDeclaredMethods()));
        }
    }

    @Test
    void 공허_통과_방지_위반_표본은_발급기_구현_규칙에_잡힌다() {
        // DO_NOT_INCLUDE_TESTS 를 쓰지 않는다 — 표본이 test-only 고립 클래스라 그 옵션을 쓰면 대상 자체가 빠진다.
        JavaClasses isolated = new ClassFileImporter()
                .importPackages("com.dongkuk.dmes.mdm.contract.rule.violation");
        assertTrue(isolated.stream().anyMatch(c -> c.getSimpleName().equals("ViolatingIssuer")), "표본이 가져와지지 않았다");
        assertTrue(noIssuerImplementation().evaluate(isolated).hasViolation(),
                "ViolatingIssuer 가 MdmRuleIdIssuer 를 구현하는데도 규칙이 위반을 잡지 못했다 — 공허 통과");
    }
}
