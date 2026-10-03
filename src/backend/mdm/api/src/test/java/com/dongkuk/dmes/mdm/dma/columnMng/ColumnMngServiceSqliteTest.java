package com.dongkuk.dmes.mdm.dma.columnMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.FakeMaruIdNamespace;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngCompareRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSaveRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSearchRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngViewRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.service.ColumnMngService;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
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
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-04-04 design.md §3.3 C1~C28 — 컬럼 사전 서비스(검색·상세·분해·저장)를 local(SQLite) 실제 컨텍스트로 돌린다.
 *
 * <p>서비스에는 {@code @Transactional} 이 없다(OASIS 가 프로세스 트랜잭션을 건다, F11). 그래서 이 테스트는 운영 경로와
 * 같게 서비스 호출을 {@link TransactionTemplate} 으로 감싼다. 단언은 {@link JdbcTemplate}(새 연결)로 커밋된 행을 읽는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class ColumnMngServiceSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    ColumnMngService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    FakeMaruIdNamespace maruIds;
    @Autowired
    MdmTermRepository terms;
    @Autowired
    MdmDomainRepository domains;
    @Autowired
    MdmColumnRepository columns;
    @Autowired
    MdmColumnSystemRepository mappings;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private MdmTerm rmtl;
    private MdmTerm coil;
    private MdmTerm thk;
    private MdmDomain coilThk;
    private MdmDomain rmtlCoilThk;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        DmaTestSupport.clear(jdbc);
        currentUser.set("admin1", Set.of(MdmRoles.STD_ADMIN));
        maruIds.reset();
        AuditHolder.remove();
        UserContextHolder.clear();
        rmtl = DmaTestSupport.term(terms, "원재료", "RMTL", "Raw Material", "[\"원자재(ERP)\"]");
        coil = DmaTestSupport.term(terms, "코일", "COIL", "Coil", null);
        thk = DmaTestSupport.term(terms, "두께", "THK", "Thickness", null);
        coilThk = DmaTestSupport.domain(domains, "코일 두께", "COIL_THK");
        rmtlCoilThk = DmaTestSupport.domain(domains, "원재료 코일 두께", "RMTL_COIL_THK");
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── search ────────────────────────────────────────────────────────────

    @Test
    void C1_빈_DB_검색은_빈_목록과_자기_행을_뺀_시스템_목록() {
        DmaTestSupport.clear(jdbc);

        Map<String, Object> result = service.search(new ColumnMngSearchRequest());

        assertEquals(List.of(), result.get("list"));
        assertFalse(result.containsKey("domains"), "도메인 전체 목록은 응답에 싣지 않는다");
        assertEquals(List.of("APS", "DKMS", "ERP", "L2", "MES"),
                maps(result.get("systems")).stream().map(m -> m.get("systemCode")).toList());
        assertEquals("레벨2", maps(result.get("systems")).get(3).get("systemName"));
    }

    @Test
    void optionsOnly_는_목록을_비우고_시스템_콤보만_돌려준다() {
        DmaTestSupport.column(columns, "코일 아이디", "COIL_ID", coilThk.getDomainId());
        ColumnMngSearchRequest q = new ColumnMngSearchRequest();
        q.setOptionsOnly(true);

        Map<String, Object> result = service.search(q);

        assertEquals(List.of(), result.get("list"));
        assertFalse(result.containsKey("domains"));
        assertEquals(5, maps(result.get("systems")).size());
    }

    @Test
    void C21_검색어는_시스템별_실제_필드명에도_대소문자_무시로_걸린다() {
        MdmColumn a = DmaTestSupport.column(columns, "코일 아이디", "COIL_ID", coilThk.getDomainId());
        DmaTestSupport.column(columns, "원재료 코일 두께", "RMTL_COIL_THK", coilThk.getDomainId());
        DmaTestSupport.mapping(mappings, a.getColumnId(), "ERP", "MATNR", null);

        List<Map<String, Object>> list = maps(service.search(search("matnr", null)).get("list"));

        assertEquals(List.of("코일 아이디"), list.stream().map(m -> m.get("columnName")).toList());
        assertEquals("ERP:MATNR", list.get(0).get("systemFields"));
        assertEquals(1, maps(service.search(search("coil_i", null)).get("list")).size(), "표준 물리명 부분 일치");
    }

    @Test
    void C22_논리명_부분_일치와_도메인_필터() {
        MdmColumn a = DmaTestSupport.column(columns, "원재료 코일 두께", "RMTL_COIL_THK", rmtlCoilThk.getDomainId());
        a.setTermIds("[" + rmtl.getTermId() + "," + coil.getTermId() + "," + thk.getTermId() + ",99999]");
        a.setLabelMid("원재료코일두께");
        columns.save(a);
        DmaTestSupport.column(columns, "코일 두께", "COIL_THK", coilThk.getDomainId());
        DmaTestSupport.column(columns, "코일 아이디", "COIL_ID", coilThk.getDomainId());

        List<Map<String, Object>> all = maps(service.search(search(" 두께 ", null)).get("list"));
        List<Map<String, Object>> filtered = maps(service.search(search("두께", "rmtl_coil")).get("list"));

        assertEquals(List.of("원재료 코일 두께", "코일 두께"), all.stream().map(m -> m.get("columnName")).toList());
        assertEquals(1, filtered.size());
        Map<String, Object> row = filtered.get(0);
        assertEquals("원재료 + 코일 + 두께 + ?", row.get("termNames"));
        assertEquals("원재료 코일 두께", row.get("domainName"));
        assertEquals("RMTL_COIL_THK", row.get("domainStdName"));
        assertEquals("N", row.get("required"));
        assertEquals("원재료코일두께", row.get("labelMid"));
        assertEquals(3, maps(service.search(new ColumnMngSearchRequest()).get("list")).size());
        assertEquals(3, maps(service.search(null).get("list")).size());
    }

    @Test
    void 도메인_키워드는_ID_도메인명_표준명_부분_일치를_대소문자_무시로_건다() {
        DmaTestSupport.column(columns, "코일 두께", "COIL_THK", coilThk.getDomainId());
        DmaTestSupport.column(columns, "원재료 코일 두께", "RMTL_COIL_THK", rmtlCoilThk.getDomainId());
        DmaTestSupport.column(columns, "도메인 없음", "NO_DOM", null);

        assertEquals(List.of("원재료 코일 두께"), names(service.search(search("", "rmtl_coil_thk"))), "표준명, 대소문자 무시");
        assertEquals(List.of("원재료 코일 두께"), names(service.search(search("", " 원재료 "))), "도메인명 부분 일치, 앞뒤 공백 무시");
        assertEquals(List.of("원재료 코일 두께", "코일 두께"), names(service.search(search("", "COIL_THK"))), "표준명 부분 일치는 둘 다");
        assertEquals(List.of("코일 두께"), names(service.search(search("", String.valueOf(coilThk.getDomainId())))).stream()
                .filter("코일 두께"::equals).toList(), "도메인 ID 문자열 일치");
        assertEquals(List.of(), names(service.search(search("", "없는도메인"))));
        assertEquals(3, names(service.search(search("", "  "))).size(), "빈 키워드는 전체(도메인 없는 컬럼 포함)");
        assertEquals(List.of("원재료 코일 두께"), names(service.search(search("RMTL", "코일"))), "검색어와 도메인 키워드는 AND");
    }

    private static List<String> names(Map<String, Object> result) {
        return maps(result.get("list")).stream().map(m -> (String) m.get("columnName")).toList();
    }

    // ── view ──────────────────────────────────────────────────────────────

    @Test
    void view_없는_컬럼은_MDM021() {
        assertCode(MdmErrorCode.INVALID_INPUT, () -> service.view(view(123456L)));
    }

    // ── save ──────────────────────────────────────────────────────────────

    @Test
    void C2_정상_저장과_상세_왕복() {
        ColumnMngSaveRequest req = valid();
        req.setLabelLong("원재료 코일 두께");
        req.setLabelMid(" ");
        req.setDescription("설명");
        req.setRequired(true);
        req.setDefaultValue("0");
        req.setRefKind("MASTER");
        req.setRefTarget("COIL_MASTER");
        req.setRefCateId("CATE1");
        req.setUsageNote("메모");

        Long columnId = save(req, List.of(sys("ERP", "ZZ_RMTL_COIL_THK", "X", "n1"), sys("MES", "RMTL_COIL_THK", null, null)),
                termRows(rmtl.getTermId(), coil.getTermId(), thk.getTermId()));

        assertEquals("[" + rmtl.getTermId() + "," + coil.getTermId() + "," + thk.getTermId() + "]",
                jdbc.queryForObject("SELECT TERM_IDS FROM TB_MDM_COLUMN", String.class));
        assertNull(jdbc.queryForObject("SELECT LABEL_MID FROM TB_MDM_COLUMN", String.class), "빈 표시명은 NULL(폴백이 동작하게)");
        Map<String, Object> result = service.view(view(columnId));
        Map<String, Object> column = map(result.get("column"));
        assertEquals(columnId, ((Number) column.get("columnId")).longValue());
        assertEquals("원재료 코일 두께", column.get("columnName"));
        assertEquals("RMTL_COIL_THK", column.get("physName"));
        assertEquals("원재료 코일 두께", column.get("labelLong"));
        assertNull(column.get("labelMid"));
        assertEquals(rmtlCoilThk.getDomainId(), ((Number) column.get("domainId")).longValue());
        assertEquals(Boolean.TRUE, column.get("required"));
        assertEquals("0", column.get("defaultValue"));
        assertEquals("MASTER", column.get("refKind"));
        assertEquals("COIL_MASTER", column.get("refTarget"));
        assertEquals("CATE1", column.get("refCateId"));
        assertEquals("설명", column.get("description"));
        assertEquals("메모", column.get("usageNote"));
        List<Map<String, Object>> systems = maps(result.get("systems"));
        assertEquals(List.of("ERP", "MES"), systems.stream().map(m -> m.get("systemCode")).toList());
        assertEquals("X", systems.get(0).get("transform"));
        assertEquals("n1", systems.get(0).get("note"));
        List<Map<String, Object>> termList = maps(result.get("terms"));
        assertEquals(List.of("원재료", "코일", "두께"), termList.stream().map(m -> m.get("termName")).toList());
        assertEquals("RMTL", termList.get(0).get("engAbbr"));
        assertEquals(Boolean.FALSE, termList.get(0).get("missing"));
    }

    @Test
    void C2b_TERM_IDS_는_토큰_순서를_지키고_정렬하지_않는다() {
        // 변이 검증(I22) 보강 — ID 오름차순과 다른 순서로 보내도 그대로 저장한다.
        save(valid(), List.of(), termRows(thk.getTermId(), rmtl.getTermId(), coil.getTermId()));

        assertEquals("[" + thk.getTermId() + "," + rmtl.getTermId() + "," + coil.getTermId() + "]",
                jdbc.queryForObject("SELECT TERM_IDS FROM TB_MDM_COLUMN", String.class));
    }

    @Test
    void C3_담당자만이면_입력을_보기_전에_MDM016() {
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        ColumnMngSaveRequest invalid = new ColumnMngSaveRequest();

        assertCode(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED, () -> save(invalid, List.of(), List.of()));
        assertCode(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED, () -> save(valid(), List.of(), List.of()));
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void C4_SYSADMIN_만이면_MDM016() {
        currentUser.set("admin", Set.of("SYSADMIN"));

        assertCode(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED, () -> save(valid(), List.of(), List.of()));
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void C5_물리명에_자리_표시자가_있으면_MDM017() {
        ColumnMngSaveRequest req = valid();
        req.setPhysName("RMTL_COIL_THK_***");

        assertCode(MdmErrorCode.NAME_PLACEHOLDER_REMAINS, () -> save(req, List.of(), List.of()));
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void C6_논리명을_서버가_다시_분해해_미등록이_있으면_MDM017() {
        ColumnMngSaveRequest req = valid();
        req.setColumnName("원재료 코일 두께 편차");
        req.setPhysName("RMTL_COIL_THK_DEV");

        BusinessException e = assertCode(MdmErrorCode.NAME_PLACEHOLDER_REMAINS, () -> save(req, List.of(), List.of()));
        assertTrue(e.getMessage().endsWith(": 편차"), e.getMessage());
    }

    @Test
    void C7_없는_termId_는_MDM017() {
        assertCode(MdmErrorCode.NAME_PLACEHOLDER_REMAINS,
                () -> save(valid(), List.of(), termRows(rmtl.getTermId(), 987654L, thk.getTermId())));
        List<Map<String, Object>> withNull = new ArrayList<>(termRows(rmtl.getTermId(), coil.getTermId()));
        Map<String, Object> nullRow = new LinkedHashMap<>();
        nullRow.put("termId", null);
        withNull.add(nullRow);
        assertCode(MdmErrorCode.NAME_PLACEHOLDER_REMAINS, () -> save(valid(), List.of(), withNull));
    }

    @Test
    void C7b_논리명에_자리_표시자가_있으면_MDM017() {
        ColumnMngSaveRequest req = valid();
        req.setColumnName("원재료 코일 두께 ***");
        req.setPhysName("RMTL_COIL_THK_DEV");

        assertCode(MdmErrorCode.NAME_PLACEHOLDER_REMAINS, () -> save(req, List.of(), List.of()));
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void 약어_없는_용어가_있으면_MDM017() {
        DmaTestSupport.term(terms, "편성", null, null, null);
        ColumnMngSaveRequest req = valid();
        req.setColumnName("편성 두께");
        req.setPhysName("FORM_THK");

        assertCode(MdmErrorCode.NAME_PLACEHOLDER_REMAINS, () -> save(req, List.of(), List.of()));
    }

    @Test
    void C8_terms_그리드가_비면_재분해_기본_선택으로_채운다() {
        save(valid(), List.of(), List.of());
        save(other("원자재 두께", "RMTL_THK"), List.of(), null);

        assertEquals("[" + rmtl.getTermId() + "," + coil.getTermId() + "," + thk.getTermId() + "]",
                jdbc.queryForObject("SELECT TERM_IDS FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'RMTL_COIL_THK'", String.class));
        assertEquals("[" + rmtl.getTermId() + "," + thk.getTermId() + "]",
                jdbc.queryForObject("SELECT TERM_IDS FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'RMTL_THK'", String.class));
    }

    @Test
    void C9_다른_컬럼이_이미_가진_시스템_필드명이면_MDM018_이고_아무것도_저장하지_않는다() {
        Long first = save(other("코일 두께", "COIL_THK"), List.of(sys("ERP", "MATNR", null, null)), List.of());

        BusinessException e = assertCode(MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED,
                () -> save(valid(), List.of(sys("MES", "RMTL_COIL_THK", null, null), sys("ERP", "MATNR", null, null)),
                        List.of()));

        assertTrue(e.getMessage().contains("ERP·MATNR → 컬럼 '코일 두께'"), e.getMessage());
        assertEquals(1, count("TB_MDM_COLUMN"));
        assertEquals(1, count("TB_MDM_COLUMN_SYSTEM"));
        assertEquals(first, jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN", Long.class));
    }

    @Test
    void C10_한_요청_안에_같은_시스템_필드명이_두_번이면_MDM018() {
        assertCode(MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED,
                () -> save(valid(), List.of(sys("ERP", "MATNR", null, null), sys(" ERP ", "MATNR ", null, null)), List.of()));
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void C11_한_컬럼은_한_시스템에_여러_이름을_가질_수_있다() {
        save(valid(), List.of(sys("ERP", "MATNR", null, null), sys("ERP", "CHARG", null, null)), List.of());

        assertEquals(2, count("TB_MDM_COLUMN_SYSTEM"));
    }

    /**
     * spec 2026-10-03-mdm-column-system-alias-design L3 — 별칭 매칭이 대소문자를 무시하므로, 다른 컬럼에 대소문자만 다른 별칭을 두면 기존 별칭이
     * 모호해져 '없음'이 된다. 저장 검사도 대소문자를 무시해 막는다(TSK-04-04 I13 의 정확 일치를 대체).
     */
    @Test
    void C12_다른_컬럼에_대소문자만_다른_필드명이면_MDM018_이고_아무것도_저장하지_않는다() {
        Long first = save(other("코일 두께", "COIL_THK"), List.of(sys("MES", "AMB", null, null)), List.of());

        BusinessException e = assertCode(MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED,
                () -> save(valid(), List.of(sys("MES", "amb", null, null)), List.of()));

        assertTrue(e.getMessage().contains("MES·amb → 컬럼 '코일 두께'"), e.getMessage());
        assertEquals(1, count("TB_MDM_COLUMN"));
        assertEquals(1, count("TB_MDM_COLUMN_SYSTEM"));
        assertEquals("AMB", jdbc.queryForObject("SELECT PHYS_NAME FROM TB_MDM_COLUMN_SYSTEM WHERE COLUMN_ID = ?",
                String.class, first));
    }

    @Test
    void C12b_대소문자만_다른_필드명이라도_시스템이_다르면_충돌하지_않는다() {
        save(other("코일 두께", "COIL_THK"), List.of(sys("MES", "AMB", null, null)), List.of());

        save(valid(), List.of(sys("ERP", "amb", null, null)), List.of());

        assertEquals(2, count("TB_MDM_COLUMN_SYSTEM"));
    }

    @Test
    void C12c_한_컬럼은_대소문자만_다른_별칭을_함께_가질_수_있고_다시_저장해도_자기와_충돌하지_않는다() {
        Long id = save(valid(), List.of(sys("MES", "SPARE1", null, null), sys("MES", "Spare1", null, null)), List.of());
        ColumnMngSaveRequest again = valid();
        again.setColumnId(id);

        assertEquals(id, save(again, List.of(sys("MES", "SPARE1", null, null), sys("MES", "Spare1", null, null),
                sys("MES", "spare1", null, null)), List.of()));
        assertEquals(3, count("TB_MDM_COLUMN_SYSTEM"));
    }

    @Test
    void C13_자기_컬럼을_다시_저장해도_자기와는_충돌하지_않는다() {
        Long id = save(valid(), List.of(sys("ERP", "MATNR", null, null)), List.of());
        ColumnMngSaveRequest again = valid();
        again.setColumnId(id);
        again.setUsageNote("수정");

        assertEquals(id, save(again, List.of(sys("ERP", "MATNR", null, null)), List.of()));
        assertEquals("수정", jdbc.queryForObject("SELECT USAGE_NOTE FROM TB_MDM_COLUMN", String.class));
        assertEquals(1, count("TB_MDM_COLUMN"));
        assertEquals(1, count("TB_MDM_COLUMN_SYSTEM"));
    }

    @Test
    void C14_매핑은_차분으로_저장한다() {
        Long id = save(valid(), List.of(sys("ERP", "A", "X", null), sys("MES", "B", null, null)), List.of());
        ColumnMngSaveRequest again = valid();
        again.setColumnId(id);

        save(again, List.of(sys("ERP", "A", "Y", null), sys("APS", "C", null, null)), List.of());

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT SYSTEM_CODE, PHYS_NAME, TRANSFORM, VER FROM TB_MDM_COLUMN_SYSTEM ORDER BY SYSTEM_CODE");
        assertEquals(2, rows.size());
        assertEquals("APS", rows.get(0).get("SYSTEM_CODE"));
        assertEquals(0L, ((Number) rows.get(0).get("VER")).longValue());
        assertEquals("ERP", rows.get(1).get("SYSTEM_CODE"));
        assertEquals("Y", rows.get(1).get("TRANSFORM"));
        assertEquals(1L, ((Number) rows.get(1).get("VER")).longValue(), "같은 키는 UPDATE(VER+1) — 지웠다 다시 넣지 않는다");
    }

    @Test
    void C15_같은_논리명_또는_물리명의_다른_컬럼이_있으면_MDM019() {
        save(valid(), List.of(), List.of());

        ColumnMngSaveRequest sameName = valid();
        sameName.setPhysName("RMTL_COIL_THK2");
        assertCode(MdmErrorCode.COLUMN_DUPLICATED, () -> save(sameName, List.of(), List.of()));
        assertCode(MdmErrorCode.COLUMN_DUPLICATED, () -> save(other("원자재 코일 두께", "RMTL_COIL_THK"), List.of(), List.of()));
        assertEquals(1, count("TB_MDM_COLUMN"));
    }

    @Test
    void C16_표시명_길이_초과는_칸_이름과_함께_MDM021() {
        assertInvalid(r -> r.setLabelLong("가".repeat(25)), "표시명(긴)");
        assertInvalid(r -> r.setLabelMid("가".repeat(13)), "표시명(중간)");
        assertInvalid(r -> r.setLabelShort("가".repeat(7)), "표시명(짧은)");
        ColumnMngSaveRequest ok = valid();
        ok.setLabelLong("가".repeat(24));
        ok.setLabelMid("가".repeat(12));
        ok.setLabelShort("가".repeat(6));
        save(ok, List.of(), List.of());
    }

    @Test
    void 코드_칸_길이는_50자까지() {
        assertInvalid(r -> r.setDefaultValue("x".repeat(51)), "기본값");
        assertInvalid(r -> {
            r.setRefKind("MASTER");
            r.setRefTarget("X".repeat(51));
        }, "참조 대상");
        assertInvalid(r -> r.setRefCateId("X".repeat(51)), "참조 카테고리");
        ColumnMngSaveRequest longPhys = valid();
        longPhys.setPhysName("RMTL_COIL_THK_" + "X".repeat(37));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> save(longPhys, List.of(), List.of()));
        assertCode(MdmErrorCode.INVALID_INPUT,
                () -> save(valid(), List.of(sys("ERP", "X".repeat(51), null, null)), List.of()));
        assertCode(MdmErrorCode.INVALID_INPUT,
                () -> save(valid(), List.of(sys("ERP", "X", "T".repeat(51), null)), List.of()));
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void C17_존재하지_않는_도메인은_MDM021() {
        // D-141 — 도메인은 필수가 아니다. 비우면 저장되고(아래 시험), 값을 주면 있는 도메인이어야 한다.
        assertInvalid(r -> r.setDomainId(987654L), "도메인");
    }

    @Test
    void D141_도메인_없이_저장하면_검색_상세_중복_목록이_도메인_없이_동작한다() {
        ColumnMngSaveRequest req = valid();
        req.setDomainId(null);

        Long columnId = save(req, List.of(sys("ERP", "ZZ_RMTL_COIL_THK", null, null)), List.of());

        assertNull(jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", Long.class, columnId));
        Map<String, Object> detail = map(service.view(view(columnId)).get("column"));
        assertNull(detail.get("domainId"));
        assertEquals("원재료 코일 두께", detail.get("columnName"));

        DmaTestSupport.column(columns, "코일 두께", "COIL_THK", coilThk.getDomainId());
        List<Map<String, Object>> all = maps(service.search(search("두께", null)).get("list"));
        assertEquals(List.of("원재료 코일 두께", "코일 두께"), all.stream().map(m -> m.get("columnName")).toList());
        assertNull(all.get(0).get("domainId"));
        assertNull(all.get(0).get("domainName"));
        assertNull(all.get(0).get("domainStdName"));
        List<Map<String, Object>> filtered = maps(service.search(search("", "coil_thk")).get("list"));
        assertEquals(List.of("코일 두께"), filtered.stream().map(m -> m.get("columnName")).toList(), "도메인 필터는 도메인 없는 컬럼을 뺀다");

        List<Map<String, Object>> dups = maps(service.compare(compare("FORWARD", "원재료 코일두께")).get("duplicates"));
        assertEquals(List.of("COLUMN_NAME", "PHYS_NAME"), dups.stream().map(m -> m.get("matchedBy")).toList());
        assertNull(dups.get(0).get("domainId"));
        assertNull(dups.get(0).get("domainName"));
        List<Map<String, Object>> reverse = maps(service.compare(compare("REVERSE", "ZZ_RMTL_COIL_THK")).get("duplicates"));
        assertEquals(List.of("SYSTEM_FIELD"), reverse.stream().map(m -> m.get("matchedBy")).toList());

        // 도메인을 붙였다가 다시 비우는 수정도 된다.
        ColumnMngSaveRequest withDomain = valid();
        withDomain.setColumnId(columnId);
        save(withDomain, List.of(), List.of());
        assertEquals(rmtlCoilThk.getDomainId(),
                jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", Long.class, columnId));
        ColumnMngSaveRequest cleared = valid();
        cleared.setColumnId(columnId);
        cleared.setDomainId(null);
        save(cleared, List.of(), List.of());
        assertNull(jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", Long.class, columnId));
    }

    @Test
    void 필수값이_비면_MDM021() {
        assertInvalid(r -> r.setColumnName("  "), null);
        assertInvalid(r -> r.setPhysName(" "), null);
    }

    @Test
    void C18_물리명_형식이_틀리면_MDM021() {
        ColumnMngSaveRequest req = other("원재료 두께", "rmtl_thk");

        assertCode(MdmErrorCode.INVALID_INPUT, () -> save(req, List.of(), List.of()));
    }

    @Test
    void C19_자기_행_MDM_이나_없는_시스템_코드는_MDM021() {
        assertCode(MdmErrorCode.INVALID_INPUT, () -> save(valid(), List.of(sys("MDM", "X", null, null)), List.of()));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> save(valid(), List.of(sys("XXX", "X", null, null)), List.of()));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> save(valid(), List.of(sys("ERP", " ", null, null)), List.of()));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> save(valid(), List.of(sys("", "X", null, null)), List.of()));
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void C20_완전히_빈_매핑_행은_무시한다() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(sys(" ", "", null, null));
        rows.add(sys(null, null, null, null));
        rows.add(sys("ERP", "MATNR", null, null));

        save(valid(), rows, List.of());

        assertEquals(1, count("TB_MDM_COLUMN_SYSTEM"));
    }

    @Test
    void C27_참조_종류와_대상의_조합이_틀리면_MDM021() {
        assertInvalid(r -> r.setRefKind("MASTER"), "참조 대상");
        assertInvalid(r -> r.setRefTarget("COIL_MASTER"), "참조 종류");
        assertInvalid(r -> r.setRefCateId("CATE1"), "참조 종류");
        assertInvalid(r -> {
            r.setRefKind("OTHER");
            r.setRefTarget("X");
        }, "참조 종류");
    }

    @Test
    void C28_마루_데이터_이름_공간이_있으면_참조_대상_존재를_본다() {
        ColumnMngSaveRequest req = valid();
        req.setRefKind("MASTER");
        req.setRefTarget("COIL_MASTER");

        maruIds.set(MaruIdKind.MASTER_DATA, Set.of("OTHER"));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> save(req, List.of(), List.of()));

        maruIds.set(MaruIdKind.MASTER_DATA, Set.of("COIL_MASTER"));
        save(req, List.of(), List.of());
        assertEquals(1, count("TB_MDM_COLUMN"));
    }

    @Test
    void C28b_마루_데이터_구현체가_없으면_존재_확인을_생략한다() {
        maruIds.set(MaruIdKind.MASTER_CODE, Set.of());
        ColumnMngSaveRequest req = valid();
        req.setRefKind("MASTER");
        req.setRefTarget("ANY_TARGET");

        save(req, List.of(), List.of());

        assertEquals(1, count("TB_MDM_COLUMN"));
    }

    // ── 메타 변경 기록(spec 2026-10-02-mdm-meta-cache-design §3.3) ──────────

    @Test
    void META_신규_저장은_새_물리명을_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        save(valid(), List.of(), List.of());
        assertEquals(List.of("COLUMN:RMTL_COIL_THK:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void META_물리명을_바꾸면_옛_이름과_새_이름을_모두_기록한다() {
        Long id = save(other("코일 두께", "COIL_THK"), List.of(), List.of());
        MetaRevTestSupport.clear(jdbc);
        ColumnMngSaveRequest renamed = other("원재료 코일 두께", "RMTL_COIL_THK");
        renamed.setColumnId(id);

        save(renamed, List.of(), List.of());

        assertEquals(List.of("COLUMN:COIL_THK:SAVE", "COLUMN:RMTL_COIL_THK:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    /** spec 2026-10-03-mdm-column-system-alias-design L6 — 별칭 행의 전·후를 모두 COLUMN 키(대문자)로 남긴다. */
    @Test
    void META_신규_저장은_새_시스템_별칭도_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        save(valid(), List.of(sys("MES", "Rmtl_T", null, null), sys("APS", "aps_t", null, null)), List.of());
        assertEquals(Set.of("RMTL_COIL_THK", "RMTL_T", "APS_T"), MetaRevTestSupport.keys(jdbc, "COLUMN"));
    }

    @Test
    void META_별칭_행을_바꾸면_바뀌기_전과_뒤_별칭을_모두_기록한다() {
        Long id = save(valid(), List.of(sys("MES", "OLD_T", null, null), sys("MES", "KEEP_T", null, null)), List.of());
        MetaRevTestSupport.clear(jdbc);
        ColumnMngSaveRequest again = valid();
        again.setColumnId(id);

        save(again, List.of(sys("MES", "KEEP_T", null, null), sys("APS", "new_t", null, null)), List.of());

        assertEquals(Set.of("RMTL_COIL_THK", "OLD_T", "KEEP_T", "NEW_T"), MetaRevTestSupport.keys(jdbc, "COLUMN"));
        assertEquals(List.of("APS·new_t", "MES·KEEP_T"), mappings.findByColumnId(id).stream()
                .map(m -> m.getSystemCode() + "·" + m.getPhysName()).sorted().toList());
    }

    @Test
    void META_별칭이_그대로여도_컬럼_저장은_그_별칭을_기록한다() {
        Long id = save(valid(), List.of(sys("MES", "Rmtl_T", null, null)), List.of());
        MetaRevTestSupport.clear(jdbc);
        ColumnMngSaveRequest described = valid();
        described.setColumnId(id);
        described.setDescription("설명만 바꾼다");

        save(described, List.of(sys("MES", "Rmtl_T", null, null)), List.of());

        assertEquals(Set.of("RMTL_COIL_THK", "RMTL_T"), MetaRevTestSupport.keys(jdbc, "COLUMN"));
    }

    @Test
    void META_별칭을_모두_지우면_지운_별칭을_기록한다() {
        Long id = save(valid(), List.of(sys("MES", "GONE_T", null, null)), List.of());
        MetaRevTestSupport.clear(jdbc);
        ColumnMngSaveRequest again = valid();
        again.setColumnId(id);

        save(again, List.of(), List.of());

        assertEquals(Set.of("RMTL_COIL_THK", "GONE_T"), MetaRevTestSupport.keys(jdbc, "COLUMN"));
        assertEquals(List.of(), mappings.findByColumnId(id));
    }

    @Test
    void META_원장이_롤백되면_기록도_남지_않는다() {
        MetaRevTestSupport.clear(jdbc);
        tx.executeWithoutResult(s -> {
            service.save(valid(), List.of(), List.of());
            s.setRollbackOnly();
        });
        assertEquals(0, count("TB_MDM_COLUMN"));
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }

    // ── compare ───────────────────────────────────────────────────────────

    @Test
    void C23_정방향_분해는_토큰_물리명_표시명_추천_도메인을_준다() {
        Map<String, Object> result = service.compare(compare("FORWARD", "원재료 코일두께"));

        assertEquals("RMTL_COIL_THK", result.get("physName"));
        assertEquals("원재료 코일 두께", result.get("logicalName"));
        assertEquals(Boolean.FALSE, result.get("placeholder"));
        List<Map<String, Object>> tokens = maps(result.get("tokens"));
        assertEquals(3, tokens.size());
        assertEquals("MATCHED", tokens.get(0).get("status"));
        assertEquals(rmtl.getTermId(), ((Number) tokens.get(0).get("termId")).longValue());
        assertEquals("RMTL", tokens.get(0).get("abbr"));
        assertEquals(1, maps(tokens.get(0).get("candidates")).size());
        assertEquals("NAME", maps(tokens.get(0).get("candidates")).get(0).get("via"));
        Map<String, Object> labels = map(result.get("labels"));
        assertEquals("코일두께", labels.get("labelShort"));
        assertEquals(List.of(rmtlCoilThk.getDomainId(), coilThk.getDomainId()),
                maps(result.get("domains")).stream().map(m -> ((Number) m.get("domainId")).longValue()).toList());
        assertEquals(3, maps(result.get("domains")).get(0).get("matchLength"));
        assertEquals(rmtlCoilThk.getDomainId(), ((Number) result.get("recommendedDomainId")).longValue());
        assertEquals(List.of(), result.get("duplicates"));
    }

    @Test
    void 정방향_미등록_꼬리는_추천_도메인이_없다() {
        Map<String, Object> result = service.compare(compare("FORWARD", "원재료 코일두께 편차"));

        assertEquals("RMTL_COIL_THK_***", result.get("physName"));
        assertEquals(Boolean.TRUE, result.get("placeholder"));
        assertNull(result.get("recommendedDomainId"));
        assertEquals("UNKNOWN", maps(result.get("tokens")).get(3).get("status"));
        assertNull(maps(result.get("tokens")).get(3).get("termId"));
    }

    @Test
    void C24_빈_사전에서도_분해가_된다() {
        DmaTestSupport.clear(jdbc);

        Map<String, Object> result = service.compare(compare("FORWARD", "원재료 코일두께"));

        assertEquals("***_***", result.get("physName"));
        assertTrue(maps(result.get("tokens")).stream().allMatch(t -> "UNKNOWN".equals(t.get("status"))));
        assertEquals(List.of(), result.get("domains"));
        assertNull(result.get("recommendedDomainId"));
    }

    @Test
    void C25_역분해가_안_되면_시스템별_실제_필드명에서_찾는다() {
        Long id = save(other("코일 두께", "COIL_THK"), List.of(sys("ERP", "CHARG", null, null)), List.of());

        Map<String, Object> result = service.compare(compare("REVERSE", "charg"));

        assertEquals("***", result.get("logicalName"));
        assertEquals(Boolean.TRUE, result.get("placeholder"));
        assertTrue(!result.containsKey("labels") || result.get("labels") == null, "REVERSE 는 표시명 제안이 없다");
        List<Map<String, Object>> dups = maps(result.get("duplicates"));
        assertEquals(1, dups.size());
        assertEquals("SYSTEM_FIELD", dups.get(0).get("matchedBy"));
        assertEquals("ERP", dups.get(0).get("systemCode"));
        assertEquals(id, ((Number) dups.get(0).get("columnId")).longValue());
        assertEquals(coilThk.getDomainId(), ((Number) dups.get(0).get("domainId")).longValue());
        assertEquals("코일 두께", dups.get(0).get("domainName"));
    }

    @Test
    void 역분해는_표준_물리명이_같은_컬럼도_찾는다() {
        save(valid(), List.of(), List.of());

        Map<String, Object> result = service.compare(compare("REVERSE", " rmtl_coil_thk "));

        assertEquals("원재료 코일 두께", result.get("logicalName"));
        assertEquals("RMTL_COIL_THK", result.get("physName"));
        List<Map<String, Object>> dups = maps(result.get("duplicates"));
        assertEquals(List.of("PHYS_NAME"), dups.stream().map(m -> m.get("matchedBy")).toList());
        assertEquals(rmtlCoilThk.getDomainId(), ((Number) result.get("recommendedDomainId")).longValue());
    }

    @Test
    void C26_정방향_결과와_같은_컬럼이_있으면_중복_목록에_나온다() {
        save(valid(), List.of(), List.of());

        Map<String, Object> result = service.compare(compare("FORWARD", "원재료 코일두께"));

        List<Map<String, Object>> dups = maps(result.get("duplicates"));
        assertEquals(List.of("COLUMN_NAME", "PHYS_NAME"), dups.stream().map(m -> m.get("matchedBy")).toList());
        assertEquals("원재료 코일 두께", dups.get(1).get("columnName"));
    }

    @Test
    void compare_빈_입력은_MDM021() {
        assertCode(MdmErrorCode.INVALID_INPUT, () -> service.compare(compare("FORWARD", "  ")));
        assertCode(MdmErrorCode.INVALID_INPUT, () -> service.compare(compare("SIDEWAYS", "코일")));
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private ColumnMngSaveRequest valid() {
        return other("원재료 코일 두께", "RMTL_COIL_THK");
    }

    private ColumnMngSaveRequest other(String name, String physName) {
        ColumnMngSaveRequest req = new ColumnMngSaveRequest();
        req.setColumnName(name);
        req.setPhysName(physName);
        req.setDomainId(physName.startsWith("RMTL_COIL") ? rmtlCoilThk.getDomainId() : coilThk.getDomainId());
        return req;
    }

    private void assertInvalid(Consumer<ColumnMngSaveRequest> mutate, String fieldLabel) {
        ColumnMngSaveRequest req = valid();
        mutate.accept(req);
        BusinessException e = assertCode(MdmErrorCode.INVALID_INPUT, () -> save(req, List.of(), List.of()));
        if (fieldLabel != null) {
            assertTrue(e.getMessage().contains(fieldLabel), e.getMessage());
        }
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    private Long save(ColumnMngSaveRequest req, List<Map<String, Object>> systems, List<Map<String, Object>> termIds) {
        Map<String, Object> result = tx.execute(s -> service.save(req, systems, termIds));
        return ((Number) result.get("columnId")).longValue();
    }

    private static BusinessException assertCode(MdmErrorCode code, org.junit.jupiter.api.function.Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertTrue(e.getMessage().startsWith(code.defaultMessage()), code + " 기대, 실제: " + e.getMessage());
        return e;
    }

    private static Map<String, Object> sys(String system, String phys, String transform, String note) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("systemCode", system);
        row.put("physName", phys);
        row.put("transform", transform);
        row.put("note", note);
        return row;
    }

    private static List<Map<String, Object>> termRows(Long... ids) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Long id : ids) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("termId", id);
            rows.add(row);
        }
        return rows;
    }

    private static ColumnMngSearchRequest search(String keyword, String domainKeyword) {
        ColumnMngSearchRequest req = new ColumnMngSearchRequest();
        req.setKeyword(keyword);
        req.setDomainKeyword(domainKeyword);
        return req;
    }

    private static ColumnMngViewRequest view(Long id) {
        ColumnMngViewRequest req = new ColumnMngViewRequest();
        req.setColumnId(id);
        return req;
    }

    private static ColumnMngCompareRequest compare(String direction, String input) {
        ColumnMngCompareRequest req = new ColumnMngCompareRequest();
        req.setDirection(direction);
        req.setInput(input);
        return req;
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object value) {
        return (List<Map<String, Object>>) value;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return (Map<String, Object>) value;
    }
}
