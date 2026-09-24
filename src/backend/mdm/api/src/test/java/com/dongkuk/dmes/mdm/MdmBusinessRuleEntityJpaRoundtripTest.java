package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.support.MdmSqliteLocalDateTimeConverter;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleRowId;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleTestCase;
import com.dongkuk.dmes.mdm.entity.MdmRuleTestCaseId;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVarId;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleVerId;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleRowRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleTestCaseRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVarRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVerRepository;
import jakarta.persistence.Converter;
import jakarta.persistence.EntityManager;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-08-01 design.md §3.4 — {@code ddl-auto: none} 이라 부팅이 매핑 오류를 다 잡지 못하므로 06 활성 6엔티티를 저장→flush→
 * clear→findById 로 왕복한다({@code MdmLayoutEntityJpaRoundtripTest} 패턴). 복합 PK 4종을 포함한다.
 *
 * <p>클래스 단위 {@code @Transactional}(메서드마다 rollback)이라 DB 값은 모두 {@code entityManager.createNativeQuery} 로
 * 같은 연결에서 읽고 쓴다 — 별도 연결은 커밋 전 행을 보지 못한다({@code MdmEntityJpaRoundtripTest} 실측).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class MdmBusinessRuleEntityJpaRoundtripTest {

    @TempDir
    static Path tempDir;

    @Autowired
    MdmRuleRepository ruleRepository;
    @Autowired
    MdmRuleVerRepository verRepository;
    @Autowired
    MdmRuleVarRepository varRepository;
    @Autowired
    MdmRuleRowRepository rowRepository;
    @Autowired
    MdmRuleTestCaseRepository testCaseRepository;
    @Autowired
    MdmRuleSetRepository setRepository;
    @Autowired
    EntityManager entityManager;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-business-rule-entity-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    // ── 6엔티티 왕복 ──

    @Test
    void MdmRule_은_지정_PK_로_저장_조회_왕복한다() {
        MdmRule rule = new MdmRule("RT_RULE", "왕복 룰", "DECISION", "EXTERNAL");
        rule.setSourceSystem("MES");
        rule.setDescription("설명");
        rule.setUsageNote("쓰임");
        ruleRepository.save(rule);
        entityManager.flush();
        entityManager.clear();

        MdmRule reloaded = ruleRepository.findById("RT_RULE").orElseThrow();
        assertEquals("왕복 룰", reloaded.getMaruRuleName());
        assertEquals("DECISION", reloaded.getRuleKind());
        assertEquals("CREATED", reloaded.getStatus(), "생성자 기본 상태");
        assertEquals("EXTERNAL", reloaded.getSourceKind());
        assertEquals("MES", reloaded.getSourceSystem());
        assertEquals("설명", reloaded.getDescription());
        assertEquals("쓰임", reloaded.getUsageNote());
        assertEquals(0, reloaded.getLastVarId());
        assertEquals(0, reloaded.getLastRowId());
        assertEquals(0, reloaded.getLastCaseId());
        assertEquals(0L, reloaded.getVersion(), "부모 테이블 감사 카운터는 VER");
    }

    @Test
    void MdmRuleVer_는_IdClass_복합_PK_로_저장_조회_왕복한다() {
        saveRule("RT_VER");
        MdmRuleVer ver = new MdmRuleVer("RT_VER", 2, "kim");
        ver.setBaseVer(1);
        ver.setHitPolicy("FIRST");
        ver.setDescription("두 번째");
        ver.setEmergencyReason("긴급");
        ver.setApprovedBy("lee");
        ver.setApprovedAt(LocalDateTime.of(2026, 9, 1, 8, 0, 0));
        ver.setRejectReason("반려");
        ver.setCancelledAt(LocalDateTime.of(2026, 9, 2, 9, 0, 0));
        ver.setCancelReason("취소");
        verRepository.save(ver);
        entityManager.flush();
        entityManager.clear();

        MdmRuleVer reloaded = verRepository.findById(new MdmRuleVerId("RT_VER", 2)).orElseThrow();
        assertEquals(2, reloaded.getVer());
        assertEquals("DRAFT", reloaded.getStatus(), "생성자 기본 상태");
        assertEquals(1, reloaded.getBaseVer());
        assertEquals("kim", reloaded.getOwnerId());
        assertEquals("FIRST", reloaded.getHitPolicy());
        assertEquals("두 번째", reloaded.getDescription());
        assertEquals("N", reloaded.getEmergencyYn());
        assertEquals("긴급", reloaded.getEmergencyReason());
        assertEquals("lee", reloaded.getApprovedBy());
        assertEquals(LocalDateTime.of(2026, 9, 1, 8, 0, 0), reloaded.getApprovedAt());
        assertEquals("반려", reloaded.getRejectReason());
        assertEquals(LocalDateTime.of(2026, 9, 2, 9, 0, 0), reloaded.getCancelledAt());
        assertEquals("취소", reloaded.getCancelReason());
        assertEquals(0L, reloaded.getRowVersion());
        assertEquals(null, reloaded.getApplyFrom());
    }

    @Test
    void MdmRuleVar_는_IdClass_복합_PK_로_저장_조회_왕복한다() {
        saveRuleAndVersion("RT_VAR");
        MdmRuleVar var = new MdmRuleVar("RT_VAR", 1, 4, "RESULT", 1);
        var.setDispType("Value");
        var.setAxis("COL");
        var.setVarName("QLTY_GRD");
        var.setVarAst("{\"type\":\"id\"}");
        var.setDataType("STRING");
        var.setCollectAgg("LIST");
        var.setPrioList("[\"A\",\"B\"]");
        var.setResGrp("G1");
        var.setGrpCond("COIL_THK > 1");
        var.setGrpCondAst("{}");
        var.setLabel("판정등급");
        var.setDescription("결과");
        varRepository.save(var);
        entityManager.flush();
        entityManager.clear();

        MdmRuleVar reloaded = varRepository.findById(new MdmRuleVarId("RT_VAR", 1, 4)).orElseThrow();
        assertEquals("RESULT", reloaded.getVarKind());
        assertEquals("Value", reloaded.getDispType());
        assertEquals("COL", reloaded.getAxis());
        assertEquals("QLTY_GRD", reloaded.getVarName());
        assertEquals("{\"type\":\"id\"}", reloaded.getVarAst());
        assertEquals("STRING", reloaded.getDataType());
        assertEquals("LIST", reloaded.getCollectAgg());
        assertEquals("[\"A\",\"B\"]", reloaded.getPrioList());
        assertEquals("G1", reloaded.getResGrp());
        assertEquals("COIL_THK > 1", reloaded.getGrpCond());
        assertEquals("{}", reloaded.getGrpCondAst());
        assertEquals(1, reloaded.getSeq());
        assertEquals("판정등급", reloaded.getLabel());
        assertEquals("결과", reloaded.getDescription());
        assertEquals(null, reloaded.getDomainId());
    }

    @Test
    void MdmRuleVar_의_DOMAIN_ID_는_Long_원시_필드로_왕복한다() {
        saveRuleAndVersion("RT_VAR_DOM");
        long domainId = ((Number) entityManager.createNativeQuery(
                "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE) "
                        + "VALUES ('판정등급', 'RT_GRD', 'QTY', 'NUMBER') RETURNING DOMAIN_ID").getSingleResult()).longValue();
        MdmRuleVar var = new MdmRuleVar("RT_VAR_DOM", 1, 1, "COND", 1);
        var.setVarName("COIL_THK");
        var.setDomainId(domainId);
        varRepository.save(var);
        entityManager.flush();
        entityManager.clear();

        assertEquals(domainId, varRepository.findById(new MdmRuleVarId("RT_VAR_DOM", 1, 1)).orElseThrow().getDomainId());
    }

    @Test
    void MdmRuleRow_는_IdClass_복합_PK_로_저장_조회_왕복한다() {
        saveRuleAndVersion("RT_ROW");
        MdmRuleRow row = new MdmRuleRow("RT_ROW", 1, 4, "DEFAULT", 0, "{\"4\":{\"val\":\"C\"}}");
        row.setNote("기본 행");
        row.setTag("T1");
        rowRepository.save(row);
        entityManager.flush();
        entityManager.clear();

        MdmRuleRow reloaded = rowRepository.findById(new MdmRuleRowId("RT_ROW", 1, 4)).orElseThrow();
        assertEquals(0, reloaded.getSeq());
        assertEquals("DEFAULT", reloaded.getRowKind());
        assertEquals("{\"4\":{\"val\":\"C\"}}", reloaded.getCells());
        assertEquals("기본 행", reloaded.getNote());
        assertEquals("T1", reloaded.getTag());
    }

    @Test
    void MdmRuleTestCase_는_IdClass_복합_PK_로_저장_조회_왕복한다() {
        saveRule("RT_CASE");
        MdmRuleTestCase testCase = new MdmRuleTestCase("RT_CASE", 1, "{\"COIL_THK\":1.8}");
        testCase.setCaseName("1.8mm 광폭 A급");
        testCase.setExpectedJson("{\"QLTY_GRD\":\"A\"}");
        testCase.setDescription("설명");
        testCaseRepository.save(testCase);
        entityManager.flush();
        entityManager.clear();

        MdmRuleTestCase reloaded = testCaseRepository.findById(new MdmRuleTestCaseId("RT_CASE", 1)).orElseThrow();
        assertEquals("1.8mm 광폭 A급", reloaded.getCaseName());
        assertEquals("{\"COIL_THK\":1.8}", reloaded.getInputJson());
        assertEquals("{\"QLTY_GRD\":\"A\"}", reloaded.getExpectedJson());
        assertEquals("설명", reloaded.getDescription());
        assertEquals(0L, reloaded.getRowVersion());
    }

    @Test
    void MdmRuleSet_은_지정_PK_로_저장_조회_왕복한다() {
        MdmRuleSet set = new MdmRuleSet("RT_SET", "3CCL 라인스피드", "[\"BASE_SPD_LKP\",\"SPD_EXC\"]");
        set.setDescription("세트");
        setRepository.save(set);
        entityManager.flush();
        entityManager.clear();

        MdmRuleSet reloaded = setRepository.findById("RT_SET").orElseThrow();
        assertEquals("3CCL 라인스피드", reloaded.getMaruRuleSetName());
        assertEquals("[\"BASE_SPD_LKP\",\"SPD_EXC\"]", reloaded.getRuleIds());
        assertEquals("세트", reloaded.getDescription());
        assertEquals("INUSE", reloaded.getStatus(), "생성자 기본 상태");
        assertEquals(0L, reloaded.getRowVersion());
    }

    // ── §3.4-1: AUD_VER 재정의 ──

    @Test
    void AUD_VER_테이블은_감사_카운터를_AUD_VER_에_쓰고_업무_VER_는_그대로다() {
        saveRuleAndVersion("RT_AUD");
        varRepository.save(new MdmRuleVar("RT_AUD", 1, 1, "COND", 1));
        rowRepository.save(new MdmRuleRow("RT_AUD", 1, 1, "NORMAL", 1, "{}"));
        entityManager.flush();
        for (String table : new String[] {"TB_MDM_RULE_VER", "TB_MDM_RULE_VAR", "TB_MDM_RULE_ROW"}) {
            assertEquals("1|0", verAndAudVer(table, "RT_AUD"), table + " 저장 직후 VER|AUD_VER");
        }
        entityManager.clear();

        verRepository.findById(new MdmRuleVerId("RT_AUD", 1)).orElseThrow().setDescription("바뀜");
        varRepository.findById(new MdmRuleVarId("RT_AUD", 1, 1)).orElseThrow().setLabel("바뀜");
        rowRepository.findById(new MdmRuleRowId("RT_AUD", 1, 1)).orElseThrow().setNote("바뀜");
        entityManager.flush();
        for (String table : new String[] {"TB_MDM_RULE_VER", "TB_MDM_RULE_VAR", "TB_MDM_RULE_ROW"}) {
            assertEquals("1|1", verAndAudVer(table, "RT_AUD"), table + " 갱신 뒤 VER|AUD_VER");
        }
    }

    // ── §3.4-2·3: 서비스 소유 칼럼 updatable=false(D7)·ROW_VERSION 은 @Version 이 아니다 ──

    @Test
    void MdmRule_의_카운터와_상태는_엔티티_저장으로_되돌아가지_않는다() {
        saveRule("RT_OWN_RULE");
        entityManager.clear();
        MdmRule stale = ruleRepository.findById("RT_OWN_RULE").orElseThrow();

        native_("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 5, LAST_ROW_ID = 6, LAST_CASE_ID = 7, STATUS = 'INUSE' "
                + "WHERE MARU_RULE_ID = 'RT_OWN_RULE'");
        stale.setMaruRuleName("이름만 바꿈");
        entityManager.flush();

        assertEquals("5|6|7|INUSE|이름만 바꿈", single("SELECT LAST_VAR_ID || '|' || LAST_ROW_ID || '|' || LAST_CASE_ID "
                + "|| '|' || STATUS || '|' || MARU_RULE_NAME FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'RT_OWN_RULE'"));
    }

    @Test
    void MdmRuleVer_의_서비스_소유_칼럼은_엔티티_저장으로_되돌아가지_않고_ROW_VERSION_도_자동으로_오르지_않는다() {
        saveRuleAndVersion("RT_OWN_VER");
        entityManager.clear();
        MdmRuleVer stale = verRepository.findById(new MdmRuleVerId("RT_OWN_VER", 1)).orElseThrow();

        native_("UPDATE TB_MDM_RULE_VER SET STATUS = 'RELEASED', OWNER_ID = 'lee', APPLY_FROM = '2026-01-01 00:00:00', "
                + "APPLY_TO = '9999-12-31 00:00:00', REQUESTED_BY = 'kim', REQUESTED_AT = '2026-01-01 00:00:01', "
                + "RELEASED_AT = '2026-01-01 00:00:02', ROW_VERSION = 3 WHERE MARU_RULE_ID = 'RT_OWN_VER'");
        stale.setDescription("설명만 바꿈");
        entityManager.flush();

        assertEquals("RELEASED|lee|2026-01-01 00:00:00|9999-12-31 00:00:00|kim|2026-01-01 00:00:01|2026-01-01 00:00:02|3|설명만 바꿈",
                single("SELECT STATUS || '|' || OWNER_ID || '|' || APPLY_FROM || '|' || APPLY_TO || '|' || REQUESTED_BY || '|' "
                        + "|| REQUESTED_AT || '|' || RELEASED_AT || '|' || ROW_VERSION || '|' || DESCRIPTION "
                        + "FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'RT_OWN_VER'"));
        assertEquals(0L, stale.getRowVersion(), "ROW_VERSION 은 @Version 이 아니다 — 엔티티 값이 스스로 오르지 않는다");
    }

    @Test
    void MdmRuleTestCase_와_MdmRuleSet_의_ROW_VERSION_은_엔티티_저장으로_되돌아가지_않는다() {
        saveRule("RT_OWN_CASE");
        testCaseRepository.save(new MdmRuleTestCase("RT_OWN_CASE", 1, "{}"));
        setRepository.save(new MdmRuleSet("RT_OWN_SET", "세트", "[]"));
        entityManager.flush();
        entityManager.clear();
        MdmRuleTestCase staleCase = testCaseRepository.findById(new MdmRuleTestCaseId("RT_OWN_CASE", 1)).orElseThrow();
        MdmRuleSet staleSet = setRepository.findById("RT_OWN_SET").orElseThrow();

        native_("UPDATE TB_MDM_RULE_TEST_CASE SET ROW_VERSION = 4 WHERE MARU_RULE_ID = 'RT_OWN_CASE'");
        native_("UPDATE TB_MDM_RULE_SET SET ROW_VERSION = 9 WHERE MARU_RULE_SET_ID = 'RT_OWN_SET'");
        staleCase.setCaseName("이름만 바꿈");
        staleSet.setDescription("설명만 바꿈");
        entityManager.flush();

        assertEquals("4", single("SELECT ROW_VERSION FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID = 'RT_OWN_CASE'"));
        assertEquals("9", single("SELECT ROW_VERSION FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'RT_OWN_SET'"));
        assertEquals(0L, staleCase.getRowVersion());
        assertEquals(0L, staleSet.getRowVersion());
    }

    // ── §3.4-4: SQLite 업무 일시(D5) ──

    @Test
    void 업무_일시는_초_단위_KST_텍스트로_저장되고_텍스트를_LocalDateTime_으로_읽는다() {
        saveRule("RT_TIME");
        MdmRuleVer ver = new MdmRuleVer("RT_TIME", 1, null);
        ver.setStatus("RELEASED");
        ver.setApplyFrom(LocalDateTime.of(2026, 10, 1, 0, 0, 0, 789_000_000));
        ver.setApplyTo(LocalDateTime.of(9999, 12, 31, 0, 0));
        verRepository.save(ver);
        entityManager.flush();

        assertEquals("text|2026-10-01 00:00:00|text|9999-12-31 00:00:00", single(
                "SELECT typeof(APPLY_FROM) || '|' || APPLY_FROM || '|' || typeof(APPLY_TO) || '|' || APPLY_TO "
                        + "FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'RT_TIME'"));

        native_("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, APPLY_FROM, APPLY_TO, RELEASED_AT) "
                + "VALUES ('RT_TIME', 2, 'RELEASED', '2026-09-21 10:00:00', '9999-12-31 00:00:00', '2026-09-20 09:08:07')");
        entityManager.clear();
        MdmRuleVer nativeRow = verRepository.findById(new MdmRuleVerId("RT_TIME", 2)).orElseThrow();
        assertEquals(LocalDateTime.of(2026, 9, 21, 10, 0, 0), nativeRow.getApplyFrom());
        assertEquals(LocalDateTime.of(9999, 12, 31, 0, 0), nativeRow.getApplyTo());
        assertEquals(LocalDateTime.of(2026, 9, 20, 9, 8, 7), nativeRow.getReleasedAt());
    }

    // ── §3.4-5: JSON CHECK 가 엔티티 경로에도 걸린다 ──

    @Test
    void 부정형_CELLS_를_엔티티로_저장하면_JSON_CHECK_가_거부한다() {
        saveRuleAndVersion("RT_JSON");
        rowRepository.save(new MdmRuleRow("RT_JSON", 1, 1, "NORMAL", 1, "{bad"));
        RuntimeException e = assertThrows(RuntimeException.class, () -> entityManager.flush());
        assertTrue(rootMessage(e).contains("CK_TB_MDM_RULE_ROW_CELLS_JSON"), rootMessage(e));
    }

    // ── §3.4-6: 보류 테이블 엔티티 없음(D1) ──

    @Test
    void 관리_엔티티_테이블_집합에_06_활성_6테이블이_있고_보류_2테이블은_없다() {
        Set<String> managedTableNames = entityManager.getMetamodel().getEntities().stream()
                .map(e -> e.getJavaType().getAnnotation(jakarta.persistence.Table.class))
                .filter(Objects::nonNull)
                .map(jakarta.persistence.Table::name)
                .collect(Collectors.toSet());
        assertTrue(managedTableNames.containsAll(Set.of("TB_MDM_RULE", "TB_MDM_RULE_VER", "TB_MDM_RULE_VAR",
                "TB_MDM_RULE_ROW", "TB_MDM_RULE_TEST_CASE", "TB_MDM_RULE_SET")), managedTableNames.toString());
        assertFalse(managedTableNames.contains("TB_MDM_RULE_SYSTEM"), "D1 — TB_MDM_RULE_SYSTEM 은 엔티티를 붙이지 않는다");
        assertFalse(managedTableNames.contains("TB_MDM_RULE_RECV"), "D1 — TB_MDM_RULE_RECV 는 엔티티를 붙이지 않는다");
    }

    // ── §3.4-7: 컨버터가 MSSQL 에 새지 않는다(D5, 정적 검사) ──

    @Test
    void SQLite_일시_컨버터는_local_프로파일에만_등록되고_Converter_어노테이션이_없다() {
        assertFalse(MdmSqliteLocalDateTimeConverter.class.isAnnotationPresent(Converter.class),
                "@Converter 가 붙으면 엔티티 스캔이 MSSQL 에도 적용한다");
        assertTrue(classpathText("application-local.yml").contains("metadata_builder_contributor"),
                "local 프로파일에는 contributor 가 있어야 한다");
        for (String yml : new String[] {"application.yml", "application-local-db.yml", "application-wildfly.yml"}) {
            assertFalse(classpathText(yml).contains("metadata_builder_contributor"), yml + " 에 SQLite contributor 가 있다");
        }
    }

    // ── 도우미 ──

    private void saveRule(String ruleId) {
        ruleRepository.save(new MdmRule(ruleId, "룰-" + ruleId, "DECISION", "MDM"));
        entityManager.flush();
    }

    private void saveRuleAndVersion(String ruleId) {
        saveRule(ruleId);
        verRepository.save(new MdmRuleVer(ruleId, 1, "kim"));
        entityManager.flush();
    }

    private String verAndAudVer(String table, String ruleId) {
        return single("SELECT VER || '|' || AUD_VER FROM " + table + " WHERE MARU_RULE_ID = '" + ruleId + "'");
    }

    private void native_(String sql) {
        entityManager.createNativeQuery(sql).executeUpdate();
    }

    private String single(String sql) {
        Object value = entityManager.createNativeQuery(sql).getSingleResult();
        assertNotNull(value, sql);
        return value.toString();
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        StringBuilder all = new StringBuilder();
        while (t != null) {
            all.append(t.getMessage()).append(" | ");
            t = t.getCause();
        }
        return all.toString();
    }

    private static String classpathText(String path) {
        try (InputStream in = MdmBusinessRuleEntityJpaRoundtripTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, "클래스패스에 " + path + " 가 없다");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
