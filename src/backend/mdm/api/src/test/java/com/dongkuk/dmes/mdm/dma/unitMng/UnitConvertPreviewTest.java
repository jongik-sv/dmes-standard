package com.dongkuk.dmes.mdm.dma.unitMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.ConvertPreviewRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.ConvertPreviewResult;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitSaveRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.service.UnitMngService;
import java.math.BigDecimal;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

/** TSK-04-02 design.md §3.2 — I1(차원 다름 거부), I2(환산 계산식·반올림 규칙). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class UnitConvertPreviewTest {

    @TempDir
    static Path tempDir;

    @Autowired
    UnitMngService service;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("unit-convert-preview-test.db");
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

    @BeforeEach
    void seedUnits() {
        // TIME 차원 — 기준 단위는 초(S), 02 설계 예시(35 min -> h)를 그대로 재현한다.
        service.save(req("S", "TIME", "S", "1"));
        service.save(req("MIN", "TIME", "S", "60"));
        service.save(req("H", "TIME", "S", "3600"));
        // MASS 차원 — 다경로 왕복 확인용(ton/kg/g).
        service.save(req("KG", "MASS", "KG", "1"));
        service.save(req("G", "MASS", "KG", "0.001"));
        service.save(req("TON", "MASS", "KG", "1000"));
    }

    private ConvertPreviewRequest convReq(String value, String from, String to) {
        ConvertPreviewRequest r = new ConvertPreviewRequest();
        r.setValue(value);
        r.setFromUnitCode(from);
        r.setToUnitCode(to);
        return r;
    }

    @Test
    void I1_서로_다른_차원끼리는_환산을_거부한다() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.convertPreview(convReq("1", "KG", "H")));
        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().contains("차원"), ex.getMessage());
    }

    @Test
    void I2_35분은_0_583333333_시간이다() {
        ConvertPreviewResult r = service.convertPreview(convReq("35", "MIN", "H"));
        assertEquals(new BigDecimal("0.583333333"), r.getValue());
        assertEquals("TIME", r.getDimension());
    }

    @Test
    void I2_ton_kg_g_다경로_왕복이_일치한다() {
        // 1 ton -> kg -> g, 그리고 1 ton -> g 직접 변환이 같아야 한다.
        ConvertPreviewResult tonToKg = service.convertPreview(convReq("1", "TON", "KG"));
        ConvertPreviewResult kgToG = service.convertPreview(convReq(tonToKg.getValue().toPlainString(), "KG", "G"));
        ConvertPreviewResult tonToGDirect = service.convertPreview(convReq("1", "TON", "G"));

        assertEquals(0, kgToG.getValue().compareTo(tonToGDirect.getValue()),
                "kg 경유 값=" + kgToG.getValue() + ", 직접 변환 값=" + tonToGDirect.getValue());
        assertEquals(new BigDecimal("1000000.000000000"), tonToGDirect.getValue());
    }

    @Test
    void 같은_단위로의_환산은_원래값을_그대로_돌려준다() {
        ConvertPreviewResult r = service.convertPreview(convReq("42", "KG", "KG"));
        assertEquals(0, new BigDecimal("42").compareTo(r.getValue()));
    }
}
