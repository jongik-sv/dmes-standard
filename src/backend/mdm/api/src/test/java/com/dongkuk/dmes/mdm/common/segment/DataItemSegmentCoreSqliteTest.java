package com.dongkuk.dmes.mdm.common.segment;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.itemRows;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.text;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.ts;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.oasis.audit.AuditHolder;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.IntStream;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-07-03 design.md §3.2 T-S — 05 「선분과 닫기」 항목 선분 의미(S1~S13)를 Oracle 시험 PDB 실제 컨텍스트로 확인한다.
 *
 * <p>코어는 {@code @Transactional} 없이 {@code TransactionTemplate} 으로 스스로 트랜잭션을 연다(운영 OASIS 트랜잭션과 같은
 * 효과). 단언은 {@link JdbcTemplate} 네이티브 조회로 커밋된 행을 읽는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataItemSegmentCoreSqliteTest extends AbstractMdmSharedDbTest {

    private static final String MD = "PORT";
    private static final String CONFLICT = MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage();

    @Autowired
    DataItemSaveCore core;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;
    @Autowired
    DataItemSegmentStore store;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        DmdSegmentTestSupport.insertMdm(jdbc, MD, 5, "국가", "위도", "경도", "a4", "a5", "a6", "a7", "a8", "a9", "a10");
        clock.setLocal(T0);
        AuditHolder.remove();
        UserContextHolder.set(new UserInfo("steward1", "담당자1", null));
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    // ── 등록 ────────────────────────────────────────────────────────────────

    @Test
    void S3_S10_S12_등록은_열린_행_하나_row_version_0_CHG_SEQ_0() {
        SaveOutcome out = core.register(MD, "KRPUS", value("부산"));

        assertEquals(MdmTemporalSegmentAction.INSERT, out.action());
        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(1, rows.size());
        assertEquals(text(T0), rows.get(0).get("VALID_FROM"));
        assertEquals(OPEN, rows.get(0).get("VALID_TO"), "새 열린 행은 OPEN_END 를 명시한다(S10)");
        assertEquals(0, num(rows.get(0), "ROW_VERSION"));
        assertEquals(0, num(rows.get(0), "CHG_SEQ"));
        assertEquals("부산", rows.get(0).get("NAME"));
        assertEquals(0, out.latest().rowVersion());
    }

    @Test
    void S8_열린_키_등록은_KEY_EXISTS_닫힌_키_등록은_다시_열기_안내() {
        core.register(MD, "KRPUS", value("부산"));
        BusinessException open = assertThrows(BusinessException.class, () -> core.register(MD, "KRPUS", value("부산2")));
        assertTrue(open.getMessage().contains(DataItemMessages.KEY_EXISTS), open.getMessage());

        tick(10);
        core.close(MD, "KRPUS", 0);
        tick(10);
        BusinessException closed = assertThrows(BusinessException.class, () -> core.register(MD, "KRPUS", value("부산3")));
        assertTrue(closed.getMessage().contains(DataItemMessages.CLOSED_KEY_REOPEN), closed.getMessage());
        assertEquals(1, itemRows(jdbc, MD, "KRPUS").size(), "닫힌 키 등록은 새 행을 만들지 않는다");
    }

    // ── 수정 ────────────────────────────────────────────────────────────────

    @Test
    void S1_S2_S3_수정은_옛_행을_같은_시각에_닫고_새_행_row_version_을_올린다() {
        core.register(MD, "KRPUS", value("부산"));
        LocalDateTime t2 = T0.plusMinutes(5);
        clock.setLocal(t2);

        SaveOutcome out = core.modify(MD, "KRPUS", value("부산항"), 0);

        assertEquals(MdmTemporalSegmentAction.UPDATE, out.action());
        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(2, rows.size());
        assertEquals(text(T0), rows.get(0).get("VALID_FROM"));
        assertEquals(text(t2), rows.get(0).get("VALID_TO"), "옛 행 valid_to = 저장 시각(S1)");
        assertEquals(0, num(rows.get(0), "ROW_VERSION"), "옛 행 row_version 은 그대로(S3)");
        assertEquals("부산", rows.get(0).get("NAME"));
        assertEquals(text(t2), rows.get(1).get("VALID_FROM"), "새 행 valid_from = 같은 저장 시각(S1)");
        assertEquals(OPEN, rows.get(1).get("VALID_TO"));
        assertEquals(1, num(rows.get(1), "ROW_VERSION"), "새 행 = 옛 행 +1(S3)");
        assertEquals("부산항", rows.get(1).get("NAME"), "새 행 값 = 요청 값(S2)");
        assertEquals(1, out.latest().rowVersion());
    }

    @Test
    void S5_값이_같은_수정은_NONE_이고_아무것도_쓰지_않는다() {
        DataItemValue base = new DataItemValue("부산", null, 1, null, List.of("KR"), List.of("KR"));
        core.register(MD, "KRPUS", base);
        Map<String, Object> before = itemRows(jdbc, MD, "KRPUS").get(0);
        tick(60);

        SaveOutcome same = core.modify(MD, "KRPUS", new DataItemValue(" 부산 ", "  ", 1, "", List.of("KR", ""),
                List.of("KR", " ")), 0);

        assertEquals(MdmTemporalSegmentAction.NONE, same.action(), "공백·빈 문자열은 NULL 과 같다(S5 정규화)");
        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(1, rows.size());
        assertEquals(before, rows.get(0), "row_version·U_AT·VER 모두 불변");
    }

    static IntStream comparedFields() {
        return IntStream.range(0, 19);
    }

    /** S5 — 비교 필드 19개 각각을 한 칸씩만 바꾼 수정은 모두 UPDATE 다(비교 대상 누락 변이). */
    @ParameterizedTest(name = "비교 필드 {0}")
    @MethodSource("comparedFields")
    void S5_비교_필드_19개는_하나만_달라도_UPDATE(int field) {
        DataItemValue base = full(field, false);
        core.register(MD, "K" + field, base);
        tick(5);

        SaveOutcome out = core.modify(MD, "K" + field, full(field, true), 0);

        assertEquals(MdmTemporalSegmentAction.UPDATE, out.action(), "필드 " + field);
        assertEquals(2, itemRows(jdbc, MD, "K" + field).size());
    }

    // ── 닫기·다시 열기 ──────────────────────────────────────────────────────

    @Test
    void S6_S3_닫기는_열린_행_valid_to_만_적고_row_version_을_올린다() {
        core.register(MD, "KRINC", value("인천"));
        LocalDateTime t3 = T0.plusHours(1);
        clock.setLocal(t3);

        SaveOutcome out = core.close(MD, "KRINC", 0);

        assertEquals(MdmTemporalSegmentAction.CLOSE, out.action());
        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRINC");
        assertEquals(1, rows.size(), "닫기는 새 행을 만들지 않고 지우지도 않는다");
        assertEquals(text(t3), rows.get(0).get("VALID_TO"));
        assertEquals(1, num(rows.get(0), "ROW_VERSION"), "닫기도 상태 전이라 +1(D7)");

        tick(5);
        BusinessException again = assertThrows(BusinessException.class, () -> core.close(MD, "KRINC", 1));
        assertTrue(again.getMessage().contains(DataItemMessages.NOT_OPEN), again.getMessage());
    }

    @Test
    void S7_S2_다시_열기는_마지막_값을_복사하고_닫힌_구간을_남긴다() {
        core.register(MD, "KRPUS", value("부산"));
        LocalDateTime t2 = T0.plusMinutes(1);
        clock.setLocal(t2);
        core.modify(MD, "KRPUS", value("부산항", List.of("KR"), List.of("KR")), 0);
        LocalDateTime t3 = T0.plusMinutes(2);
        clock.setLocal(t3);
        core.close(MD, "KRPUS", 1);
        LocalDateTime t4 = T0.plusMinutes(3);
        clock.setLocal(t4);

        SaveOutcome out = core.reopen(MD, "KRPUS", 2);

        assertEquals(MdmTemporalSegmentAction.REOPEN, out.action());
        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(3, rows.size());
        assertEquals(text(t3), rows.get(1).get("VALID_TO"), "마지막 행 valid_to 는 그대로(닫힌 구간 보존, S7)");
        assertEquals(text(t4), rows.get(2).get("VALID_FROM"));
        assertEquals(OPEN, rows.get(2).get("VALID_TO"));
        assertEquals("부산항", rows.get(2).get("NAME"), "마지막 행 값 복사(S2)");
        assertEquals("KR", rows.get(2).get("LVL1"));
        assertEquals("KR", rows.get(2).get("ATTR01"));
        assertEquals(3, num(rows.get(2), "ROW_VERSION"), "마지막 행 +1(S3)");
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND CODE = ? "
                + "AND VALID_FROM <= ? AND VALID_TO > ?", Integer.class, MD, "KRPUS", ts(t3), ts(t3)),
                "닫혀 있던 구간 [t3,t4) 을 덮는 행이 없다");

        tick(5);
        BusinessException again = assertThrows(BusinessException.class, () -> core.reopen(MD, "KRPUS", 3));
        assertTrue(again.getMessage().contains(DataItemMessages.ALREADY_OPEN), again.getMessage());
    }

    // ── row_version CAS ───────────────────────────────────────────────────

    @Test
    void S4_오래된_row_version_은_수정_닫기_다시_열기_모두_충돌이고_아무것도_쓰지_않는다() {
        core.register(MD, "KRPUS", value("부산"));
        tick(5);
        assertConflict(() -> core.modify(MD, "KRPUS", value("부산항"), 7));
        assertConflict(() -> core.close(MD, "KRPUS", 7));
        assertEquals(1, itemRows(jdbc, MD, "KRPUS").size());
        assertEquals(OPEN, itemRows(jdbc, MD, "KRPUS").get(0).get("VALID_TO"));

        core.close(MD, "KRPUS", 0);
        tick(5);
        assertConflict(() -> core.reopen(MD, "KRPUS", 0));
        assertEquals(1, itemRows(jdbc, MD, "KRPUS").size());
    }

    @Test
    void S3_S4_오래된_화면은_남의_수정_뒤에_충돌한다() {
        core.register(MD, "KRPUS", value("부산"));
        int seenByA = 0;
        tick(5);
        core.modify(MD, "KRPUS", value("B 가 고침"), 0);
        tick(5);

        assertConflict(() -> core.modify(MD, "KRPUS", value("A 가 고침"), seenByA));
        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(2, rows.size());
        assertEquals("B 가 고침", rows.get(1).get("NAME"));
    }

    @Test
    void S3_S4_남이_닫은_뒤_옛_row_version_으로_다시_열면_충돌한다() {
        core.register(MD, "KRPUS", value("부산"));
        tick(5);
        core.close(MD, "KRPUS", 0);
        tick(5);

        assertConflict(() -> core.reopen(MD, "KRPUS", 0));
        assertEquals(1, itemRows(jdbc, MD, "KRPUS").size());
    }

    @Test
    void S4_저장소의_닫는_UPDATE_는_ROW_VERSION_조건부_CAS_다() {
        // 코어는 잠금 뒤 먼저 비교하므로 CAS 는 두 번째 방어선이다. 저장소 계약을 직접 불러 조건을 확인한다.
        core.register(MD, "KRPUS", value("부산"));
        DataItemKey key = new DataItemKey(MD, "KRPUS");
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        LocalDateTime at = T0.plusMinutes(1);

        assertConflict(() -> tx.executeWithoutResult(s -> store.close(key, at, 5)));
        assertConflict(() -> tx.executeWithoutResult(s -> store.modify(key, value("부산항"), at, 5)));
        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(1, rows.size());
        assertEquals(OPEN, rows.get(0).get("VALID_TO"));

        tx.executeWithoutResult(s -> store.close(key, at, 0));
        assertEquals(text(at), itemRows(jdbc, MD, "KRPUS").get(0).get("VALID_TO"));
    }

    // ── 경계 ────────────────────────────────────────────────────────────────

    @Test
    void S9_같은_초의_사건은_경계를_1초씩_민다() {
        core.register(MD, "KRPUS", value("A"));
        core.modify(MD, "KRPUS", value("B"), 0);
        core.close(MD, "KRPUS", 1);
        core.reopen(MD, "KRPUS", 2);
        core.modify(MD, "KRPUS", value("C"), 3);

        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(4, rows.size());
        assertRow(rows.get(0), T0, T0.plusSeconds(1));
        assertRow(rows.get(1), T0.plusSeconds(1), T0.plusSeconds(2));
        assertRow(rows.get(2), T0.plusSeconds(3), T0.plusSeconds(4));
        assertEquals(text(T0.plusSeconds(4)), rows.get(3).get("VALID_FROM"));
        assertEquals(OPEN, rows.get(3).get("VALID_TO"));
    }

    @Test
    void S9_저장_시각은_초_단위로_자른다() {
        clock.setLocal(T0.withNano(700_000_000));

        core.register(MD, "KRPUS", value("부산"));
        core.modify(MD, "KRPUS", value("부산항"), 0);

        List<Map<String, Object>> rows = itemRows(jdbc, MD, "KRPUS");
        assertEquals(text(T0), rows.get(0).get("VALID_FROM"));
        assertEquals(text(T0.plusSeconds(1)), rows.get(1).get("VALID_FROM"),
                "잘린 경계와 비교해야 같은 초 사건을 민다(절삭 없이 .700 과 비교하면 PK 충돌)");
    }

    @Test
    void S11_직렬_무작위_50사건_뒤_겹침_0_키당_열린_행_최대_1() {
        Random random = new Random(20260924L);
        String[] keys = {"K1", "K2", "K3", "K4", "K5"};
        int applied = 0;
        for (int i = 0; i < 50; i++) {
            String key = keys[random.nextInt(keys.length)];
            int op = random.nextInt(4);
            if (random.nextBoolean()) {
                tick(random.nextInt(3));
            }
            int rv = latestRowVersion(key);
            try {
                switch (op) {
                    case 0 -> core.register(MD, key, value("n" + i));
                    case 1 -> core.modify(MD, key, value("n" + i), rv);
                    case 2 -> core.close(MD, key, rv);
                    default -> core.reopen(MD, key, rv);
                }
                applied++;
            } catch (BusinessException expected) {
                // 열린 키 등록·닫힌 키 닫기 같은 거부는 정상이다.
            }
        }
        assertTrue(applied >= 15, "성공한 사건이 너무 적어 시험이 공허하다: " + applied);
        assertEquals(0, DmdSegmentTestSupport.overlapCount(jdbc, MD));
        assertTrue(DmdSegmentTestSupport.maxOpenRowsPerKey(jdbc, MD) <= 1);
        List<Map<String, Object>> zero = jdbc.queryForList(
                "SELECT CODE FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND VALID_FROM >= VALID_TO", MD);
        assertEquals(List.of(), zero, "길이 0 구간이 없다");
    }

    // ── 감사 ────────────────────────────────────────────────────────────────

    @Test
    void S13_새_행은_감사_9칼럼을_쓰고_닫는_UPDATE_는_U_와_VER_을_올린다() {
        core.register(MD, "KRPUS", value("부산"));
        Map<String, Object> inserted = itemRows(jdbc, MD, "KRPUS").get(0);
        assertEquals("steward1", inserted.get("C_USR_ID"));
        assertEquals("steward1", inserted.get("U_USR_ID"));
        assertEquals(text(T0), inserted.get("C_AT"));
        assertEquals(0, num(inserted, "VER"));

        UserContextHolder.set(new UserInfo("steward2", "담당자2", null));
        LocalDateTime t2 = T0.plusHours(2);
        clock.setLocal(t2);
        core.close(MD, "KRPUS", 0);

        Map<String, Object> closed = itemRows(jdbc, MD, "KRPUS").get(0);
        assertEquals("steward1", closed.get("C_USR_ID"));
        assertEquals("steward2", closed.get("U_USR_ID"));
        assertEquals(text(t2), closed.get("U_AT"));
        assertEquals(1, num(closed, "VER"));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /** 19개 비교 필드를 모두 채운 값. changed 면 field 번째 하나만 다른 값. */
    private static DataItemValue full(int field, boolean changed) {
        String[] s = new String[19];
        for (int i = 0; i < 19; i++) {
            s[i] = "V" + i;
        }
        if (changed) {
            s[field] = "W" + field;
        }
        Integer seq = changed && field == 2 ? 2 : 1;
        List<String> lvl = new ArrayList<>(List.of(s[4], s[5], s[6], s[7], s[8]));
        List<String> attr = new ArrayList<>(List.of(s[9], s[10], s[11], s[12], s[13], s[14], s[15], s[16], s[17], s[18]));
        return new DataItemValue(s[0], s[1], seq, s[3], lvl, attr);
    }

    private int latestRowVersion(String key) {
        List<Integer> rv = jdbc.queryForList("SELECT ROW_VERSION FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND CODE = ? "
                + "ORDER BY VALID_FROM DESC", Integer.class, MD, key);
        return rv.isEmpty() ? 0 : rv.get(0);
    }

    private void tick(int seconds) {
        clock.setLocal(LocalDateTime.ofInstant(clock.instant(), clock.getZone()).plusSeconds(seconds));
    }

    private static void assertConflict(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertTrue(e.getMessage().startsWith(CONFLICT), e.getMessage());
    }

    private static void assertRow(Map<String, Object> row, LocalDateTime from, LocalDateTime to) {
        assertEquals(text(from), row.get("VALID_FROM"));
        assertEquals(text(to), row.get("VALID_TO"));
        assertFalse(from.equals(to));
    }

    private static int num(Map<String, Object> row, String column) {
        return ((Number) row.get(column)).intValue();
    }
}
