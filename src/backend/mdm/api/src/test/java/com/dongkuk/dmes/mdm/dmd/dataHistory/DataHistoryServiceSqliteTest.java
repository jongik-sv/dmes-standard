package com.dongkuk.dmes.mdm.dmd.dataHistory;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.T0;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.text;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.segment.DataCateValue;
import com.dongkuk.dmes.mdm.common.segment.DataCategorySegmentCore;
import com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore;
import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryRequest;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryResult;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryRow;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataHistory.service.DataHistoryService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
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

/**
 * TSK-07-03 design.md §3.2 T-H — 항목 이력(H1~H3). 01 「이력 조회」 생성·변경·소멸(수용 기준 6).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class DataHistoryServiceSqliteTest {

    private static final String MD = "PORT";
    private static final LocalDateTime T1 = T0;
    private static final LocalDateTime T2 = T0.plusMinutes(1);
    private static final LocalDateTime T3 = T0.plusMinutes(2);
    private static final LocalDateTime T4 = T0.plusMinutes(3);
    private static final LocalDateTime T5 = T0.plusMinutes(4);

    @TempDir
    static Path tempDir;

    @Autowired
    DataHistoryService service;
    @Autowired
    DataItemSaveCore itemCore;
    @Autowired
    DataCategorySegmentCore cateCore;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDir.resolve("mdm-dmd-history.db"));
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        DmdSegmentTestSupport.insertMdm(jdbc, MD, 1, "국가");
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearThreadLocals() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void H1_H2_생성_변경_닫힘_다시_열기_변경은_사건과_빈_구간으로_보인다() {
        at(T1, () -> itemCore.register(MD, "KRPUS", value("부산")));
        at(T2, () -> itemCore.modify(MD, "KRPUS", value("부산항"), 0));
        at(T3, () -> itemCore.close(MD, "KRPUS", 1));
        at(T4, () -> itemCore.reopen(MD, "KRPUS", 2));
        at(T5, () -> itemCore.modify(MD, "KRPUS", value("부산신항"), 3));

        DataHistoryResult result = service.search(request("ITEM", "KRPUS", null));

        List<DataHistoryRow> rows = result.getRows();
        assertEquals(4, rows.size());
        assertEquals(List.of(text(T1), text(T2), text(T4), text(T5)), rows.stream().map(DataHistoryRow::getValidFrom).toList(),
                "valid_from 오름차순(H1)");
        assertEquals(List.of("CREATED", "CHANGED", "REOPENED", "CHANGED"), rows.stream().map(DataHistoryRow::getEvent).toList());
        assertEquals(List.of("PAST", "PAST", "PAST", "OPEN"), rows.stream().map(DataHistoryRow::getRowState).toList());
        assertNull(rows.get(1).getGapFrom());
        assertEquals(text(T3), rows.get(2).getGapFrom(), "닫혀 있던 구간");
        assertEquals(text(T4), rows.get(2).getGapTo());
        assertNull(rows.get(3).getGapFrom());
        assertEquals("부산항", rows.get(1).getName());
        assertEquals(3, rows.get(2).getRowVersion());
        assertEquals("OPEN", result.getState());
        assertEquals(MD, result.getHeader().getMaruDataId());
    }

    @Test
    void H2_마지막_사건이_닫기면_마지막_행은_CLOSED_상태는_소멸() {
        at(T1, () -> itemCore.register(MD, "KRINC", value("인천")));
        at(T2, () -> itemCore.modify(MD, "KRINC", value("인천항"), 0));
        at(T3, () -> itemCore.close(MD, "KRINC", 1));

        DataHistoryResult result = service.search(request("ITEM", "KRINC", null));

        assertEquals(List.of("PAST", "CLOSED"), result.getRows().stream().map(DataHistoryRow::getRowState).toList());
        assertEquals(text(T3), result.getRows().get(1).getValidTo());
        assertEquals("CLOSED", result.getState());
    }

    @Test
    void H2_앞_행과_이어지는지는_부등호로_가른다() {
        // 앞 행 valid_to 가 뒤 행 valid_from 보다 1초라도 앞이면 다시 열기다.
        insertItemRow(jdbc, MD, "EDGE", "a", T1, text(T2), 0, null, null);
        insertItemRow(jdbc, MD, "EDGE", "b", T2, text(T3), 1, null, null);
        insertItemRow(jdbc, MD, "EDGE", "c", T3.plusSeconds(1), OPEN, 2, null, null);

        List<DataHistoryRow> rows = service.search(request("ITEM", "EDGE", null)).getRows();

        assertEquals(List.of("CREATED", "CHANGED", "REOPENED"), rows.stream().map(DataHistoryRow::getEvent).toList());
        assertEquals(text(T3), rows.get(2).getGapFrom());
        assertEquals(text(T3.plusSeconds(1)), rows.get(2).getGapTo());
    }

    @Test
    void H1_H2_카테고리와_소속도_같은_규칙() {
        at(T1, () -> cateCore.registerCate(MD, "KR", new DataCateValue("한국", "REGEX", "^KR$", "ATTR01", null)));
        at(T2, () -> cateCore.modifyCate(MD, "KR", new DataCateValue("한국 항구", "REGEX", "^KR$", "ATTR01", null)));
        at(T3, () -> cateCore.closeCate(MD, "KR"));
        at(T4, () -> cateCore.reopenCate(MD, "KR"));

        DataHistoryResult cate = service.search(request("CATE", "KR", null));
        assertEquals(List.of("CREATED", "CHANGED", "REOPENED"), cate.getRows().stream().map(DataHistoryRow::getEvent).toList());
        assertEquals("한국 항구", cate.getRows().get(2).getCateName());
        assertEquals("ATTR01", cate.getRows().get(2).getDefTarget());
        assertEquals("^KR$", cate.getRows().get(2).getDefExpr());
        assertEquals("OPEN", cate.getState());

        insertItemRow(jdbc, MD, "KRPUS", "부산", T0.minusDays(1), OPEN, 0, null, List.of("KR"));
        at(T1, () -> cateCore.registerCate(MD, "MAJOR", new DataCateValue("주요", "TABLE", null, null, null)));
        at(T2, () -> cateCore.addMember(MD, "MAJOR", "KRPUS"));
        at(T3, () -> cateCore.removeMember(MD, "MAJOR", "KRPUS"));
        at(T4, () -> cateCore.addMember(MD, "MAJOR", "KRPUS"));

        DataHistoryResult member = service.search(request("CATE_ITEM", "KRPUS", "MAJOR"));
        assertEquals(List.of("CREATED", "REOPENED"), member.getRows().stream().map(DataHistoryRow::getEvent).toList());
        assertEquals(text(T3), member.getRows().get(1).getGapFrom());
        assertEquals("OPEN", member.getState());
    }

    @Test
    void H3_키가_없으면_거부하고_없는_키는_빈_목록() {
        BusinessException blank = assertThrows(BusinessException.class, () -> service.search(request("ITEM", " ", null)));
        assertTrue(blank.getMessage().contains("키를 입력하세요"), blank.getMessage());
        BusinessException none = assertThrows(BusinessException.class, () -> service.search(request("ITEM", null, null)));
        assertTrue(none.getMessage().contains("키를 입력하세요"), none.getMessage());

        DataHistoryResult empty = service.search(request("ITEM", "NOPE", null));
        assertEquals(List.of(), empty.getRows());
        assertEquals("NONE", empty.getState());
    }

    @Test
    void view_는_마루_데이터_목록과_머리를_준다() {
        DataHistoryViewRequest r = new DataHistoryViewRequest();
        r.setMaruDataId(MD);

        var result = service.view(r);

        assertEquals(1, result.getMaruDataOptions().size());
        assertEquals(1, result.getHeader().getLvlCnt());
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private void at(LocalDateTime t, Runnable call) {
        clock.setLocal(t);
        call.run();
    }

    private static DataHistoryRequest request(String target, String key, String cateId) {
        DataHistoryRequest r = new DataHistoryRequest();
        r.setMaruDataId(MD);
        r.setTarget(target);
        r.setKey(key);
        r.setCateId(cateId);
        return r;
    }
}
