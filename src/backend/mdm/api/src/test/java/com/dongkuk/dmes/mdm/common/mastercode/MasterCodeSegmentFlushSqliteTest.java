package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection.Change;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection.RowStatus;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.hibernate.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataAccessException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 특성 테스트 — {@link MasterCodeItemSegmentOps}·{@link MasterCodeCateSegmentOps} 의 반복문 안 쓰기(행마다
 * {@code saveAndFlush})를 {@code save} + 메서드 끝 flush 한 번으로 바꾸기 전에 지금 동작을 고정한다(리팩토링 항목1 flush).
 *
 * <p>실제 V9 표(Oracle 시험 PDB, Flyway)에서 돈다. 운영처럼 트랜잭션 안에서 부르는 것이 기본이고(OASIS 트랜잭션), 배치 하나는 트랜잭션
 * 밖(detached)에서도 같은 결과인지 고정한다. 고정하는 것:
 * <ul>
 *   <li>DB 에 남은 행 — from·to 와 감사 칼럼 VER(@PreUpdate 가 flush 마다 1 올린다) — 와 돌려주는 값.</li>
 *   <li>public 메서드가 돌아올 때 영속성 컨텍스트에 쓰지 않은 변경이 없다(세션 dirty 아님) — DB 오류가 커밋 때가 아니라 그
 *       메서드 안에서 나야 OASIS 가 실패로 싣는다(클래스 설명 ③).</li>
 *   <li>같은 PK 를 지운 뒤 다시 넣는 경우(클래스 설명 ②)가 같은 트랜잭션에서 성공한다.</li>
 *   <li>DB 제약 위반이 그 public 메서드 안에서 스프링이 번역한 예외로 던져진다 — Oracle(ORA-02290)은 CHECK 위반을
 *       {@link DataAccessException} 하위(DataIntegrityViolationException)로 번역한다(리포지토리 프록시를 거친 flush 여야 번역된다).</li>
 * </ul>
 * 단언은 트랜잭션이 끝난 뒤 JdbcTemplate(새 연결)으로 표를 직접 읽는다.
 *
 * <p>기본 시드: 마루 코드 {@code M}, 1.000 RELEASED(행 A·B·C), 1.001 DRAFT. 소속 시드는 {@link #seedCascade()}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class MasterCodeSegmentFlushSqliteTest extends AbstractMdmSharedDbTest {

    private static final VersionRef DRAFT = new VersionRef(VersionTarget.MASTER_CODE, "M", new BigDecimal("1.001"));

    @Autowired
    MasterCodeItemSegmentOps itemOps;
    @Autowired
    MasterCodeCateSegmentOps cateOps;
    @Autowired
    EntityManager entityManager;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;

    private MasterCodeFixtures fx;
    private JdbcTemplate jdbc;
    private TransactionTemplate tx;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        tx = new TransactionTemplate(transactionManager);
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        fx.seedCode("M", "시험 코드", "MDM", 2);
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, 5);
        fx.seedItem("M", "A", "1.000", OPEN, "에이", null, 1, null, "G");
        fx.seedItem("M", "B", "1.000", OPEN, "비", null, 2, null, "G");
        fx.seedItem("M", "C", "1.000", OPEN, "씨", null, 3, null, "H");
    }

    // ── Item: removeItem 연쇄(:145-156) ────────────────────────────────────

    @Test
    void I1_removeItem_연쇄는_소속을_닫거나_지우고_메서드가_돌아올_때_모두_flush_돼_있다() {
        seedCascade();

        List<String> closed = inTx(() -> clean(itemOps.removeItem(DRAFT, "B")));

        assertEquals(List.of("T1", "T2", "T3"), closed);
        assertEquals(List.of("A|1.000|9999|에이|0", "B|1.000|1.001|비|1", "C|1.000|9999|씨|0"), items());
        assertEquals(List.of("T1 A@1.000-9999 v0", "T1 B@1.000-1.001 v1", "T2 B@1.000-1.001 v1"), cateItems());
    }

    @Test
    void I2_코드_삭제로_지운_소속_PK_를_같은_트랜잭션에서_다시_넣는다() {
        seedCascade();

        inTx(() -> {
            clean(itemOps.removeItem(DRAFT, "B"));
            clean(() -> itemOps.addItem(DRAFT, "B", values("새 비", 2, "G")));
            clean(() -> cateOps.addCategoryMembers(DRAFT, "T3", Set.of("B")));
            return null;
        });

        assertEquals(List.of("A|1.000|9999|에이|0", "B|1.000|1.001|비|1", "B|1.001|9999|새 비|0", "C|1.000|9999|씨|0"),
                items());
        assertEquals(List.of("T1 A@1.000-9999 v0", "T1 B@1.000-1.001 v1", "T2 B@1.000-1.001 v1", "T3 B@1.001-9999 v0"),
                cateItems());
    }

    // ── Item: applyItems 배치(:172-286) ────────────────────────────────────

    @Test
    void I3_투영_순서_DELETED_뒤_ADDED_같은_코드는_옛_행을_닫고_새_구간을_넣는다() {
        seedCascade();

        Map<String, List<String>> closed = inTx(() -> clean(itemOps.applyItems(DRAFT, List.of(
                new Change(RowStatus.DELETED, "A", null),
                new Change(RowStatus.ADDED, "A", values("새 에이", 1, "G"))))));

        assertEquals(Map.of("A", List.of("T1")), closed);
        assertEquals(List.of("A|1.000|1.001|에이|1", "A|1.001|9999|새 에이|0", "B|1.000|9999|비|0", "C|1.000|9999|씨|0"),
                items());
        assertEquals(List.of("T1 A@1.000-1.001 v1", "T1 B@1.000-9999 v0", "T2 B@1.000-9999 v0", "T3 B@1.001-9999 v0"),
                cateItems());
    }

    @Test
    void I4_한_배치에서_추가_삭제_재추가는_같은_PK_를_지운_뒤_다시_넣는다() {
        Map<String, List<String>> closed = inTx(() -> clean(itemOps.applyItems(DRAFT, List.of(
                new Change(RowStatus.ADDED, "D", values("디1", 4, "G")),
                new Change(RowStatus.DELETED, "D", null),
                new Change(RowStatus.ADDED, "D", values("디2", 4, "G"))))));

        assertEquals(Map.of("D", List.of()), closed);
        assertEquals(List.of("A|1.000|9999|에이|0", "B|1.000|9999|비|0", "C|1.000|9999|씨|0", "D|1.001|9999|디2|0"),
                items());
    }

    @Test
    void I5_한_배치에서_같은_코드를_두_번_고치면_V_행을_다시_고친다() {
        Map<String, List<String>> closed = inTx(() -> clean(itemOps.applyItems(DRAFT, List.of(
                new Change(RowStatus.CHANGED, "A", values("에이1", 1, "G")),
                new Change(RowStatus.CHANGED, "A", values("에이2", 1, "G"))))));

        assertEquals(Map.of(), closed);
        assertEquals(List.of("A|1.000|1.001|에이|1", "A|1.001|9999|에이2|1", "B|1.000|9999|비|0", "C|1.000|9999|씨|0"),
                items());
    }

    @Test
    void I6_닫기_뒤_다시_열기_삭제_추가_옛_값으로_수정은_옛_행을_9999_로_다시_연다() {
        seedCascade();

        Map<String, List<String>> closed = inTx(() -> clean(itemOps.applyItems(DRAFT, List.of(
                new Change(RowStatus.DELETED, "B", null),
                new Change(RowStatus.ADDED, "B", values("새 비", 2, "G")),
                new Change(RowStatus.CHANGED, "B", values("비", 2, "G"))))));

        assertEquals(Map.of("B", List.of("T1", "T2", "T3")), closed);
        assertEquals(List.of("A|1.000|9999|에이|0", "B|1.000|9999|비|2", "C|1.000|9999|씨|0"), items());
        assertEquals(List.of("T1 A@1.000-9999 v0", "T1 B@1.000-1.001 v1", "T2 B@1.000-1.001 v1"), cateItems(),
                "배치 수정으로 다시 연 코드는 소속 연쇄를 되살리지 않는다");
    }

    @Test
    void I7_여러_행_배치는_트랜잭션_안에서_차례로_적용된다() {
        seedCascade();

        Map<String, List<String>> closed = inTx(() -> clean(itemOps.applyItems(DRAFT, multiRowBatch())));

        assertMultiRowBatch(closed);
    }

    /**
     * 감사 VER 고정 — 앞 행의 UPDATE 가 flush 되기 전에 첫 삭제 행이 CATE_ITEM 을 JPQL 로 읽으면, Hibernate 자동 flush 가 표가
     * 겹치지 않아 실행을 미루면서도 {@code @PreUpdate} 를 한 번 불러 VER 이 하나 더 오른다(2026-10-04 실험). 지금은 행마다
     * flush 해서 모든 닫힌 행의 VER 이 1 이다. 투영 순서(DELETED 먼저)가 아닌 순서로 applyItems 를 불러도 같아야 한다.
     */
    @Test
    void I7b_수정_행_뒤에_삭제_행이_와도_감사_VER_은_flush_한_번씩만_오른다() {
        seedCascade();

        Map<String, List<String>> closed = inTx(() -> clean(itemOps.applyItems(DRAFT, List.of(
                new Change(RowStatus.CHANGED, "A", values("새 에이", 1, "G")),
                new Change(RowStatus.DELETED, "C", null),
                new Change(RowStatus.DELETED, "B", null)))));

        Map<String, List<String>> expected = new LinkedHashMap<>();
        expected.put("C", List.of());
        expected.put("B", List.of("T1", "T2", "T3"));
        assertEquals(expected, closed);
        assertEquals(List.of("A|1.000|1.001|에이|1", "A|1.001|9999|새 에이|0", "B|1.000|1.001|비|1",
                "C|1.000|1.001|씨|1"), items());
        assertEquals(List.of("T1 A@1.000-9999 v0", "T1 B@1.000-1.001 v1", "T2 B@1.000-1.001 v1"), cateItems());
    }

    @Test
    void I8_여러_행_배치는_트랜잭션_밖_detached_에서도_같다() {
        seedCascade();

        Map<String, List<String>> closed = itemOps.applyItems(DRAFT, multiRowBatch());

        assertMultiRowBatch(closed);
    }

    @Test
    void I9_DB_제약_위반은_applyItems_안에서_번역된_예외로_던지고_롤백하면_아무것도_남지_않는다() {
        seedCascade();
        List<String> itemsBefore = items();
        List<String> cateItemsBefore = cateItems();

        tx.executeWithoutResult(status -> {
            assertThrows(DataAccessException.class, () -> itemOps.applyItems(DRAFT, List.of(
                    new Change(RowStatus.DELETED, "B", null),
                    new Change(RowStatus.CHANGED, "A", values("새 에이", 1, "G")),
                    new Change(RowStatus.ADDED, "X Y", values("공백 코드", 9, "G")))),
                    "CK_TB_MDM_CODE_ITEM_CODE 위반이 커밋이 아니라 applyItems 안에서 나야 한다(클래스 설명 ③)");
            status.setRollbackOnly();
        });

        assertEquals(itemsBefore, items());
        assertEquals(cateItemsBefore, cateItems());
    }

    // ── Item: revertItem 의 reopenCascade(:354-368, 반복문) ─────────────────

    @Test
    void I10_코드_삭제_되돌리기는_닫힌_소속을_다시_열고_메서드가_돌아올_때_모두_flush_돼_있다() {
        seedCascade();
        inTx(() -> clean(itemOps.removeItem(DRAFT, "B")));

        inTx(() -> {
            clean(() -> itemOps.revertItem(DRAFT, "B"));
            return null;
        });

        assertEquals(List.of("A|1.000|9999|에이|0", "B|1.000|9999|비|2", "C|1.000|9999|씨|0"), items());
        assertEquals(List.of("T1 A@1.000-9999 v0", "T1 B@1.000-9999 v2", "T2 B@1.000-9999 v2"), cateItems());
    }

    @Test
    void I11_한_트랜잭션에서_삭제와_되돌리기() {
        seedCascade();

        inTx(() -> {
            clean(itemOps.removeItem(DRAFT, "B"));
            clean(() -> itemOps.revertItem(DRAFT, "B"));
            return null;
        });

        assertEquals(List.of("A|1.000|9999|에이|0", "B|1.000|9999|비|2", "C|1.000|9999|씨|0"), items());
        assertEquals(List.of("T1 A@1.000-9999 v0", "T1 B@1.000-9999 v2", "T2 B@1.000-9999 v2"), cateItems());
    }

    // ── Cate: closeCategory 연쇄(:116-126) ─────────────────────────────────

    @Test
    void C1_카테고리_닫기는_소속을_닫거나_지우고_메서드가_돌아올_때_모두_flush_돼_있다() {
        seedCascade();
        fx.seedCateItem("M", "T1", "C", "1.001", OPEN);

        inTx(() -> {
            clean(() -> cateOps.closeCategory(DRAFT, "T1"));
            return null;
        });

        assertEquals(List.of("R@1.000-9999 v0", "T1@1.000-1.001 v1", "T2@1.000-9999 v0", "T3@1.000-9999 v0"), cates());
        assertEquals(List.of("T1 A@1.000-1.001 v1", "T1 B@1.000-1.001 v1", "T2 B@1.000-9999 v0", "T3 B@1.001-9999 v0"),
                cateItems());
    }

    @Test
    void C2_V_에서_넣은_카테고리를_닫으면_지우고_같은_트랜잭션에서_같은_PK_로_다시_넣는다() {
        inTx(() -> {
            clean(() -> cateOps.addCategory(DRAFT, table("N", "새 표")));
            clean(() -> cateOps.addCategoryMembers(DRAFT, "N", Set.of("A", "B")));
            clean(() -> cateOps.closeCategory(DRAFT, "N"));
            clean(() -> cateOps.addCategory(DRAFT, table("N", "새 표 다시")));
            clean(() -> cateOps.addCategoryMembers(DRAFT, "N", Set.of("B", "C")));
            return null;
        });

        assertEquals(List.of("N@1.001-9999 v0"), cates());
        assertEquals(List.of("N B@1.001-9999 v0", "N C@1.001-9999 v0"), cateItems());
        assertEquals(List.of("새 표 다시"), jdbc.queryForList(
                "SELECT CATE_NAME FROM TB_MDM_CODE_CATE WHERE MARU_CODE_ID = 'M'", String.class));
    }

    @Test
    void C3_카테고리_변경_뒤_닫기는_V_행을_지우고_옛_행과_소속을_닫는다() {
        seedCascade();

        inTx(() -> {
            clean(() -> cateOps.changeCategory(DRAFT, table("T1", "새 표1")));
            clean(() -> cateOps.closeCategory(DRAFT, "T1"));
            return null;
        });

        assertEquals(List.of("R@1.000-9999 v0", "T1@1.000-1.001 v1", "T2@1.000-9999 v0", "T3@1.000-9999 v0"), cates());
        assertEquals(List.of("T1 A@1.000-1.001 v1", "T1 B@1.000-1.001 v1", "T2 B@1.000-9999 v0", "T3 B@1.001-9999 v0"),
                cateItems());
    }

    // ── Cate: revertCate 의 reopenMembersCascade(:236-245) ──────────────────

    @Test
    void C4_카테고리_닫기_되돌리기는_소속을_다시_열고_메서드가_돌아올_때_모두_flush_돼_있다() {
        seedCascade();
        fx.seedCateItem("M", "T1", "C", "1.001", OPEN);
        inTx(() -> {
            clean(() -> cateOps.closeCategory(DRAFT, "T1"));
            return null;
        });

        inTx(() -> {
            clean(() -> cateOps.revertCate(DRAFT, "T1"));
            return null;
        });

        assertEquals(List.of("R@1.000-9999 v0", "T1@1.000-9999 v2", "T2@1.000-9999 v0", "T3@1.000-9999 v0"), cates());
        assertEquals(List.of("T1 A@1.000-9999 v2", "T1 B@1.000-9999 v2", "T2 B@1.000-9999 v0", "T3 B@1.001-9999 v0"),
                cateItems(), "V 에서 넣었다 지운 T1 C 는 되살리지 않는다");
    }

    @Test
    void C5_한_트랜잭션에서_닫기와_되돌리기() {
        seedCascade();

        inTx(() -> {
            clean(() -> cateOps.closeCategory(DRAFT, "T1"));
            clean(() -> cateOps.revertCate(DRAFT, "T1"));
            return null;
        });

        assertEquals(List.of("R@1.000-9999 v0", "T1@1.000-9999 v2", "T2@1.000-9999 v0", "T3@1.000-9999 v0"), cates());
        assertEquals(List.of("T1 A@1.000-9999 v2", "T1 B@1.000-9999 v2", "T2 B@1.000-9999 v0", "T3 B@1.001-9999 v0"),
                cateItems());
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** DELETED B·C → CHANGED A → ADDED D·E(투영 순서). */
    private static List<Change> multiRowBatch() {
        return List.of(
                new Change(RowStatus.DELETED, "B", null),
                new Change(RowStatus.DELETED, "C", null),
                new Change(RowStatus.CHANGED, "A", values("새 에이", 1, "G")),
                new Change(RowStatus.ADDED, "D", values("디", 4, "G")),
                new Change(RowStatus.ADDED, "E", values("이", 5, "H")));
    }

    private void assertMultiRowBatch(Map<String, List<String>> closed) {
        Map<String, List<String>> expected = new LinkedHashMap<>();
        expected.put("B", List.of("T1", "T2", "T3"));
        expected.put("C", List.of());
        assertEquals(expected, closed);
        assertEquals(List.of("B", "C"), List.copyOf(closed.keySet()), "삭제 행 순서");
        assertEquals(List.of("A|1.000|1.001|에이|1", "A|1.001|9999|새 에이|0", "B|1.000|1.001|비|1",
                "C|1.000|1.001|씨|1", "D|1.001|9999|디|0", "E|1.001|9999|이|0"), items());
        assertEquals(List.of("T1 A@1.000-9999 v0", "T1 B@1.000-1.001 v1", "T2 B@1.000-1.001 v1"), cateItems());
    }

    /** TABLE T1(A·B@1.000), T2(B@1.000), T3(B@1.001 — 이 DRAFT 에서 넣은 소속), REGEX R. */
    private void seedCascade() {
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);
        fx.seedCate("M", "T2", "1.000", OPEN, "표2", "TABLE", null, null);
        fx.seedCate("M", "T3", "1.000", OPEN, "표3", "TABLE", null, null);
        fx.seedCate("M", "R", "1.000", OPEN, "정규식", "REGEX", "[AB]", "CODE");
        fx.seedCateItem("M", "T1", "A", "1.000", OPEN);
        fx.seedCateItem("M", "T1", "B", "1.000", OPEN);
        fx.seedCateItem("M", "T2", "B", "1.000", OPEN);
        fx.seedCateItem("M", "T3", "B", "1.001", OPEN);
    }

    private <T> T inTx(Supplier<T> body) {
        return tx.execute(status -> body.get());
    }

    /** public 메서드가 돌아온 직후 영속성 컨텍스트에 DB 로 안 나간 변경이 없어야 한다(클래스 설명 ③). */
    private <T> T clean(T result) {
        assertFalse(entityManager.unwrap(Session.class).isDirty(), "메서드가 돌아올 때 flush 되지 않은 변경이 남았다");
        return result;
    }

    private void clean(Runnable call) {
        call.run();
        clean((Object) null);
    }

    /** "code|from|to|name|VER" 목록(정렬). */
    private List<String> items() {
        return jdbc.query("SELECT CODE, FROM_VER, TO_VER, NAME, VER FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'M'",
                (rs, i) -> rs.getString(1) + "|" + MasterCodeFixtures.fmt(rs.getBigDecimal(2)) + "|"
                        + MasterCodeFixtures.fmt(rs.getBigDecimal(3)) + "|" + rs.getString(4) + "|" + rs.getLong(5))
                .stream().sorted().toList();
    }

    /** "cate@from-to vVER" 목록(정렬). */
    private List<String> cates() {
        return jdbc.query("SELECT CATE_ID, FROM_VER, TO_VER, VER FROM TB_MDM_CODE_CATE WHERE MARU_CODE_ID = 'M'",
                (rs, i) -> rs.getString(1) + "@" + MasterCodeFixtures.fmt(rs.getBigDecimal(2)) + "-"
                        + MasterCodeFixtures.fmt(rs.getBigDecimal(3)) + " v" + rs.getLong(4))
                .stream().sorted().toList();
    }

    /** "cate code@from-to vVER" 목록(정렬). */
    private List<String> cateItems() {
        return jdbc.query("SELECT CATE_ID, CODE, FROM_VER, TO_VER, VER FROM TB_MDM_CODE_CATE_ITEM WHERE MARU_CODE_ID = 'M'",
                (rs, i) -> rs.getString(1) + " " + rs.getString(2) + "@" + MasterCodeFixtures.fmt(rs.getBigDecimal(3))
                        + "-" + MasterCodeFixtures.fmt(rs.getBigDecimal(4)) + " v" + rs.getLong(5))
                .stream().sorted().toList();
    }

    private static CategoryDefinition table(String cateId, String cateName) {
        return new CategoryDefinition(cateId, cateName, CategoryKind.TABLE, null, null, null);
    }

    private static MasterCodeItemValues values(String name, Integer seq, String lvl1) {
        List<String> lvls = new ArrayList<>(Arrays.asList(new String[5]));
        lvls.set(0, lvl1);
        return new MasterCodeItemValues(name, null, seq, null, lvls, Arrays.asList(new String[10]));
    }
}
