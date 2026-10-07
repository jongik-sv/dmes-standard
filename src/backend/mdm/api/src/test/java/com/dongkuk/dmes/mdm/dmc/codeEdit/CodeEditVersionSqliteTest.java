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
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
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
class CodeEditVersionSqliteTest extends AbstractMdmSharedDbTest {

    private static final String ID = "PROC_CD";

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
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> draft(service::handover, "1.000", 0L, "stw2"));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> draft(service::deleteDraft, "1.000", 0L, null));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> create("MAJOR"));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> tx.execute(s -> service.restoreVersion(restoreReq("MAJOR", "1.000"))));
        assertEquals("stw1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER", String.class));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
    }

    /**
     * V9c 해제(unlock)는 ADR-0002 D3 에 따라 <b>역할이 아니라 소유자로만</b> 판정한다 — "관리자 강제 해제는 없다".
     * 역할을 잃은 소유자도 풀 수 있어야 DRAFT 가 영구히 묶이지 않는다. 마루 코드만 이 판정에서 빠졌고 그래서
     * {@code OWNER_ID='admin'} 인 PROC_CD 2.000 DRAFT 를 소유자本人이 열어도 해제할 수 없었다.
     * {@link com.dongkuk.dmes.mdm.common.version.DefaultDraftOwnershipService} 계약·룰 영역
     * ({@code RuleVersionService.unlock})과 같은 판정이다.
     */
    @Test
    void V9c_해제는_담당자_역할이_아니라_소유자로만_판정한다() {
        registered(); // 1.000 DRAFT, OWNER_ID=stw1
        currentUser.set("stw1", Set.of("MDM_STD_ADMIN")); // 표준관리자만 — 담당자 아님(I12 관점으로는 못 고치는 사람)
        assertFalse(view().getFlags().isEditable(), "담당자가 아니면 flags.editable=false");
        assertEquals("stw1", view().getMe());

        // 본인이 소유한 DRAFT 면 역할을 요구하지 않는다(해제 성공).
        CodeEditView unlocked = draft(service::release, "1.000", 0L, null);
        CodeVersionRow row = unlocked.getVersions().stream().filter(v -> "1.000".equals(v.getVer())).findFirst().orElseThrow();
        assertNull(row.getOwnerId());
        assertEquals(1L, row.getRowVersion());
        assertNull(jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER", String.class));

        // 다시 선점된 뒤 다른 사용자(담당자 아님)가 해제하면 MDM003 — 해제는 소유자 전용이다.
        jdbc.update("UPDATE TB_MDM_CODE_VER SET OWNER_ID = 'stw1' WHERE VER = 1");
        currentUser.set("stw2", Set.of("MDM_STD_ADMIN"));
        assertCode(MdmErrorCode.NOT_DRAFT_OWNER, () -> draft(service::release, "1.000", 0L, null));
        assertEquals("stw1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER", String.class));
    }

    /** V9d 해제에도 미적용 2개 규칙(I6·D7)은 그대로다 — 역할만 뺀다. */
    @Test
    void V9d_해제도_미적용_2개면_MDM007_이다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.draft(ID, "1.001", "stw1");
        seeds.draft(ID, "1.002", "stw2");
        as("stw1");
        currentUser.set("stw1", Set.of("MDM_STD_ADMIN"));
        assertCode(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS, () -> draft(service::release, "1.001", 0L, null));
        assertEquals("stw1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER WHERE VER = 1.001", String.class));
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

    /**
     * D8-1 계약 — 예정 확정(미래 적용 RELEASED)은 <b>미적용</b>이고 확정 취소할 수 있다. 룰 영역 `RuleVersions.isUnapplied` 와
     * 같은 정의(DRAFT·결재 중·{@code applyFrom > now} 인 RELEASED)여야 화면의 확정 취소·새 버전 막힘이 두 영역에서 어긋나지 않는다.
     *
     * <p>{@code codeEdit} view 는 선택 버전을 내려주지 않는다(04 「버전 목록」) — 그래서 이 판정이 행별로 내려가는 값이다.
     * 화면이 그 행을 골랐을 때 확정 취소가 켜지는지는 `codeMng/buttons.ts` {@code versionButtons} 가 이 값만 본다.
     */
    @Test
    void D8_예정_확정_RELEASED_는_미적용이고_확정_취소할_수_있다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedVer(ID, "1.001", "MINOR", "RELEASED", FUTURE, OPEN_END, "stw1");
        as("stw1");

        CodeEditView v = view();
        CodeVersionRow current = v.getVersions().stream().filter(r -> "1.000".equals(r.getVer())).findFirst().orElseThrow();
        CodeVersionRow scheduled = v.getVersions().stream().filter(r -> "1.001".equals(r.getVer())).findFirst().orElseThrow();

        assertFalse(current.isUnapplied(), "지금 적용 중인 RELEASED 는 적용된 것이다");
        assertFalse(current.isCancelConfirmable(), "이미 적용된 뒤에는 되돌릴 수 없다(D8)");
        assertTrue(scheduled.isUnapplied(), "적용 시각이 오지 않은 확정 RELEASED 는 미적용이다");
        assertTrue(scheduled.isCancelConfirmable(), "소유자고 미적용 1개면 확정 취소할 수 있다(D8-1)");
        assertEquals(1, v.getFlags().getUnappliedCount());
        assertEquals("v1.001 RELEASED", v.getHeader().getUnappliedLabel());
    }

    /** 소유자가 아니면 예정 확정 버전도 확정 취소할 수 없다 — 서버 판정값을 화면이 재계산하지 않아도 되는 전제. */
    @Test
    void D8_예정_확정도_소유자가_아니면_확정_취소가_안_된다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedVer(ID, "1.001", "MINOR", "RELEASED", FUTURE, OPEN_END, "stw1");
        as("stw2");

        CodeVersionRow scheduled = view().getVersions().stream().filter(r -> "1.001".equals(r.getVer())).findFirst().orElseThrow();
        assertTrue(scheduled.isUnapplied());
        assertFalse(scheduled.isCancelConfirmable());
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
