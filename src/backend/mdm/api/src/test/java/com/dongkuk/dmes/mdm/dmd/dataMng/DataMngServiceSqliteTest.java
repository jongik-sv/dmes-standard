package com.dongkuk.dmes.mdm.dmd.dataMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.CateSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.DataCategorySegmentCore;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentRowStore;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.dmd.dataMng.dto.DataMngRegRequest;
import com.dongkuk.dmes.mdm.dmd.dataMng.dto.DataMngSearchRequest;
import com.dongkuk.dmes.mdm.dmd.dataMng.service.DataMngService;
import com.dongkuk.dmes.mdm.repository.MdmCodeRepository;
import com.dongkuk.dmes.mdm.repository.MdmDataRepository;
import com.dongkuk.oasis.audit.AuditHolder;
import jakarta.persistence.EntityManager;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-07-02 design.md §3.1 — {@code dataMng} 조회·등록. R1(한 트랜잭션)·R6(BASE 값)·R9(배포 순번 미발급)·R10(MDM 원천 고정)·
 * F15(ID 이름 공간 충돌) 를 이 클래스가 담당한다(구현 단위 B1).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataMngServiceSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    DataMngService service;
    @Autowired
    DataCategorySegmentCore categorySegmentCore;
    @Autowired
    DataSegmentRowStore rowStore;
    @Autowired
    MdmDataRepository dataRepo;
    @Autowired
    MdmCodeRepository codeRepo;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    EntityManager entityManager;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── reg — 등록 ─────────────────────────────────────────────────────────

    // rowStore.latestCateRows 등 네이티브 읽기는 호출 전 entityManager.flush() 를 하므로 트랜잭션이 있어야 한다
    // (DataSegmentRowStore.query() 계약). register() 자체는 자기 TransactionTemplate 으로 이미 커밋하므로
    // 이 @Transactional 은 등록 뒤 검증 읽기만을 위한 것이다 — R1(아래)과 달리 register 호출 자체를 감싸는 게
    // 아니므로 R1 의 "서비스를 감싸지 말라" 규칙과 무관하다.
    @Test
    @Transactional
    void 등록은_TB_MDM_DATA_와_BASE_카테고리를_같은_트랜잭션으로_만든다() {
        DataMngRegRequest req = regRequest("SHIPY", "조선소", "^[0-9A-Z]{1,20}$", 2);

        service.register(req);

        assertTrue(dataRepo.existsById("SHIPY"));
        List<CateSegmentRow> cates = rowStore.latestCateRows("SHIPY");
        assertEquals(1, cates.size());
        assertEquals(CategoryConventions.BASE_CATE_ID, cates.get(0).key().cateId());
    }

    @Test
    @Transactional
    void R6_BASE_카테고리는_REGEX_점별_KEY_전체_로_만들어진다() {
        service.register(regRequest("SHIPY", "조선소", "^[0-9A-Z]{1,20}$", 0));

        CateSegmentRow base = rowStore.latestCateRows("SHIPY").get(0);
        assertEquals("전체", base.value().cateName());
        assertEquals("REGEX", base.value().defKind());
        assertEquals(".*", base.value().defExpr());
        assertEquals("KEY", base.value().defTarget());
    }

    @Test
    @Transactional
    void R9_등록_뒤_배포_순번은_0이다() {
        service.register(regRequest("SHIPY", "조선소", "^[0-9A-Z]{1,20}$", 0));

        var data = dataRepo.findById("SHIPY").orElseThrow();
        assertEquals(0L, data.getLastChgSeq());
        assertEquals(0L, data.getChgSeq());
        CateSegmentRow base = rowStore.latestCateRows("SHIPY").get(0);
        assertEquals(0L, base.chgSeq());
    }

    @Test
    void R10_등록은_MDM_원천_고정이고_원천_시스템은_NULL이다() {
        service.register(regRequest("SHIPY", "조선소", "^[0-9A-Z]{1,20}$", 0));

        var data = dataRepo.findById("SHIPY").orElseThrow();
        assertEquals("MDM", data.getSourceKind());
        assertNull(data.getSourceSystem());
    }

    @Test
    void F15_마루_코드에_같은_ID_가_있으면_MDM011_로_거부한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "DUPID", 0); // 마루 데이터로 먼저 존재 → 등록은 dataRepo.existsById 로 걸린다
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.register(regRequest("DUPID", "중복", "^[0-9A-Z]{1,20}$", 0)));
        assertTrue(ex.getMessage().contains("마루 코드·마루 데이터에 같은 ID 가 있습니다"), ex.getMessage());
    }

    // ── R1 — 한 트랜잭션(카테고리 등록 실패 시 마루 데이터 행도 롤백) ────────────────────

    @Test
    void R1_카테고리_등록이_실패하면_MdmData_행도_롤백된다() {
        DataCategorySegmentCore failing = mock(DataCategorySegmentCore.class);
        when(failing.registerCate(any(), any(), any())).thenThrow(new RuntimeException("의도적 실패(R1 변이 검증)"));
        DataMngService failingService = new DataMngService(entityManager, dataRepo, codeRepo, failing, transactionManager);

        assertThrows(RuntimeException.class,
                () -> failingService.register(regRequest("ROLLB", "롤백", "^[0-9A-Z]{1,20}$", 0)));

        assertFalse(dataRepo.existsById("ROLLB"));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'ROLLB'", Integer.class));
    }

    // ── search — 조회(ID·이름·상태) ─────────────────────────────────────────

    @Test
    void search_는_ID_이름_상태로_부분_일치_조회한다() {
        service.register(regRequest("KRPUS1", "부산항", "^[0-9A-Z]{1,20}$", 0));
        service.register(regRequest("KRINC1", "인천항", "^[0-9A-Z]{1,20}$", 0));

        assertEquals(2, service.search(searchRequest("KR", null, null)).getList().size());
        assertEquals(1, service.search(searchRequest(null, "부산", null)).getList().size());
        assertEquals(2, service.search(searchRequest(null, null, "INUSE")).getList().size());
        assertEquals(0, service.search(searchRequest(null, null, "DEPRECATED")).getList().size());
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static DataMngRegRequest regRequest(String id, String name, String codePattern, int lvlCnt) {
        DataMngRegRequest req = new DataMngRegRequest();
        req.setMaruDataId(id);
        req.setMaruDataName(name);
        req.setCodePattern(codePattern);
        req.setLvlCnt(lvlCnt);
        return req;
    }

    private static DataMngSearchRequest searchRequest(String id, String name, String status) {
        DataMngSearchRequest req = new DataMngSearchRequest();
        req.setMaruDataId(id);
        req.setMaruDataName(name);
        req.setStatus(status);
        return req;
    }
}
