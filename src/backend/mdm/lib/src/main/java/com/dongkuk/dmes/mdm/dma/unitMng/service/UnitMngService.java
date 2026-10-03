package com.dongkuk.dmes.mdm.dma.unitMng.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmUnitReferenceSpi;
import com.dongkuk.dmes.mdm.dma.unitMng.UnitForbiddenCodes;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.ConvertPreviewRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.ConvertPreviewResult;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.DimensionOption;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitDeleteRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitRow;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitSaveRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitSearchRequest;
import com.dongkuk.dmes.mdm.dma.unitMng.dto.UnitSearchResult;
import com.dongkuk.dmes.mdm.entity.MdmUnit;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmUnitRepository;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

/**
 * 단위 마스터({@code unitMng}) OASIS 진입 서비스 — TSK-04-02 design.md §2.
 *
 * <p>정본: {@code docs/mdm/screens/unitMng/unitMng_기능설계서.md}. BPMN
 * {@code services/dma/unitMng.bpmn} 의 {@code actionGateway} 4 분기와 1:1 이다: {@code search}/{@code save}/
 * {@code delete}/{@code compare}(method={@link #convertPreview}).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — CGLIB 프록시가 파라미터명을 지워 OASIS
 * 바인딩이 {@code ParameterName must not be null} 로 죽는다(mls {@code NoticeMgmtService} 선례).
 */
@Service("unitMngService")
public class UnitMngService {

    private static final Logger log = LoggerFactory.getLogger(UnitMngService.class);

    /** 불변 규칙 I20 — UNIT_CODE/BASE_UNIT ASCII 20자, DIMENSION ASCII 50자. */
    private static final Pattern CODE_20 = Pattern.compile("^[A-Za-z0-9_]{1,20}$");
    private static final Pattern DIMENSION_50 = Pattern.compile("^[A-Za-z0-9_]{1,50}$");

    private final MdmUnitRepository unitRepository;
    private final MdmDomainRepository domainRepository;
    private final ObjectProvider<MdmUnitReferenceSpi> unitReferences;

    public UnitMngService(MdmUnitRepository unitRepository, MdmDomainRepository domainRepository,
                          ObjectProvider<MdmUnitReferenceSpi> unitReferences) {
        this.unitRepository = unitRepository;
        this.domainRepository = domainRepository;
        this.unitReferences = unitReferences;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search
    // ────────────────────────────────────────────────────────────────

    public UnitSearchResult search(UnitSearchRequest request) {
        String unitCodeFilter = request != null ? trimToNull(request.getUnitCode()) : null;
        String dimensionFilter = request != null ? trimToNull(request.getDimension()) : null;

        List<MdmUnit> all = unitRepository.findAll();
        boolean optionsOnly = request != null && request.isOptionsOnly();
        List<UnitRow> rows = optionsOnly ? List.<UnitRow>of() : all.stream()
                .filter(u -> unitCodeFilter == null
                        || u.getUnitCode().toUpperCase(Locale.ROOT).contains(unitCodeFilter.toUpperCase(Locale.ROOT)))
                .filter(u -> dimensionFilter == null || dimensionFilter.equalsIgnoreCase(u.getDimension()))
                .map(u -> new UnitRow(u.getUnitCode(), u.getDimension(), u.getBaseUnit(), u.getFactor()))
                .toList();

        // 차원별 확립된 기준 단위 — D-002 ComboBox 자동완성용(전체 데이터 기준, 필터와 무관하다).
        Map<String, String> establishedByDimension = new LinkedHashMap<>();
        for (MdmUnit u : all) {
            establishedByDimension.putIfAbsent(u.getDimension(), u.getBaseUnit());
        }
        List<DimensionOption> dimensionOptions = establishedByDimension.entrySet().stream()
                .map(e -> new DimensionOption(e.getKey(), e.getValue()))
                .toList();

        log.info("[unitMng] search — unitCode={} dimension={} rows={}", unitCodeFilter, dimensionFilter, rows.size());
        // 환산 미리보기 콤보용 전체 단위 — 조건·optionsOnly 와 무관하게 항상 돌려준다.
        List<UnitRow> unitOptions = all.stream()
                .map(u -> new UnitRow(u.getUnitCode(), u.getDimension(), u.getBaseUnit(), u.getFactor()))
                .sorted(java.util.Comparator.comparing(UnitRow::getDimension).thenComparing(UnitRow::getUnitCode))
                .toList();
        return new UnitSearchResult(rows, dimensionOptions, unitOptions);
    }

    // ────────────────────────────────────────────────────────────────
    // action: save
    // ────────────────────────────────────────────────────────────────

    public UnitRow save(UnitSaveRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "저장할 값이 없습니다.");
        }
        String unitCode = trimToNull(request.getUnitCode());
        String dimension = trimToNull(request.getDimension());
        String baseUnit = trimToNull(request.getBaseUnit());

        if (unitCode == null || !CODE_20.matcher(unitCode).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "단위 코드는 영문·숫자·밑줄 20자 이내여야 합니다."); // V-001, I20
        }
        if (dimension == null || !DIMENSION_50.matcher(dimension).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "차원은 영문·숫자·밑줄 50자 이내여야 합니다."); // V-002, I20
        }
        if (baseUnit == null || !CODE_20.matcher(baseUnit).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "기준 단위 값이 올바르지 않습니다."); // V-003, I20
        }
        BigDecimal factor = parseFactor(request.getFactor());

        if (UnitForbiddenCodes.isForbidden(unitCode)) {
            // I4 — 월·년·영업일·근무시간처럼 고정 계수가 없는 단위는 어떤 차원으로도 등록을 거부한다.
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "월·년·영업일·근무시간처럼 고정 계수가 없는 단위는 등록할 수 없습니다.");
        }

        // I3 — 같은 차원의 다른 단위(자기 자신 제외)를 기준으로 기준 단위 일관성을 판정한다.
        List<MdmUnit> siblings = unitRepository.findByDimension(dimension).stream()
                .filter(u -> !u.getUnitCode().equals(unitCode))
                .toList();
        if (siblings.isEmpty()) {
            // 새 차원의 첫 등록(또는 이 단위 하나만 있는 차원의 자기 자신 수정) — 자신이 기준 단위, factor=1.
            if (!unitCode.equals(baseUnit) || BigDecimal.ONE.compareTo(factor) != 0) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                        "새 차원의 첫 단위는 그 자신이 기준 단위(계수 1)여야 합니다.");
            }
        } else {
            String established = siblings.get(0).getBaseUnit();
            if (!established.equals(baseUnit)) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                        "이 차원의 기준 단위는 이미 `" + established + "` 로 정해져 있습니다.");
            }
        }

        MdmUnit existing = unitRepository.findById(unitCode).orElse(null);
        MdmUnit entity = existing != null ? existing : new MdmUnit(unitCode);
        entity.setDimension(dimension);
        entity.setBaseUnit(baseUnit);
        entity.setFactor(factor);
        if (existing == null) {
            entity.setChgSeq(0L); // I16 — 등록 시에는 0으로 명시한다.
        } // I16 — 수정 시에는 CHG_SEQ 를 건드리지 않는다(배포 순번 메커니즘은 범위 밖) — 이미 로드된 값을 그대로 둔다.
        MdmUnit saved = unitRepository.save(entity);
        log.info("[unitMng] save — unitCode={} dimension={} baseUnit={} factor={}", unitCode, dimension, baseUnit, factor);
        return new UnitRow(saved.getUnitCode(), saved.getDimension(), saved.getBaseUnit(), saved.getFactor());
    }

    // ────────────────────────────────────────────────────────────────
    // action: delete
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> delete(UnitDeleteRequest request) {
        if (request == null || trimToNull(request.getUnitCode()) == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "삭제할 단위 코드가 없습니다.");
        }
        String unitCode = request.getUnitCode().trim();
        MdmUnit entity = unitRepository.findById(unitCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "삭제 대상 단위를 찾을 수 없습니다: " + unitCode));

        // I5(a) — TB_MDM_DOMAIN.UNIT_CODE FK 참조가 있으면 거부.
        if (domainRepository.existsByUnitCode(unitCode)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "다른 데이터(도메인)가 이 단위를 참조하고 있어 삭제할 수 없습니다.");
        }
        // I5(a) 확장(D-151 검토) — 다른 영역의 단위 FK 참조(레이아웃 항목의 확정 고정값 UNIT_CODE·전송 단위 TRANS_UNIT 등)도 같은 꼴로
        // 거부한다. 02 는 그 표를 직접 읽지 않고 영역이 구현한 SPI 로 묻는다(MdmDomainReferenceSpi 와 같은 구조).
        for (MdmUnitReferenceSpi spi : unitReferences.orderedStream().toList()) {
            if (spi.references(unitCode)) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                        "다른 데이터(" + spi.label() + ")가 이 단위를 참조하고 있어 삭제할 수 없습니다.");
            }
        }
        // I5(b) — 자기 차원의 기준 단위이면서 같은 차원에 다른 단위가 남아 있으면 거부.
        boolean isBaseUnit = entity.getUnitCode().equals(entity.getBaseUnit());
        if (isBaseUnit) {
            boolean hasSiblings = unitRepository.findByDimension(entity.getDimension()).stream()
                    .anyMatch(u -> !u.getUnitCode().equals(unitCode));
            if (hasSiblings) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                        "이 단위는 차원의 기준 단위이며 같은 차원에 다른 단위가 남아 있어 삭제할 수 없습니다.");
            }
        }

        unitRepository.delete(entity);
        log.info("[unitMng] delete — unitCode={}", unitCode);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cntMerge", 1);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: compare (method=convertPreview)
    // ────────────────────────────────────────────────────────────────

    /**
     * 환산 미리보기 — 불변 규칙 I1·I2. 계산의 유일한 근원은 이 메서드다(FE 는 재계산하지 않는다).
     */
    public ConvertPreviewResult convertPreview(ConvertPreviewRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "환산 요청 값이 없습니다.");
        }
        String fromCode = trimToNull(request.getFromUnitCode());
        String toCode = trimToNull(request.getToUnitCode());
        if (fromCode == null || toCode == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "변환할 단위 두 개를 모두 선택하세요.");
        }
        BigDecimal value;
        try {
            value = new BigDecimal(request.getValue());
        } catch (NumberFormatException | NullPointerException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "환산할 값이 올바른 숫자가 아닙니다.");
        }

        MdmUnit fromUnit = unitRepository.findById(fromCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "단위를 찾을 수 없습니다: " + fromCode));
        MdmUnit toUnit = unitRepository.findById(toCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "단위를 찾을 수 없습니다: " + toCode));

        // I1 — 서로 다른 차원의 단위 간 환산은 항상 거부한다.
        if (!fromUnit.getDimension().equals(toUnit.getDimension())) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "서로 다른 차원끼리는 변환할 수 없습니다.");
        }

        // I2 — value_target = value_source × factor_source ÷ factor_target,
        // 나눗셈은 MathContext(34, HALF_UP), 최종값은 setScale(9, HALF_UP).
        BigDecimal numerator = value.multiply(fromUnit.getFactor());
        BigDecimal divided = numerator.divide(toUnit.getFactor(), new MathContext(34, RoundingMode.HALF_UP));
        BigDecimal result = divided.setScale(9, RoundingMode.HALF_UP);

        return new ConvertPreviewResult(result, fromCode, toCode, fromUnit.getDimension());
    }

    // ────────────────────────────────────────────────────────────────
    // 내부 구현
    // ────────────────────────────────────────────────────────────────

    private static BigDecimal parseFactor(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "환산 계수는 필수입니다.");
        }
        BigDecimal factor;
        try {
            factor = new BigDecimal(raw.trim());
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "환산 계수는 0보다 큰 숫자여야 합니다.");
        }
        if (factor.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "환산 계수는 0보다 큰 숫자여야 합니다."); // V-004
        }
        return factor;
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
