package com.dongkuk.dmes.mdm.dmb.layout.codec;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

/**
 * TSK-05-03 design.md §3.1 — 직렬화기·파서의 입력은 스냅샷뿐이다(불변 I11, 수용 기준 2 의 구조 보증). {@code dmb.layout.codec} 은
 * {@code java.*}·{@code contract.layout}·자기 패키지만 의존한다 — 엔티티·리포지토리·{@code EntityManager}·Spring·Jackson 을 보지
 * 않으므로 라이브 레이아웃 행을 읽을 길이 없다.
 */
class LayoutCodecArchitectureTest {

    private static final String CODEC = "com.dongkuk.dmes.mdm.dmb.layout.codec..";

    private static final ArchRule ONLY_SNAPSHOT = classes().that().resideInAPackage(CODEC)
            .should().onlyDependOnClassesThat().resideInAnyPackage("java..", "com.dongkuk.dmes.mdm.contract.layout..", CODEC);

    @Test
    void 직렬화기_파서는_스냅샷과_java_만_의존한다() {
        JavaClasses main = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.dongkuk.dmes.mdm.dmb.layout.codec");
        assertTrue(main.contain(LayoutSerializer.class) && main.contain(LayoutParser.class),
                "codec 클래스가 가져와지지 않았다 — 규칙이 공허하게 통과한다");
        ONLY_SNAPSHOT.check(main);
    }

    @Test
    void 규칙은_위반_샘플을_실제로_잡는다() {
        JavaClasses sample = new ClassFileImporter().importClasses(EntityReadingSample.class);
        assertThrows(AssertionError.class, () -> ONLY_SNAPSHOT.check(sample));
    }

    /** 위반 샘플 — codec 패키지 안에서 엔티티를 읽는다. */
    static class EntityReadingSample {
        int length(MdmLayoutItem item) {
            return item.getLength();
        }
    }
}
