package kr.dongkuk.maru.mdm.engine.arch;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-01 design.md §3.1·§5 I1·I2 — 엔진 다섯 패키지의 의존 방향(06-business-rule.md:461·463). 영구 규칙.
 *
 * <p>spi 는 아무 engine 패키지도·EvalEx 도 보지 않는다. code 는 spi 만, expr 는 spi·code, rule·domain 은 expr·spi 를 본다.
 * rule 과 domain 은 서로 보지 않고, domain 은 code 를 직접 보지 않는다.
 */
class EnginePackageDependencyTest {

    private static final JavaClasses ENGINE = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("kr.dongkuk.maru.mdm.engine");

    @Test
    void spi_는_EvalEx_와_다른_engine_패키지를_보지_않는다() {
        noClasses().that().resideInAPackage("..engine.spi..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.ezylang..", "..engine.code..", "..engine.expr..", "..engine.rule..", "..engine.domain..")
                .as("spi 는 EvalEx 타입과 다른 engine 패키지를 쓰지 않는다 (06:461·463)")
                .check(ENGINE);
    }

    @Test
    void code_는_spi_만_보고_EvalEx_를_쓰지_않는다() {
        noClasses().that().resideInAPackage("..engine.code..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.ezylang..", "..engine.expr..", "..engine.rule..", "..engine.domain..")
                .as("code 는 spi 만 본다 — EvalEx 를 쓰지 않는다 (06:460·463)")
                .check(ENGINE);
    }

    @Test
    void expr_는_rule_과_domain_을_보지_않는다() {
        noClasses().that().resideInAPackage("..engine.expr..")
                .should().dependOnClassesThat().resideInAnyPackage("..engine.rule..", "..engine.domain..")
                .as("expr 는 spi·code 만 본다 (06:463)")
                .check(ENGINE);
    }

    @Test
    void rule_은_domain_과_code_를_보지_않는다() {
        noClasses().that().resideInAPackage("..engine.rule..")
                .should().dependOnClassesThat().resideInAnyPackage("..engine.domain..", "..engine.code..")
                .as("rule 은 expr·spi 만 본다 (06:463)")
                .check(ENGINE);
    }

    @Test
    void domain_은_rule_과_code_를_보지_않는다() {
        noClasses().that().resideInAPackage("..engine.domain..")
                .should().dependOnClassesThat().resideInAnyPackage("..engine.rule..", "..engine.code..")
                .as("domain 은 expr·spi 만 본다 — code 를 직접 보지 않는다 (06:463)")
                .check(ENGINE);
    }
}
