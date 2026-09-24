package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.engine.MdmCodeLookupAvailability;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import org.springframework.stereotype.Component;

/**
 * R10 — {@code cate_id} 가 RELEASED 버전에서 유효한 카테고리인가(02:177, TSK-04-03 design.md §3.2). RELEASED 버전
 * V(적용 전 RELEASED 포함, CANCELLED·DRAFT 제외) 중 하나라도 {@code from_ver <= V < to_ver} 인 카테고리 행이 있으면 유효.
 * {@code BASE}(또는 빈 카테고리)는 RELEASED 버전이 하나라도 있으면 유효. 서버 {@link CodeLookup} 이 없으면 판정 불가(D2).
 */
@Component
public class CodeCategoryValidator {

    private static final String RELEASED = "RELEASED";
    private static final String BASE = "BASE";

    public enum Verdict { VALID, INVALID, UNAVAILABLE }

    private final MdmCodeLookupAvailability availability;

    public CodeCategoryValidator(MdmCodeLookupAvailability availability) {
        this.availability = availability;
    }

    public Verdict check(String maruCodeId, String cateId) {
        Optional<CodeLookup> lookup = availability.lookup();
        if (lookup.isEmpty()) {
            return Verdict.UNAVAILABLE;
        }
        Optional<CodeRows> rows = lookup.get().code(maruCodeId);
        if (rows.isEmpty()) {
            return Verdict.INVALID;
        }
        List<BigDecimal> released = rows.get().versions().stream()
                .filter(v -> RELEASED.equals(v.status())).map(CodeLookup.CodeVersionRow::ver).toList();
        if (released.isEmpty()) {
            return Verdict.INVALID;
        }
        if (cateId == null || cateId.isBlank() || BASE.equals(cateId)) {
            return Verdict.VALID;
        }
        boolean valid = rows.get().categories().stream()
                .filter(c -> cateId.equals(c.cateId()))
                .anyMatch(c -> released.stream().anyMatch(v -> c.fromVer().compareTo(v) <= 0 && v.compareTo(c.toVer()) < 0));
        return valid ? Verdict.VALID : Verdict.INVALID;
    }
}
