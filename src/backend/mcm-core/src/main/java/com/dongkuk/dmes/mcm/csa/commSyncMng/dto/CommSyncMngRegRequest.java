/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commSyncMng OASIS BPMN serviceTask `reg` 액션 요청 DTO — 단일 action.
 *       (W8 / csa 9 화면 8번째 — 동기화 관리)
 *
 * 분석리포트 §10.1 / 기능설계서 §10.1 / BPMN설계서 §5.1 인용.
 *
 *  - pSyncTarget : 6 enum (MASTER / RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT) — xfdl S-002 cbo_SyncTarget.value
 *
 * dsObject / dsMain 은 BPMN grids.{key}.rows → method param List<Map> 자동 매핑 (W7 pwdinit 정본 패턴).
 *
 * To-Be 정책 (분석 §11.0 / Q-001~Q-010 해소 2026-05-31):
 *  - Q-001 — 본 화면 책임 = MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_DETAIL / TB_MCM_CODE_CATEGORY)
 *  - Q-002 — Oracle DB Link 폐기 → 단일 MSSQL 단일 업무 DB (런타임 DB Link 변수 빈문자열 고정)
 *  - Q-007 — package = com.dongkuk.dmes.mcm.csa.commSyncMng.dto (mcm-core 모듈)
 */
package com.dongkuk.dmes.mcm.csa.commSyncMng.dto;

/**
 * commSyncMng `reg` action — 동기화 실행 (이행) 요청 DTO (W8).
 *
 * <p>BPMN flow (commSyncMng.bpmn):
 * <ul>
 *   <li>StartEvent → ExclusiveGateway (input=action) → action="reg" → regTask (commSyncMngService.reg) → EndEvent</li>
 *   <li>dto property: {@code com.dongkuk.dmes.mcm.csa.commSyncMng.dto.CommSyncMngRegRequest}</li>
 *   <li>grids: {@code dsMain} / {@code dsObject} (xfdl Dataset id 보존 — service method 시그니처와 1:1 매핑)</li>
 *   <li>output: {@code result}</li>
 * </ul>
 *
 * <p>params (xfdl:145~159 — fn_sync → gfn_transaction sArgument):
 * <ul>
 *   <li>{@code pSyncTarget} — 6 enum 처리유형 (MASTER / RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT)</li>
 * </ul>
 *
 * <p>검증 (분석 §11.4 SQL Injection 대응 / 기능 §11 V-001~V-010):
 * <ul>
 *   <li>V-001: pSyncTarget ∈ {MASTER, RULE, RULE_JUDGE, INTERFACE, FORMAT, OBJECT} — 그 외 거부</li>
 *   <li>V-007: dsMain.targetid prefix ∈ {MA, RA, RB, NU} — 그 외 거부 (Service 단에서 검증)</li>
 * </ul>
 */
public class CommSyncMngRegRequest {

    /**
     * 처리유형 (6 enum).
     * <p>xfdl cbo_SyncTarget.value (S-002) — null 검증은 fn_msgSaveCallBack (xfdl:134~137) 와 동일.
     */
    private String pSyncTarget;

    public CommSyncMngRegRequest() {
        // Jackson 역직렬화용 기본 생성자
    }

    public String getPSyncTarget() {
        return pSyncTarget;
    }

    public void setPSyncTarget(String pSyncTarget) {
        this.pSyncTarget = pSyncTarget;
    }
}
