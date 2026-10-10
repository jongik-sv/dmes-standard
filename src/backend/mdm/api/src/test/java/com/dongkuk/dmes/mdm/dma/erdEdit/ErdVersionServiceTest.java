package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.*;
import com.dongkuk.dmes.mdm.entity.MdmErdModelVer;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@ActiveProfiles("local")
class ErdVersionServiceTest extends AbstractMdmSharedDbTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdModelStore store;
    @Autowired ErdConfirmCheck confirmCheck;
    @Autowired VersionStateService stateService;
    @Autowired PlatformTransactionManager txManager;

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
    }

    @Test
    void createModelMakesDraftOwnedByCreator() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        MdmErdModelVer d = store.draft("mcm").orElseThrow();
        assertThat(d.getOwnerId()).isEqualTo("owner");
        assertThat(ErdModelCodec.read(d.getModelJson()).model.schema).isEqualTo("MCMAPUSER");
    }

    @Test
    void newVersionCopiesJsonAndKeepsIds() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        ErdModel m = ((ApplyOutcome.Applied) new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("mcm", "MCMAPUSER"),
                0, 1, "s", List.of(new AddTable("t-1", "TB_A", "에이", "")))).next();
        store.writeJson(new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000")), ErdModelCodec.write(m));
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID='mcm'");
        BigDecimal next = versions.newVersion("mcm", "MINOR", "owner");
        MdmErdModelVer d = store.draft("mcm").orElseThrow();
        assertThat(d.getVer()).isEqualByComparingTo(next);
        assertThat(ErdModelCodec.read(d.getModelJson()).tables).containsKey("t-1");
        assertThat(d.getBaseVer()).isEqualByComparingTo("1.000");
    }

    @Test
    void confirmBlocksOnlyChangedColumnViolations() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        var engine = new ErdCommandEngine(ErdNaming.NONE);
        ErdModel released = ((ApplyOutcome.Applied) engine.apply(ErdModel.empty("mcm", "MCMAPUSER"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-old", "t-1", "BIZ_CD", "***코드", null, "VARCHAR2", 10, null, false, null, "", null)))).next();
        store.writeJson(new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000")), ErdModelCodec.write(released));
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID='mcm'");
        BigDecimal next = versions.newVersion("mcm", "MINOR", "owner");
        VersionRef draft = new VersionRef(VersionTarget.ERD_MODEL, "mcm", next);

        var ok = checkInTx(new ConfirmCheckRequest(draft, java.time.LocalDateTime.now().plusDays(1), null, "owner", java.time.LocalDateTime.now()));
        assertThat(ok.errors()).isEmpty();
        assertThat(ok.warnings()).isNotEmpty(); // 기존 위반(BIZ_CD)은 경고

        ErdModel changed = ((ApplyOutcome.Applied) engine.apply(released, 1, 2, "s", List.of(
                new AddColumn("c-new", "t-1", "ZZ_QQ", "***", null, "VARCHAR2", 1, null, false, null, "", null)))).next();
        store.writeJson(draft, ErdModelCodec.write(changed));
        var blocked = checkInTx(new ConfirmCheckRequest(draft, java.time.LocalDateTime.now().plusDays(1), null, "owner", java.time.LocalDateTime.now()));
        assertThat(blocked.errors()).extracting(i -> i.itemKey()).contains("c-new");
    }

    @Test
    void deleteDraftRemovesEditorsFirst() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID='mcm'");
        BigDecimal next = versions.newVersion("mcm", "MINOR", "owner");
        versions.addEditor("mcm", "mate", "owner");
        MdmErdModelVer d = store.draft("mcm").orElseThrow();

        stateService.deleteDraft(new VersionRef(VersionTarget.ERD_MODEL, "mcm", next), d.getRowVersion(), "owner");

        assertThat(store.draft("mcm")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID='mcm'", Integer.class)).isZero();
        assertThat(store.latestReleased("mcm")).isPresent(); // RELEASED 는 남는다
    }

    private static String code(Throwable e) {
        return ((BusinessException) e).getErrors().get(0).code();
    }

    @Test
    void coEditorCannotAddEditor() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        versions.addEditor("mcm", "mate", "owner");

        assertThatThrownBy(() -> versions.addEditor("mcm", "friend", "mate"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.NOT_DRAFT_OWNER.code()));
        assertThatThrownBy(() -> versions.removeEditor("mcm", "mate", "mate"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.NOT_DRAFT_OWNER.code()));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID='mcm'", Integer.class)).isEqualTo(1);
    }

    @Test
    void ownerAddsAndRemovesEditor() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        versions.addEditor("mcm", "mate", "owner");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID='mcm' AND USER_ID='mate'", Integer.class)).isEqualTo(1);
        versions.removeEditor("mcm", "mate", "owner");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID='mcm'", Integer.class)).isZero();
    }

    @Test
    void revOfMissingModelIsNotFound() {
        assertThatThrownBy(() -> store.rev("none"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.ERD_MODEL_NOT_FOUND.code()));
    }

    @Test
    void lockRevInsideTransactionReadsRevOrNotFound() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        TransactionTemplate tx = new TransactionTemplate(txManager);
        long rev = tx.execute(s -> store.lockRev("mcm"));
        assertThat(rev).isZero();
        assertThatThrownBy(() -> tx.execute(s -> store.lockRev("none")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.ERD_MODEL_NOT_FOUND.code()));
    }

    @Test
    void lockRevOutsideTransactionThrows() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        assertThatThrownBy(() -> store.lockRev("mcm")).isInstanceOf(IllegalTransactionStateException.class);
    }

    private void release(String modelId) {
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID=?", modelId);
    }

    private ConfirmCheckRequest confirmRequest(VersionRef draft) {
        return new ConfirmCheckRequest(draft, java.time.LocalDateTime.now().plusDays(1), null, "owner", java.time.LocalDateTime.now());
    }

    /** R8-1: RELEASED 가 없는 첫 버전은 표준 위반을 경고로만 알리고 확정을 막지 않는다. */
    @Test
    void firstVersionReportsViolationsAsWarningsOnly() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        VersionRef draft = new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000"));
        ErdModel m = ((ApplyOutcome.Applied) new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("mcm", "MCMAPUSER"),
                0, 1, "s", List.of(new AddTable("t-1", "TB_A", "에이", ""),
                        new AddColumn("c-1", "t-1", "ZZ_QQ", "***", null, "VARCHAR2", 1, null, false, null, "", null)))).next();
        store.writeJson(draft, ErdModelCodec.write(m));

        var r = checkInTx(confirmRequest(draft));
        assertThat(r.errors()).isEmpty();
        assertThat(r.warnings()).extracting(i -> i.itemKey()).contains("c-1");
    }

    @Test
    void confirmWarnsOnLeftoverInferredRelation() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        VersionRef draft = new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000"));
        ErdModel m = ErdModel.empty("mcm", "MCMAPUSER");
        ErdRelation r = new ErdRelation();
        r.state = "INFERRED";
        m.relations.put("r-1", r);
        store.writeJson(draft, ErdModelCodec.write(m));

        var result = checkInTx(confirmRequest(draft));
        assertThat(result.errors()).isEmpty();
        assertThat(result.warnings()).extracting(i -> i.code()).contains("ERD_INFERRED_LEFT");
    }

    @Test
    void newVersionPromotesParentToInUse() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        release("mcm");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", String.class)).isEqualTo("CREATED");
        versions.newVersion("mcm", "MINOR", "owner");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", String.class)).isEqualTo("INUSE");
    }

    @Test
    void newVersionWhileDraftExistsIsMdm006() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        assertThatThrownBy(() -> versions.newVersion("mcm", "MINOR", "owner"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.UNAPPLIED_VERSION_EXISTS.code()));
    }

    @Test
    void newVersionWithoutReleasedIsNotFound() {
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('mcm','mcm','MCMAPUSER','MCM')");
        assertThatThrownBy(() -> versions.newVersion("mcm", "MAJOR", "owner"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.ERD_MODEL_NOT_FOUND.code()));
    }

    /** 확정 경로(applyFrom 있음)의 검사는 공통 confirm 트랜잭션 안에서 불린다 — 그 트랜잭션에서 돌린다. */
    private ConfirmCheckResult checkInTx(ConfirmCheckRequest req) {
        return new TransactionTemplate(txManager).execute(s -> confirmCheck.check(req));
    }

    /**
     * M1: 확정 경로의 검사는 casConfirm 전에 모델 행을 잠근다(확정·삭제·명령이 모두 모델 행 → 버전 행 순서). 잠금은 MANDATORY 라
     * 트랜잭션 밖에서 부르면 바로 드러난다. 미리 검사(validate, applyFrom 없음)는 잠그지 않으므로 트랜잭션 없이도 된다.
     */
    @Test
    void confirmPathCheckLocksModelRowButValidateDoesNot() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        VersionRef draft = new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000"));
        assertThatThrownBy(() -> confirmCheck.check(confirmRequest(draft))).isInstanceOf(IllegalTransactionStateException.class);
        assertThat(checkInTx(confirmRequest(draft)).errors()).isEmpty();
        var validate = confirmCheck.check(new ConfirmCheckRequest(draft, null, null, "owner", java.time.LocalDateTime.now()));
        assertThat(validate.errors()).isEmpty();
    }
}
