package com.dongkuk.dmes.mdm.dmd.dataEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentLock;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.CategorySummaryRow;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditDeprecateRequest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditHeaderSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditView;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.service.DataEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.time.LocalDateTime;
import java.util.Arrays;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * TSK-07-02 design.md §3.1 — {@code dataEdit} 조회·저장·폐기. R1′(자기 트랜잭션)·R2(잠금 1회)·R7(DEPRECATED 전부
 * 거부)·R11/D6(lvl_cnt 축소, 닫힌 행 포함 스캔)·R5(카드4 매칭 건수)를 이 클래스가 담당한다(구현 단위 B2).
 *
 * <p>R1′ 테스트는 테스트 메서드에 {@code @Transactional} 을 붙이지 않는다 — 서비스가 자기 트랜잭션으로 직접 커밋·거부
 * 한다는 사실 자체를 증명해야 하므로(F7), 테스트가 대신 트랜잭션을 열어 주면 이 증명이 무의미해진다(B1 R1 선례와 같은
 * 이유). 그 밖의 읽기 검증(카드4 등)은 {@code rowStore} 네이티브 읽기가 활성 트랜잭션을 요구하므로 {@code @Transactional}
 * 을 붙인다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataEditServiceSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    DataEditService service;
    @MockitoSpyBean
    DataSegmentLock lock;
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

    // ── R1′·auditVer — 자기 트랜잭션으로 커밋, 충돌이면 아무것도 안 바뀐다 ────────────

    @Test
    void R1_저장은_자기_트랜잭션으로_바로_커밋되고_충돌시_아무것도_바뀌지_않는다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 1, "국가");

        // 성공 — 테스트 메서드에 @Transactional 이 없다. 서비스 자신의 TransactionTemplate 이 커밋해야만 아래 raw
        // JDBC 읽기(별도 커넥션 관점)에 값이 보인다.
        DataEditView saved = service.save(saveRequest("PORT", 0L, "항구(개정)", "^[0-9A-Z]{1,20}$", 1, "국가"));
        assertEquals("항구(개정)",
                jdbc.queryForObject("SELECT MARU_DATA_NAME FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'PORT'", String.class));
        assertEquals(1L, jdbc.queryForObject("SELECT VER FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'PORT'", Long.class));
        // 응답 자체의 auditVer 도 올라 있어야 한다(다음 저장이 이 값을 그대로 보낸다, F9) — buildView 가 flush 전에
        // 읽으면 여기서 0 이 나가 다음 저장이 오탐 충돌한다(HTTP 왕복 테스트 E1 로 처음 잡힌 버그).
        assertEquals(1L, saved.getAuditVer());

        // 충돌 — auditVer 는 여전히 0 을 보낸다(실제는 1). 검사가 엔티티 변경 전에 있으므로 이름이 그대로여야 한다.
        assertThrows(BusinessException.class,
                () -> service.save(saveRequest("PORT", 0L, "다른 이름", "^[0-9A-Z]{1,20}$", 1, "국가")));
        assertEquals("항구(개정)",
                jdbc.queryForObject("SELECT MARU_DATA_NAME FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'PORT'", String.class));
    }

    @Test
    void 폐기도_자기_트랜잭션으로_바로_커밋된다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 0);

        service.deprecate(deprecateRequest("PORT", 0L));

        assertEquals("DEPRECATED",
                jdbc.queryForObject("SELECT STATUS FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'PORT'", String.class));
    }

    // ── R2 — 잠금은 정확히 한 번 ───────────────────────────────────────────────

    @Test
    void R2_저장은_잠금을_정확히_한_번_부른다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 0);

        service.save(saveRequest("PORT", 0L, "항구", "^[0-9A-Z]{1,20}$", 0));

        verify(lock, times(1)).lock("PORT");
    }

    @Test
    void R2_폐기는_잠금을_정확히_한_번_부른다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 0);

        service.deprecate(deprecateRequest("PORT", 0L));

        verify(lock, times(1)).lock("PORT");
    }

    // ── R7 — DEPRECATED 는 모든 쓰기 거부 ─────────────────────────────────────

    @Test
    void R7_DEPRECATED_마루_데이터는_저장을_거부한다() {
        DmdSegmentTestSupport.insertMaruData(jdbc, "OLD", "MDM", null, "DEPRECATED",
                DmdSegmentTestSupport.DEFAULT_PATTERN, 0);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(saveRequest("OLD", 0L, "이름", "^[0-9A-Z]{1,20}$", 0)));
        assertTrue(ex.getMessage().contains("폐기된 마루 데이터입니다"), ex.getMessage());
    }

    @Test
    void R7_DEPRECATED_마루_데이터는_폐기_재시도도_거부한다() {
        DmdSegmentTestSupport.insertMaruData(jdbc, "OLD", "MDM", null, "DEPRECATED",
                DmdSegmentTestSupport.DEFAULT_PATTERN, 0);

        assertThrows(BusinessException.class, () -> service.deprecate(deprecateRequest("OLD", 0L)));
    }

    // ── 키 패턴 정규식 문법 ─────────────────────────────────────────────────────

    @Test
    void 키_패턴_정규식_문법이_틀리면_저장을_거부한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 0);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(saveRequest("PORT", 0L, "항구", "[", 0)));
        assertTrue(ex.getMessage().contains("키 패턴 정규식이 올바르지 않습니다"), ex.getMessage());
    }

    // ── R11·D6 — lvl_cnt 축소는 닫힌 행 포함 스캔 ────────────────────────────────

    @Test
    void R11_열린_행에_값이_있으면_lvl_cnt_축소를_거부한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 2, "국가");
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of("KR", "PUS"), List.of("한국"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(saveRequest("PORT", 0L, "항구", "^[0-9A-Z]{1,20}$", 1, "국가")));
        assertTrue(ex.getMessage().contains("계층 칸 수를 1 로 줄일 수 없습니다"), ex.getMessage());
    }

    @Test
    void D6_닫힌_채로_남은_키의_마지막_행에_값이_있으면_lvl_cnt_축소를_거부한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 2, "국가");
        // KRPUS 는 닫힌 채로 남아 있다(다시 열리지 않음) — latestItemRows 가 돌려주는 "키별 마지막 행"이 이 닫힌
        // 행 자신이다(D6 선택지 1). 그 행에 LVL2 값이 있으면 축소를 막는다.
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                "2026-06-01 00:00:00", 0, List.of("KR", "PUS"), List.of("한국"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(saveRequest("PORT", 0L, "항구", "^[0-9A-Z]{1,20}$", 1, "국가")));
        assertTrue(ex.getMessage().contains("계층 칸 수를 1 로 줄일 수 없습니다"), ex.getMessage());
    }

    @Test
    void D6_새_행으로_대체된_과거_선분의_값은_lvl_cnt_축소_판정에서_빠진다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 2, "국가");
        // KRPUS 의 첫 선분(닫힘)은 LVL2 값이 있었지만, 그 뒤 새 행(지금 열려 있음, D6 "마지막 행")은 LVL2 를 비웠다.
        // latestItemRows 는 키별 마지막 행만 보므로(D6 선택지 1) 이 과거 값은 축소 판정에 들어가지 않는다.
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                "2026-06-01 00:00:00", 0, List.of("KR", "PUS"), List.of("한국"));
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 6, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 1, Arrays.asList("KR", null), List.of("한국"));

        DataEditView view = service.save(saveRequest("PORT", 0L, "항구", "^[0-9A-Z]{1,20}$", 1, "국가"));

        assertEquals(1, view.getLvlCnt());
    }

    @Test
    void 값이_없는_칸을_줄이는_것은_허용한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 2, "국가");
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of("KR"), List.of("한국"));

        DataEditView view = service.save(saveRequest("PORT", 0L, "항구", "^[0-9A-Z]{1,20}$", 1, "국가"));

        assertEquals(1, view.getLvlCnt());
    }

    @Test
    void 계층_칸_수_늘리기는_항상_허용한다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 0);

        DataEditView view = service.save(saveRequest("PORT", 0L, "항구", "^[0-9A-Z]{1,20}$", 5));

        assertEquals(5, view.getLvlCnt());
    }

    // ── R5 — 카테고리 카드 매칭 건수 ──────────────────────────────────────────────

    @Test
    void R5_열린_REGEX_카테고리는_열린_항목_중_매칭_수를_보인다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 1, "국가");
        DmdSegmentTestSupport.insertCateRow(jdbc, "PORT", "BASE", "REGEX", ".*", "KEY",
                LocalDateTime.of(2026, 1, 1, 0, 0), DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertCateRow(jdbc, "PORT", "KR", "REGEX", "^KR", "LVL1",
                LocalDateTime.of(2026, 1, 1, 0, 0), DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of("KR"), List.of("한국"));
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "CNSHA", "상하이", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of("CN"), List.of("중국"));
        // 닫힌 항목은 매칭 대상이 아니다(R5).
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRINC", "인천", LocalDateTime.of(2026, 1, 1, 0, 0),
                "2026-06-01 00:00:00", 0, List.of("KR"), List.of("한국"));

        DataEditView view = service.view(viewRequest("PORT"));

        CategorySummaryRow base = category(view, "BASE");
        assertTrue(base.isOpen());
        assertEquals(2, base.getMatchCount()); // 열린 항목 둘(KRPUS·CNSHA), 닫힌 KRINC 는 제외
        CategorySummaryRow kr = category(view, "KR");
        assertEquals(1, kr.getMatchCount()); // KRPUS 만
    }

    @Test
    void R5_닫힌_카테고리는_매칭_0이다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 1, "국가");
        DmdSegmentTestSupport.insertCateRow(jdbc, "PORT", "OLDCATE", "REGEX", ".*", "KEY",
                LocalDateTime.of(2026, 1, 1, 0, 0), "2026-06-01 00:00:00"); // 닫힌 카테고리
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of("KR"), List.of("한국"));

        DataEditView view = service.view(viewRequest("PORT"));

        CategorySummaryRow cate = category(view, "OLDCATE");
        assertFalse(cate.isOpen());
        assertEquals(0, cate.getMatchCount());
    }

    @Test
    void R5_열린_TABLE_카테고리는_열린_소속_수를_보인다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 0);
        DmdSegmentTestSupport.insertCateRow(jdbc, "PORT", "MAJOR", "TABLE", null, null,
                LocalDateTime.of(2026, 1, 1, 0, 0), DmdSegmentTestSupport.OPEN);
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of(), List.of());
        DmdSegmentTestSupport.insertMemberRow(jdbc, "PORT", "MAJOR", "KRPUS", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN);

        DataEditView view = service.view(viewRequest("PORT"));

        assertEquals(1, category(view, "MAJOR").getMatchCount());
    }

    // ── 항목 수 — 열린 항목만 센다(D-104) ────────────────────────────────────────

    @Test
    void 항목_수는_열린_항목만_센다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 1, "국가");
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of("KR"), List.of("한국"));
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "CNSHA", "상하이", LocalDateTime.of(2026, 1, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of("CN"), List.of("중국"));
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRINC", "인천", LocalDateTime.of(2026, 1, 1, 0, 0),
                "2026-06-01 00:00:00", 0, List.of("KR"), List.of("한국"));

        assertEquals(2, service.view(viewRequest("PORT")).getItemCount());
    }

    @Test
    void 닫힌_뒤_다시_연_키는_항목_수에서_1건으로_센다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 1, "국가");
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 1, 1, 0, 0),
                "2026-03-01 00:00:00", 0, List.of("KR"), List.of("한국"));
        DmdSegmentTestSupport.insertItemRow(jdbc, "PORT", "KRPUS", "부산", LocalDateTime.of(2026, 6, 1, 0, 0),
                DmdSegmentTestSupport.OPEN, 0, List.of("KR"), List.of("한국"));

        assertEquals(1, service.view(viewRequest("PORT")).getItemCount());
    }

    @Test
    void 항목이_없으면_항목_수는_0이다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 0);

        assertEquals(0, service.view(viewRequest("PORT")).getItemCount());
    }

    // ── view — 조회는 잠금을 걸지 않는다 ─────────────────────────────────────────

    @Test
    void view_는_잠금을_걸지_않는다() {
        DmdSegmentTestSupport.insertMdm(jdbc, "PORT", 0);

        service.view(viewRequest("PORT"));

        verify(lock, times(0)).lock("PORT");
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static CategorySummaryRow category(DataEditView view, String cateId) {
        return view.getCategories().stream().filter(c -> cateId.equals(c.getCateId())).findFirst()
                .orElseThrow(() -> new AssertionError(cateId + " 카테고리가 없다: " + view.getCategories()));
    }

    private static DataEditViewRequest viewRequest(String id) {
        DataEditViewRequest req = new DataEditViewRequest();
        req.setMaruDataId(id);
        return req;
    }

    private static DataEditHeaderSaveRequest saveRequest(String id, Long auditVer, String name, String codePattern,
                                                          int lvlCnt, String... attrs) {
        DataEditHeaderSaveRequest req = new DataEditHeaderSaveRequest();
        req.setMaruDataId(id);
        req.setAuditVer(auditVer);
        req.setMaruDataName(name);
        req.setCodePattern(codePattern);
        req.setLvlCnt(lvlCnt);
        if (attrs.length > 0) {
            req.setAttr01Name(attrs[0]);
        }
        return req;
    }

    private static DataEditDeprecateRequest deprecateRequest(String id, Long auditVer) {
        DataEditDeprecateRequest req = new DataEditDeprecateRequest();
        req.setMaruDataId(id);
        req.setAuditVer(auditVer);
        return req;
    }
}
