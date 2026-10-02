package com.dongkuk.dmes.cactus.mdm;

import java.util.List;

/**
 * 화면용 컬럼 메타(spec 2026-10-02-mdm-meta-cache-design §4.2) — 컬럼 메타에서 비즈니스식 원문을 빼고 존재 여부({@code bizRuleOnServer})만,
 * 코드 참조가 있으면 오늘 기준 허용 코드({@code allowedCodes})를 더한다. 코드 참조가 없거나 허용 코드를 풀 수 없으면(코드 원본을 MDM 에서 받지
 * 못함 등) null 이다 — 빈 목록은 "풀었는데 허용 코드가 없다"이다. 허용 코드를 풀지 못해도 컬럼 메타 자체는 그대로 준다.
 */
public record MdmScreenColumn(
        String physName,
        String columnName,
        String labelLong,
        String labelMid,
        String labelShort,
        String description,
        String usageNote,
        String dataType,
        Integer length,
        Integer scale,
        boolean required,
        String defaultValue,
        String refKind,
        String refTarget,
        String refCateId,
        MdmColumnMeta.DomainRef domain,
        MdmColumnMeta.Expr stdExpr,
        boolean bizRuleOnServer,
        List<String> bizRequiredVars,
        MdmColumnMeta.CodeRefMeta codeRef,
        List<AllowedCode> allowedCodes) {

    public record AllowedCode(String code, String name) {
    }

    public static MdmScreenColumn of(MdmColumnMeta m, List<AllowedCode> allowedCodes) {
        return new MdmScreenColumn(m.physName(), m.columnName(), m.labelLong(), m.labelMid(), m.labelShort(), m.description(),
                m.usageNote(), m.dataType(), m.length(), m.scale(), m.required(), m.defaultValue(), m.refKind(), m.refTarget(),
                m.refCateId(), m.domain(), m.stdExpr(), m.bizExpr() != null && m.bizExpr().text() != null,
                m.bizRequiredVars() == null ? List.of() : m.bizRequiredVars(), m.codeRef(), allowedCodes);
    }
}
