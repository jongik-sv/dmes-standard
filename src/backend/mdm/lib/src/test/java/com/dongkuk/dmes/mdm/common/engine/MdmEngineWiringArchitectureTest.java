package com.dongkuk.dmes.mdm.common.engine;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.ezylang.evalex.Expression;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.time.Duration;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-03(반려 재작업) design.md §3.6·§5.3 I47 — 평가기는 {@link MdmEngineConfig} 빈 한 곳에서만 만든다(D19).
 * mdm main 은 EvalEx {@code Expression} 을 직접 만들지 않는다(캐시 경로는 {@code MdmEvaluator} 하나뿐이어야 한다).
 */
class MdmEngineWiringArchitectureTest {

    private static final JavaClasses MDM = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.dongkuk.dmes.mdm");

    @Test
    void 평가기는_MdmEngineConfig_만_만든다() {
        noClasses().that().resideInAPackage("com.dongkuk.dmes.mdm..")
                .and().doNotBelongToAnyOf(MdmEngineConfig.class)
                .should().callConstructor(MdmEvaluator.class, EngineLookups.class)
                .orShould().callConstructor(MdmEvaluator.class, EngineLookups.class, Duration.class)
                .as("MdmEvaluator 는 MdmEngineConfig 빈 하나에서만 만든다(D19, I47)")
                .check(MDM);
    }

    @Test
    void mdm_은_EvalEx_Expression_을_직접_만들지_않는다() {
        noClasses().that().resideInAPackage("com.dongkuk.dmes.mdm..")
                .should().dependOnClassesThat().belongToAnyOf(Expression.class)
                .as("mdm main 은 EvalEx Expression 을 직접 만들지 않는다(I47)")
                .check(MDM);
    }
}
