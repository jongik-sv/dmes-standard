/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecMenu 엔티티 — TB_MCM_SEC_MENU (메뉴 항목 마스터) 본 컬럼 1:1 정의 (commMenuMng 화면 owner)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 메뉴 항목 마스터 — {@code TB_MCM_SEC_MENU} (As-Is) JPA Entity (commMenuMng 화면 owner / W2).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — 사용자 결정).
 * 테이블명 대문자 prefix 보존 (분석리포트 §11.1).
 *
 * <p>분석리포트 §9.1 — TB_MCM_SEC_MENU 본 15 컬럼 (PARENT_MENU_ID 가 본 행의 MENU_ID 자기참조 — As-Is 보존):
 * <ul>
 *   <li>PK 복합 = (MENU_ID, MENU_SEQ) — xml:101/107 WHERE 절</li>
 *   <li>본 15 컬럼: MENU_ID(PK) / MENU_SEQ(PK) / FULL_SEQ / MENU_NM / MENU_DESC / MENU_TP /
 *       OBJECT_ID(FK) / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / MENU_VIEW_YN /
 *       PARENT_MENU_ID (xml:77/96 = #{MENU_ID} 자기참조 보존) /
 *       MENU_PARAM1 / MENU_PARAM2 / MENU_PARAM3</li>
 * </ul>
 *
 * <p>As-Is {@code ref_Audit} fragment (CREATED_OBJECT_* / LAST_UPDATED_* 8 컬럼) 폐기 →
 * mcm-core {@link McmAuditEntity} 의 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER 9 컬럼 + JPA {@code @PrePersist} / {@code @PreUpdate}
 * 자동 채움 (정책 #6 (A) Entity 명명 단축형 / cma 정본 패턴).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1 (As-Is 컬럼 카탈로그 24 행 = 본 15 + audit 9)</li>
 *   <li>분석리포트 §11.1 (To-Be 명명 안 — Entity = SecMenu / Repository = SecMenuRepository / 모듈 단위 평탄)</li>
 *   <li>As-Is Mapper {@code CommMenuMngMapper.selectCommMenuMng / insertCommMenuMng / updateCommMenuMng / deleteCommMenuMng}</li>
 *   <li>기존 mcm-core legacy entity ({@code com.dongkuk.dmes.mcm.menu.entity.*}) 와 별도 — 본 entity 는 csa commMenuMng 화면 owner</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_MENU", schema = "MCMAPUSER")
public class SecMenu extends McmAuditEntity {

    /**
     * PK — 메뉴 ID (xfdl G-003 / D-002 / 분석 §9.1 #1). VARCHAR(30).
     * <p>2026-06-05 사용자 결정 — 단독 PK 로 변경 (기존 복합 (MENU_ID, MENU_SEQ) → MENU_ID).
     * MENU_SEQ 는 PK 에서 분리되어 순수 "메뉴 순서" 컬럼으로 사용. FULL_SEQ 는 자동부여 정렬값.
     */
    @Id
    @Column(name = "MENU_ID", length = 30, nullable = false)
    private String menuId;

    /**
     * 메뉴 순서 (xfdl G-002 / D-005 / 분석 §9.1 #2). VARCHAR(30).
     * <p>2026-06-05 — PK 에서 분리. 순수 순서 필드 (입력 숫자만 + 저장 시 '0' LPAD 8자리 "12"→"00000012").
     * PK 가 아니므로 insert/update 모두 LPAD 안전.
     */
    @Column(name = "MENU_SEQ", length = 30)
    private String menuSeq;

    /** FULL 정렬 순서 (xfdl G-006 / D-009 inputtype=digit / 분석 §9.1 #3). VARCHAR(30). */
    @Column(name = "FULL_SEQ", length = 30)
    private String fullSeq;

    /** 메뉴 명칭 (xfdl G-004 / D-006 Essential / 분석 §9.1 #4). VARCHAR(300). */
    @Column(name = "MENU_NM", length = 300)
    private String menuNm;

    /** 메뉴 설명 (xfdl G-012 / D-015 txa_menu_desc / 분석 §9.1 #5). VARCHAR(1000). */
    @Column(name = "MENU_DESC", length = 1000)
    private String menuDesc;

    /**
     * 메뉴 타입 (xfdl G-008 / D-011 cbo_menu_tp 내부 LV-003 WEB/MOBIL / 분석 §9.1 #6).
     * 신규 행 default 'WEB' (xfdl:688/718). VARCHAR(10).
     */
    @Column(name = "MENU_TP", length = 10)
    private String menuTp;

    /**
     * 연결 OBJECT 식별자 — FK to TB_MCM_SEC_OBJ.OBJECT_ID (xfdl G-005 / D-007 Essential commonDynamic LoV /
     * 분석 §9.1 #7). 저장 필수 (V-002 — fn_before_save_chk 의 4 필수 컬럼). VARCHAR(50).
     */
    @Column(name = "OBJECT_ID", length = 50)
    private String objectId;

    /**
     * 사용 여부 — "Y" / "N" (xfdl G-007 / S-004 / D-010 rdo_use_tp LV-001 / 분석 §9.1 #8).
     * 신규 행 default 'Y' (xfdl:689/719). VARCHAR(1).
     */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    /**
     * 유효 개시일 (xfdl G-009 / D-012 cal_start_active_date displaytype=date / 분석 §9.1 #9).
     * As-Is 신규 행 default {@code gfn_today()} 8자 (xfdl:690/720). DATETIME2.
     */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDateTime startActiveDate;

    /**
     * 유효 기한일 (xfdl G-010 / D-013 cal_end_active_date / 분석 §9.1 #10).
     * As-Is 신규 행 default "99991231" 8자 (xfdl:691/721) → To-Be 정정 (cma 패턴) = {@code 9999-12-31 23:59:59}.
     * DATETIME2.
     */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDateTime endActiveDate;

    /**
     * 표시 여부 — "Y" / "N" (xfdl G-011 / D-014 rdo_menu_view_yn LV-002 / 분석 §9.1 #11).
     * 신규 행 default 'Y' (xfdl:692/722). VARCHAR(1).
     */
    @Column(name = "MENU_VIEW_YN", length = 1)
    private String menuViewYn;

    /**
     * 상위 메뉴 ID (xfdl D-008 readonly / 분석 §9.1 #12).
     * <b>As-Is 보존 특이사항</b>: INSERT (xml:77) / UPDATE (xml:96) 시 PARENT_MENU_ID = #{MENU_ID} 자기참조 세트
     * (분석 §12 결정 누적 — D-008 의 cbo_menu_id text 첫 공백 전 substr 이 실제 부모 ID 라는 As-Is 의도).
     * VARCHAR(30).
     */
    @Column(name = "PARENT_MENU_ID", length = 30)
    private String parentMenuId;

    /** 메뉴 PARAM1 (xfdl D-016 / 분석 §9.1 #13). VARCHAR(300). */
    @Column(name = "MENU_PARAM1", length = 300)
    private String menuParam1;

    /** 메뉴 PARAM2 (xfdl D-017 / 분석 §9.1 #14). VARCHAR(300). */
    @Column(name = "MENU_PARAM2", length = 300)
    private String menuParam2;

    /** 메뉴 PARAM3 (xfdl D-018 / 분석 §9.1 #15). VARCHAR(300). */
    @Column(name = "MENU_PARAM3", length = 300)
    private String menuParam3;

    public SecMenu() {}

    // ── getter / setter ──

    public String getMenuId() { return menuId; }
    public void setMenuId(String menuId) { this.menuId = menuId; }

    public String getMenuSeq() { return menuSeq; }
    public void setMenuSeq(String menuSeq) { this.menuSeq = menuSeq; }

    public String getFullSeq() { return fullSeq; }
    public void setFullSeq(String fullSeq) { this.fullSeq = fullSeq; }

    public String getMenuNm() { return menuNm; }
    public void setMenuNm(String menuNm) { this.menuNm = menuNm; }

    public String getMenuDesc() { return menuDesc; }
    public void setMenuDesc(String menuDesc) { this.menuDesc = menuDesc; }

    public String getMenuTp() { return menuTp; }
    public void setMenuTp(String menuTp) { this.menuTp = menuTp; }

    public String getObjectId() { return objectId; }
    public void setObjectId(String objectId) { this.objectId = objectId; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDateTime getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDateTime startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDateTime getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDateTime endActiveDate) { this.endActiveDate = endActiveDate; }

    public String getMenuViewYn() { return menuViewYn; }
    public void setMenuViewYn(String menuViewYn) { this.menuViewYn = menuViewYn; }

    public String getParentMenuId() { return parentMenuId; }
    public void setParentMenuId(String parentMenuId) { this.parentMenuId = parentMenuId; }

    public String getMenuParam1() { return menuParam1; }
    public void setMenuParam1(String menuParam1) { this.menuParam1 = menuParam1; }

    public String getMenuParam2() { return menuParam2; }
    public void setMenuParam2(String menuParam2) { this.menuParam2 = menuParam2; }

    public String getMenuParam3() { return menuParam3; }
    public void setMenuParam3(String menuParam3) { this.menuParam3 = menuParam3; }
}
