package com.dongkuk.dmes.mdm.dma.unitMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitDeleteRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitSaveRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.service.UnitMngService;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-04-02 design.md §3.2 — I3(차원별 기준 단위 고정), I4(금지 단위 코드), I5(삭제 시 참조 무결성),
 * I20(ASCII 제한). 격리 방식은 {@code MdmEntityJpaRoundtripTest} 와 동일(§3.2 격리 방식).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class UnitMngServiceTest {

    @TempDir
    static Path tempDir;

    @Autowired
    UnitMngService service;
    @Autowired
    MdmDomainRepository domainRepository;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("unit-mng-service-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    private static UnitSaveRequest req(String unitCode, String dimension, String baseUnit, String factor) {
        UnitSaveRequest r = new UnitSaveRequest();
        r.setUnitCode(unitCode);
        r.setDimension(dimension);
        r.setBaseUnit(baseUnit);
        r.setFactor(factor);
        return r;
    }

    // ── I3 ──

    @Test
    void 새_차원의_첫_단위는_자기_자신이_기준_단위이고_계수1이어야_한다() {
        service.save(req("KG1", "MASS1", "KG1", "1"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(req("XU", "MASS2", "OTHER", "1")));
        assertTrue(ex.getMessage().contains("기준 단위"), ex.getMessage());

        BusinessException ex2 = assertThrows(BusinessException.class,
                () -> service.save(req("YU", "MASS3", "YU", "2")));
        assertTrue(ex2.getMessage().contains("계수"), ex2.getMessage());
    }

    @Test
    void 기존_차원에_등록시_확립된_기준단위와_다르면_거부한다() {
        service.save(req("KG2", "MASS4", "KG2", "1"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(req("G2", "MASS4", "G2", "0.001")));
        assertTrue(ex.getMessage().contains("KG2"), ex.getMessage());
    }

    @Test
    void 기존_차원에_등록시_확립된_기준단위와_같으면_성공한다() {
        service.save(req("KG3", "MASS5", "KG3", "1"));
        var saved = service.save(req("G3", "MASS5", "KG3", "0.001"));
        assertEquals("KG3", saved.getBaseUnit());
        assertEquals("MASS5", saved.getDimension());
    }

    // ── I4 ──

    @Test
    void 금지_단위_코드는_어떤_차원으로도_등록을_거부한다() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(req("MONTH", "TIME1", "MONTH", "1")));
        assertTrue(ex.getMessage().contains("고정 계수"), ex.getMessage());

        // 대소문자 무관.
        assertThrows(BusinessException.class, () -> service.save(req("month", "TIME2", "month", "1")));
        assertThrows(BusinessException.class, () -> service.save(req("BIZDAY", "TIME3", "BIZDAY", "1")));
    }

    // ── I5 ──

    @Test
    void FK_참조가_있는_단위는_삭제를_거부한다() {
        service.save(req("KG4", "MASS6", "KG4", "1"));
        MdmDomain domain = new MdmDomain("무게도메인", "UNIT_FK_TEST", "QTY", "NUMBER");
        domain.setUnitCode("KG4");
        domainRepository.save(domain);
        domainRepository.flush();

        UnitDeleteRequest del = new UnitDeleteRequest();
        del.setUnitCode("KG4");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.delete(del));
        assertTrue(ex.getMessage().contains("참조"), ex.getMessage());
    }

    @Test
    void 기준단위이면서_형제단위가_남아있으면_삭제를_거부한다() {
        service.save(req("KG5", "MASS7", "KG5", "1"));
        service.save(req("G5", "MASS7", "KG5", "0.001"));

        UnitDeleteRequest del = new UnitDeleteRequest();
        del.setUnitCode("KG5");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.delete(del));
        assertTrue(ex.getMessage().contains("기준 단위"), ex.getMessage());

        // 형제(비기준) 단위는 삭제할 수 있다.
        UnitDeleteRequest delSibling = new UnitDeleteRequest();
        delSibling.setUnitCode("G5");
        service.delete(delSibling);
    }

    @Test
    void 차원의_유일한_단위는_삭제할_수_있다() {
        service.save(req("KG6", "MASS8", "KG6", "1"));
        UnitDeleteRequest del = new UnitDeleteRequest();
        del.setUnitCode("KG6");
        service.delete(del); // 형제가 없으므로 성공해야 한다.
    }

    // ── I20 ──

    @Test
    void UNIT_CODE_DIMENSION_이_ASCII_가_아니면_거부한다() {
        assertThrows(BusinessException.class, () -> service.save(req("질량코드", "MASS9", "질량코드", "1")));
        assertThrows(BusinessException.class, () -> service.save(req("KG7", "질량", "KG7", "1")));
    }

    @Test
    void UNIT_CODE_는_20자를_넘으면_거부한다() {
        String tooLong = "A".repeat(21);
        assertThrows(BusinessException.class, () -> service.save(req(tooLong, "MASS10", tooLong, "1")));
    }
}
