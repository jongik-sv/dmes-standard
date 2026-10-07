package com.dongkuk.dmes.mdm.dmc.codeConfirm;

import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.cateRow;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.confirm;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.itemRow;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.list;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.memberRow;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.status;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.validate;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.view;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeConfirmCheck;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionSpiRegistry;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.service.CodeCateEditService;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.service.CodeConfirmService;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionCreateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.service.CodeItemEditService;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeRegRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.service.CodeMngService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import kr.dongkuk.maru.mdm.engine.code.CodeResolver.CodeListEntry;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-06-05 design.md §3.2 H1~H5 — 수용 기준 4 「04 샘플 데이터 버전 이력(v1.000 → v1.001)을 확정 경로로 재현」. 기대값은
 * 원천 {@code 04-master-code-deploy-full.md:1059-1080} 을 글자 그대로 옮겼다. 데이터는 화면과 같은 서비스로만 만든다
 * (codeMng 등록 → codeItemEdit·codeCateEdit 저장 → codeConfirm 확정 → codeEdit 새 버전 → 저장 → 확정). 시계 2026-09-03
 * 00:00 KST, 사용자 kim(MDM_STEWARD). 서비스에는 {@code @Transactional} 이 없으므로 운영 경로(OASIS 프로세스 트랜잭션)처럼
 * 액션마다 {@link TransactionTemplate} 하나로 부른다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class CodeConfirmSampleHistorySqliteTest extends AbstractMdmSharedDbTest {

    private static final String ID = "PROC_CD";

    @Autowired
    CodeMngService codeMngService;
    @Autowired
    CodeItemEditService codeItemEditService;
    @Autowired
    CodeCateEditService codeCateEditService;
    @Autowired
    CodeEditService codeEditService;
    @Autowired
    CodeConfirmService codeConfirmService;
    @Autowired
    VersionSpiRegistry registry;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    MasterCodeLedgerQueries ledger;

    private TransactionTemplate tx;
    private JdbcTemplate jdbc;
    private MasterCodeFixtures fx;
    private Map<String, Object> validate1000;
    private Map<String, Object> confirm1000;

    @BeforeEach
    void replaySampleHistory() {
        tx = new TransactionTemplate(transactionManager);
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));

        CodeRegRequest reg = new CodeRegRequest();
        reg.setMaruCodeId(ID);
        reg.setMaruCodeName("공정 코드");
        reg.setLvlCnt(0);
        tx.executeWithoutResult(st -> codeMngService.register(reg));

        tx.executeWithoutResult(st -> codeItemEditService.save(itemSave("1.000"), List.of(
                itemRow("ADDED", "1P", "PLTCM", "PLTCM", 11),
                itemRow("ADDED", "82", "2CGL", "CGL", 21),
                itemRow("ADDED", "83", "3CGl", "CGL", 22)), List.of(), List.of()));
        tx.executeWithoutResult(st -> codeCateEditService.save(cateSave("1.000"), List.of(
                cateRow("ADDED", "COATING", "도금 공정", "REGEX", "8[0-9]", "CODE"),
                cateRow("ADDED", "MAJOR", "주요 공정", "TABLE", null, null),
                cateRow("ADDED", "COLD_MILL", "냉연 공정", "TABLE", null, null)), List.of(
                memberRow("MAJOR", "1P"), memberRow("MAJOR", "82"), memberRow("COLD_MILL", "1P"))));
        validate1000 = tx.execute(st -> codeConfirmService.validate(validate(ID, "1.000", "2024-01-01 00:00:00")));
        confirm1000 = tx.execute(st -> codeConfirmService.confirm(
                confirm(ID, "1.000", fx.rowVersion(ID, "1.000"), "2024-01-01 00:00:00", false)));

        CodeVersionCreateRequest minor = new CodeVersionCreateRequest();
        minor.setMaruCodeId(ID);
        minor.setVerKind("MINOR");
        tx.executeWithoutResult(st -> codeEditService.createVersion(minor));
        tx.executeWithoutResult(st -> codeItemEditService.save(itemSave("1.001"), List.of(
                itemRow("CHANGED", "83", "3CGL", "CGL", 22),
                itemRow("ADDED", "2P", "PLTCM2", "PLTCM", 12)), List.of(), List.of()));
        tx.executeWithoutResult(st -> codeCateEditService.save(cateSave("1.001"), List.of(),
                List.of(memberRow("MAJOR", "2P"), memberRow("COLD_MILL", "2P"))));
        tx.executeWithoutResult(st -> codeConfirmService.confirm(
                confirm(ID, "1.001", fx.rowVersion(ID, "1.001"), "2026-07-01 00:00:00", false)));
    }

    private CodeItemSaveRequest itemSave(String ver) {
        CodeItemSaveRequest r = new CodeItemSaveRequest();
        r.setMaruCodeId(ID);
        r.setVer(ver);
        r.setRowVersion(fx.rowVersion(ID, ver));
        return r;
    }

    private CodeCateSaveRequest cateSave(String ver) {
        CodeCateSaveRequest r = new CodeCateSaveRequest();
        r.setMaruCodeId(ID);
        r.setVer(ver);
        r.setRowVersion(fx.rowVersion(ID, ver));
        return r;
    }

    @Test
    void 레지스트리의_MASTER_CODE_확정_검사는_운영_빈이다() {
        assertInstanceOf(MasterCodeConfirmCheck.class, registry.confirmCheck(VersionTarget.MASTER_CODE));
    }

    @Test
    void H1_VER_표가_원천과_같다() {
        List<String> vers = jdbc.query("SELECT VER, STATUS, TO_CHAR(APPLY_FROM, 'YYYY-MM-DD HH24:MI:SS'), "
                        + "TO_CHAR(APPLY_TO, 'YYYY-MM-DD HH24:MI:SS'), VER_KIND, REQUESTED_BY, APPROVED_BY "
                        + "FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = ? ORDER BY VER",
                (rs, i) -> MasterCodeFixtures.fmt(rs.getBigDecimal(1)) + "|" + rs.getString(2) + "|" + rs.getString(3)
                        + "|" + rs.getString(4) + "|" + rs.getString(5) + "|" + rs.getString(6) + "|" + rs.getString(7), ID);

        assertEquals(List.of(
                "1.000|RELEASED|2024-01-01 00:00:00|2026-07-01 00:00:00|MAJOR|kim|null",
                "1.001|RELEASED|2026-07-01 00:00:00|9999-12-31 00:00:00|MINOR|kim|null"), vers);
    }

    @Test
    void H2_ITEM_과_CATE_ITEM_이_원천의_v1_001_까지_모습과_같다() {
        assertEquals(List.of(
                "1P|1.000|9999|PLTCM|PLTCM|11",
                "2P|1.001|9999|PLTCM2|PLTCM|12",
                "82|1.000|9999|2CGL|CGL|21",
                "83|1.000|1.001|3CGl|CGL|22",
                "83|1.001|9999|3CGL|CGL|22"), fx.itemRows(ID));
        assertEquals(List.of("BASE@1.000-9999", "COATING@1.000-9999", "COLD_MILL@1.000-9999", "MAJOR@1.000-9999"),
                fx.cateSegments(ID));
        assertEquals(List.of(
                "COLD_MILL 1P@1.000-9999",
                "COLD_MILL 2P@1.001-9999",
                "MAJOR 1P@1.000-9999",
                "MAJOR 2P@1.001-9999",
                "MAJOR 82@1.000-9999"), fx.cateItemSegments(ID));
    }

    @Test
    void H3_첫_확정에서_TB_MDM_CODE_가_INUSE_가_된다() {
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE WHERE MARU_CODE_ID = ?", String.class, ID));
        assertEquals("INUSE", CodeConfirmRequests.map(confirm1000, "header").get("status"));
        assertNull(confirm1000.get("closedPreviousVer"));
    }

    @Test
    void H4_v1_001_의_diff_와_카테고리_요약() {
        Map<String, Object> v = codeConfirmService.view(view(ID, "1.001"));

        List<String> diff = list(v, "diff").stream()
                .map(d -> d.get("key") + " " + d.get("kind")).toList();
        assertEquals(List.of("ITEM:2P ADDED", "ITEM:83 CHANGED", "CATE_ITEM:COLD_MILL,2P ADDED", "CATE_ITEM:MAJOR,2P ADDED"),
                diff);
        Map<String, Object> changed83 = list(v, "diff").get(1);
        assertEquals("3CGl", ((Map<?, ?>) changed83.get("oldValues")).get("NAME"));
        assertEquals("3CGL", ((Map<?, ?>) changed83.get("newValues")).get("NAME"));
        assertEquals("1.000", CodeConfirmRequests.map(v, "previous").get("ver"));

        List<String> changes = list(v, "categoryChanges").stream()
                .map(c -> c.get("cateId") + " " + c.get("beforeCount") + "->" + c.get("afterCount") + " +"
                        + c.get("addedCodes") + " -" + c.get("removedCodes") + " " + c.get("reduced"))
                .toList();
        assertEquals(List.of(
                "BASE 3->4 +[2P] -[] false",
                "COLD_MILL 1->2 +[2P] -[] false",
                "MAJOR 2->3 +[2P] -[] false"), changes);
        assertEquals(List.of("도금 공정"), v.get("unchangedCategories"));
    }

    @Test
    void H5_v1_000_확정_검사는_3_4항_면제다() {
        assertEquals("EXEMPT", status(validate1000, "3"));
        assertEquals("EXEMPT", status(validate1000, "4"));
        assertEquals(0, ((Number) validate1000.get("rejectedCount")).intValue());
        assertEquals(0, ((Number) validate1000.get("warnedCount")).intValue());
    }

    /**
     * TSK-09-02 design.md §3 B1 D1 — 이 체인이 실제로 심은 원장(1P/82/83/2P)에 04 「샘플 데이터」의 "해석 결과(V = 1.001)"
     * 문장을 그대로 대조한다. 판정기는 운영 빈이 아니라 시험 코드 안에서만 조립한다(D2,
     * {@code MasterCodeDeprecateEngineSqliteTest} 와 같은 방식).
     */
    @Test
    void H6_MASTER_AT_원장_판정이_04_샘플_데이터_해석_결과와_같다() {
        DefaultCodeResolver resolver = new DefaultCodeResolver(new MdmCodeLookup(ledger), CodeEffLookup.NONE);
        LocalDateTime baseDt = LocalDateTime.of(2026, 9, 3, 0, 0);

        assertEquals(Set.of("1P", "2P", "82", "83"), members(resolver, "BASE", baseDt));
        assertEquals(Set.of("82", "83"), members(resolver, "COATING", baseDt));
        assertEquals(Set.of("1P", "2P", "82"), members(resolver, "MAJOR", baseDt));
        assertEquals(Set.of("1P", "2P"), members(resolver, "COLD_MILL", baseDt));
    }

    /**
     * TSK-09-02 design.md §3 B1 4항 — 기준일을 v1.001 applyFrom(2026-07-01) 이전으로 주면 버전이 v1.000 으로 소급되고,
     * 그 버전에는 아직 없던 2P 가 어느 카테고리에도 없어야 한다(04 「판정 참고 구현」 버전·카테고리 소급 규칙).
     */
    @Test
    void H7_기준일이_v1_000_구간이면_판정도_v1_000_모습으로_소급된다() {
        DefaultCodeResolver resolver = new DefaultCodeResolver(new MdmCodeLookup(ledger), CodeEffLookup.NONE);
        LocalDateTime baseDt = LocalDateTime.of(2025, 1, 1, 0, 0);

        assertEquals(Set.of("1P", "82", "83"), members(resolver, "BASE", baseDt));
        assertEquals(Set.of("82", "83"), members(resolver, "COATING", baseDt));
        assertEquals(Set.of("1P", "82"), members(resolver, "MAJOR", baseDt));
        assertEquals(Set.of("1P"), members(resolver, "COLD_MILL", baseDt));
    }

    private static Set<String> members(DefaultCodeResolver resolver, String cateId, LocalDateTime baseDt) {
        return resolver.codeList(ID, cateId, baseDt).stream().map(CodeListEntry::code).collect(Collectors.toSet());
    }
}
