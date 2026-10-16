package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/**
 * C8 — 실시간 허브(stream)는 명령 서비스(service)에 기대지 않는다. service 가 허브로 발행하고 허브는 {@link ErdChangeSource} 같은
 * stream 쪽 입구로만 읽으므로 두 패키지 사이에 순환이 없다.
 */
class ErdStreamLayerArchitectureTest {

    private static final JavaClasses ERD = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.dongkuk.dmes.mdm.dma.erdEdit");

    @Test
    void streamDoesNotDependOnService() {
        noClasses().that().resideInAPackage("com.dongkuk.dmes.mdm.dma.erdEdit.stream..")
                .should().dependOnClassesThat().resideInAPackage("com.dongkuk.dmes.mdm.dma.erdEdit.service..")
                .as("ERD stream 은 service 에 기대지 않는다(C8, stream↔service 순환 금지)")
                .check(ERD);
    }
}
