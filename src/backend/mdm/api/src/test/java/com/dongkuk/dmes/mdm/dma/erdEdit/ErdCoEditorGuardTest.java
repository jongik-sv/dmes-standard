package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** ERD_MODEL DRAFT 공동 편집자 가드 시험 — 소유자·공동 편집자는 쓰고, 그 밖의 사용자는 MDM003 이다. */
@SpringBootTest
@ActiveProfiles("local")
class ErdCoEditorGuardTest extends AbstractMdmSharedDbTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired VersionWriteGuard guard;
    @Autowired DraftOwnershipService ownership;

    @BeforeEach
    void seed() {
        // 다른 ERD 시험이 남긴 행(명령 기록·다이어그램·작업 중 표시)도 지운다 — 모델 행을 FK 로 붙잡는다.
        for (String t : java.util.List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('mcm','mcm','MCMAPUSER','MCM')");
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, OWNER_ID, MODEL_JSON) VALUES ('mcm', 1, 'owner', '{}')");
        jdbc.update("INSERT INTO TB_MDM_ERD_EDITOR (ERD_MODEL_ID, VER, USER_ID) VALUES ('mcm', 1, 'mate')");
    }

    VersionRef draft() {
        return new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000"));
    }

    @Test
    void ownerWrites() {
        assertThat(guard.beginDraftWrite(draft(), 0, "owner")).isGreaterThan(0);
    }

    @Test
    void coEditorWrites() {
        assertThat(guard.beginDraftWrite(draft(), 0, "mate")).isGreaterThan(0);
    }

    @Test
    void strangerGetsMdm003() {
        assertThatThrownBy(() -> guard.beginDraftWrite(draft(), 0, "stranger"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrors().get(0).code())
                        .isEqualTo(MdmErrorCode.NOT_DRAFT_OWNER.code()));
    }

    /** 공동 편집자라도 row_version 불일치는 그대로 충돌이다 — 나머지 검사가 유지된다. */
    @Test
    void coEditorStillChecksRowVersion() {
        assertThatThrownBy(() -> guard.beginDraftWrite(draft(), 5, "mate"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrors().get(0).code())
                        .isEqualTo(MdmErrorCode.ROW_VERSION_CONFLICT.code()));
    }

    private static String code(Throwable e) {
        return ((BusinessException) e).getErrors().get(0).code();
    }

    /** R7-1: 소유자가 없는 DRAFT(해제 뒤)는 공동 편집자 행이 있어도 쓸 수 없다 — 먼저 선점해야 한다. */
    @Test
    void coEditorCannotWriteOwnerlessDraft() {
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET OWNER_ID = NULL WHERE ERD_MODEL_ID = 'mcm' AND VER = 1");
        assertThatThrownBy(() -> guard.beginDraftWrite(draft(), 0, "mate"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.NOT_DRAFT_OWNER.code()));
    }

    /** 공동 편집자 행은 그 버전에만 유효하다 — 다른 버전(VER 2)의 DRAFT 는 쓸 수 없다. */
    @Test
    void editorRowDoesNotAuthorizeAnotherVersion() {
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, OWNER_ID, MODEL_JSON) VALUES ('mcm', 2, 'owner2', '{}')");
        VersionRef v2 = new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("2.000"));
        assertThatThrownBy(() -> guard.beginDraftWrite(v2, 0, "mate"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.NOT_DRAFT_OWNER.code()));
    }

    /** 공동 편집자는 해제·넘기기를 못 한다 — 소유자 전용이다. */
    @Test
    void coEditorCannotReleaseOrHandover() {
        assertThatThrownBy(() -> ownership.release(draft(), 0, "mate"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.NOT_DRAFT_OWNER.code()));
        assertThatThrownBy(() -> ownership.handover(draft(), 0, "mate", "someone"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(MdmErrorCode.NOT_DRAFT_OWNER.code()));
    }
}
