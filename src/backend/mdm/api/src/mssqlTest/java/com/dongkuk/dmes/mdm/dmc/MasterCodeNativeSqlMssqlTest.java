package com.dongkuk.dmes.mdm.dmc;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST2;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.MdmMssqlServer;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionCreateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRestoreRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngRow;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.service.CodeMngService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
 * TSK-06-02 design.md §2·규칙표 #17 — 삭제 훅·조회 모델·채번 저장·복원 비교의 네이티브 SQL 을 실제 SQL Server 에서 돌린다
 * (SQLite 시험 D1·P1·R8 의 축약판). {@code CAST(VER AS VARCHAR(40))} 읽기, DECIMAL(7,3) 저장·등호 조회를 확인한다.
 * 공용 서버({@link MdmMssqlServer})를 쓴다 — {@code :api:mssqlMigrationTest} 로만 돈다(testAll 비포함, 도커 필요).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
@Import(DmaTestSupport.Config.class)
class MasterCodeNativeSqlMssqlTest {

    static final String DB_URL = MdmMssqlServer.newDatabase("mastercodenative");
    private static final String ID = "PROC_CD";

    @Autowired
    CodeEditService codeEdit;
    @Autowired
    CodeMngService codeMng;
    @Autowired
    VersionStateService versionState;
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
    static void registerMssql(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DB_URL);
        registry.add("spring.datasource.username", MdmMssqlServer::user);
        registry.add("spring.datasource.password", MdmMssqlServer::password);
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        seeds = new MasterCodeSeeds(jdbc);
        seeds.clear();
        currentUser.set("stw1", Set.of("MDM_STEWARD"));
    }

    @Test
    void 삭제_훅이_세_표를_DRAFT_전으로_되돌린다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedItem(ID, "A", "1.000", OPEN, "a1", 1);
        seeds.seedBase(ID);
        seeds.seedCate(ID, "T", "1.000", OPEN, "TABLE", null, null, "t1");
        seeds.seedCateItem(ID, "T", "A", "1.000", OPEN);
        List<String> before = seeds.segments(ID);

        CodeVersionCreateRequest create = new CodeVersionCreateRequest();
        create.setMaruCodeId(ID);
        create.setVerKind("MINOR");
        tx.execute(s -> codeEdit.createVersion(create));
        jdbc.update("UPDATE TB_MDM_CODE_ITEM SET TO_VER = 1.001 WHERE MARU_CODE_ID = ?", ID);
        seeds.seedItem(ID, "A", "1.001", OPEN, "a2", 1);
        jdbc.update("UPDATE TB_MDM_CODE_CATE_ITEM SET TO_VER = 1.001 WHERE MARU_CODE_ID = ?", ID);

        tx.executeWithoutResult(s -> versionState.deleteDraft(
                new VersionRef(VersionTarget.MASTER_CODE, ID, new BigDecimal("1.001")), 0L, "stw1"));

        assertEquals(before, seeds.segments(ID));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER", ID));
    }

    @Test
    void 복원과_조회_모델이_DECIMAL_7_3_을_그대로_다룬다() {
        seeds.seedCode(ID, "CREATED", "MDM");
        seeds.released(ID, "1.000", PAST, PAST2);
        seeds.released(ID, "1.001", PAST2, OPEN_END);
        seeds.seedItem(ID, "A", "1.000", "1.001", "a1", 1);
        seeds.seedItem(ID, "A", "1.001", OPEN, "a2", 1);
        seeds.seedBase(ID);

        CodeVersionRestoreRequest restore = new CodeVersionRestoreRequest();
        restore.setMaruCodeId(ID);
        restore.setVerKind("MINOR");
        restore.setSourceVer("1.000");
        CodeEditView v = tx.execute(s -> codeEdit.restoreVersion(restore));

        assertEquals("1.002", v.getVersions().get(0).getVer());
        assertEquals("a1", jdbc.queryForObject("SELECT NAME FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = ? AND FROM_VER = ?",
                String.class, ID, new BigDecimal("1.002")));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = ? AND TO_VER = ?",
                Integer.class, ID, new BigDecimal("1.002")));

        CodeMngSearchRequest search = new CodeMngSearchRequest();
        search.setKeyword("proc");
        CodeMngRow row = tx.execute(s -> codeMng.search(search)).getRows().get(0);
        assertEquals("v1.001", row.getCurrentVerLabel());
        assertEquals("v1.002 DRAFT", row.getUnappliedLabel());
        assertEquals("INUSE", row.getStatus());
    }
}
