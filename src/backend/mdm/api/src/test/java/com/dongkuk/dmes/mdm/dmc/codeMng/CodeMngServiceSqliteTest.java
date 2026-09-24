package com.dongkuk.dmes.mdm.dmc.codeMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngRow;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngSearchResult;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeRegRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeRegResult;
import com.dongkuk.dmes.mdm.dmc.codeMng.service.CodeMngService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
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
 * TSK-06-02 design.md §3.2 R1~R9 — 마루 코드 조회·등록 서비스를 local(SQLite) 실제 컨텍스트로 돌린다(불변 규칙 I7~I12,
 * I17·I18). 서비스에는 {@code @Transactional} 이 없으므로 운영 경로(OASIS 프로세스 트랜잭션)처럼 {@link TransactionTemplate}
 * 으로 감싼다. 단언은 JdbcTemplate(새 연결)로 커밋된 행을 읽는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class CodeMngServiceSqliteTest {

    @TempDir
    static Path tempDir;

    @Autowired
    CodeMngService service;
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
        Path dbFile = tempDir.resolve("mdm-code-mng-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        seeds = new MasterCodeSeeds(jdbc);
        seeds.clear();
        currentUser.set("stw1", Set.of("MDM_STEWARD"));
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── 등록 ──

    @Test
    void R1_정상_등록은_코드_VER_BASE_세_행을_만들고_등록자가_선점한다() {
        CodeRegResult r = register(req("PROC_CD", "공정 코드", "설명", 2, null));

        assertEquals("PROC_CD", r.getMaruCodeId());
        assertEquals("1.000", r.getVer());
        assertEquals(0L, r.getRowVersion());
        assertEquals("stw1", r.getOwnerId());

        Map<String, Object> code = jdbc.queryForMap("SELECT * FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'PROC_CD'");
        assertEquals("CREATED", code.get("STATUS"));
        assertEquals("MDM", code.get("SOURCE_KIND"));
        assertEquals("공정 코드", code.get("MARU_CODE_NAME"));
        assertEquals("설명", code.get("DESCRIPTION"));
        assertEquals(2, ((Number) code.get("LVL_CNT")).intValue());
        assertNull(code.get("SOURCE_SYSTEM"));

        Map<String, Object> ver = jdbc.queryForMap("SELECT MARU_CODE_ID, CAST(VER AS VARCHAR(40)) AS V, VER_KIND, STATUS,"
                + " OWNER_ID, ROW_VERSION, RESTORED_FROM, APPLY_FROM, APPLY_TO FROM TB_MDM_CODE_VER");
        assertEquals(0, new java.math.BigDecimal("1.000").compareTo(new java.math.BigDecimal(ver.get("V").toString())));
        assertEquals("MAJOR", ver.get("VER_KIND"));
        assertEquals("DRAFT", ver.get("STATUS"));
        assertEquals("stw1", ver.get("OWNER_ID"));
        assertEquals(0L, ((Number) ver.get("ROW_VERSION")).longValue());
        assertNull(ver.get("RESTORED_FROM"));
        assertNull(ver.get("APPLY_FROM"));
        assertNull(ver.get("APPLY_TO"));

        Map<String, Object> cate = jdbc.queryForMap("SELECT CATE_ID, CAST(FROM_VER AS VARCHAR(40)) AS F,"
                + " CAST(TO_VER AS VARCHAR(40)) AS T, DEF_KIND, DEF_EXPR, DEF_TARGET FROM TB_MDM_CODE_CATE");
        assertEquals("BASE", cate.get("CATE_ID"));
        assertEquals(0, java.math.BigDecimal.ONE.compareTo(new java.math.BigDecimal(cate.get("F").toString())));
        assertEquals(0, new java.math.BigDecimal("9999").compareTo(new java.math.BigDecimal(cate.get("T").toString())));
        assertEquals("REGEX", cate.get("DEF_KIND"));
        assertEquals(".*", cate.get("DEF_EXPR"));
        assertEquals("CODE", cate.get("DEF_TARGET"));

        assertEquals(1, seeds.count("TB_MDM_CODE"));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
        assertEquals(1, seeds.count("TB_MDM_CODE_CATE"));
        assertEquals(0, seeds.count("TB_MDM_CODE_ITEM"));
    }

    @Test
    void R2_ID_제약_위반은_MDM021_이고_행이_없다() {
        String longId = "A".repeat(51);
        for (String bad : Arrays.asList("proc_cd", "PROC.CD", "PROC CD", "PROC,CD", "1PROC", longId, "", "   ", null)) {
            assertCode(MdmErrorCode.INVALID_INPUT, () -> register(req(bad, "이름", null, 0, null)));
        }
        assertEquals(0, seeds.count("TB_MDM_CODE"));
        assertEquals(0, seeds.count("TB_MDM_CODE_VER"));
        assertEquals(0, seeds.count("TB_MDM_CODE_CATE"));
        // 금지 문자(MaruIdRules)는 형식 규칙보다 먼저 보고 그 사유를 문구로 알린다
        for (String bad : Arrays.asList("PROC.CD", "PROC CD", "PROC,CD")) {
            BusinessException e = assertThrows(BusinessException.class, () -> register(req(bad, "이름", null, 0, null)));
            assertTrue(e.getMessage().contains("점·콤마·공백"), e.getMessage());
        }

        register(req("PROC_CD", "이름", null, 0, null));
        register(req("A1_B2", "이름", null, 0, null));
        register(req("A".repeat(50), "이름", null, 0, null));
        assertEquals(3, seeds.count("TB_MDM_CODE"));
    }

    @Test
    void R3_TB_MDM_CODE_에_같은_ID_가_있으면_MDM011() {
        register(req("PROC_CD", "이름", null, 0, null));
        assertCode(MdmErrorCode.MARU_ID_NAMESPACE_CONFLICT, () -> register(req("PROC_CD", "다른 이름", null, 0, null)));
        assertEquals(1, seeds.count("TB_MDM_CODE"));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
        assertEquals(1, seeds.count("TB_MDM_CODE_CATE"));
    }

    @Test
    void R4_TB_MDM_DATA_에만_같은_ID_가_있어도_MDM011() {
        seeds.seedData("PLANT");
        assertCode(MdmErrorCode.MARU_ID_NAMESPACE_CONFLICT, () -> register(req("PLANT", "공장", null, 0, null)));
        assertEquals(0, seeds.count("TB_MDM_CODE"));
        assertEquals(0, seeds.count("TB_MDM_CODE_VER"));
        assertEquals(1, seeds.count("TB_MDM_DATA"));
    }

    @Test
    void R5_원천은_MDM_만_받는다() {
        assertCode(MdmErrorCode.INVALID_INPUT, () -> register(req("EXT_CD", "외부", null, 0, "EXTERNAL")));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> register(req("EXT_CD", "외부", null, 0, "XYZ")));
        assertEquals(0, seeds.count("TB_MDM_CODE"));

        register(req("A_CD", "이름", null, 0, null));
        register(req("B_CD", "이름", null, 0, "MDM"));
        register(req("C_CD", "이름", null, 0, " "));
        assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_CODE WHERE SOURCE_KIND = 'MDM'", Integer.class));
    }

    @Test
    void R6_담당자_역할이_없으면_MDM013_이고_행이_없다() {
        for (Set<String> roles : java.util.List.of(Set.of("MDM_STD_ADMIN"), Set.of("SYSADMIN"), Set.<String>of())) {
            currentUser.set("u1", roles);
            assertCode(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> register(req("PROC_CD", "이름", null, 0, null)));
        }
        assertEquals(0, seeds.count("TB_MDM_CODE"));
    }

    @Test
    void R7_이름_공백과_계층_칸_수_범위_밖은_MDM021() {
        assertCode(MdmErrorCode.INVALID_INPUT, () -> register(req("PROC_CD", "  ", null, 0, null)));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> register(req("PROC_CD", null, null, 0, null)));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> register(req("PROC_CD", "가".repeat(101), null, 0, null)));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> register(req("PROC_CD", "이름", null, 6, null)));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> register(req("PROC_CD", "이름", null, -1, null)));
        assertEquals(0, seeds.count("TB_MDM_CODE"));

        register(req("PROC_CD", "이름", null, null, null));
        assertEquals(0, jdbc.queryForObject("SELECT LVL_CNT FROM TB_MDM_CODE", Integer.class));
    }

    // ── 조회 ──

    @Test
    void R8_목록은_현재_버전_미적용_계산_상태를_보이고_DB_상태를_바꾸지_않는다() {
        seeds.seedCode("A_CD", "CREATED", "MDM");
        seeds.released("A_CD", "1.000", MasterCodeSeeds.PAST, MasterCodeSeeds.PAST2);
        seeds.released("A_CD", "1.001", MasterCodeSeeds.PAST2, MasterCodeSeeds.OPEN_END);
        seeds.seedCode("B_CD", "CREATED", "MDM");
        seeds.released("B_CD", "1.000", MasterCodeSeeds.FUTURE, MasterCodeSeeds.OPEN_END);
        seeds.seedCode("C_CD", "CREATED", "MDM");
        seeds.draft("C_CD", "1.000", "stw1");

        CodeMngSearchResult result = search(null, null);

        assertEquals(3, result.getTotalCount());
        CodeMngRow a = result.getRows().get(0);
        CodeMngRow b = result.getRows().get(1);
        CodeMngRow c = result.getRows().get(2);
        assertEquals("A_CD", a.getMaruCodeId());
        assertEquals("v1.001", a.getCurrentVerLabel());
        assertEquals("1.001", a.getCurrentVer());
        assertEquals("없음", a.getUnappliedLabel());
        assertEquals("INUSE", a.getStatus());
        assertEquals("CREATED", a.getStoredStatus());
        assertEquals("배포 대기 v1.000", b.getCurrentVerLabel());
        assertEquals("v1.000 RELEASED", b.getUnappliedLabel());
        assertEquals("CREATED", b.getStatus());
        assertTrue(b.isPending());
        assertEquals("미확정", c.getCurrentVerLabel());
        assertEquals("v1.000 DRAFT", c.getUnappliedLabel());
        assertEquals(1, c.getUnappliedCount());

        assertEquals("CREATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'A_CD'", String.class),
                "조회는 쓰지 않는다(I18)");
    }

    @Test
    void R9_keyword_와_계산_상태_필터() {
        seeds.seedCode("PROC_CD", "CREATED", "MDM");
        seeds.released("PROC_CD", "1.000", MasterCodeSeeds.PAST, MasterCodeSeeds.OPEN_END);
        seeds.seedCode("GRADE_CD", "DEPRECATED", "MDM");
        jdbc.update("UPDATE TB_MDM_CODE SET MARU_CODE_NAME = '강종 등급' WHERE MARU_CODE_ID = 'GRADE_CD'");

        assertEquals(1, search("proc", null).getTotalCount(), "ID 는 대소문자 무시 부분 일치");
        assertEquals("GRADE_CD", search("강종", null).getRows().get(0).getMaruCodeId());
        assertEquals("PROC_CD", search(null, "INUSE").getRows().get(0).getMaruCodeId());
        assertEquals(1, search(null, "INUSE").getTotalCount(), "필터는 계산 상태 기준");
        assertEquals(0, search(null, "CREATED").getTotalCount());
        assertEquals("GRADE_CD", search(null, "DEPRECATED").getRows().get(0).getMaruCodeId());
        assertEquals(1, search("_CD", "DEPRECATED").getTotalCount());

        CodeMngSearchResult empty = search("NOPE", null);
        assertEquals(0, empty.getTotalCount());
        assertTrue(empty.getRows().isEmpty());
        assertEquals(0, search("P%C", null).getTotalCount(), "LIKE 와일드카드는 글자로 본다");
    }

    // ── 도우미 ──

    private CodeRegResult register(CodeRegRequest request) {
        return tx.execute(s -> service.register(request));
    }

    private CodeMngSearchResult search(String keyword, String status) {
        CodeMngSearchRequest r = new CodeMngSearchRequest();
        r.setKeyword(keyword);
        r.setStatus(status);
        return tx.execute(s -> service.search(r));
    }

    static CodeRegRequest req(String id, String name, String desc, Integer lvlCnt, String sourceKind) {
        CodeRegRequest r = new CodeRegRequest();
        r.setMaruCodeId(id);
        r.setMaruCodeName(name);
        r.setDescription(desc);
        r.setLvlCnt(lvlCnt);
        r.setSourceKind(sourceKind);
        return r;
    }

    static void assertCode(MdmErrorCode expected, Supplier<?> call) {
        BusinessException e = assertThrows(BusinessException.class, call::get);
        assertEquals(expected.code(), e.getErrors().get(0).code(), e.getMessage());
        assertTrue(e.getMessage().startsWith(expected.defaultMessage()), e.getMessage());
    }
}
