package com.dongkuk.dmes.mdm.common.version;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** D-144 3단계 — 객체 ID 가 INTEGER 인 버전 표에서 공통 저장소의 모든 연산이 문자열 ID 로 동작한다(스펙 §4.2). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class VersionRowStoreIntegerIdSqliteTest extends AbstractMdmSharedDbTest {

    private static final AuditStamp STAMP = new AuditStamp("kim", "TEST", "TEST", Instant.parse("2026-06-15T00:00:00Z"));
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 15, 9, 0, 0);

    @Autowired EntityManager em;
    @Autowired MdmTemporalBinder temporal;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txm;

    private VersionRowStore store;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        VersionFixtureTables.integerIdSqliteDdl().forEach(jdbc::execute);
        VersionFixtureTables.clearIntegerId(jdbc);
        store = new VersionRowStore(em, target -> VersionFixtureTables.LAYOUT_SPEC, temporal);
        tx = new TransactionTemplate(txm);
        jdbc.update("INSERT INTO TB_MDM_TC_LAYOUT (LAYOUT_ID, STATUS, VER) VALUES (7, 'CREATED', 0)");
        jdbc.update("INSERT INTO TB_MDM_TC_LAYOUT_VER (LAYOUT_ID, VER, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, ROW_VERSION) "
                + "VALUES (7, 1.000, 'RELEASED', NULL, '2026-01-01 00:00:00', '9999-12-31 00:00:00', 0)");
        jdbc.update("INSERT INTO TB_MDM_TC_LAYOUT_VER (LAYOUT_ID, VER, STATUS, OWNER_ID, ROW_VERSION) "
                + "VALUES (7, 1.001, 'DRAFT', 'kim', 0)");
    }

    private static VersionRef ref(String ver) {
        return new VersionRef(VersionTarget.LAYOUT, "7", new BigDecimal(ver));
    }

    @Test
    void findAndFindAllReturnStringObjectId() {
        List<VersionRow> rows = tx.execute(s -> store.findAll(VersionTarget.LAYOUT, "7"));
        assertThat(rows).hasSize(2);
        assertThat(rows).allSatisfy(r -> assertThat(r.ref().objectId()).isEqualTo("7"));
        VersionRow draft = tx.execute(s -> store.find(ref("1.001")).orElseThrow());
        assertThat(draft.ref().ver()).isEqualByComparingTo("1.001");
        assertThat(draft.status()).isEqualTo("DRAFT");
    }

    @Test
    void casWritesMatchIntegerKeyFromStringBinding() {
        assertThat(tx.<Integer>execute(s -> store.casBumpRowVersion(ref("1.001"), 0, STAMP))).isEqualTo(1);
        assertThat(tx.<Integer>execute(s -> store.casSetOwner(ref("1.001"), 1, "lee", false, STAMP))).isEqualTo(1);
        assertThat(tx.<Integer>execute(s -> store.casConfirm(ref("1.001"), 2, LocalDateTime.of(2026, 7, 1, 0, 0), "lee", NOW, STAMP)))
                .isEqualTo(1);
        assertThat(tx.<Integer>execute(s -> store.closeApplyTo(ref("1.000"), LocalDateTime.of(2026, 7, 1, 0, 0), STAMP))).isEqualTo(1);
        assertThat(tx.<Integer>execute(s -> store.casCancelConfirm(ref("1.001"), 3, STAMP))).isEqualTo(1);
        assertThat(tx.<Integer>execute(s -> store.reopenApplyTo(ref("1.000"), STAMP))).isEqualTo(1);
        assertThat(tx.<Integer>execute(s -> store.casDeleteDraft(ref("1.001"), 4))).isEqualTo(1);
        assertThat(tx.<Integer>execute(s -> store.markParentInUse(VersionTarget.LAYOUT, "7", STAMP))).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_TC_LAYOUT WHERE LAYOUT_ID = 7", String.class)).isEqualTo("INUSE");
        assertThat(jdbc.queryForObject("SELECT APPLY_TO FROM TB_MDM_TC_LAYOUT_VER WHERE LAYOUT_ID = 7 AND VER = 1.000", String.class))
                .isEqualTo("9999-12-31 00:00:00");
    }
}
