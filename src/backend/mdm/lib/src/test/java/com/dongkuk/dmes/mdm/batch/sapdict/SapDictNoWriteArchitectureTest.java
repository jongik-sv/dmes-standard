package com.dongkuk.dmes.mdm.batch.sapdict;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.INTERFACES;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-05 design.md §3.7 — "후보는 파일로만 출력하고 자동 등록하지 않는다"(spec 수용 기준 2)를 구조로 고정한다
 * (불변 규칙 I1·I19). 배치 패키지는 DB·Spring·영속성·Flyway·엔티티·리포지토리와 계약 인터페이스(SPI)에 의존하지 않는다.
 *
 * <p>test 소스셋은 가져오지 않는다(DO_NOT_INCLUDE_TESTS) — 위반 표본 {@code SapDictArchViolationSample} 은 test 에만
 * 있고, 규칙이 실제로 위반을 잡는지는 {@link #공허_통과_방지_음성_테스트가_실제로_위반을_잡는다()} 가 따로 증명한다.
 */
class SapDictNoWriteArchitectureTest {

    private static final String BATCH = "com.dongkuk.dmes.mdm.batch.sapdict..";

    private static final JavaClasses MDM = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.dongkuk.dmes.mdm");

    private static ArchRule noWritePath() {
        return noClasses().that().resideInAPackage(BATCH)
                .should().dependOnClassesThat().resideInAnyPackage(
                        "org.springframework..",
                        "jakarta.persistence..",
                        "org.hibernate..",
                        "java.sql..",
                        "javax.sql..",
                        "org.flywaydb..",
                        "com.dongkuk.dmes.mdm.entity..",
                        "com.dongkuk.dmes.mdm.repository..")
                .as("SAP 후보 추출 배치는 DB·Spring·영속성·Flyway·entity·repository 에 의존하지 않는다(TSK-04-05 불변 규칙 I1)");
    }

    private static ArchRule noContractInterface() {
        return noClasses().that().resideInAPackage(BATCH)
                .should().dependOnClassesThat(INTERFACES.and(resideInAPackage("com.dongkuk.dmes.mdm.contract..")))
                .as("SAP 후보 추출 배치는 계약 인터페이스(SPI)에 의존하지 않는다 — enum·상수만 쓴다(TSK-04-05 불변 규칙 I1, D4)");
    }

    @Test
    void 배치_패키지가_비어_있지_않다() {
        long count = MDM.stream()
                .filter(c -> c.getPackageName().startsWith("com.dongkuk.dmes.mdm.batch.sapdict"))
                .count();
        assertTrue(count > 0, "배치 패키지 클래스가 하나도 가져와지지 않았다 — 규칙이 공허하게 통과한다");
    }

    @Test
    void 배치_패키지는_DB_Spring_영속성_Flyway_에_의존하지_않는다() {
        noWritePath().check(MDM);
    }

    @Test
    void 배치_패키지는_계약_인터페이스에_의존하지_않는다() {
        noContractInterface().check(MDM);
    }

    @Test
    void 공허_통과_방지_음성_테스트가_실제로_위반을_잡는다() {
        // 이 임포트는 DO_NOT_INCLUDE_TESTS 를 쓰지 않는다 — 표본이 test-only 라 그 옵션을 쓰면 대상이 빠져 공허 통과한다.
        JavaClasses isolated = new ClassFileImporter()
                .importPackages(
                        "com.dongkuk.dmes.mdm.batch.sapdict.archviolation",
                        "com.dongkuk.dmes.mdm.repository",
                        "com.dongkuk.dmes.mdm.contract.dictionary");

        assertTrue(noWritePath().evaluate(isolated).hasViolation(),
                "표본(리포지토리 필드)이 있는데도 쓰기 경로 규칙이 위반을 잡지 못했다 — 공허 통과");
        assertTrue(noContractInterface().evaluate(isolated).hasViolation(),
                "표본(계약 인터페이스 파라미터)이 있는데도 계약 인터페이스 규칙이 위반을 잡지 못했다 — 공허 통과");
    }
}
