package com.dongkuk.dmes.mdm.dma.domainMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** spec 2026-10-02-mdm-meta-cache-design §3.3 — 도메인 저장이 그 도메인·하위 도메인·참조 컬럼을 같은 트랜잭션에 기록한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({DomainMngTestConfig.Functions.class, DomainMngTestConfig.Codes.class})
class DomainMngMetaRevisionTest extends DomainMngApiSupport {

    @Autowired
    PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        fixtures();
    }

    private Long qty(Consumer<DomainDraftRequest> edit) {
        return saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            r.setLength(10);
            edit.accept(r);
        }));
    }

    /** 저장된 행 그대로의 초안 + edit(DomainMngParentLinkTest.stored 와 같은 모양). */
    private DomainDraftRequest stored(Long id, Consumer<DomainDraftRequest> edit) {
        Map<String, Object> row = row(id);
        DomainDraftRequest r = new DomainDraftRequest();
        r.setDomainId(id);
        r.setVer(ver(id));
        r.setDomainName((String) row.get("DOMAIN_NAME"));
        r.setStdName((String) row.get("STD_NAME"));
        r.setParentDomainId(row.get("PARENT_DOMAIN_ID") == null ? null : ((Number) row.get("PARENT_DOMAIN_ID")).longValue());
        r.setDomainKind((String) row.get("DOMAIN_KIND"));
        r.setDataType((String) row.get("DATA_TYPE"));
        r.setLength(row.get("LENGTH") == null ? null : ((Number) row.get("LENGTH")).intValue());
        r.setScale(row.get("SCALE") == null ? null : ((Number) row.get("SCALE")).intValue());
        r.setUnitCode((String) row.get("UNIT_CODE"));
        r.setMaruCodeId((String) row.get("MARU_CODE_ID"));
        r.setCateId((String) row.get("CATE_ID"));
        r.setStdRule((String) row.get("STD_RULE"));
        r.setBizRule((String) row.get("BIZ_RULE"));
        r.setDescription((String) row.get("DESCRIPTION"));
        edit.accept(r);
        return r;
    }

    @Test
    void 새_도메인_저장은_그_도메인을_기록한다() {
        MetaRevTestSupport.clear(jdbc);
        Long id = qty(r -> { });
        assertEquals(List.of("DOMAIN:" + id + ":SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void 부모를_다시_저장하면_하위_도메인과_참조_컬럼까지_기록한다() {
        Long parent = qty(r -> r.setStdRule("value >= 0"));
        Long child = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(parent);
        }));
        String phys = uniq("MRD_COL");
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) VALUES (?, ?, ?, 0, 0)",
                phys, phys, child);
        MetaRevTestSupport.clear(jdbc);

        service.save(stored(parent, r -> r.setDescription("설명 바꿈")), List.of(), List.of());

        assertEquals(Set.of(String.valueOf(parent), String.valueOf(child)), MetaRevTestSupport.keys(jdbc, "DOMAIN"));
        assertTrue(MetaRevTestSupport.keys(jdbc, "COLUMN").contains(phys), MetaRevTestSupport.rows(jdbc).toString());
    }

    @Test
    void 원장이_롤백되면_도메인_기록도_남지_않는다() {
        MetaRevTestSupport.clear(jdbc);
        int before = rowCount();
        new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
            service.save(req(r -> {
                r.setDomainKind("QTY");
                r.setDataType("NUMBER");
                r.setUnitCode("mm");
                r.setLength(10);
            }), List.of(), List.of());
            s.setRollbackOnly();
        });
        assertEquals(before, rowCount());
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }
}
