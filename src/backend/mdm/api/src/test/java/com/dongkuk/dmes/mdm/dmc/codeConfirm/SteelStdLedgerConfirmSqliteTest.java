package com.dongkuk.dmes.mdm.dmc.codeConfirm;

import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.confirm;
import static com.dongkuk.dmes.mdm.dmc.codeConfirm.CodeConfirmRequests.validate;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.service.CodeConfirmService;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeHeaderSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.service.CodeItemEditService;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeRegRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.service.CodeMngService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
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
 * TSK-09-02 design.md §3 B1 — 수용 기준 「STEEL_STD 등록→편집→확정」. 04 「계층 예」 8행({@code MasterCodeSamples.java}·
 * {@code MasterCodeFixtures.seedSteelStd()} 와 값이 같다)을 화면과 같은 서비스로만 심는다(codeMng.register →
 * codeItemEdit.save → codeConfirm.confirm, 단일 버전 1.000). 확정 뒤 {@code TB_MDM_CODE_ITEM} 이 원본 8행과 정확히
 * 같은지 단언한다. 콤보·트리 "조회" API 는 백엔드에 없으므로(트리 조립은 프런트 몫) 다루지 않는다 — 그 조회 자체는
 * 이 시험의 불변 규칙 범위 밖이다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class SteelStdLedgerConfirmSqliteTest extends AbstractMdmSharedDbTest {

    private static final String ID = "STEEL_STD";

    @Autowired
    CodeMngService codeMngService;
    @Autowired
    CodeEditService codeEditService;
    @Autowired
    CodeItemEditService codeItemEditService;
    @Autowired
    CodeConfirmService codeConfirmService;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private TransactionTemplate tx;
    private JdbcTemplate jdbc;
    private MasterCodeFixtures fx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactionManager);
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
    }

    @Test
    void SS1_등록부터_확정까지_STEEL_STD_8행이_원천과_같다() {
        CodeRegRequest reg = new CodeRegRequest();
        reg.setMaruCodeId(ID);
        reg.setMaruCodeName("강종 규격");
        reg.setLvlCnt(3);
        tx.executeWithoutResult(st -> codeMngService.register(reg));

        CodeHeaderSaveRequest header = new CodeHeaderSaveRequest();
        header.setMaruCodeId(ID);
        header.setAuditVer(0L);
        header.setMaruCodeName("강종 규격");
        header.setAttr01Name("인장강도");
        tx.executeWithoutResult(st -> codeEditService.saveHeader(header));

        CodeItemSaveRequest itemSave = new CodeItemSaveRequest();
        itemSave.setMaruCodeId(ID);
        itemSave.setVer("1.000");
        itemSave.setRowVersion(fx.rowVersion(ID, "1.000"));
        tx.executeWithoutResult(st -> codeItemEditService.save(itemSave, List.of(
                row("KS-9", "규격 외 KS", 9, null, "KS"),
                row("KS-3-CGCC", "CGCC", 1, "270", "KS", "KS-3"),
                row("KS-3-CGCD", "CGCD", 2, "270", "KS", "KS-3"),
                row("KS-3-CGCH", "CGCH(기본)", 3, "270", "KS", "KS-3"),
                row("KS-3-CGCH-Z12", "CGCH Z12", 1, "270", "KS", "KS-3", "KS-3-CGCH"),
                row("KS-3-CGCH-Z27", "CGCH Z27", 2, "270", "KS", "KS-3", "KS-3-CGCH"),
                row("JIS-3-CGCC", "CGCC(JIS)", 1, "270", "JIS", "JIS-3"),
                row("JIS-4-SPCC", "SPCC", 1, "270", "JIS", "JIS-4"))));

        Map<String, Object> validate1000 = tx.execute(st -> codeConfirmService.validate(
                validate(ID, "1.000", "2026-01-01 00:00:00")));
        assertEquals(0, ((Number) validate1000.get("rejectedCount")).intValue());
        tx.executeWithoutResult(st -> codeConfirmService.confirm(
                confirm(ID, "1.000", fx.rowVersion(ID, "1.000"), "2026-01-01 00:00:00", false)));

        assertEquals("RELEASED", jdbc.queryForObject(
                "SELECT STATUS FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = ?", String.class, ID));
        // 정렬은 String 자연 순서(코드 뒤 구분자 '-' < '|') 다 — "KS-3-CGCH-Z12" 가 "KS-3-CGCH" 보다 앞선다.
        assertEquals(List.of(
                "JIS-3-CGCC|1.000|9999|CGCC(JIS)|null|1",
                "JIS-4-SPCC|1.000|9999|SPCC|null|1",
                "KS-3-CGCC|1.000|9999|CGCC|null|1",
                "KS-3-CGCD|1.000|9999|CGCD|null|2",
                "KS-3-CGCH-Z12|1.000|9999|CGCH Z12|null|1",
                "KS-3-CGCH-Z27|1.000|9999|CGCH Z27|null|2",
                "KS-3-CGCH|1.000|9999|CGCH(기본)|null|3",
                "KS-9|1.000|9999|규격 외 KS|null|9"), fx.itemRows(ID));
        assertEquals(List.of(
                "JIS-3-CGCC|JIS|JIS-3|null|270",
                "JIS-4-SPCC|JIS|JIS-4|null|270",
                "KS-3-CGCC|KS|KS-3|null|270",
                "KS-3-CGCD|KS|KS-3|null|270",
                "KS-3-CGCH-Z12|KS|KS-3|KS-3-CGCH|270",
                "KS-3-CGCH-Z27|KS|KS-3|KS-3-CGCH|270",
                "KS-3-CGCH|KS|KS-3|null|270",
                "KS-9|KS|null|null|null"), lvlAttrRows());
    }

    private List<String> lvlAttrRows() {
        return jdbc.query("SELECT CODE, LVL1, LVL2, LVL3, ATTR01 FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = ?",
                        (rs, i) -> rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getString(3) + "|"
                                + rs.getString(4) + "|" + rs.getString(5), ID)
                .stream().sorted().toList();
    }

    /** codeItemEdit 그리드 행(ADDED) — lvls 는 lvl1 부터, attr01 은 명시 인자. */
    private static Map<String, Object> row(String code, String name, Integer seq, String attr01, String... lvls) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", "ADDED");
        m.put("code", code);
        m.put("name", name);
        m.put("seq", seq);
        m.put("attr01", attr01);
        for (int i = 0; i < lvls.length; i++) {
            m.put("lvl" + (i + 1), lvls[i]);
        }
        return m;
    }
}
