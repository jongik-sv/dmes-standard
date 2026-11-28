package com.dongkuk.dmes.mdm.common.dictionary;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import java.util.List;

/**
 * 컬럼의 유효 타입·길이·소수 자릿수와 그 출처(2026-11-26 컬럼 기본 타입 결정).
 *
 * <p>규칙 하나: 도메인이 있고 그 체인을 조립할 수 있으면 도메인 유효 값({@link DomainChainAssembler#typeOf}), 아니면 컬럼 기본 타입
 * ({@code TB_MDM_COLUMN.DATA_TYPE·LENGTH·SCALE}). 둘 다 없으면 {@link #NONE}. 룰 변수의 DOMAIN_ID → DATA_TYPE 순서와 같다.
 * 도메인 있는 컬럼의 결과는 기본 타입 칸과 무관하다(도메인 있는 컬럼 결과 불변).
 *
 * @param dataType 유효 데이터 타입(NUMBER·STRING·BOOLEAN·DATE) 또는 null
 * @param source   {@link Source}
 */
public record ColumnEffectiveType(String dataType, Integer length, Integer scale, Source source) {

    /** 유효 타입의 출처. 응답에는 {@code name()} 그대로 싣는다. */
    public enum Source { DOMAIN, BASE, NONE }

    public static final ColumnEffectiveType NONE = new ColumnEffectiveType(null, null, null, Source.NONE);

    /**
     * 컬럼 하나의 유효 타입. {@code snapshot} 에는 컬럼 도메인의 조상까지 모두 들어 있어야 한다
     * ({@link ColumnEffectiveTypes#snapshotWithAncestors} 또는 도메인 전체 스냅샷).
     */
    public static ColumnEffectiveType of(MdmColumn column, DomainTreeSnapshot snapshot) {
        ColumnEffectiveType byDomain = ofDomain(column.getDomainId(), snapshot);
        return byDomain != null ? byDomain : ofBase(column.getDataType(), column.getLength(), column.getScale());
    }

    /** 도메인 체인의 유효 값. 도메인이 없거나 스냅샷에 없거나 순환이면 null(→ 기본 타입으로 넘어간다). */
    public static ColumnEffectiveType ofDomain(Long domainId, DomainTreeSnapshot snapshot) {
        if (domainId == null || snapshot == null || snapshot.find(domainId).isEmpty()) {
            return null;
        }
        List<DomainNode> chain;
        try {
            chain = snapshot.chainRootFirst(domainId);
        } catch (DomainTreeSnapshot.CycleException e) {
            return null;
        }
        DomainChainAssembler.TypeSpec type = DomainChainAssembler.typeOf(chain);
        if (type.dataType() == null || type.dataType().isBlank()) {
            return null;
        }
        return new ColumnEffectiveType(type.dataType(), type.length(), type.scale(), Source.DOMAIN);
    }

    /** 컬럼 기본 타입. 타입이 비면 {@link #NONE}. */
    public static ColumnEffectiveType ofBase(String dataType, Integer length, Integer scale) {
        if (dataType == null || dataType.isBlank()) {
            return NONE;
        }
        return new ColumnEffectiveType(dataType, length, scale, Source.BASE);
    }

    /** 출처 이름 — {@link Source#NONE} 은 null 로 싣는다(타입 없음). */
    public String sourceName() {
        return source == Source.NONE ? null : source.name();
    }
}
