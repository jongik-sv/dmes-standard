package com.dongkuk.dmes.cactus.mdm;

/** 도메인 메타(spec §4.3, 툴팁) — MDM {@code MetaFeedPayloads.DomainMeta} 와 필드 이름이 같다. 비즈니스식 원문은 없다. */
public record MdmDomainMeta(
        String domainId,
        String domainName,
        String stdName,
        String domainKind,
        String dataType,
        Integer length,
        Integer scale,
        String unitCode,
        String description,
        MdmColumnMeta.Expr stdExpr,
        boolean bizRuleOnServer,
        MdmColumnMeta.CodeRefMeta codeRef) {
}
