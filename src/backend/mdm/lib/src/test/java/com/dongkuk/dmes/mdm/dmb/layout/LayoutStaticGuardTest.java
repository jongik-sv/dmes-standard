package com.dongkuk.dmes.mdm.dmb.layout;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-05-02 design.md §3.1 — 정적 가드(불변 I18·I19). 규칙마다 위반 샘플로 공허 통과를 막는다.
 */
class LayoutStaticGuardTest {

    private static final String DMB = "com.dongkuk.dmes.mdm.dmb..";

    private static final ArchRule NO_TX_CLASS = noClasses().that().resideInAnyPackage(DMB)
            .should().beAnnotatedWith(Transactional.class)
            .orShould().dependOnClassesThat().haveFullyQualifiedName("org.springframework.transaction.support.TransactionTemplate")
            .orShould().callMethod(javax.sql.DataSource.class, "getConnection");
    private static final ArchRule NO_TX_METHOD = noMethods().that().areDeclaredInClassesThat().resideInAnyPackage(DMB)
            .should().beAnnotatedWith(Transactional.class);

    /** 예약어 칼럼·행 수 제한 문법·백틱·널 파라미터 비교 — 단어 경계라 TOTAL_LENGTH·FILLER_LENGTH 는 걸리지 않는다. */
    private static final List<Pattern> FORBIDDEN = List.of(
            Pattern.compile("\\bOFFSET\\b", Pattern.CASE_INSENSITIVE), Pattern.compile("\\bLENGTH\\b", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\bVERSION\\b", Pattern.CASE_INSENSITIVE), Pattern.compile("\\bLIMIT\\b", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\bTOP\\b", Pattern.CASE_INSENSITIVE), Pattern.compile("`"),
            Pattern.compile(":\\w+\\s+IS\\s+NULL", Pattern.CASE_INSENSITIVE));

    @Test
    void dmb_패키지에_Transactional_과_직접_커넥션이_없다() {
        JavaClasses classes = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.dongkuk.dmes.mdm.dmb");
        assertTrue(classes.size() > 10, "dmb 클래스가 가져와지지 않았다 — 규칙이 공허하게 통과한다");
        NO_TX_CLASS.check(classes);
        NO_TX_METHOD.check(classes);
    }

    @Test
    void 규칙은_위반_샘플을_실제로_잡는다() {
        JavaClasses sample = new ClassFileImporter().importClasses(TxViolationSample.class);
        assertThrows(AssertionError.class, () -> noClasses().should().beAnnotatedWith(Transactional.class).check(sample));
        assertThrows(AssertionError.class, () -> noMethods().should().beAnnotatedWith(Transactional.class).check(sample));
    }

    @Test
    void 네이티브_SQL_은_예약어_칼럼을_쓰지_않는다() {
        assertFalse(LayoutQueries.ALL_NATIVE_SQL.isEmpty());
        for (String sql : LayoutQueries.ALL_NATIVE_SQL) {
            assertTrue(portable(sql), sql);
        }
        assertTrue(portable("SELECT TOTAL_LENGTH, FILLER_LENGTH FROM TB_MDM_LAYOUT_ITEM"), "단어 경계 오탐 없음");
        assertFalse(portable("SELECT `OFFSET` FROM TB_MDM_LAYOUT_ITEM"), "백틱·OFFSET 샘플");
        assertFalse(portable("SELECT LENGTH FROM TB_MDM_LAYOUT_ITEM"), "LENGTH 샘플");
        assertFalse(portable("SELECT VERSION FROM TB_MDM_LAYOUT"), "VERSION 샘플");
        assertFalse(portable("SELECT PHYS_NAME FROM TB_MDM_COLUMN LIMIT 100"), "LIMIT 샘플");
        assertFalse(portable("SELECT TOP 100 PHYS_NAME FROM TB_MDM_COLUMN"), "TOP 샘플");
        assertFalse(portable("SELECT PHYS_NAME FROM TB_MDM_COLUMN WHERE :kw IS NULL OR PHYS_NAME LIKE :kw"), "널 파라미터 샘플");
    }

    private static boolean portable(String sql) {
        return FORBIDDEN.stream().noneMatch(p -> p.matcher(sql).find());
    }

    @Transactional
    static class TxViolationSample {
        @Transactional
        public void write() {
        }
    }
}
