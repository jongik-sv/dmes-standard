package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/**
 * 감사 컬럼 8개(CactusAuditEntity 규약). addTable 명령이 표를 만들 때 묶음 끝에서 자동으로 덧붙인다(audit:false 면 안 붙인다).
 * 타입은 DB 사실이다 — 가져오기({@code ErdImportBuilder.typeOf})가 같은 컬럼에서 만드는 값과 같아야 한다.
 * VER 은 감사 컬럼이 아니다.
 */
public final class ErdAuditColumns {
    private ErdAuditColumns() {}

    /**
     * @param phys            물리명
     * @param dataType        물리 타입(TIMESTAMP 는 정밀도까지 한 문자열)
     * @param length          길이(없으면 null)
     * @param fallbackLogical 고정 이름 — 기존 표 DDL 의 COMMENT 와 같은 글. 사전이 논리명을 못 줄 때 논리명으로, 항상 컬럼 comment 로 쓴다
     */
    public record Spec(String phys, String dataType, Integer length, Integer scale, String fallbackLogical) {}

    /** 붙는 순서 그대로. */
    public static final List<Spec> SPECS = List.of(
            new Spec("C_USR_ID", "VARCHAR2", 100, null, "생성자 아이디"),
            new Spec("C_AT", "TIMESTAMP(6)", null, null, "생성일시"),
            new Spec("C_SVC_ID", "VARCHAR2", 100, null, "생성 서비스 아이디"),
            new Spec("C_PGM_ID", "VARCHAR2", 100, null, "생성 프로그램 아이디"),
            new Spec("U_USR_ID", "VARCHAR2", 100, null, "수정자 아이디"),
            new Spec("U_AT", "TIMESTAMP(6)", null, null, "수정일시"),
            new Spec("U_SVC_ID", "VARCHAR2", 100, null, "수정 서비스 아이디"),
            new Spec("U_PGM_ID", "VARCHAR2", 100, null, "수정 프로그램 아이디"));

    /** 감사 컬럼 물리명(붙는 순서). */
    public static final List<String> NAMES = SPECS.stream().map(Spec::phys).toList();

    /** 대소문자를 가리지 않고 감사 컬럼 물리명인지 본다. */
    public static boolean isAudit(String phys) {
        if (phys == null) return false;
        String up = phys.toUpperCase(Locale.ROOT);
        return NAMES.contains(up);
    }

    /**
     * 감사 컬럼이 아닌 컬럼을 "맨 끝"에 넣을 자리. 컬럼 순서가 감사 컬럼(8개 중 아무거나, 대소문자 무시) 몇 개로 끝나면 그 연속 구간
     * 바로 앞 index 를, 아니면 columnOrder 크기를 돌려준다. 위치를 지정하지 않은 addColumn 과 끝으로 보내는 moveColumn 이 쓴다.
     *
     * @param columnOrder 컬럼 id 순서(옮기는 컬럼은 이미 뺀 상태)
     * @param physOf      컬럼 id → 물리명
     */
    public static int endInsertIndex(List<String> columnOrder, Function<String, String> physOf) {
        int i = columnOrder.size();
        while (i > 0 && isAudit(physOf.apply(columnOrder.get(i - 1)))) i--;  // 없는 컬럼(null 물리명)은 감사가 아니다
        return i;
    }
}
