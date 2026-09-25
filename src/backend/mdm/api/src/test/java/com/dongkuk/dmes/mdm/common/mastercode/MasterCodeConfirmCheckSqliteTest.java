package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionSpiRegistry;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckItemResult;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCheckStatus;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConfirmCheckReport;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import java.math.BigDecimal;
import java.time.LocalDateTime;
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

/**
 * TSK-06-05 design.md §3.2 SP1~SP5 — 운영 확정 검사 SPI 빈({@link MasterCodeConfirmCheck})을 실제 V9 표로 local(SQLite)
 * 컨텍스트에서 돌린다. {@code VersionScenarioTestConfig} 를 import 하지 않는다 — 그 후처리기가 운영 SPI 를 가짜로 바꾼다.
 *
 * <p>기본 시드: 원천 04:1059-1092 PROC_CD 에서 DRAFT v2.000 이 82·83 과 MAJOR 82 를 닫은 모습(시계 2026-09-03).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class MasterCodeConfirmCheckSqliteTest extends AbstractMdmSharedDbTest {

    private static final VersionRef V2_000 = ref("PROC_CD", "2.000");
    private static final LocalDateTime FUTURE = LocalDateTime.of(2026, 10, 1, 0, 0);
    private static final LocalDateTime V1_001_APPLY_FROM = LocalDateTime.of(2026, 7, 1, 0, 0);
    private static final List<String> TABLES =
            List.of("TB_MDM_CODE", "TB_MDM_CODE_VER", "TB_MDM_CODE_ITEM", "TB_MDM_CODE_CATE", "TB_MDM_CODE_CATE_ITEM");

    @Autowired
    MasterCodeConfirmCheck spi;
    @Autowired
    VersionSpiRegistry registry;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;
    private MasterCodeFixtures fx;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        fx.seedProcCdBeforeDraftEdits();
        jdbc.update("UPDATE TB_MDM_CODE_ITEM SET TO_VER = '2.000' WHERE MARU_CODE_ID = 'PROC_CD' "
                + "AND CODE IN ('82', '83') AND TO_VER >= 9999");
        jdbc.update("UPDATE TB_MDM_CODE_CATE_ITEM SET TO_VER = '2.000' WHERE MARU_CODE_ID = 'PROC_CD' "
                + "AND CATE_ID = 'MAJOR' AND CODE = '82'");
    }

    @Test
    void 운영_레지스트리의_MASTER_CODE_확정_검사는_이_빈이다() {
        assertInstanceOf(MasterCodeConfirmCheck.class, registry.confirmCheck(VersionTarget.MASTER_CODE));
    }

    @Test
    void SP1_diff_는_샘플_REMOVED_세_행이고_base_는_직전_RELEASED_1_001() {
        VersionDiff diff = spi.diff(V2_000);

        assertEquals(List.of("ITEM:82 REMOVED", "ITEM:83 REMOVED", "CATE_ITEM:MAJOR,82 REMOVED"),
                diff.entries().stream().map(e -> e.key() + " " + e.kind()).toList());
        assertEquals(0, diff.base().ver().compareTo(new BigDecimal("1.001")));
        assertEquals(V2_000, diff.target());
        assertEquals("3CGL", diff.entries().get(1).oldValues().get("NAME"));
    }

    @Test
    void SP1_최초_버전의_base_는_null() {
        seedFirstVersionCode("F", 0);
        fx.seedItem("F", "A", "1.000", OPEN, "에이", null, 1, null);

        VersionDiff diff = spi.diff(ref("F", "1.000"));

        assertEquals(null, diff.base());
        assertEquals(List.of("ITEM:A ADDED", "CATE:BASE ADDED"),
                diff.entries().stream().map(e -> e.key() + " " + e.kind()).toList());
    }

    @Test
    void SP2_샘플_v2_000_은_COATING_2_2_경고_하나() {
        ConfirmCheckRequest request = request(V2_000, V1_001_APPLY_FROM);

        MasterCodeConfirmCheckReport report = spi.report(request);

        assertEquals(List.of("1=PASSED", "2=PASSED", "2-1=PASSED", "2-2=WARNED", "3=DELEGATED", "4=PASSED",
                "5=DEFERRED", "6=PASSED", "7=PASSED", "8=PASSED"), statuses(report));
        ConfirmCheckResult result = spi.check(request);
        assertEquals(List.of(), result.errors());
        assertEquals(List.of("CATEGORY_EMPTY CATE:COATING"), codeAndKey(result.warnings()));
    }

    @Test
    void SP3_V_에_없는_코드의_TABLE_소속은_2_1_경고() {
        fx.seedCateItem("PROC_CD", "MAJOR", "83", "1.000", OPEN);

        MasterCodeConfirmCheckReport report = spi.report(request(V2_000, V1_001_APPLY_FROM));

        assertEquals(MasterCodeCheckStatus.WARNED, row(report, "2-1").status());
        assertEquals(List.of("CATE_ITEM_CODE_MISSING CATE_ITEM:MAJOR,83"), codeAndKey(row(report, "2-1").issues()));
    }

    @Test
    void SP4_저장_검사를_우회한_계층_위반은_6항_거부() {
        seedFirstVersionCode("H", 3);
        fx.seedItem("H", "A", "1.000", OPEN, "에이", null, 1, null, "G", null, "K");

        ConfirmCheckRequest request = request(ref("H", "1.000"), null);
        MasterCodeConfirmCheckReport report = spi.report(request);

        assertEquals(MasterCodeCheckStatus.REJECTED, row(report, "6").status());
        assertEquals(MasterCodeCheckStatus.EXEMPT, row(report, "3").status());
        assertEquals(MasterCodeCheckStatus.EXEMPT, row(report, "4").status());
        assertEquals(List.of("LVL_HIERARCHY ITEM:A"), codeAndKey(spi.check(request).errors()));
    }

    @Test
    void SP4_I3_RELEASED_없는_2_000_도_최초_버전이라_3_4항_면제() {
        fx.seedCode("S", "S 코드", "MDM", 0);
        fx.seedVersion("S", "2.000", "DRAFT", "kim", null, null, 0);
        fx.seedCate("S", "BASE", "2.000", OPEN, "전체", "REGEX", ".*", "CODE");
        fx.seedItem("S", "A", "2.000", OPEN, "에이", null, 1, null);

        MasterCodeConfirmCheckReport report = spi.report(request(ref("S", "2.000"), null));

        assertEquals(MasterCodeCheckStatus.EXEMPT, row(report, "3").status());
        assertEquals(MasterCodeCheckStatus.EXEMPT, row(report, "4").status());
        assertEquals(null, spi.diff(ref("S", "2.000")).base());
    }

    @Test
    void SP5_SPI_는_쓰기를_하지_않는다() {
        fx.seedCateItem("PROC_CD", "MAJOR", "83", "1.000", OPEN);
        List<Object> before = snapshot();

        spi.diff(V2_000);
        spi.report(request(V2_000, V1_001_APPLY_FROM));
        spi.check(request(V2_000, V1_001_APPLY_FROM));

        assertEquals(before, snapshot());
        assertEquals(List.of("82@1.000-2.000", "83@1.000-1.001", "83@1.001-2.000"),
                fx.itemSegments("PROC_CD").stream().filter(s -> s.startsWith("8")).toList());
        assertTrue(fx.cateItemSegments("PROC_CD").contains("MAJOR 83@1.000-9999"));
    }

    private void seedFirstVersionCode(String id, int lvlCnt) {
        fx.seedCode(id, id + " 코드", "MDM", lvlCnt);
        fx.seedVersion(id, "1.000", "DRAFT", "kim", null, null, 0);
        fx.seedCate(id, "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
    }

    /** 다섯 표 행 수, 세 선분 표의 행 모습, DRAFT 의 ROW_VERSION. */
    private List<Object> snapshot() {
        return List.of(
                TABLES.stream().map(t -> jdbc.queryForObject("SELECT COUNT(*) FROM " + t, Long.class)).toList(),
                fx.itemRows("PROC_CD"), fx.cateSegments("PROC_CD"), fx.cateItemSegments("PROC_CD"),
                fx.rowVersion("PROC_CD", "2.000"));
    }

    private static ConfirmCheckRequest request(VersionRef draft, LocalDateTime previousApplyFrom) {
        return new ConfirmCheckRequest(draft, FUTURE, previousApplyFrom, "kim", MasterCodeTestConfig.SAMPLE_DAY);
    }

    private static VersionRef ref(String id, String ver) {
        return new VersionRef(VersionTarget.MASTER_CODE, id, new BigDecimal(ver));
    }

    private static MasterCodeCheckItemResult row(MasterCodeConfirmCheckReport report, String no) {
        return report.results().stream().filter(r -> r.item().no().equals(no)).findFirst().orElseThrow();
    }

    private static List<String> statuses(MasterCodeConfirmCheckReport report) {
        return report.results().stream().map(r -> r.item().no() + "=" + r.status()).toList();
    }

    private static List<String> codeAndKey(List<MdmCheckIssue> issues) {
        return issues.stream().map(i -> i.code() + " " + i.itemKey()).toList();
    }
}
