package com.dongkuk.dmes.mdm.entity;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-01 design.md §5 불변 규칙 6·9 — mutation check 로 드러난 커버리지 구멍을 메운다(Build 기록 참고).
 *
 * <p>기존 {@code MdmContractArchitectureTest} 는 {@code contract..} 패키지만 본다. 엔티티 패키지가
 * 엔진 타입을 끌어오거나(불변 규칙 6) JPA 연관관계 매핑을 쓰는 변이(불변 규칙 9)는 왕복 테스트만으로는
 * 잡히지 않는다 — 두 변이 모두 정상 저장·조회가 그대로 통과하기 때문이다(실측 확인, Build 기록).
 */
class MdmEntityArchitectureTest {

    private static final String ENTITY = "com.dongkuk.dmes.mdm.entity..";

    private static final JavaClasses MDM = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.dongkuk.dmes.mdm");

    @Test
    void 엔티티_패키지는_엔진_타입에_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage(ENTITY)
                .should().dependOnClassesThat().resideInAnyPackage("kr.dongkuk.maru.mdm.engine..")
                .as("mdm 엔티티는 kr.dongkuk.maru.mdm.engine.. 에 의존하지 않는다(불변 규칙 6, 두 모듈 결합 방지)");
        rule.check(MDM);
    }

    @Test
    void 엔티티_패키지는_ManyToOne_연관관계_매핑을_쓰지_않는다() {
        ArchRule rule = noFields().that().areDeclaredInClassesThat().resideInAPackage(ENTITY)
                .should().beAnnotatedWith(ManyToOne.class)
                .as("mdm 은 MES 모듈이라 @ManyToOne 을 쓰지 않는다(불변 규칙 9, F16) — FK 는 원시 ID 필드로만 표현한다");
        rule.check(MDM);
    }

    @Test
    void 엔티티_패키지는_OneToMany_연관관계_매핑을_쓰지_않는다() {
        ArchRule rule = noFields().that().areDeclaredInClassesThat().resideInAPackage(ENTITY)
                .should().beAnnotatedWith(OneToMany.class)
                .as("mdm 은 MES 모듈이라 @OneToMany 를 쓰지 않는다(불변 규칙 9)");
        rule.check(MDM);
    }

    @Test
    void 엔티티_패키지는_OneToOne_ManyToMany_연관관계_매핑을_쓰지_않는다() {
        ArchRule oneToOne = noFields().that().areDeclaredInClassesThat().resideInAPackage(ENTITY)
                .should().beAnnotatedWith(OneToOne.class)
                .as("mdm 은 MES 모듈이라 @OneToOne 을 쓰지 않는다(불변 규칙 9)");
        oneToOne.check(MDM);
        ArchRule manyToMany = noFields().that().areDeclaredInClassesThat().resideInAPackage(ENTITY)
                .should().beAnnotatedWith(ManyToMany.class)
                .as("mdm 은 MES 모듈이라 @ManyToMany 를 쓰지 않는다(불변 규칙 9)");
        manyToMany.check(MDM);
    }
}
