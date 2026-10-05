package com.dongkuk.dmes.mcm.widget.admin.dto;

/**
 * commWidgetMng save 요청의 params — 정의 행 1개(스펙 2026-10-02-widget-admin-generic §4.1·§5.2).
 * 신규 정의 위젯(srcTp=D)이면 widgetId 를 비워 보낸다(서버가 {@code def.{key}} 를 만든다). configJson 은 JSON 문자열.
 */
public class WidgetDefSaveRequest {

    private String widgetId;
    private String srcTp;
    private String typeId;
    private String title;
    private String subtitle;
    private String description;
    private Integer defW;
    private Integer defH;
    private Integer minW;
    private Integer minH;
    private Integer maxW;
    private Integer maxH;
    private Integer refreshSec;
    private String linkPageId;
    private String multipleYn;
    private String categoryCd;
    private String privateYn;
    private String useYn;
    private String dataSrc;
    private String configJson;

    public WidgetDefSaveRequest() {}

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
