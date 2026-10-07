package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleVerId;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVerRepository;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-01 design.md §3.5 — TSK-01-03 인계 ③: 시나리오 키트를 실제 06 테이블로 상속한다.
 *
 * <p>명세는 혼합이다: MASTER_CODE 는 픽스처({@link VersionFixtureTables#CODE_SPEC}, 04 실제 테이블은 dev 에 아직 없다),
 * BUSINESS_RULE 은 실제 명세({@link DefaultVersionTableRegistry}, V1 기준선의 {@code TB_MDM_RULE_VER}). 키트 S15 가
 * 실제 테이블에서 돌고, 06 전용 시나리오 R1~R4 를 더한다. 가짜 확정 검사(BUSINESS_RULE)는
 * {@link VersionScenarioTestConfig} 에 이미 있으므로 여기서 다시 등록하지 않는다(같은 대상 둘이면 기동 실패). DRAFT 삭제 훅은
 * main 의 실물(TSK-08-02 RuleDraftDeletionHook)을 쓴다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({VersionScenarioTestConfig.class, BusinessRuleVersionScenarioSqliteTest.MixedRegistry.class})
class BusinessRuleVersionScenarioSqliteTest extends AbstractVersionStateScenarioTest {

    @Autowired
    MdmRuleRepository ruleRepository;
    @Autowired
    MdmRuleVerRepository verRepository;

    @TestConfiguration(proxyBeanMethods = false)
    static class MixedRegistry {
        @Bean
        @Primary
        VersionTableRegistry mixedVersionTableRegistry() {
            VersionTableSpec realRule = new DefaultVersionTableRegistry().spec(VersionTarget.BUSINESS_RULE);
            return target -> target == VersionTarget.MASTER_CODE ? VersionFixtureTables.CODE_SPEC : realRule;
        }
    }

    @Override
    protected void createSchema(JdbcTemplate jdbc) {
        // 쓰이지 않는 룰 픽스처(TB_MDM_TC_RULE*)도 함께 생기지만 무해하다. 실제 06 테이블은 V1 기준선이 이미 만들었다.
        VersionFixtureTables.sqliteDdl().forEach(jdbc::execute);
    }

    @Override
    protected void clearTables(JdbcTemplate jdbc) {
        VersionFixtureTables.clear(jdbc);
        jdbc.update("DELETE FROM TB_MDM_RULE_RECV");
        jdbc.update("DELETE FROM TB_MDM_RULE_TEST_CASE");
        jdbc.update("DELETE FROM TB_MDM_RULE_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_RULE_VER"); // RULE_VAR·RULE_ROW 는 CASCADE 로 함께 지워진다
        jdbc.update("DELETE FROM TB_MDM_RULE");
    }

    /** 실제 TB_MDM_RULE 의 NOT NULL 칼럼(이름·종류·원천)과 CK_TB_MDM_RULE_SRC_SYS 를 채운다. MASTER_CODE 는 키트 그대로. */
    @Override
    protected void seedObject(VersionTarget target, String objectId, String status, String uUsrId, Integer auditCounter) {
        if (target != VersionTarget.BUSINESS_RULE) {
            super.seedObject(target, objectId, status, uUsrId, auditCounter);
            return;
        }
        jdbc.update("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND, SOURCE_SYSTEM, STATUS, "
                + "U_USR_ID, VER) VALUES (?, ?, 'DECISION', 'MDM', NULL, ?, ?, ?)", objectId, objectId, status, uUsrId, auditCounter);
    }

    // ── R1: JPA 쓰기 → 네이티브 확정 → JPA 읽기(F12 형식 혼재 실측) ──

    @Test
    void R1_JPA_로_저장한_룰_버전을_공통_서비스가_확정하고_엔티티로_다시_읽는다() {
        at("2026-06-20 09:08:07");
        ruleRepository.save(new MdmRule("QLTY_GRD_JDG", "품질 등급 판정", "DECISION", "MDM"));
        MdmRuleVer v1Entity = new MdmRuleVer("QLTY_GRD_JDG", new BigDecimal("1.000"), VersionKind.MAJOR, KIM);
        v1Entity.setStatus("RELEASED");
        v1Entity.setHitPolicy("FIRST");
        v1Entity.setApplyFrom(LocalDateTime.of(2026, 1, 1, 0, 0, 0));
        v1Entity.setApplyTo(LocalDateTime.of(9999, 12, 31, 0, 0, 0));
        verRepository.save(v1Entity);
        MdmRuleVer v2Entity = new MdmRuleVer("QLTY_GRD_JDG", new BigDecimal("2.000"), VersionKind.MAJOR, KIM);
        v2Entity.setBaseVer(new BigDecimal("1.000"));
        v2Entity.setHitPolicy("FIRST");
        verRepository.save(v2Entity);

        // apply_from 은 v1 보다 뒤이고 시계(now) 이하여야 부모가 INUSE 로 바뀐다(S22).
        confirm(rule("QLTY_GRD_JDG", "2.000"), 0, "2026-06-01 00:00:00");

        MdmRuleVer v1 = verRepository.findById(new MdmRuleVerId("QLTY_GRD_JDG", new BigDecimal("1.000"))).orElseThrow();
        MdmRuleVer v2 = verRepository.findById(new MdmRuleVerId("QLTY_GRD_JDG", new BigDecimal("2.000"))).orElseThrow();
        assertEquals(LocalDateTime.of(2026, 6, 1, 0, 0, 0), v1.getApplyTo(), "직전 RELEASED 의 적용 구간이 확정 apply_from 에서 닫힌다");
        assertEquals("RELEASED", v2.getStatus());
        assertEquals(1L, v2.getRowVersion());
        assertEquals(LocalDateTime.of(2026, 6, 1, 0, 0, 0), v2.getApplyFrom());
        assertEquals(LocalDateTime.of(9999, 12, 31, 0, 0, 0), v2.getApplyTo());
        assertEquals(LocalDateTime.of(2026, 6, 20, 9, 8, 7), v2.getReleasedAt());
        assertEquals(LocalDateTime.of(2026, 6, 20, 9, 8, 7), v2.getRequestedAt());
        assertEquals(KIM, v2.getRequestedBy());
        assertEquals(1L, v2.getVersion(), "감사 카운터(AUD_VER)가 네이티브 확정으로 1 올랐다");
        assertEquals("INUSE", ruleRepository.findById("QLTY_GRD_JDG").orElseThrow().getStatus());

        // D6 — 감사 U_AT 값 비교(JPA 쓰기 / 네이티브 KST 쓰기, 둘 다 TIMESTAMP). 읽기가 예외 없이 끝나는지만 단언하고 차이는 기록한다.
        Instant updatedAt = v2.getUpdatedAt();
        assertNotNull(updatedAt);
        Instant clockInstant = LocalDateTime.of(2026, 6, 20, 9, 8, 7).atZone(MdmClockConfig.KST).toInstant();
        Map<String, Object> raw = jdbc.queryForMap("SELECT U_AT, C_AT FROM "
                + "TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2");
        System.out.println("[TSK-08-01 D6 실측] U_AT raw=" + raw + ", entity updatedAt=" + updatedAt
                + ", clock(KST)=" + clockInstant + ", 차이(시간)=" + Duration.between(clockInstant, updatedAt).toMinutes() / 60.0);
    }

    // ── R2: DRAFT 삭제가 VAR·ROW 를 CASCADE 로 지운다 ──

    @Test
    void R2_DRAFT_삭제는_그_버전의_변수와_행을_CASCADE_로_지운다() {
        seedObject(VersionTarget.BUSINESS_RULE, "CASCADE_RULE", "CREATED");
        VersionRef v1 = rule("CASCADE_RULE", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) VALUES ('CASCADE_RULE', 1, 1, 'COND', 'A', 1)");
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) VALUES ('CASCADE_RULE', 1, 2, 'RESULT', 'B', 1)");
        jdbc.update("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('CASCADE_RULE', 1, 1, 1, 'NORMAL', '{}')");
        jdbc.update("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('CASCADE_RULE', 1, 2, 0, 'DEFAULT', '{}')");

        versionStateService.deleteDraft(v1, 0, KIM);

        assertNull(readVersionOrNull(v1));
        // 이 설정에서는 가짜 훅이 BUSINESS_RULE 삭제를 받는다 — 실물 RuleDraftDeletionHook 정의는 TSK-06-02 후처리기가 지운다
        // (TSK-08-02 design §7.2). 실물 훅의 CASCADE 는 운영 컨텍스트의 RuleVersionServiceTest 가 본다.
        assertEquals(List.of(v1), draftDeletion(VersionTarget.BUSINESS_RULE).calls());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'CASCADE_RULE'", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'CASCADE_RULE'", Integer.class));
    }

    // ── R3: 실제 테이블의 네이티브 쓰기 형식(S24 의 실제 테이블판) ──

    @Test
    void R3_실제_TB_MDM_RULE_VER_에_네이티브_확정이_KST_초_단위_TIMESTAMP_로_쓴다() {
        at("2026-06-20 09:08:07");
        seedObject(VersionTarget.BUSINESS_RULE, "TEXT_RULE", "INUSE");
        VersionRef v1 = rule("TEXT_RULE", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        confirm(v1, 0, "2026-07-01 00:00:00");

        // 칸 형은 TIMESTAMP(6) 이고 값은 KST 초 단위다(SQLite 때는 TEXT)
        List<String> types = jdbc.queryForList("SELECT DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TB_MDM_RULE_VER' "
                + "AND COLUMN_NAME IN ('APPLY_FROM', 'APPLY_TO', 'RELEASED_AT')", String.class);
        assertEquals(List.of("TIMESTAMP(6)", "TIMESTAMP(6)", "TIMESTAMP(6)"), types);
        Map<String, Object> stored = jdbc.queryForMap("SELECT APPLY_FROM, APPLY_TO, RELEASED_AT "
                + "FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'TEXT_RULE'");
        assertEquals("2026-07-01 00:00:00|9999-12-31 00:00:00|2026-06-20 09:08:07",
                text(stored.get("APPLY_FROM")) + "|" + text(stored.get("APPLY_TO")) + "|" + text(stored.get("RELEASED_AT")));
    }

    // ── R4: 소유권 전이가 실제 테이블에서 돈다 ──

    @Test
    void R4_해제와_선점이_실제_테이블의_OWNER_ID_ROW_VERSION_AUD_VER_를_바꾼다() {
        seedObject(VersionTarget.BUSINESS_RULE, "OWN_RULE", "CREATED");
        VersionRef v1 = rule("OWN_RULE", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        assertEquals(1, ownershipService.release(v1, 0, KIM));
        Map<String, Object> released = readVersion(v1);
        assertNull(released.get("OWNER_ID"));
        assertEquals(1L, number(released.get("ROW_VERSION")));
        assertEquals(1L, number(released.get("AUD_VER")));

        currentUser.set(LEE, Set.of(MdmRoles.STEWARD));
        assertEquals(2, ownershipService.acquire(v1, 1, LEE));
        Map<String, Object> acquired = readVersion(v1);
        assertEquals(LEE, acquired.get("OWNER_ID"));
        assertEquals(2L, number(acquired.get("ROW_VERSION")));
        assertEquals(2L, number(acquired.get("AUD_VER")));
    }
}
