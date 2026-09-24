package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 레이아웃 스냅샷 버전 이력 — {@code TB_MDM_LAYOUT_VER}(TSK-05-03 design.md §6.5·D2, V12). 저장해 스냅샷이 바뀔 때마다 한 행이다.
 * 상태 칼럼은 없다(03:72 "상태·승인·소유자를 두지 않는다"). 저장 일시·저장자는 감사 {@code C_AT}·{@code C_USR_ID} 다.
 *
 * <p>업무 버전 칼럼은 {@code LAYOUT_VERSION}(예약어 {@code VERSION} 을 새로 만들지 않는다) — 감사 {@code VER}(상위 클래스
 * {@code version})과 다른 칼럼이다. 복합 PK 는 {@link MdmLayoutVerId}. 연관관계 매핑을 쓰지 않는다(원시 필드).
 */
@Entity
@Table(name = "TB_MDM_LAYOUT_VER")
@IdClass(MdmLayoutVerId.class)
public class MdmLayoutVer extends CactusAuditEntity {

    @Id
    @Column(name = "LAYOUT_ID")
    private Long layoutId;

    @Id
    @Column(name = "LAYOUT_VERSION")
    private Long layoutVersion;

    @Column(name = "TOTAL_LENGTH", nullable = false)
    private int totalLength;

    /** {@code SEQUENTIAL}·{@code SIMULTANEOUS}, 최초 등록이면 null. */
    @Column(name = "SWITCH_MODE", length = 20)
    private String switchMode;

    /** 변경 종류 쉼표 목록(예 {@code FILLER_SPLIT}). */
    @Column(name = "CHANGE_KINDS", length = 200)
    private String changeKinds;

    @Column(name = "CHANGE_SUMMARY", length = 1000)
    private String changeSummary;

    /** 정규화 스냅샷 JSON(키 정렬·공백 없음) — {@code layoutVersion} 은 이 행 번호. */
    @Column(name = "SNAPSHOT_JSON", nullable = false)
    private String snapshotJson;

    protected MdmLayoutVer() {
        // JPA 기본 생성자
    }

    public MdmLayoutVer(Long layoutId, Long layoutVersion) {
        this.layoutId = layoutId;
        this.layoutVersion = layoutVersion;
    }

    public Long getLayoutId() { return layoutId; }
    public Long getLayoutVersion() { return layoutVersion; }
    public int getTotalLength() { return totalLength; }
    public String getSwitchMode() { return switchMode; }
    public String getChangeKinds() { return changeKinds; }
    public String getChangeSummary() { return changeSummary; }
    public String getSnapshotJson() { return snapshotJson; }

    public void setTotalLength(int v) { this.totalLength = v; }
    public void setSwitchMode(String v) { this.switchMode = v; }
    public void setChangeKinds(String v) { this.changeKinds = v; }
    public void setChangeSummary(String v) { this.changeSummary = v; }
    public void setSnapshotJson(String v) { this.snapshotJson = v; }
}
