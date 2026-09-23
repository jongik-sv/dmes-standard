package kr.dongkuk.maru.mdm.engine.arch;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

/**
 * design.md §5 불변 규칙 1·2 — mcm-core {@code McmCoreArchitectureTest} 관용구 확장(§1 표).
 *
 * <p>규칙 1: 엔진은 EvalEx·java 표준(lang/util/math/time/text) 외 의존을 갖지 않는다.
 * <p>규칙 2: 엔진은 DB(java.sql/javax.sql)·네트워크(java.net/java.nio.channels)를 직접 호출하지 않는다.
 *
 * <p>규칙 1 의 화이트리스트에 {@code java.io} 가 없어(허용 목록은 lang/util/math/time/text 뿐),
 * 임의 파일 I/O 는 규칙 2 의 별도 금지 목록이 아니라 규칙 1 의 화이트리스트 밖이라는 사실로
 * 이미 막힌다(design.md §5 규칙 1 변이 문구 참고).
 */
class MaruMdmEngineArchitectureTest {

    private static final JavaClasses ENGINE = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("kr.dongkuk.maru.mdm.engine");

    @Test
    void engine_은_EvalEx_와_java_표준_외에_의존하지_않는다() {
        ArchRule rule = classes().that().resideInAPackage("kr.dongkuk.maru.mdm.engine..")
                .should().onlyDependOnClassesThat().resideInAnyPackage(
                        "kr.dongkuk.maru.mdm.engine..",
                        "com.ezylang.evalex..",
                        "java.lang..", "java.util..", "java.math..", "java.time..", "java.text..")
                .as("엔진 jar 는 EvalEx·java 표준 외 의존을 금지한다 (PRD FR-E7·TRD §10)");
        rule.check(ENGINE);
    }

    @Test
    void engine_은_DB_와_네트워크를_직접_호출하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage("kr.dongkuk.maru.mdm.engine..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "java.sql..", "javax.sql..", "java.net..", "java.nio.channels..")
                .as("엔진 jar 는 DB·네트워크를 직접 호출하지 않는다 — 정의·사본 조회는 engine.spi 로만 받는다 (TRD §10)");
        rule.check(ENGINE);
    }
}
