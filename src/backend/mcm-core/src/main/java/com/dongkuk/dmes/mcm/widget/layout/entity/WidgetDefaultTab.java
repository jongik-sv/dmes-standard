package com.dongkuk.dmes.mcm.widget.layout.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 기본 탭 머리 — 관리자가 전사({@code *})·부서 키에 두는 「홈」 밖의 탭(docs/widget-2026-10/design-widget-tabs.md §1·§2).
 * TAB_ID 는 {@code def-N} 이고 모든 키에서 하나뿐이다(TAB_ID 단독 유일 제약). 사용자는 이 탭을 지우거나 이름을 바꿀 수 없고
 * 배치만 개인화한다(재정의 행은 사용자 탭 테이블에 같은 TAB_ID 로 둔다). 「홈」 기본 배치는 {@link WidgetDefaultLayout} 이 맡는다.
 */
@Entity
@Table(name = "TB_MCM_WIDGET_DEFAULT_TAB", schema = "MCMAPUSER",
        uniqueConstraints = @UniqueConstraint(name = "UK_MCM_WIDGET_DEFAULT_TAB_ID", columnNames = "TAB_ID"))
@IdClass(WidgetDefaultTabId.class)
public class WidgetDefaultTab extends McmAuditEntity {

    /** 기본 탭 ID 접두. */
    public static final String TAB_ID_PREFIX = "def-";

    @Id
    @Column(name = "LAYOUT_KEY", length = 30, nullable = false)
    private String layoutKey;

    @Id
    @Column(name = "TAB_ID", length = 30, nullable = false)
    private String tabId;

    @Column(name = "TAB_NM", length = 60, nullable = false)
    private String tabNm;

    /** 표시 순서(1부터). 사용자 화면에서는 「홈」 다음에 이 순서로 고정된다. */
    @Column(name = "TAB_SEQ", nullable = false)
    private Integer tabSeq;

    public WidgetDefaultTab() {}

    public String getLayoutKey() { return layoutKey; }
    public void setLayoutKey(String layoutKey) { this.layoutKey = layoutKey; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getTabNm() { return tabNm; }
    public void setTabNm(String tabNm) { this.tabNm = tabNm; }
    public Integer getTabSeq() { return tabSeq; }
    public void setTabSeq(Integer tabSeq) { this.tabSeq = tabSeq; }
}
