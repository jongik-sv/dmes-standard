package kr.dongkuk.maru.mdm.engine.arch;

import static com.tngtech.archunit.lang.conditions.ArchConditions.callMethod;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.math.BigDecimal;
import kr.dongkuk.maru.mdm.engine.domain.DomainValidator;
import kr.dongkuk.maru.mdm.engine.expr.ValueConverter;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-02 design.md §3.1·D2 — 수용 기준 6: 타입 변환 계약이 룰 엔진과 같은 함수를 쓴다. 도메인 검증기는 공개 단일 진입점
 * {@link ValueConverter#convert} 를 부르고 값 변환을 직접 하지 않는다. rule 쪽 결속은 TSK-03-03 이 더한다(지금 rule 에
 * 구현이 없어 대상이 비고, 형제 Task 머지 순간 dev 를 빨강으로 만들 수 있다).
 */
class TypeConversionEntryTest {

    private static final JavaClasses ENGINE = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("kr.dongkuk.maru.mdm.engine");

    @Test
    void 도메인_검증기는_ValueConverter_convert_를_부른다() {
        classes().that().implement(DomainValidator.class)
                .should(callMethod(ValueConverter.class, "convert", Object.class, DataType.class))
                .as("도메인 검증기는 ValueConverter.convert 로 값을 바꾼다 (02 실행 순서 3단계, 06:198)")
                .check(ENGINE);
    }

    @Test
    void domain_은_값_변환을_직접_하지_않는다() {
        noClasses().that().resideInAPackage("..engine.domain..")
                .should().callConstructor(BigDecimal.class, String.class)
                .orShould().callMethod(BigDecimal.class, "valueOf", long.class)
                .orShould().callMethod(BigDecimal.class, "valueOf", double.class)
                .orShould().callMethod(BigDecimal.class, "valueOf", long.class, int.class)
                .orShould().callMethod(Boolean.class, "parseBoolean", String.class)
                .orShould().callMethod(Boolean.class, "valueOf", String.class)
                .as("domain 은 BigDecimal·Boolean 변환을 직접 하지 않는다 — ValueConverter 한 곳이 한다")
                .check(ENGINE);
    }
}
