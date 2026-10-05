package com.dongkuk.dmes.mcm.widget.def.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 위젯 정의·덮어쓰기 — 스펙 2026-10-02-widget-admin-generic §4.1.
 * <ul>
 *   <li>SRC_TP='C': 코드 위젯 메타 덮어쓰기. 행은 관리자가 덮어쓸 때만 생긴다(없으면 코드 값 그대로, 사용 중).</li>
 *   <li>SRC_TP='D': 관리자 정의 위젯. WIDGET_ID 는 {@code def.{key}}, 본체는 TYPE_ID 유형의 렌더러.</li>
 * </ul>
 * NULL 칸은 코드(또는 유형) 값을 쓴다. CONFIG_JSON 은 정의 설정(유형별 §6)이라 길 수 있어 LONG32VARCHAR 로 둔다
 * ({@code @Lob} 은 PostgreSQL 에서 oid 로 매핑돼 방언 간 다르게 동작한다 — W-D30).
 */
@Entity
@Table(name = "TB_MCM_WIDGET_DEF", schema = "MCMAPUSER")
public class WidgetDef extends McmAuditEntity {

    public static final String SRC_CODE = "C";
    public static final String SRC_DEF = "D";

    @Id
    @Column(name = "WIDGET_ID", length = 100, nullable = false)
    private String widgetId;

    @Column(name = "SRC_TP", length = 1, nullable = false)
    private String srcTp;

    @Column(name = "TYPE_ID", length = 40)
    private String typeId;

    @Column(name = "TITLE", length = 100)
    private String title;

    @Column(name = "SUBTITLE", length = 100)
    private String subtitle;

    @Column(name = "DESCRIPTION", length = 400)
    private String description;

    @Column(name = "DEF_W")
    private Integer defW;

    @Column(name = "DEF_H")
    private Integer defH;

    @Column(name = "MIN_W")
    private Integer minW;

    @Column(name = "MIN_H")
    private Integer minH;

    @Column(name = "MAX_W")
    private Integer maxW;

    @Column(name = "MAX_H")
    private Integer maxH;

    @Column(name = "REFRESH_SEC")
    private Integer refreshSec;

    @Column(name = "LINK_PAGE_ID", length = 200)
    private String linkPageId;

    @Column(name = "MULTIPLE_YN", length = 1)
    private String multipleYn;

    /** 분류 — 공통코드 그룹 WIDGET_CTG 값. NULL 이면 코드 위젯은 코드 메타 값, 정의 위젯은 분류 없음. */
    @Column(name = "CATEGORY_CD", length = 20)
    private String categoryCd;

    /** 비공개 — Y 면 서랍 목록에 안 보이고 검색어가 위젯 ID 와 전부 같을 때만 보인다(2026-10-05 위젯 개선 §10). */
    @Column(name = "PRIVATE_YN", length = 1)
    private String privateYn;

    @Column(name = "USE_YN", length = 1, nullable = false)
    private String useYn = "Y";

    /** 쿼리 유형의 실행 모듈(지금은 mcm 만). 그 밖 유형은 NULL. */
    @Column(name = "DATA_SRC", length = 20)
    private String dataSrc;

    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "CONFIG_JSON")
    private String configJson;

    public WidgetDef() {}

    public boolean isCodeOverride() { return SRC_CODE.equals(srcTp); }
    public boolean isDefinition() { return SRC_DEF.equals(srcTp); }
    public boolean isInUse() { return !"N".equals(useYn); }

    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public String getSrcTp() { return srcTp; }
    public void setSrcTp(String srcTp) { this.srcTp = srcTp; }
    public String getTypeId() { return typeId; }
    public void setTypeId(String typeId) { this.typeId = typeId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getDefW() { return defW; }
    public void setDefW(Integer defW) { this.defW = defW; }
    public Integer getDefH() { return defH; }
    public void setDefH(Integer defH) { this.defH = defH; }
    public Integer getMinW() { return minW; }
    public void setMinW(Integer minW) { this.minW = minW; }
    public Integer getMinH() { return minH; }
    public void setMinH(Integer minH) { this.minH = minH; }
    public Integer getMaxW() { return maxW; }
    public void setMaxW(Integer maxW) { this.maxW = maxW; }
    public Integer getMaxH() { return maxH; }
    public void setMaxH(Integer maxH) { this.maxH = maxH; }
    public Integer getRefreshSec() { return refreshSec; }
    public void setRefreshSec(Integer refreshSec) { this.refreshSec = refreshSec; }
    public String getLinkPageId() { return linkPageId; }
    public void setLinkPageId(String linkPageId) { this.linkPageId = linkPageId; }
    public String getMultipleYn() { return multipleYn; }
    public void setMultipleYn(String multipleYn) { this.multipleYn = multipleYn; }
    public String getCategoryCd() { return categoryCd; }
    public void setCategoryCd(String categoryCd) { this.categoryCd = categoryCd; }
    public String getPrivateYn() { return privateYn; }
    public void setPrivateYn(String privateYn) { this.privateYn = privateYn; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
    public String getDataSrc() { return dataSrc; }
    public void setDataSrc(String dataSrc) { this.dataSrc = dataSrc; }
    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
}
