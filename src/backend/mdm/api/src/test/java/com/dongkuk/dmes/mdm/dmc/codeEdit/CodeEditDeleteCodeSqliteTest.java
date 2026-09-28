package com.dongkuk.dmes.mdm.dmc.codeEdit;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.FUTURE;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static com.dongkuk.dmes.mdm.dmc.codeEdit.CodeEditHeaderSqliteTest.assertCode;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDraftRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditFlags;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditViewRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 2026-09-28 사용자 결정 — "릴리즈된 적이 없다면 폐기 버튼이 삭제가 되도록". 한 번도 RELEASED 되지 않은 마루 코드는
 * {@code delete}(target=CODE)로 행째 지운다. 판정은 TB_MDM_CODE_VER 의 RELEASED·CANCELLED 행 유무이고, 실행 때 서버가
 * 담당자·원천·다른 사용자 DRAFT·auditVer·도메인·수신 로그·MASTER 식 참조를 다시 본다. target 이 없으면 기존 DRAFT 삭제다.
 *
 * <p>TB_MDM_DOMAIN·TB_MDM_CODE_SYSTEM·TB_MDM_CODE_RECV 는 {@link MasterCodeSeeds#clear()} 가 비우지 않고 TB_MDM_CODE 를
 * FK 로 가리키므로, 이 시험이 넣은 행을 먼저 지운다(임시 DB 파일).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class CodeEditDeleteCodeSqliteTest {

    private static final String ID = "DEL_CD";
    private static final String TEST_DOMAIN = "DELT_%";

    @TempDir
    static Path tempDir;

    @Autowired
    CodeEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private MasterCodeSeeds seeds;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-code-edit-delete-code-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        seeds = new MasterCodeSeeds(jdbc);
        jdbc.update("DELETE FROM TB_MDM_DOMAIN WHERE STD_NAME LIKE ?", TEST_DOMAIN);
        jdbc.update("DELETE FROM TB_MDM_CODE_RECV");
        jdbc.update("DELETE FROM TB_MDM_CODE_SYSTEM");
        seeds.clear();
        as("stw1");
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    /** 등록 직후 모습에 코드 행·TABLE 카테고리·소속·배포 대상 시스템까지 채운다 — 지울 여섯 표 모두에 행이 있다. */
    private void registeredWithRows() {
        seeds.seedCode(ID, "CREATED", "MDM");
        seeds.draft(ID, "1.000", "stw1");
        seeds.seedBase(ID);
        seeds.seedItem(ID, "A", "1.000", OPEN, "에이", 1);
        seeds.seedCate(ID, "T1", "1.000", OPEN, "TABLE", null, null, "표1");
        seeds.seedCateItem(ID, "T1", "A", "1.000", OPEN);
        jdbc.update("INSERT INTO TB_MDM_CODE_SYSTEM (MARU_CODE_ID, SYSTEM_CODE, VER) VALUES (?, 'ERP', 0)", ID);
    }

    // ── 플래그 ──

    @Test
    void F1_버전이_DRAFT_뿐이면_neverReleased_이고_담당자는_삭제할_수_있다() {
        seeds.seedCode(ID, "CREATED", "MDM");
        seeds.draft(ID, "1.000", "stw1");

        CodeEditFlags mine = view().getFlags();
        assertTrue(mine.isNeverReleased());
        assertTrue(mine.isCanDeleteCode());
        assertFalse(mine.isCanDeprecate(), "canDeprecate 는 그대로다(미적용 DRAFT 가 있으면 못 폐기)");

        as("stw2");
        CodeEditFlags other = view().getFlags();
        assertTrue(other.isNeverReleased());
        assertFalse(other.isCanDeleteCode(), "다른 사용자가 소유한 DRAFT 가 있으면 못 지운다");

        jdbc.update("UPDATE TB_MDM_CODE_VER SET OWNER_ID = NULL");
        assertTrue(view().getFlags().isCanDeleteCode(), "소유자 없는 DRAFT 는 막지 않는다");

        currentUser.set("stw1", Set.of("MDM_STD_ADMIN"));
        assertFalse(view().getFlags().isCanDeleteCode(), "담당자가 아니면 못 지운다");
    }

    @Test
    void F2_RELEASED_나_CANCELLED_가_있으면_neverReleased_가_아니고_버전_0개는_neverReleased() {
        seeds.seedCode(ID, "CREATED", "MDM");
        assertTrue(view().getFlags().isNeverReleased(), "VER 행 0개도 RELEASED 된 적 없다");
        assertTrue(view().getFlags().isCanDeleteCode());

        seeds.released(ID, "1.000", FUTURE, OPEN_END);
        CodeEditFlags released = view().getFlags();
        assertFalse(released.isNeverReleased(), "TB_MDM_CODE.STATUS 가 CREATED 여도 RELEASED 행이 있으면 아니다");
        assertFalse(released.isCanDeleteCode());

        jdbc.update("UPDATE TB_MDM_CODE_VER SET STATUS = 'CANCELLED'");
        assertFalse(view().getFlags().isNeverReleased());

        seeds.seedCode("EXT_CD", "CREATED", "EXTERNAL");
        CodeEditFlags external = view("EXT_CD").getFlags();
        assertTrue(external.isNeverReleased());
        assertFalse(external.isCanDeleteCode(), "원천 EXTERNAL 은 못 지운다");
    }

    // ── 삭제 성공 ──

    @Test
    void D1_RELEASED_된_적_없는_코드는_여섯_표의_행을_모두_지운다() {
        registeredWithRows();
        seeds.seedCode("KEEP_CD", "CREATED", "MDM");
        seeds.draft("KEEP_CD", "1.000", "stw1");
        seeds.seedBase("KEEP_CD");

        Object result = tx.execute(s -> service.delete(codeReq(ID, 0L)));

        assertEquals(Map.of("deleted", "CODE", "maruCodeId", ID), result);
        for (String table : List.of("TB_MDM_CODE_CATE_ITEM", "TB_MDM_CODE_CATE", "TB_MDM_CODE_ITEM", "TB_MDM_CODE_VER",
                "TB_MDM_CODE_SYSTEM", "TB_MDM_CODE")) {
            assertEquals(0, seeds.count(table, ID), table);
        }
        assertEquals(1, seeds.count("TB_MDM_CODE", "KEEP_CD"), "다른 코드는 건드리지 않는다");
        assertEquals(1, seeds.count("TB_MDM_CODE_CATE", "KEEP_CD"));
    }

    @Test
    void D2_target_이_없으면_기존_DRAFT_삭제_그대로다() {
        registeredWithRows();
        CodeDraftRequest r = new CodeDraftRequest();
        r.setMaruCodeId(ID);
        r.setVer("1.000");
        r.setRowVersion(0L);

        Object result = tx.execute(s -> service.delete(r));

        CodeEditView view = assertInstanceOf(CodeEditView.class, result);
        assertEquals(0, view.getVersions().size());
        assertEquals(1, seeds.count("TB_MDM_CODE", ID), "마루 코드는 남는다");
        assertEquals(0, seeds.count("TB_MDM_CODE_VER", ID));
        assertEquals(0, seeds.count("TB_MDM_CODE_ITEM", ID), "DRAFT 삭제 훅이 1.000 선분을 지웠다");
    }

    // ── 거부 ──

    @Test
    void R1_RELEASED_CANCELLED_버전이_있으면_MDM009() {
        registeredWithRows();
        seeds.released(ID, "2.000", PAST, OPEN_END);

        BusinessException e = assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> deleteCode(0L));
        assertTrue(e.getMessage().contains("폐기하세요"), e.getMessage());

        jdbc.update("UPDATE TB_MDM_CODE_VER SET STATUS = 'CANCELLED' WHERE VER = 2.0");
        assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> deleteCode(0L));
        assertEquals(1, seeds.count("TB_MDM_CODE", ID));
        assertEquals(2, seeds.count("TB_MDM_CODE_VER", ID));
    }

    @Test
    void R2_도메인이_가리키면_도메인_ID_를_싣고_거부한다() {
        registeredWithRows();
        long domainId = insertDomain("DELT_CODE", "CODE", ID, null);

        BusinessException e = assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> deleteCode(0L));

        assertTrue(e.getMessage().contains("도메인 ID " + domainId), e.getMessage());
        assertEquals(1, seeds.count("TB_MDM_CODE", ID));
        assertEquals(1, seeds.count("TB_MDM_CODE_ITEM", ID));
    }

    @Test
    void R3_MASTER_식이_가리키면_거부하고_다른_코드_ID_는_막지_않는다() {
        registeredWithRows();
        insertDomain("DELT_OTHER", "VALUE", null, "MASTER(\"DEL_CD_X\", \"BASE\", value) != null");
        insertDomain("DELT_EXPR", "VALUE", null, "MASTER( \"" + ID + "\", \"BASE\", value) != null");

        BusinessException e = assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> deleteCode(0L));
        assertTrue(e.getMessage().contains("BIZ_RULE"), e.getMessage());
        assertEquals(1, seeds.count("TB_MDM_CODE", ID));

        jdbc.update("DELETE FROM TB_MDM_DOMAIN WHERE STD_NAME = 'DELT_EXPR'");
        tx.execute(s -> service.delete(codeReq(ID, 0L)));
        assertEquals(0, seeds.count("TB_MDM_CODE", ID), "접두가 같은 다른 ID(DEL_CD_X)는 참조가 아니다");
    }

    @Test
    void R3b_JSON_칼럼의_식_텍스트와_AST_모양의_MASTER_참조도_거부한다() {
        registeredWithRows();
        insertDomainAst("DELT_AST", "{\"type\":\"FUNCTION\",\"value\":\"MASTER\",\"params\":["
                + "{\"type\":\"STRING_LITERAL\",\"value\":\"" + ID + "\"},{\"type\":\"STRING_LITERAL\",\"value\":\"BASE\"}]}");

        BusinessException ast = assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> deleteCode(0L));
        assertTrue(ast.getMessage().contains("BIZ_AST"), ast.getMessage());

        jdbc.update("DELETE FROM TB_MDM_DOMAIN WHERE STD_NAME = 'DELT_AST'");
        insertDomainAst("DELT_JSON", "{\"expr\":\"MASTER_AT(\\\"" + ID + "\\\", \\\"BASE\\\", value, now)\"}");

        BusinessException text = assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> deleteCode(0L));
        assertTrue(text.getMessage().contains("BIZ_AST"), text.getMessage());
        assertEquals(1, seeds.count("TB_MDM_CODE", ID));
    }

    @Test
    void R4_수신_로그가_있으면_거부한다() {
        registeredWithRows();
        jdbc.update("INSERT INTO TB_MDM_CODE_RECV (MARU_CODE_ID, SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY)"
                + " VALUES (?, 'ERP', 'VERSION', '2026-09-01 00:00:00', '{}')", ID);

        BusinessException e = assertCode(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> deleteCode(0L));

        assertTrue(e.getMessage().contains("TB_MDM_CODE_RECV"), e.getMessage());
        assertEquals(1, seeds.count("TB_MDM_CODE", ID));
    }

    @Test
    void R5_다른_사용자_DRAFT_auditVer_불일치_담당자_아님_EXTERNAL_잘못된_target() {
        registeredWithRows();

        as("stw2");
        BusinessException owned = assertCode(MdmErrorCode.DRAFT_ALREADY_OWNED, () -> deleteCode(0L));
        assertTrue(owned.getMessage().contains("v1.000"), owned.getMessage());

        as("stw1");
        assertCode(MdmErrorCode.ROW_VERSION_CONFLICT, () -> deleteCode(7L));
        assertCode(MdmErrorCode.ROW_VERSION_CONFLICT, () -> deleteCode(null));

        currentUser.set("stw1", Set.of("MDM_STD_ADMIN"));
        assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> deleteCode(0L));

        as("stw1");
        CodeDraftRequest bad = codeReq(ID, 0L);
        bad.setTarget("VERSION");
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.delete(bad)));

        seeds.seedCode("EXT_CD", "CREATED", "EXTERNAL");
        assertCode(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.delete(codeReq("EXT_CD", 0L))));

        assertEquals(1, seeds.count("TB_MDM_CODE", ID));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER", ID));
        assertEquals(1, seeds.count("TB_MDM_CODE", "EXT_CD"));
    }

    // ── 도우미 ──

    private void as(String userId) {
        currentUser.set(userId, Set.of("MDM_STEWARD"));
    }

    private CodeEditView view() {
        return view(ID);
    }

    private CodeEditView view(String id) {
        CodeEditViewRequest r = new CodeEditViewRequest();
        r.setMaruCodeId(id);
        return tx.execute(s -> service.view(r));
    }

    private Object deleteCode(Long auditVer) {
        return tx.execute(s -> service.delete(codeReq(ID, auditVer)));
    }

    private static CodeDraftRequest codeReq(String id, Long auditVer) {
        CodeDraftRequest r = new CodeDraftRequest();
        r.setMaruCodeId(id);
        r.setAuditVer(auditVer);
        r.setTarget(CodeDraftRequest.TARGET_CODE);
        return r;
    }

    /** BIZ_AST 는 JSON 이어야 한다(CK_TB_MDM_DOMAIN_BIZ_AST_JSON). */
    private void insertDomainAst(String stdName, String bizAst) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, BIZ_AST)"
                + " VALUES (?, ?, 'VALUE', 'STRING', ?)", stdName + " 도메인", stdName, bizAst);
    }

    /** CODE 종류는 STD_RULE 이 비어야 한다(CK_TB_MDM_DOMAIN_CODE). 식은 BIZ_RULE 에 둔다. */
    private long insertDomain(String stdName, String kind, String maruCodeId, String bizRule) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, MARU_CODE_ID, BIZ_RULE)"
                + " VALUES (?, ?, ?, 'STRING', ?, ?)", stdName + " 도메인", stdName, kind, maruCodeId, bizRule);
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, stdName);
    }
}
