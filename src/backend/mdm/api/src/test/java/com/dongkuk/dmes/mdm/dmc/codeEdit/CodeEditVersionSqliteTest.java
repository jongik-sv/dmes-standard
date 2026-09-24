package com.dongkuk.dmes.mdm.dmc.codeEdit;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.FUTURE;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static com.dongkuk.dmes.mdm.dmc.codeEdit.CodeEditHeaderSqliteTest.assertCode;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.security.MdmStewardDirectory;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDraftRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditViewRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionCreateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRestoreRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRow;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-06-02 design.md §3.2 V1~V9 — 새 버전·미적용 규칙·DRAFT 소유권(불변 규칙 I1~I6, I11~I13, I18, I22·I23).
 *
 * <p>넘기기 대상 조회는 운영이 늘 거부한다(D3). 성공 경로는 테스트 전용 {@link MutableStewardDirectory} 에 담당자를
 * 넣어 본다 — 기본은 비어 있어 운영과 같다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({DmaTestSupport.Config.class, CodeEditVersionSqliteTest.Directory.class})
class CodeEditVersionSqliteTest {

    private static final String ID = "PROC_CD";

    @TempDir
    static Path tempDir;

    @Autowired
    CodeEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MutableStewardDirectory directory;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private MasterCodeSeeds seeds;

    @TestConfiguration(proxyBeanMethods = false)
    static class Directory {
        @Bean
        @Primary
        MutableStewardDirectory testStewardDirectory() {
            return new MutableStewardDirectory();
        }
    }

    static final class MutableStewardDirectory implements MdmStewardDirectory {
        final Set<String> stewards = new HashSet<>();

        @Override
        public boolean isSteward(String userId) {
            return stewards.contains(userId);
        }
    }

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-code-edit-version-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        seeds = new MasterCodeSeeds(jdbc);
        seeds.clear();
        directory.stewards.clear();
        as("stw1");
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    /** 등록 직후 모습: CREATED + 1.000 DRAFT(stw1) + BASE. */
    private void registered() {
        seeds.seedCode(ID, "CREATED", "MDM");
        seeds.draft(ID, "1.000", "stw1");
        seeds.seedBase(ID);
    }

    @Test
    void V1_등록_직후_새_버전은_DRAFT_가_미적용이라_MDM006() {
        registered();
        assertCode(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> create("MAJOR"));
        assertCode(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> create("MINOR"));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
    }

    @Test
    void V2_채번은_CANCELLED_를_포함한_최대값에서_하고_만든_사람이_선점한다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedVer(ID, "1.001", "MINOR", "CANCELLED", FUTURE, OPEN_END, "stw1");
        CodeEditView before = view();
        assertEquals("2.000", before.getFlags().getNextMajor());
        assertEquals("1.002", before.getFlags().getNextMinor());
        assertTrue(before.getFlags().isCanNewMajor());
        assertTrue(before.getFlags().isCanNewMinor());

        CodeEditView v = create("MINOR");

        Map<String, Object> row = jdbc.queryForMap("SELECT VER_KIND, STATUS, OWNER_ID, ROW_VERSION, RESTORED_FROM FROM TB_MDM_CODE_VER"
                + " WHERE MARU_CODE_ID = ? AND VER = 1.002", ID);
        assertEquals("MINOR", row.get("VER_KIND"));
        assertEquals("DRAFT", row.get("STATUS"));
        assertEquals("stw1", row.get("OWNER_ID"));
        assertEquals(0L, ((Number) row.get("ROW_VERSION")).longValue());
        assertNull(row.get("RESTORED_FROM"));
        CodeVersionRow top = v.getVersions().get(0);
        assertEquals("1.002", top.getVer());
        assertEquals(0L, top.getRowVersion());
        assertEquals("stw1", top.getOwnerId());
        assertEquals(0, seeds.count("TB_MDM_CODE_CATE"), "1.000 이 아니면 BASE 를 만들지 않는다");

        // major 는 별도 코드에서
        seeds.seedCode("B_CD", "INUSE", "MDM");
        seeds.released("B_CD", "1.000", PAST, OPEN_END);
        seeds.seedVer("B_CD", "1.001", "MINOR", "CANCELLED", FUTURE, OPEN_END, "stw1");
        tx.execute(s -> service.createVersion(createReq("B_CD", "MAJOR")));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'B_CD' AND VER = 2.0"
                + " AND VER_KIND = 'MAJOR' AND STATUS = 'DRAFT'", Integer.class));
    }

    @Test
    void V3_소수부_999_면_minor_는_MDM021_major_는_다음_정수() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.999", PAST, OPEN_END);
        assertTrue(view().getFlags().isMinorLimit());
        BusinessException e = assertCode(MdmErrorCode.INVALID_INPUT, () -> create("MINOR"));
        assertTrue(e.getMessage().contains("major 를 올리십시오"), e.getMessage());
        CodeEditView v = create("MAJOR");
        assertEquals("2.000", v.getVersions().get(0).getVer());
    }

    @Test
    void V4_미래_적용_RELEASED_가_있으면_MDM006() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, FUTURE);
        seeds.released(ID, "1.001", FUTURE, OPEN_END);
        assertCode(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> create("MAJOR"));
    }

    @Test
    void V5_미적용_2개면_DRAFT_삭제만_된다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.draft(ID, "1.001", "stw1");
        seeds.draft(ID, "1.002", "stw2");

        assertCode(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> create("MAJOR"));
        assertCode(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS, () -> draft(service::release, "1.001", 0L, null));
        assertCode(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS, () -> draft(service::handover, "1.001", 0L, "stw2"));
        jdbc.update("UPDATE TB_MDM_CODE_VER SET OWNER_ID = NULL WHERE VER = 1.001");
        assertCode(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS, () -> draft(service::acquire, "1.001", 0L, null));
        jdbc.update("UPDATE TB_MDM_CODE_VER SET OWNER_ID = 'stw1' WHERE VER = 1.001");

        as("stw2");
        CodeEditView afterDelete = draft(service::deleteDraft, "1.002", 0L, null);
        assertEquals(1, afterDelete.getFlags().getUnappliedCount());

        as("stw1");
        CodeEditView released = draft(service::release, "1.001", 0L, null);
        assertNull(released.getVersions().get(0).getOwnerId());
    }

    @Test
    void V6_버전이_없으면_minor_불가_major_는_1_000_과_BASE_를_다시_만든다() {
        registered();
        draft(service::deleteDraft, "1.000", 0L, null);
        assertEquals(0, seeds.count("TB_MDM_CODE_CATE"), "DRAFT 삭제 훅이 BASE 도 지웠다");
        CodeEditView empty = view();
        assertFalse(empty.getFlags().isCanNewMinor());
        assertTrue(empty.getFlags().isCanNewMajor());
        assertEquals("1.000", empty.getFlags().getNextMajor());
        assertCode(MdmErrorCode.INVALID_INPUT, () -> create("MINOR"));

        CodeEditView v = create("MAJOR");
        assertEquals("1.000", v.getVersions().get(0).getVer());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_CODE_CATE WHERE CATE_ID = 'BASE' AND FROM_VER = 1"
                + " AND TO_VER = 9999 AND DEF_KIND = 'REGEX' AND DEF_EXPR = '.*' AND DEF_TARGET = 'CODE'", Integer.class));
    }

    @Test
    void V7_폐기된_코드는_새_버전과_복원이_MDM009() {
        seeds.seedCode(ID, "DEPRECATED", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> create("MAJOR"));
        assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> tx.execute(s -> service.restoreVersion(restoreReq("MAJOR", "1.000"))));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
    }

    @Test
    void V7b_EXTERNAL_코드는_새_버전이_MDM021() {
        seeds.seedCode(ID, "INUSE", "EXTERNAL");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        assertCode(MdmErrorCode.INVALID_INPUT, () -> create("MAJOR"));
    }

    @Test
    void V8_소유권은_요청_사용자로_선점_해제_넘기기를_하고_응답은_새_값이다() {
        registered();
        CodeEditView unlocked = draft(service::release, "1.000", 0L, "stwX");
        assertNull(unlocked.getVersions().get(0).getOwnerId(), "요청의 newOwnerId 는 행위자가 아니다");
        assertEquals(1L, unlocked.getVersions().get(0).getRowVersion());

        as("stw2");
        CodeEditView locked = draft(service::acquire, "1.000", 1L, null);
        assertEquals("stw2", locked.getVersions().get(0).getOwnerId());
        assertEquals(2L, locked.getVersions().get(0).getRowVersion());

        as("stw1");
        assertCode(MdmErrorCode.DRAFT_ALREADY_OWNED, () -> draft(service::acquire, "1.000", 2L, null));

        as("stw2");
        assertCode(MdmErrorCode.HANDOVER_TARGET_NOT_STEWARD, () -> draft(service::handover, "1.000", 2L, "stw1"));
        directory.stewards.add("stw1");
        assertCode(MdmErrorCode.HANDOVER_TARGET_NOT_STEWARD, () -> draft(service::handover, "1.000", 2L, "  "));
        CodeEditView handed = draft(service::handover, "1.000", 2L, " stw1 ");
        assertEquals("stw1", handed.getVersions().get(0).getOwnerId());
        assertEquals(3L, handed.getVersions().get(0).getRowVersion());
        assertEquals("stw1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER", String.class));
    }

    @Test
    void V9_rv_불일치_소유자_아님_역할_없음() {
        registered();
        assertCode(MdmErrorCode.ROW_VERSION_CONFLICT, () -> draft(service::release, "1.000", 7L, null));
        as("stw2");
        assertCode(MdmErrorCode.NOT_DRAFT_OWNER, () -> draft(service::deleteDraft, "1.000", 0L, "stw1"));
        assertCode(MdmErrorCode.NOT_DRAFT_OWNER, () -> draft(service::release, "1.000", 0L, "stw1"));

        currentUser.set("stw1", Set.of("MDM_STD_ADMIN"));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> draft(service::acquire, "1.000", 0L, null));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> draft(service::release, "1.000", 0L, null));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> draft(service::handover, "1.000", 0L, "stw2"));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> draft(service::deleteDraft, "1.000", 0L, null));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> create("MAJOR"));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> tx.execute(s -> service.restoreVersion(restoreReq("MAJOR", "1.000"))));
        assertEquals("stw1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER", String.class));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
    }

    @Test
    void V9b_버전_번호_형식이_틀리면_MDM021() {
        registered();
        for (String bad : List.of("1.0001", "-1", "x", " ")) {
            assertCode(MdmErrorCode.INVALID_INPUT, () -> draft(service::release, bad, 0L, null));
        }
        assertCode(MdmErrorCode.INVALID_INPUT, () -> create("PATCH"));
    }

    @Test
    void V10_새_버전_쓰기_경로는_CREATED_를_INUSE_로_저장한다() {
        seeds.seedCode(ID, "CREATED", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        create("MINOR");
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));
    }

    // ── 도우미 ──

    private void as(String userId) {
        currentUser.set(userId, Set.of("MDM_STEWARD"));
    }

    private CodeEditView view() {
        CodeEditViewRequest r = new CodeEditViewRequest();
        r.setMaruCodeId(ID);
        return tx.execute(s -> service.view(r));
    }

    private CodeEditView create(String kind) {
        return tx.execute(s -> service.createVersion(createReq(ID, kind)));
    }

    private static CodeVersionCreateRequest createReq(String id, String kind) {
        CodeVersionCreateRequest r = new CodeVersionCreateRequest();
        r.setMaruCodeId(id);
        r.setVerKind(kind);
        return r;
    }

    private static CodeVersionRestoreRequest restoreReq(String kind, String source) {
        CodeVersionRestoreRequest r = new CodeVersionRestoreRequest();
        r.setMaruCodeId(ID);
        r.setVerKind(kind);
        r.setSourceVer(source);
        return r;
    }

    private CodeEditView draft(Function<CodeDraftRequest, CodeEditView> action, String ver, Long rv, String newOwner) {
        CodeDraftRequest r = new CodeDraftRequest();
        r.setMaruCodeId(ID);
        r.setVer(ver);
        r.setRowVersion(rv);
        r.setNewOwnerId(newOwner);
        return tx.execute(s -> action.apply(r));
    }
}
