package com.dongkuk.dmes.mdm.measure;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCateSegmentOps;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection.Change;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection.RowStatus;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemSegmentOps;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * P1 — 마스터코드 선분 조작의 flush·SQL 문 수(결정적)와 N행 배치 저장 시간(보조). perf-mdm-backend.md P1.
 *
 * <p>데이터 준비는 {@code MasterCodeSegmentFlushSqliteTest}(dev) 를 본뜬다 — {@link MasterCodeFixtures} 네이티브 INSERT, 마루 코드 {@code M},
 * 1.000 RELEASED, 1.001 DRAFT(소유자 kim), 사용자 kim·STEWARD. 운영(OASIS 트랜잭션)처럼 트랜잭션 안에서 부르고 롤백한다.
 *
 * <ul>
 *   <li>{@code applyItems-N<n>}: n 행 배치 = 삭제 n/3(각 코드가 TABLE 카테고리 2개 소속 → 연쇄 닫기) → 수정 n/3(1.000 행을 닫고 새 구간) →
 *       추가 나머지(새 코드). 투영 순서(DELETED → CHANGED → ADDED).</li>
 *   <li>{@code removeItem-m<m>}: 코드 하나가 m 개 TABLE 카테고리 소속 → 삭제 연쇄.</li>
 *   <li>{@code revertItem-m<m>}: 같은 트랜잭션에서 removeItem 뒤(세지 않음) 되돌리기만 센다(reopenCascade).</li>
 *   <li>{@code closeCategory-m<m>}: 카테고리 하나에 m 개 소속 → 닫기 연쇄.</li>
 *   <li>{@code revertCate-m<m>}: closeCategory 뒤(세지 않음) 되돌리기만 센다(reopenMembersCascade).</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class MeasureP1MasterCodeFlushTest extends AbstractMdmSharedDbTest {

    private static final String P = "P1";
    private static final VersionRef DRAFT = new VersionRef(VersionTarget.MASTER_CODE, "M", new BigDecimal("1.001"));

    @Autowired
    MasterCodeItemSegmentOps itemOps;
    @Autowired
    MasterCodeCateSegmentOps cateOps;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    private MasterCodeFixtures fx;
    private StatProbe probe;

    @Test
    void 선분_조작_flush_문_수와_배치_저장_시간() {
        MeasureSupport.assumeEnabled();
        fx = new MasterCodeFixtures(new JdbcTemplate(dataSource));
        probe = new StatProbe(tm, em, emf);
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
        MeasureSupport.env(P);
        List<String> problems = new ArrayList<>();

        int[] sizes = MeasureSupport.dry() ? new int[] {10} : new int[] {10, 100, 500};
        for (int n : sizes) {
            int d = n / 3;
            int c = n / 3;
            int a = n - d - c;
            seedBatch(d + c, d);
            List<Change> batch = batch(d, c, a);
            StatProbe.Counts k = probe.inTx(() -> itemOps.applyItems(DRAFT, batch));
            check(problems, "applyItems-N" + n, k);
            MeasureSupport.emit(P, "applyItems-N" + n, MeasureSupport.concat(new Object[] {"deleted", d, "changed", c, "added", a},
                    k.kv()));
            long[] t = probe.timeInTx(() -> itemOps.applyItems(DRAFT, batch), MeasureSupport.warmup(2), MeasureSupport.reps(7));
            MeasureSupport.emit(P, "applyItems-N" + n + "-time", MeasureSupport.concat(MeasureSupport.timingKv(t),
                    "load1", MeasureSupport.load()));
        }

        int[] fanouts = MeasureSupport.dry() ? new int[] {3} : new int[] {3, 30};
        for (int m : fanouts) {
            seedCascade(m);
            emit(problems, "removeItem-m" + m, probe.inTx(() -> itemOps.removeItem(DRAFT, code(1))));
            emit(problems, "revertItem-m" + m, probe.inTx(() -> itemOps.removeItem(DRAFT, code(1)), () -> {
                itemOps.revertItem(DRAFT, code(1));
                return null;
            }));
            emit(problems, "closeCategory-m" + m, probe.inTx(() -> {
                cateOps.closeCategory(DRAFT, cate(1));
                return null;
            }));
            emit(problems, "revertCate-m" + m, probe.inTx(() -> cateOps.closeCategory(DRAFT, cate(1)), () -> {
                cateOps.revertCate(DRAFT, cate(1));
                return null;
            }));
        }
        assertTrue(problems.isEmpty(), "측정 호출 오류: " + problems);
    }

    private void emit(List<String> problems, String scenario, StatProbe.Counts k) {
        check(problems, scenario, k);
        MeasureSupport.emit(P, scenario, k.kv());
    }

    private static void check(List<String> problems, String scenario, StatProbe.Counts k) {
        if (k.error() != null) {
            problems.add(scenario + ": " + k.error());
            MeasureSupport.emit(P, scenario + "-ERROR", "error", k.error().getClass().getSimpleName());
        }
    }

    // ── 시드 ──────────────────────────────────────────────────────────────

    private void seedHead() {
        fx.clear();
        fx.seedCode("M", "측정 코드", "MDM", 2);
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, 5);
    }

    /** 1.000 에 기존 코드 existing 개, 앞 deleted 개는 TABLE 카테고리 T0001·T0002 소속. */
    private void seedBatch(int existing, int deleted) {
        seedHead();
        for (int i = 1; i <= existing; i++) {
            fx.seedItem("M", code(i), "1.000", OPEN, "이름" + i, null, i, null, "G");
        }
        fx.seedCate("M", cate(1), "1.000", OPEN, "표1", "TABLE", null, null);
        fx.seedCate("M", cate(2), "1.000", OPEN, "표2", "TABLE", null, null);
        for (int i = 1; i <= deleted; i++) {
            fx.seedCateItem("M", cate(1), code(i), "1.000", OPEN);
            fx.seedCateItem("M", cate(2), code(i), "1.000", OPEN);
        }
    }

    private static List<Change> batch(int d, int c, int a) {
        List<Change> out = new ArrayList<>();
        for (int i = 1; i <= d; i++) {
            out.add(new Change(RowStatus.DELETED, code(i), null));
        }
        for (int i = d + 1; i <= d + c; i++) {
            out.add(new Change(RowStatus.CHANGED, code(i), values("새 이름" + i, i, "G")));
        }
        for (int i = 1; i <= a; i++) {
            out.add(new Change(RowStatus.ADDED, "N" + String.format("%04d", i), values("추가" + i, 10_000 + i, "G")));
        }
        return out;
    }

    /** 코드 K0001..K{m}, 카테고리 T0001..T{m}. K0001 은 모든 카테고리 소속(removeItem 연쇄 m), T0001 은 모든 코드 소속(closeCategory 연쇄 m). */
    private void seedCascade(int m) {
        seedHead();
        for (int i = 1; i <= m; i++) {
            fx.seedItem("M", code(i), "1.000", OPEN, "이름" + i, null, i, null, "G");
            fx.seedCate("M", cate(i), "1.000", OPEN, "표" + i, "TABLE", null, null);
        }
        for (int i = 1; i <= m; i++) {
            fx.seedCateItem("M", cate(i), code(1), "1.000", OPEN);
            if (i > 1) {
                fx.seedCateItem("M", cate(1), code(i), "1.000", OPEN);
            }
        }
    }

    private static String code(int i) {
        return "K" + String.format("%04d", i);
    }

    private static String cate(int i) {
        return "T" + String.format("%04d", i);
    }

    private static MasterCodeItemValues values(String name, Integer seq, String lvl1) {
        List<String> lvls = new ArrayList<>(Arrays.asList(new String[5]));
        lvls.set(0, lvl1);
        return new MasterCodeItemValues(name, null, seq, null, lvls, Arrays.asList(new String[10]));
    }
}
