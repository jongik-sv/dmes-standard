package com.dongkuk.dmes.mdm.dmc;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDeprecateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Set;
import javax.sql.DataSource;
import kr.dongkuk.maru.mdm.engine.code.CodeResolver.CodeListEntry;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-06-02 design.md §3.2 G1·G2 — 폐기 뒤 CODE_LIST 는 비고 MASTER 판정은 유지된다(수용 기준 5, 불변 규칙 I16).
 *
 * <p>운영 {@code CodeLookup} 빈은 등록하지 않는다(D-077). DB 를 읽는 {@link MdmCodeLookup} 을 실제
 * {@link DefaultCodeResolver} 에 직접 붙이고, resolver 는 서비스 트랜잭션 <b>밖에서</b> 부른다(엔진 호출 경로와 같다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class MasterCodeDeprecateEngineSqliteTest extends AbstractMdmSharedDbTest {

    private static final String ID = "PROC_CD";

    @Autowired
    CodeEditService service;
    @Autowired
    MasterCodeLedgerQueries ledger;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    ApplicationContext context;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private DefaultCodeResolver resolver;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.clear();
        currentUser.set("stw1", Set.of("MDM_STEWARD"));
        AuditHolder.remove();
        UserContextHolder.clear();
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedItem(ID, "A", "1.000", OPEN, "에이", 1);
        seeds.seedItem(ID, "B", "1.000", OPEN, "비", 2);
        seeds.seedBase(ID);
        resolver = new DefaultCodeResolver(new MdmCodeLookup(ledger), CodeEffLookup.NONE);
    }

    @Test
    void G0_운영_CodeLookup_빈은_없다() {
        assertTrue(context.getBeansOfType(CodeLookup.class).values().stream().noneMatch(b -> b instanceof MdmCodeLookup),
                "MdmCodeLookup 은 운영 빈이 아니다(D5)");
    }

    @Test
    void G1_폐기_전에는_CODE_LIST_에_있다() {
        LocalDateTime now = LocalDateTime.now();
        assertEquals(java.util.List.of("A", "B"), resolver.codeList(ID, "BASE", now).stream().map(CodeListEntry::code).toList());
        assertTrue(resolver.isMember(ID, "BASE", "A", now));
    }

    @Test
    void G2_폐기_뒤_CODE_LIST_는_비고_MASTER_판정은_유지된다() {
        CodeDeprecateRequest r = new CodeDeprecateRequest();
        r.setMaruCodeId(ID);
        r.setAuditVer(0L);
        tx.execute(s -> service.deprecate(r));
        assertEquals("DEPRECATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_CODE", String.class));

        LocalDateTime now = LocalDateTime.now();
        assertTrue(resolver.codeList(ID, "BASE", now).isEmpty(), "DEPRECATED 는 CODE_LIST 빈 목록");
        assertTrue(resolver.isMember(ID, "BASE", "A", now), "MASTER 판정은 유지");
        assertTrue(resolver.isMember(ID, "BASE", "A", LocalDateTime.of(2026, 1, 2, 0, 0)), "과거 기준일 판정도 유지");
        assertEquals(Optional.of(new BigDecimal("1.000")), resolver.selectVersion(ID, now).map(v -> v.setScale(3)));
    }
}
