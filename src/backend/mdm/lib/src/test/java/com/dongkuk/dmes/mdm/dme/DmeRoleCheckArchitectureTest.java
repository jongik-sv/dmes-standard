package com.dongkuk.dmes.mdm.dme;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-02 design I30 — 룰 화면(dme) 서비스는 역할을 직접 보지 않고 {@code common.rule.RuleStewardCheck} 한 곳만 부른다(06-02
 * {@code MdmStewardGuard} 머지 뒤 그 한 곳만 바꾼다). {@code MdmRoles.STEWARD} 는 컴파일 상수라 클래스 파일에 참조가 남지 않으므로
 * 역할 집합을 여는 {@code MdmCurrentUser.roleIds()} 호출을 막는다.
 */
class DmeRoleCheckArchitectureTest {

    private static ArchRule noDirectRoleCheck() {
        return noClasses().that().resideInAPackage("com.dongkuk.dmes.mdm.dme..")
                .should().callMethod(MdmCurrentUser.class, "roleIds")
                .as("dme 는 역할을 RuleStewardCheck 로만 판단한다(I30)");
    }

    @Test
    void dme_는_MdmCurrentUser_roleIds_를_부르지_않는다() {
        JavaClasses dme = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.dongkuk.dmes.mdm.dme");
        assertTrue(dme.stream().anyMatch(c -> c.getSimpleName().equals("RuleMngService")), "dme 클래스가 가져와지지 않았다");
        noDirectRoleCheck().check(dme);
    }
}
