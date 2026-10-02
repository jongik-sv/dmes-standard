package com.dongkuk.dmes.mdm.common.metarev;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder.MetaRevisionRange;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.entity.MdmMetaRev;
import com.dongkuk.dmes.mdm.repository.MdmMetaRevRepository;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** spec 2026-10-02-mdm-meta-cache-design §3.2·§7 「MDM 기록」 — 대상별 키 펼침과 트랜잭션 합류. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MetaRevisionRecorderTest extends AbstractMdmSharedDbTest {

    @Autowired
    MetaRevisionRecorder recorder;
    @Autowired
    MdmMetaRevRepository repository;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    PlatformTransactionManager transactionManager;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactionManager);
        MetaRevTestSupport.clear(jdbc);
        jdbc.update("DELETE FROM TB_MDM_COLUMN_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_COLUMN");
        jdbc.update("DELETE FROM TB_MDM_DOMAIN");
        new MasterCodeSeeds(jdbc).clear();
    }

    @Test
    void 컬럼_신규는_새_물리명_하나를_대문자로_기록한다() {
        recorder.column(null, "coil_thk");
        assertEquals(List.of("COLUMN:COIL_THK:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 컬럼_물리명이_바뀌면_옛_이름과_새_이름을_모두_기록하고_같으면_하나다() {
        recorder.column("COIL_THK", "RMTL_COIL_THK");
        recorder.column("COIL_WID", "COIL_WID");
        assertEquals(List.of("COLUMN:COIL_THK:SAVE", "COLUMN:RMTL_COIL_THK:SAVE", "COLUMN:COIL_WID:SAVE"),
                MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 도메인은_하위_도메인과_그_도메인들을_참조하는_컬럼까지_펼친다() {
        long p = MetaRevTestSupport.domain(jdbc, "MR_P", "QTY", null, null);
        long c = MetaRevTestSupport.domain(jdbc, "MR_C", "QTY", p, null);
        long g = MetaRevTestSupport.domain(jdbc, "MR_G", "QTY", c, null);
        long u = MetaRevTestSupport.domain(jdbc, "MR_U", "QTY", null, null);
        MetaRevTestSupport.column(jdbc, "MR_COL_P", p);
        MetaRevTestSupport.column(jdbc, "MR_COL_G", g);
        MetaRevTestSupport.column(jdbc, "MR_COL_U", u);

        recorder.domain(p);

        assertEquals(Set.of(String.valueOf(p), String.valueOf(c), String.valueOf(g)), MetaRevTestSupport.keys(jdbc, "DOMAIN"));
        assertEquals(Set.of("MR_COL_P", "MR_COL_G"), MetaRevTestSupport.keys(jdbc, "COLUMN"));
    }

    @Test
    void 코드는_직접_참조하는_도메인을_도메인처럼_하위와_컬럼까지_펼친다() {
        new MasterCodeSeeds(jdbc).seedCode("MR_CD", "INUSE", "MDM");
        long k = MetaRevTestSupport.domain(jdbc, "MR_K", "CODE", null, "MR_CD");
        long k2 = MetaRevTestSupport.domain(jdbc, "MR_K2", "CODE", k, null);
        long other = MetaRevTestSupport.domain(jdbc, "MR_O", "QTY", null, null);
        MetaRevTestSupport.column(jdbc, "MR_COL_K2", k2);
        MetaRevTestSupport.column(jdbc, "MR_COL_O", other);

        recorder.code("MR_CD");

        assertEquals(Set.of("MR_CD"), MetaRevTestSupport.keys(jdbc, "CODE"));
        assertEquals(Set.of(String.valueOf(k), String.valueOf(k2)), MetaRevTestSupport.keys(jdbc, "DOMAIN"));
        assertEquals(Set.of("MR_COL_K2"), MetaRevTestSupport.keys(jdbc, "COLUMN"));
    }

    @Test
    void 룰_룰세트_전문은_받은_키만_중복_없이_기록한다() {
        recorder.rule("R1");
        recorder.ruleSet("S1");
        recorder.layouts(List.of(3L, 5L, 3L));
        assertEquals(List.of("RULE:R1:SAVE", "RULE_SET:S1:SAVE", "LAYOUT:3:SAVE", "LAYOUT:5:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 강제_기록은_펼치지_않고_순번_범위를_돌려준다() {
        long p = MetaRevTestSupport.domain(jdbc, "MR_FP", "QTY", null, null);
        MetaRevTestSupport.domain(jdbc, "MR_FC", "QTY", p, null);
        recorder.rule("R0");

        MetaRevisionRange range = recorder.force(MetaTargetType.DOMAIN, List.of(String.valueOf(p), "77"), MetaChangeKind.EVICT);

        assertEquals(2, range.count());
        assertEquals(range.fromSeq() + 1, range.toSeq());
        assertEquals(List.of("RULE:R0:SAVE", "DOMAIN:" + p + ":EVICT", "DOMAIN:77:EVICT"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 호출자_트랜잭션이_롤백되면_기록도_사라진다() {
        tx.executeWithoutResult(s -> {
            recorder.rule("R_ROLLBACK");
            s.setRollbackOnly();
        });
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 저장소는_순번_뒤_기록을_오름차순으로_읽고_최신_순번을_준다() {
        assertEquals(0L, repository.latestSeq());
        recorder.rule("A");
        recorder.rule("B");
        recorder.rule("C");
        long latest = repository.latestSeq();

        List<MdmMetaRev> after = repository.findByRevSeqGreaterThanOrderByRevSeqAsc(latest - 2, PageRequest.of(0, 10));

        assertEquals(List.of("B", "C"), after.stream().map(MdmMetaRev::getTargetKey).toList());
        assertEquals(List.of("RULE", "RULE"), after.stream().map(MdmMetaRev::getTargetType).toList());
    }
}
