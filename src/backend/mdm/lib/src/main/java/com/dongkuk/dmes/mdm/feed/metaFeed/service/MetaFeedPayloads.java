package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import java.util.List;
import java.util.Map;

/**
 * metaFeed view 값 모양(spec 2026-10-02-mdm-meta-cache-design §4.2·§4.3). 필드 이름은 cactus {@code MdmColumnMeta}·{@code MdmDomainMeta}
 * 와 글자 그대로 같다 — 바꾸면 두 쪽과 계약 시험(MdmMetaFeedContractHttpTest)을 함께 고친다.
 */
public final class MetaFeedPayloads {

    private MetaFeedPayloads() {
    }

    /**
     * 컬럼 메타. 도메인 칸(dataType·length·scale·domain·stdExpr·bizExpr·bizRequiredVars·codeRef)은 유효 도메인에서 온다.
     * {@code matchedSystem}·{@code systemPhysName} 은 요청 키를 시스템 별칭({@code TB_MDM_COLUMN_SYSTEM})으로 찾았을 때의 시스템 코드와 저장된
     * 별칭 원문이다 — 표준 물리명으로 찾았으면 둘 다 null(spec 2026-10-03-mdm-column-system-alias-design L4). {@code physName} 은 늘 표준 물리명이다.
     */
    public record ColumnMeta(
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
            DomainRef domain,
            Expr stdExpr,
            BizExpr bizExpr,
            List<String> bizRequiredVars,
            CodeRefMeta codeRef,
            String matchedSystem,
            String systemPhysName) {
    }

    public record DomainRef(String domainId, String domainName, String domainKind) {
    }

    /** 유효 표준식 — {@code chainStdExpr}(조상~자신, CODE 의 MASTER 식 제외)과 그 AST. */
    public record Expr(String text, Map<String, Object> ast) {
    }

    /** 서버 전용 유효 비즈니스식. 화면 응답에는 존재 여부만 싣는다(cactus 가 뺀다). */
    public record BizExpr(String text) {
    }

    public record CodeRefMeta(String maruCodeId, String cateId) {
    }

    /** 도메인 메타(툴팁). 비즈니스식 원문은 싣지 않고 {@code bizRuleOnServer} 만 싣는다. */
    public record DomainMeta(
            String domainId,
            String domainName,
            String stdName,
            String domainKind,
            String dataType,
            Integer length,
            Integer scale,
            String unitCode,
            String description,
            Expr stdExpr,
            boolean bizRuleOnServer,
            CodeRefMeta codeRef) {
    }
}
