package com.dongkuk.dmes.cactus.mdm;

import java.util.List;
import java.util.Map;

/**
 * 컬럼 메타(spec 2026-10-02-mdm-meta-cache-design §4.2) — MDM {@code MetaFeedPayloads.ColumnMeta} 와 필드 이름이 같다.
 * {@code matchedSystem}·{@code systemPhysName} 은 시스템 별칭으로 맞았을 때만 있다(그 시스템 코드와 저장된 별칭 원문 — {@code physName} 은 늘 표준 물리명,
 * 표준 이름으로 맞았거나 옛 MDM 응답이면 null; spec 2026-10-03-mdm-column-system-alias-design §3).
 * 엔진용 {@code ColumnDefinition} 과 화면 메타는 이 값에서 만든다({@link MdmDefinitionLookup}, {@link MdmScreenColumn}).
 */
public record MdmColumnMeta(
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

    public record DomainRef(String domainId, String domainName, String domainKind) {
    }

    /** 유효 표준식(chainStdExpr)과 AST. */
    public record Expr(String text, Map<String, Object> ast) {
    }

    /** 서버 전용 유효 비즈니스식 — 화면 응답에는 싣지 않는다(예외: SYSADMIN 캐시 항목 상세 {@code mdmMeta/entry}, 2026-10-02 사용자 결정). */
    public record BizExpr(String text) {
    }

    public record CodeRefMeta(String maruCodeId, String cateId) {
    }
}
