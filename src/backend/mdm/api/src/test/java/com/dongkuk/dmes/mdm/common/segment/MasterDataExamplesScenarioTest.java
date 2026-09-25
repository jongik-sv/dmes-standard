package com.dongkuk.dmes.mdm.common.segment;

import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.OPEN;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertItemRow;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.insertMaruData;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.text;
import static com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport.value;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.oasis.audit.AuditHolder;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-07-03 수용 기준 1 — 05 「예」 두 표(E1~E6, X1~X4)의 선분 결과를 데이터 주도로 재현한다(design.md §3.2 T-EX).
 *
 * <p>각 단계에서 시계를 그 단계 시각에 두고 동작을 실행한 뒤, "그 시각에 경계가 생긴 행"(VALID_FROM 또는 VALID_TO 가 그
 * 시각)의 집합이 05 「순번을 찍는 행」에서 순번을 뺀 집합과 <b>정확히</b> 같은지 본다. 순번 칸은 비교하지 않고 대신 모든
 * 행의 CHG_SEQ·LAST_CHG_SEQ 가 0 인지(순번 미발급, S12) 본다. E1·E2 는 TSK-07-02 몫이라 마루 데이터 행은 픽스처로 넣고
 * 선분 결과는 모두 이 Task 의 코어로 만든다. X1(수신 로그 RECV 커밋)은 선분 결과가 없고 수신 로그는 보류(PRD §2 규칙 7)라
 * 재현하지 않는다(D2).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmdSegmentTestSupport.Config.class)
class MasterDataExamplesScenarioTest extends AbstractMdmSharedDbTest {

    private static final LocalDateTime T1 = LocalDateTime.of(2026, 9, 10, 9, 0, 0);
    private static final LocalDateTime T2 = T1.plusHours(1);
    private static final LocalDateTime T3 = T1.plusHours(2);
    private static final LocalDateTime T4 = T1.plusHours(3);
    private static final LocalDateTime T5 = T1.plusHours(4);
    private static final LocalDateTime T6 = T1.plusHours(5);
    private static final LocalDateTime TX0 = LocalDateTime.of(2026, 9, 11, 9, 0, 0);
    private static final LocalDateTime TX2 = TX0.plusHours(1);

    @Autowired
    DataItemSaveCore itemCore;
    @Autowired
    DataCategorySegmentCore cateCore;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private JdbcTemplate jdbc;

    /** 선분 행 식별(순번 제외): 표·키·valid_from·valid_to. */
    record SegRow(String table, String key, String from, String to) {
        static SegRow item(String code, LocalDateTime from, LocalDateTime to) {
            return new SegRow("ITEM", code, text(from), to == null ? OPEN : text(to));
        }

        static SegRow cate(String cateId, LocalDateTime from, LocalDateTime to) {
            return new SegRow("CATE", cateId, text(from), to == null ? OPEN : text(to));
        }
    }

    /** 05 표의 한 줄. */
    record Step(String id, LocalDateTime at, String event, Consumer<JdbcTemplate> action, Set<SegRow> touched) {
    }

    @TestFactory
    Stream<DynamicTest> 예_E1_E6_항구_PORT() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        AuditHolder.remove();
        UserContextHolder.clear();

        List<Step> steps = List.of(
                new Step("E1", T1, "마루 데이터 PORT 생성", db -> {
                    insertMaruData(db, "PORT", "MDM", null, "INUSE", DmdSegmentTestSupport.DEFAULT_PATTERN, 0);
                    cateCore.registerCate("PORT", "BASE", new DataCateValue("전체", "REGEX", ".*", "KEY", null));
                }, Set.of(SegRow.cate("BASE", T1, null))),
                new Step("E2", T2, "추가 컬럼 라벨 지정(attr01 국가, attr02 위도, attr03 경도)", db -> db.update(
                        "UPDATE TB_MDM_DATA SET ATTR01_NAME = '국가', ATTR02_NAME = '위도', ATTR03_NAME = '경도' "
                                + "WHERE MARU_DATA_ID = 'PORT'"), Set.of()),
                new Step("E3", T3, "CSV 3,000건 적재", db -> {
                    UpsertResult r = itemCore.upsert("PORT", DataSavePath.CSV, null, ports(), false);
                    assertTrue(r.written(), r.issues().toString());
                    assertTrue(r.actions().stream().allMatch(a -> a == MdmTemporalSegmentAction.INSERT));
                    assertEquals(3000, r.rows().size());
                }, e3Touched()),
                new Step("E4", T4, "카테고리 KR(REGEX, ATTR01, ^KR$) 등록", db -> cateCore.registerCate("PORT", "KR",
                        new DataCateValue("한국 항구", "REGEX", "^KR$", "ATTR01", null)),
                        Set.of(SegRow.cate("KR", T4, null))),
                new Step("E5", T5, "항목 KRPUS 이름 수정", db -> itemCore.modify("PORT", "KRPUS",
                        value("부산항", List.of(), List.of("KR")), 0),
                        Set.of(SegRow.item("KRPUS", T3, T5), SegRow.item("KRPUS", T5, null))),
                new Step("E6", T6, "항목 KRINC 닫기", db -> itemCore.close("PORT", "KRINC", 0),
                        Set.of(SegRow.item("KRINC", T3, T6))));

        Stream<DynamicTest> perStep = steps.stream().map(this::run);
        DynamicTest copy = DynamicTest.dynamicTest("E6 뒤 사본(MES, last 3) 이 받는 행 = CATE KR·ITEM KRPUS 두 행·ITEM KRINC",
                () -> {
                    Set<SegRow> expected = Set.of(SegRow.cate("KR", T4, null), SegRow.item("KRPUS", T3, T5),
                            SegRow.item("KRPUS", T5, null), SegRow.item("KRINC", T3, T6));
                    assertEquals(expected, boundaryBetween("PORT", T3, T6));
                    assertNoSequence();
                });
        return Stream.concat(perStep, Stream.of(copy));
    }

    @TestFactory
    Stream<DynamicTest> EXTERNAL_예_X1_X4_거래처_CUST() {
        jdbc = new JdbcTemplate(dataSource);
        DmdSegmentTestSupport.clear(jdbc);
        AuditHolder.remove();
        UserContextHolder.clear();
        AtomicReference<UpsertResult> x2 = new AtomicReference<>();

        List<Step> steps = List.of(
                new Step("X0", TX0, "준비: CUST(EXTERNAL, ERP), C2·C3·C4 열림", db -> {
                    insertMaruData(db, "CUST", "EXTERNAL", "ERP", "INUSE", DmdSegmentTestSupport.DEFAULT_PATTERN, 0,
                            "사업자번호", "유형");
                    insertItemRow(db, "CUST", "C2", "옛 이름", TX0, OPEN, 0, null, List.of("222", "S"));
                    insertItemRow(db, "CUST", "C3", "그대로", TX0, OPEN, 0, null, List.of("333", "S"));
                    insertItemRow(db, "CUST", "C4", "넷째", TX0, OPEN, 0, null, List.of("444", "C"));
                }, Set.of(SegRow.item("C2", TX0, null), SegRow.item("C3", TX0, null), SegRow.item("C4", TX0, null))),
                new Step("X2", TX2, "(X1 수신 로그는 보류라 재현하지 않음) 내용 검사 없이 C1·C2·C4 저장", db -> x2.set(
                        itemCore.upsert("CUST", DataSavePath.API, "ERP", List.of(
                                new UpsertRow("C1", value("신규", List.of(), List.of("111", "S"))),
                                new UpsertRow("C2", value("새 이름", List.of(), List.of("222", "S"))),
                                new UpsertRow("C3", value("그대로", List.of(), List.of("333", "S"))),
                                new UpsertRow("C4", value("넷째", List.of(), List.of("444", "C", "라벨없음")))), false)),
                        Set.of(SegRow.item("C1", TX2, null), SegRow.item("C2", TX0, TX2), SegRow.item("C2", TX2, null),
                                SegRow.item("C4", TX0, TX2), SegRow.item("C4", TX2, null))));

        Stream<DynamicTest> perStep = steps.stream().map(this::run);
        DynamicTest x3 = DynamicTest.dynamicTest("X3 응답 — 행별 동작 INSERT·UPDATE·NONE·UPDATE", () -> {
            assertEquals(List.of(MdmTemporalSegmentAction.INSERT, MdmTemporalSegmentAction.UPDATE,
                    MdmTemporalSegmentAction.NONE, MdmTemporalSegmentAction.UPDATE), x2.get().actions());
            assertEquals("라벨없음", jdbc.queryForObject("SELECT ATTR03 FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUST' "
                    + "AND CODE = 'C4' AND VALID_TO = ?", String.class, OPEN), "라벨 없는 attr03 값도 그대로 저장");
        });
        DynamicTest x4 = DynamicTest.dynamicTest("X4 동기화 — tx2 에 경계가 생긴 ITEM 5행, C3 은 없다", () -> {
            Set<SegRow> rows = boundaryAt("CUST", TX2);
            assertEquals(5, rows.size(), rows.toString());
            assertTrue(rows.stream().noneMatch(r -> r.key().equals("C3")));
            assertNoSequence();
        });
        return Stream.concat(perStep, Stream.of(x3, x4));
    }

    // ── 실행·판정 ──────────────────────────────────────────────────────────

    private DynamicTest run(Step step) {
        return DynamicTest.dynamicTest(step.id() + " " + step.event(), () -> {
            clock.setLocal(step.at());
            step.action().accept(jdbc);
            String md = step.id().startsWith("X") ? "CUST" : "PORT";
            assertEquals(step.touched(), boundaryAt(md, step.at()), step.id() + " 에 경계가 생긴 행");
        });
    }

    /** 그 시각에 경계가 생긴 행(VALID_FROM = at 또는 VALID_TO = at) — 항목·카테고리·소속 세 표. */
    private Set<SegRow> boundaryAt(String md, LocalDateTime at) {
        String t = text(at);
        return rows(md, "(VALID_FROM = ? OR VALID_TO = ?)", t, t);
    }

    /** from < 경계 ≤ to 인 행. */
    private Set<SegRow> boundaryBetween(String md, LocalDateTime from, LocalDateTime to) {
        String f = text(from);
        String t = text(to);
        return rows(md, "((VALID_FROM > ? AND VALID_FROM <= ?) OR (VALID_TO > ? AND VALID_TO <= ?))", f, t, f, t);
    }

    private Set<SegRow> rows(String md, String where, Object... args) {
        Set<SegRow> out = new HashSet<>();
        List<Object> params = new ArrayList<>();
        params.add(md);
        params.addAll(List.of(args));
        for (Map<String, Object> r : jdbc.queryForList("SELECT CODE, VALID_FROM, VALID_TO FROM TB_MDM_DATA_ITEM "
                + "WHERE MARU_DATA_ID = ? AND " + where, params.toArray())) {
            out.add(new SegRow("ITEM", (String) r.get("CODE"), (String) r.get("VALID_FROM"), (String) r.get("VALID_TO")));
        }
        for (Map<String, Object> r : jdbc.queryForList("SELECT CATE_ID, VALID_FROM, VALID_TO FROM TB_MDM_DATA_CATE "
                + "WHERE MARU_DATA_ID = ? AND " + where, params.toArray())) {
            out.add(new SegRow("CATE", (String) r.get("CATE_ID"), (String) r.get("VALID_FROM"), (String) r.get("VALID_TO")));
        }
        for (Map<String, Object> r : jdbc.queryForList("SELECT CATE_ID, CODE, VALID_FROM, VALID_TO FROM "
                + "TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID = ? AND " + where, params.toArray())) {
            out.add(new SegRow("CATE_ITEM", r.get("CATE_ID") + "/" + r.get("CODE"), (String) r.get("VALID_FROM"),
                    (String) r.get("VALID_TO")));
        }
        return out;
    }

    /** 순번 미발급(S12) — 모든 선분 행 CHG_SEQ 0, 마루 데이터 LAST_CHG_SEQ·CHG_SEQ 0. */
    private void assertNoSequence() {
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE CHG_SEQ <> 0", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_CATE WHERE CHG_SEQ <> 0", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_CATE_ITEM WHERE CHG_SEQ <> 0", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA WHERE LAST_CHG_SEQ <> 0 OR CHG_SEQ <> 0",
                Integer.class));
    }

    /** E3 의 3,000행: KRPUS·KRINC·CNSHA + P0001~P2997. */
    private static List<UpsertRow> ports() {
        List<UpsertRow> rows = new ArrayList<>(3000);
        rows.add(new UpsertRow("KRPUS", value("부산", List.of(), List.of("KR"))));
        rows.add(new UpsertRow("KRINC", value("인천", List.of(), List.of("KR"))));
        rows.add(new UpsertRow("CNSHA", value("상하이", List.of(), List.of("CN"))));
        for (int i = 1; i <= 2997; i++) {
            rows.add(new UpsertRow(String.format("P%04d", i), value("항구" + i, List.of(), List.of("ZZ"))));
        }
        return rows;
    }

    private static Set<SegRow> e3Touched() {
        Set<SegRow> out = new HashSet<>();
        for (UpsertRow r : ports()) {
            out.add(SegRow.item(r.code(), T3, null));
        }
        return out;
    }
}
