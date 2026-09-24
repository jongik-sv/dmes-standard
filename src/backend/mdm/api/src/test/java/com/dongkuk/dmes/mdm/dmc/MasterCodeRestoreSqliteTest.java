package com.dongkuk.dmes.mdm.dmc;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.FUTURE;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST2;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSegments;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDraftRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRestoreRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
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
 * TSK-06-02 design.md §3.2 P1~P5 — 복원(원본 RELEASED 내용으로 채운 새 버전)의 diff 가 세 표 모두를 채운다(수용 기준 8,
 * 불변 규칙 I15). 복원 결과 {@code rowsAt(V) ≡ rowsAt(S)}, diff({@code FROM_VER=V OR TO_VER=V}) 에 같은 값의 키는 없다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class MasterCodeRestoreSqliteTest {

    private static final String ID = "PROC_CD";

    @TempDir
    static Path tempDir;

    @Autowired
    CodeEditService service;
    @Autowired
    MasterCodeVersionSegments segments;
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
        Path dbFile = tempDir.resolve("mdm-code-restore-test.db");
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

    /** 1.000(A a1, B, D, BASE, T t1, (T,A), (T,D)) → 1.001(A a2, B 닫힘, C 추가, T t2, (T,A) 닫힘, (T,C) 추가, R 추가), 둘 다 과거 적용. */
    private void twoReleases() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, PAST2);
        seeds.released(ID, "1.001", PAST2, OPEN_END);
        seeds.seedItem(ID, "A", "1.000", "1.001", "a1", 1, "L1", null, null, null, null, "x1");
        seeds.seedItem(ID, "A", "1.001", OPEN, "a2", 1, "L1", null, null, null, null, "x1");
        seeds.seedItem(ID, "B", "1.000", "1.001", "b1", 2);
        seeds.seedItem(ID, "C", "1.001", OPEN, "c1", 3);
        seeds.seedItem(ID, "D", "1.000", OPEN, "d1", 4);
        seeds.seedBase(ID);
        seeds.seedCate(ID, "T", "1.000", "1.001", "TABLE", null, null, "t1");
        seeds.seedCate(ID, "T", "1.001", OPEN, "TABLE", null, null, "t2");
        seeds.seedCate(ID, "R", "1.001", OPEN, "REGEX", "^C", "CODE", "r1");
        seeds.seedCateItem(ID, "T", "A", "1.000", "1.001");
        seeds.seedCateItem(ID, "T", "C", "1.001", OPEN);
        seeds.seedCateItem(ID, "T", "D", "1.000", OPEN);
    }

    @Test
    void P1_복원한_버전의_모습은_원본과_같다_세_표() {
        twoReleases();
        CodeEditView v = restore("MAJOR", "1.000");

        assertEquals("2.000", v.getVersions().get(0).getVer());
        assertEquals("v1.000 복원", v.getVersions().get(0).getRestoredLabel());
        assertEquals(0, BigDecimal.ONE.compareTo(jdbc.queryForObject(
                "SELECT RESTORED_FROM FROM TB_MDM_CODE_VER WHERE VER = 2.0", BigDecimal.class)));
        assertEquals("stw1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER WHERE VER = 2.0", String.class));
        assertEquals(at("1.000"), at("2.000"));
    }

    @Test
    void P2_diff_는_세_표_모두에_있고_같은_값의_키는_없다() {
        twoReleases();
        restore("MAJOR", "1.000");

        assertEquals(new TreeSet<>(List.of("A", "B", "C")), keys("TB_MDM_CODE_ITEM", "CODE", "2.000"), "값이 같은 D 는 없다");
        assertEquals(new TreeSet<>(List.of("R", "T")), keys("TB_MDM_CODE_CATE", "CATE_ID", "2.000"));
        assertEquals(new TreeSet<>(List.of("T,A", "T,C")), keys("TB_MDM_CODE_CATE_ITEM", "CATE_ID || ',' || CODE", "2.000"));
        // 추가(FROM=V)·닫기(TO=V) 구분
        assertEquals(new TreeSet<>(List.of("A", "B")), keys("TB_MDM_CODE_ITEM", "CODE", "FROM_VER", "2.000"));
        assertEquals(new TreeSet<>(List.of("A", "C")), keys("TB_MDM_CODE_ITEM", "CODE", "TO_VER", "2.000"));
        assertEquals(new TreeSet<>(List.of("T")), keys("TB_MDM_CODE_CATE", "CATE_ID", "FROM_VER", "2.000"));
        assertEquals(new TreeSet<>(List.of("R", "T")), keys("TB_MDM_CODE_CATE", "CATE_ID", "TO_VER", "2.000"));
        assertEquals(new TreeSet<>(List.of("T,A")), keys("TB_MDM_CODE_CATE_ITEM", "CATE_ID || ',' || CODE", "FROM_VER", "2.000"));
        assertEquals(new TreeSet<>(List.of("T,C")), keys("TB_MDM_CODE_CATE_ITEM", "CATE_ID || ',' || CODE", "TO_VER", "2.000"));
    }

    @Test
    void P2b_minor_복원도_같은_규칙이다() {
        twoReleases();
        restore("MINOR", "1.000");
        assertEquals(at("1.000"), at("1.002"));
    }

    @Test
    void P3_원본이_RELEASED_가_아니거나_없으면_거부한다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedVer(ID, "1.001", "MINOR", "CANCELLED", FUTURE, OPEN_END, "stw1");
        MasterCodeSeeds.assertMdmError(MdmErrorCode.INVALID_INPUT, () -> restore("MAJOR", "1.001"));
        MasterCodeSeeds.assertMdmError(MdmErrorCode.INVALID_INPUT, () -> restore("MAJOR", "1.005"));
        MasterCodeSeeds.assertMdmError(MdmErrorCode.INVALID_INPUT, () -> restore("MAJOR", "abc"));
        MasterCodeSeeds.assertMdmError(MdmErrorCode.INVALID_INPUT, () -> restore("MAJOR", null));
        // DRAFT 가 있으면 미적용 검사가 먼저라 MDM006 으로 막힌다(design §6.8 순서)
        seeds.draft(ID, "1.002", "stw1");
        BusinessException e = assertThrows(BusinessException.class, () -> restore("MAJOR", "1.002"));
        assertEquals(MdmErrorCode.UNAPPLIED_VERSION_EXISTS.code(), e.getErrors().get(0).code());
        assertEquals(3, seeds.count("TB_MDM_CODE_VER"));
    }

    @Test
    void P3b_선분_부품도_원본이_RELEASED_가_아니면_거부한다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedVer(ID, "1.001", "MINOR", "CANCELLED", FUTURE, OPEN_END, "stw1");
        seeds.draft(ID, "1.002", "stw1");
        VersionRef draft = new VersionRef(VersionTarget.MASTER_CODE, ID, new BigDecimal("1.002"));
        MasterCodeSeeds.assertMdmError(MdmErrorCode.INVALID_INPUT,
                () -> tx.execute(s -> { segments.fillFrom(draft, new BigDecimal("1.001")); return null; }));
        MasterCodeSeeds.assertMdmError(MdmErrorCode.INVALID_INPUT,
                () -> tx.execute(s -> { segments.fillFrom(draft, new BigDecimal("1.002")); return null; }));
        tx.execute(s -> { segments.fillFrom(draft, new BigDecimal("1.000")); return null; });
    }

    @Test
    void P4_미적용이_있으면_복원도_MDM006() {
        twoReleases();
        seeds.draft(ID, "1.002", "stw1");
        MasterCodeSeeds.assertMdmError(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> restore("MAJOR", "1.000"));
    }

    @Test
    void P5_복원한_DRAFT_를_지우면_복원_전으로_돌아간다() {
        twoReleases();
        List<String> before = seeds.segments(ID);
        restore("MAJOR", "1.000");
        CodeDraftRequest r = new CodeDraftRequest();
        r.setMaruCodeId(ID);
        r.setVer("2.000");
        r.setRowVersion(0L);
        tx.execute(s -> service.deleteDraft(r));
        assertEquals(before, seeds.segments(ID));
        assertEquals(at("1.001"), at("2.000"), "열린 행은 1.001 모습 그대로");
        assertEquals(2, seeds.count("TB_MDM_CODE_VER"));
    }

    // ── 도우미 ──

    private CodeEditView restore(String kind, String source) {
        CodeVersionRestoreRequest r = new CodeVersionRestoreRequest();
        r.setMaruCodeId(ID);
        r.setVerKind(kind);
        r.setSourceVer(source);
        return tx.execute(s -> service.restoreVersion(r));
    }

    /** 버전 v 에 유효한(from ≤ v < to) 세 표 행의 업무 값(버전 칸 제외). Java 로 거른다. */
    private List<String> at(String v) {
        BigDecimal ver = new BigDecimal(v);
        List<String> out = new ArrayList<>();
        for (String row : seeds.segments(ID)) {
            String[] p = row.split("\\|", -1);
            BigDecimal from = new BigDecimal(p[2]);
            BigDecimal to = new BigDecimal(p[3]);
            if (from.compareTo(ver) <= 0 && ver.compareTo(to) < 0) {
                StringBuilder sb = new StringBuilder(p[0] + "|" + p[1]);
                for (int i = 4; i < p.length; i++) {
                    sb.append('|').append(p[i]);
                }
                out.add(sb.toString());
            }
        }
        out.sort(null);
        return out;
    }

    private TreeSet<String> keys(String table, String keyExpr, String ver) {
        TreeSet<String> out = keys(table, keyExpr, "FROM_VER", ver);
        out.addAll(keys(table, keyExpr, "TO_VER", ver));
        return out;
    }

    private TreeSet<String> keys(String table, String keyExpr, String column, String ver) {
        return new TreeSet<>(jdbc.queryForList("SELECT " + keyExpr + " FROM " + table + " WHERE MARU_CODE_ID = ? AND "
                + column + " = ?", String.class, ID, new BigDecimal(ver)));
    }
}
