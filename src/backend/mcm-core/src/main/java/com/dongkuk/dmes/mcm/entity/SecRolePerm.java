/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecRolePerm 엔티티 — TB_MCM_SEC_ROLE_PERM (직무×오브젝트 퍼미션, 퍼미션 모델 v2)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 직무×오브젝트 퍼미션 — {@code TB_MCM_SEC_ROLE_PERM}(V20).
 *
 * <p>옛 {@code TB_MCM_SEC_PERM}(묶음) + {@code TB_MCM_SEC_ROLE_MAPPING}(직무×오브젝트×묶음)을 대신한다(D9·D10).
 * 한 직무·한 오브젝트에 1건이다. 값은 쉼표로 이은 action 코드다({@code security.perm.PermTokens} 로 읽고 쓴다).
 *
 * <ul>
 *   <li>효과 = {@code (btnPerm ∩ SecObj.btnPerm) ∪ (popupPerm ∩ SecObj.popupPerm)}(D7·D8·D15)</li>
 *   <li>{@code btnPerm} 은 비지 않는다(D14). 저장 서비스가 빈 값을 {@code PERM_EMPTY_BTN} 으로 거절한다</li>
 *   <li>USE_TP·유효 기간 없음(D16). 직무·오브젝트 쪽 값으로 거른다</li>
 *   <li>FK(직무·오브젝트) ON DELETE 없음(D19)</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_ROLE_PERM", schema = "MCMAPUSER")
@IdClass(SecRolePermId.class)
public class SecRolePerm extends McmAuditEntity {

    /** PK#1 — 직무 아이디(FK → TB_MCM_SEC_ROLE). VARCHAR(30). */
    @Id
    @Column(name = "ROLE_ID", length = 30, nullable = false)
    private String roleId;

    /** PK#2 — 오브젝트 아이디(FK → TB_MCM_SEC_OBJ). VARCHAR(50). */
    @Id
    @Column(name = "OBJECT_ID", length = 50, nullable = false)
    private String objectId;

    /** 버튼 권한 — action 코드, 쉼표 구분. 필수. VARCHAR(1000). */
    @Column(name = "BTN_PERM", length = 1000, nullable = false)
    private String btnPerm;

    /** 팝업 권한 — 팝업을 여는 action 코드, 쉼표 구분. VARCHAR(1000). */
    @Column(name = "POPUP_PERM", length = 1000)
    private String popupPerm;

    /** 데이터 권한 — 쉼표 구분. 이번 회차는 조회·저장 통과만(D21). VARCHAR(1000). */
    @Column(name = "DATA_PERM", length = 1000)
    private String dataPerm;

    public SecRolePerm() {}

    public SecRolePerm(String roleId, String objectId, String btnPerm, String popupPerm, String dataPerm) {
        this.roleId = roleId;
        this.objectId = objectId;
        this.btnPerm = btnPerm;
        this.popupPerm = popupPerm;
        this.dataPerm = dataPerm;
    }

    /** 이 행의 PK 값. */
    public SecRolePermId id() { return new SecRolePermId(roleId, objectId); }

    // ── getter / setter ──

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getObjectId() { return objectId; }
    public void setObjectId(String objectId) { this.objectId = objectId; }

    public String getBtnPerm() { return btnPerm; }
    public void setBtnPerm(String btnPerm) { this.btnPerm = btnPerm; }

    public String getPopupPerm() { return popupPerm; }
    public void setPopupPerm(String popupPerm) { this.popupPerm = popupPerm; }

    public String getDataPerm() { return dataPerm; }
    public void setDataPerm(String dataPerm) { this.dataPerm = dataPerm; }
}
