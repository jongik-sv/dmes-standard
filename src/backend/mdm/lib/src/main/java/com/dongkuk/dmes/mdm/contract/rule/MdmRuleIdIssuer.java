package com.dongkuk.dmes.mdm.contract.rule;

/**
 * 룰 안 식별자 발급 — 구현 TSK-08-02(첫 소비자, 규칙표 #1 실측 담당). TSK-08-01 design.md D8.
 *
 * <p>{@code TB_MDM_RULE} 의 kind 카운터를 결과 집합을 돌려주는 단일 UPDATE(SQLite RETURNING)로
 * count 만큼 올리고 새 구간을 돌려준다. 한 번 쓴 번호는 행을 지워도 다시 쓰지 않고, 버전 복사는 번호를 유지하며 발급하지
 * 않는다(06:931). 감사 칼럼은 구현이 {@code MdmNativeAuditSupport} 로 명시한다(규칙표 §2).
 * count 가 1 보다 작거나 룰이 없으면 구현이 예외를 던진다.
 */
public interface MdmRuleIdIssuer {

    MdmRuleIdRange issue(String maruRuleId, MdmRuleIdKind kind, int count);
}
