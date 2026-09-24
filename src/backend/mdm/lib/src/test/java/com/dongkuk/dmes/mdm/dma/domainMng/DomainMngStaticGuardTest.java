package com.dongkuk.dmes.mdm.dma.domainMng;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainImpactQueries;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

/**
 * design.md §4.1 U8 — 정적 가드(불변 I11·I12·I13). 프록시 해제 여부나 실행 경로에 기대지 않고 코드·SQL 문자열을 본다.
 * 각 규칙은 위반 샘플에 한 번 적용해 실제로 걸리는지(공허 통과 방지) 확인한다.
 */
class DomainMngStaticGuardTest {

    private static final String[] PACKAGES = {
            "com.dongkuk.dmes.mdm.dma.domainMng..", "com.dongkuk.dmes.mdm.common.dictionary..",
            "com.dongkuk.dmes.mdm.common.engine.."};

    private static final ArchRule NO_TX_CLASS = noClasses().that().resideInAnyPackage(PACKAGES)
            .should().beAnnotatedWith(Transactional.class)
            .orShould().dependOnClassesThat().haveFullyQualifiedName("org.springframework.transaction.support.TransactionTemplate")
            .orShould().callMethod(javax.sql.DataSource.class, "getConnection");
    private static final ArchRule NO_TX_METHOD = noMethods().that().areDeclaredInClassesThat().resideInAnyPackage(PACKAGES)
            .should().beAnnotatedWith(Transactional.class);

    @Test
    void 서비스와_구현체에_Transactional_과_직접_커넥션이_없다() {
        JavaClasses classes = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.dongkuk.dmes.mdm");
        NO_TX_CLASS.check(classes);
        NO_TX_METHOD.check(classes);
    }

    @Test
    void 규칙은_위반_샘플을_실제로_잡는다() {
        JavaClasses sample = new ClassFileImporter().importClasses(TxViolationSample.class);
        ArchRule classRule = noClasses().should().beAnnotatedWith(Transactional.class);
        ArchRule methodRule = noMethods().should().beAnnotatedWith(Transactional.class);
        assertThrows(AssertionError.class, () -> classRule.check(sample));
        assertThrows(AssertionError.class, () -> methodRule.check(sample));
    }

    @Test
    void 영향도_SQL_은_공통_문안이고_03_06_테이블을_읽지_않는다() {
        for (String sql : DomainImpactQueries.ALL_SQL) {
            assertTrue(sqlIsPortable(sql), sql);
        }
        assertTrue(DomainImpactQueries.SUBTREE_SQL.contains("DEPTH < 50"), "깊이 가드 50");
        assertTrue(DomainImpactQueries.ANCESTORS_SQL.contains("DEPTH < 50"), "깊이 가드 50");
        assertFalse(sqlIsPortable("WITH RECURSIVE T (X) AS (SELECT 1) SELECT X FROM T"), "RECURSIVE 샘플");
        assertFalse(sqlIsPortable("SELECT REF_KEY FROM TB_MDM_LAYOUT_ITEM"), "03 테이블 샘플");
        assertFalse(sqlIsPortable("SELECT VAR_NAME FROM TB_MDM_RULE_VAR"), "06 테이블 샘플");
    }

    private static boolean sqlIsPortable(String sql) {
        String upper = sql.toUpperCase(Locale.ROOT);
        return List.of("RECURSIVE", "TB_MDM_LAYOUT", "TB_MDM_RULE", "TB_MDM_DICT_SEQ", "TB_MDM_DICT_SYSTEM").stream()
                .noneMatch(upper::contains);
    }

    @Transactional
    static class TxViolationSample {
        @Transactional
        public void write() {
        }
    }
}
