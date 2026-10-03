package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import java.util.List;
import java.util.Map;

/**
 * metaFeed view 값 모양(spec 2026-10-02-mdm-meta-cache-design §4.2·§4.3). 필드 이름은 cactus {@code MdmColumnMeta}·{@code MdmDomainMeta}
 * 와 글자 그대로 같다 — 바꾸면 두 쪽과 계약 시험(MdmMetaFeedContractHttpTest)을 함께 고친다. 컬럼 칸을 더하면 cactus {@code MdmScreenColumn}
 * (화면 메타, {@code of})·cactus 시험의 생성자 호출부·mls {@code NoticeMgmtMdmRealValidatorTest}·백엔드 가이드 §11 도 함께 고친다. 새 칸은 맨 끝에
 * 붙인다(옛 cactus 는 모르는 칸을 무시하므로 MDM 이 먼저 배포돼도 깨지지 않는다). 예외: {@code ColumnMeta.descriptionHtml}(D-150)은 MDM 이
 * 먼저 내보내고 cactus 레코드에는 아직 없다 — cactus 전달과 화면 카드는 메타 캐시 세션이 맡는다.
 */
public final class MetaFeedPayloads {

    private MetaFeedPayloads() {
    }

    /**
     * 컬럼 메타. 도메인 칸(dataType·length·scale·domain·stdExpr·bizExpr·bizRequiredVars·codeRef)은 유효 도메인에서 온다.
     * {@code matchedSystem}·{@code systemPhysName} 은 요청 키를 시스템 별칭({@code TB_MDM_COLUMN_SYSTEM})으로 찾았을 때의 시스템 코드와 저장된
     * 별칭 원문이다 — 표준 물리명으로 찾았으면 둘 다 null(spec 2026-10-03-mdm-column-system-alias-design L4). {@code physName} 은 늘 표준 물리명이다.
     *
     * <p>{@code descriptionHtml}(D-150) — 설명이 HTML(알려진 태그, {@code ColumnDescriptionFormat})이면 소독본이고 {@code description} 은 그 글자만
     * (블록·{@code br} 경계에서 줄바꿈)이다. 일반 글이면 null 이고 {@code description} 은 저장된 그대로다. 그래서 글자만 그리는 옛 소비자는 태그 대신
     * 글자를 본다. {@code usageNote} 도 HTML 이면 같은 방식으로 글자만 싣고, 그 HTML 칸({@code usageNoteHtml})은 두지 않는다.
     * {@code description}·{@code usageNote} 는 늘 글자로 그리는 칸이다 — 글자만 뽑은 결과가 HTML 꼴일 수 있으므로 소비자가 형식을 다시 판별하지
     * 않는다(백엔드 가이드 §11).
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
            String systemPhysName,
            String descriptionHtml) {
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
