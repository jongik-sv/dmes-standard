package com.dongkuk.dmes.mdm.dma.unitMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitDeleteRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitSaveRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.service.UnitMngService;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmUnit;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmUnitRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-04-02 design.md §3.2 — I3(차원별 기준 단위 고정), I4(금지 단위 코드), I5(삭제 시 참조 무결성),
 * I20(ASCII 제한). 격리 방식은 {@code MdmEntityJpaRoundtripTest} 와 동일(§3.2 격리 방식).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class UnitMngServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    UnitMngService service;
    @Autowired
    MdmDomainRepository domainRepository;
    @Autowired
    MdmUnitRepository unitRepository;

    private static UnitSaveRequest req(String unitCode, String dimension, String baseUnit, String factor) {
        UnitSaveRequest r = new UnitSaveRequest();
        r.setUnitCode(unitCode);
        r.setDimension(dimension);
        r.setBaseUnit(baseUnit);
        r.setFactor(factor);
        return r;
    }

    @Test
    void optionsOnly_는_목록을_비우고_차원_콤보만_돌려준다() {
        service.save(req("KGO", "MASSO", "KGO", "1"));
        var normal = service.search(new com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitSearchRequest());
        assertTrue(normal.getList().stream().anyMatch(r -> "KGO".equals(r.getUnitCode())));

        var q = new com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitSearchRequest();
        q.setOptionsOnly(true);
        var out = service.search(q);
        assertTrue(out.getList().isEmpty());
        assertTrue(out.getDimensionOptions().stream().anyMatch(o -> "MASSO".equals(o.getDimension())));
        // 환산 미리보기 콤보용 전체 단위는 optionsOnly 에서도 채워진다.
        assertTrue(out.getUnitOptions().stream()
                .anyMatch(r -> "KGO".equals(r.getUnitCode()) && "MASSO".equals(r.getDimension())));
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

    // ── I16 ──

    @Test
    void I16_등록_시_CHG_SEQ는_0이고_수정_시에는_건드리지_않는다() {
        service.save(req("KG8", "MASS11", "KG8", "1"));
        assertEquals(0L, unitRepository.findById("KG8").orElseThrow().getChgSeq(), "등록 시 CHG_SEQ 는 0");
        // 형제 단위를 하나 둬서(siblings 비지 않음) 이후 KG8 자기 자신 수정이 I3 의 "새 차원 첫 등록" 제약
        // (factor=1 강제)에 걸리지 않게 한다 — 이 테스트의 관심사는 I16 뿐이다.
        service.save(req("G8", "MASS11", "KG8", "0.001"));

        // 배포 순번 메커니즘은 범위 밖이므로, 이미 0이 아닌 값을 직접 심어 두고 수정 후에도 그대로인지 확인한다.
        MdmUnit entity = unitRepository.findById("KG8").orElseThrow();
        entity.setChgSeq(7L);
        unitRepository.saveAndFlush(entity);

        service.save(req("KG8", "MASS11", "KG8", "2")); // factor 만 바꾸는 수정
        assertEquals(7L, unitRepository.findById("KG8").orElseThrow().getChgSeq(),
                "수정 시 CHG_SEQ 를 건드리면 안 된다(I16)");
    }

    @Test
    void 환산_계수의_정수부가_9자리를_넘으면_거절한다() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(req("BIG1", "MASSBIG", "BIG1", "1000000000")));
        assertTrue(ex.getMessage().contains("환산 계수의 정수부는 9자리를 넘을 수 없습니다."), ex.getMessage());
        assertThrows(BusinessException.class, () -> service.save(req("BIG2", "MASSBIG", "BIG2", "1E+10")));
        assertThrows(BusinessException.class, () -> service.save(req("BIG3", "MASSBIG", "BIG3", "999999999.9999999996")),
                "9자리 반올림이 올림으로 10자리가 되는 경계");
        assertThrows(BusinessException.class, () -> service.save(req("BIG4", "MASSBIG", "BIG4", "999999999.9999999995")),
                "경계값 자체도 반올림하면 10자리가 된다");
    }

    @Test
    void 환산_계수가_9자리_정수부_경계_안이면_통과한다() {
        service.save(req("KGB", "MASSB", "KGB", "1"));

        assertEquals(0, new java.math.BigDecimal("999999999").compareTo(
                service.save(req("BIGOK1", "MASSB", "KGB", "999999999")).getFactor()));
        assertEquals(0, new java.math.BigDecimal("999999999.9999999994").compareTo(
                service.save(req("BIGOK2", "MASSB", "KGB", "999999999.9999999994")).getFactor()));
    }

    @Test
    void 환산_계수가_NUMBER_18_9_에서_0이_되는_작은_값이면_거절한다() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(req("TINY1", "MASSTINY", "TINY1", "1E-12")));
        assertTrue(ex.getMessage().contains("0 이 되는"), ex.getMessage());
        assertThrows(BusinessException.class, () -> service.save(req("TINY2", "MASSTINY", "TINY2", "0.0000000004999")));
    }

    @Test
    void 환산_계수가_가장_작은_저장_가능_값이면_통과한다() {
        service.save(req("KGT", "MASST", "KGT", "1"));

        assertEquals(0, new java.math.BigDecimal("0.0000000005").compareTo(
                service.save(req("TINYOK", "MASST", "KGT", "0.0000000005")).getFactor()));
    }

    @Test
    void 환산_계수가_극단_지수여도_예외_없이_사용자_오류로_거절한다() {
        for (String factor : new String[] {"1E-100000000", "1E2147483647", "1E-2147483647"}) {
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> service.save(req("EXP1", "MASSEXP", "EXP1", factor)), factor);
            assertTrue(ex.getMessage().contains("환산 계수"), factor + " — " + ex.getMessage());
        }
    }
}
