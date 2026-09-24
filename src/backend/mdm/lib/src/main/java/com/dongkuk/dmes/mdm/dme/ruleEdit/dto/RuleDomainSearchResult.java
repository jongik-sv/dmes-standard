package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.List;

/** {@code ruleEdit} action={@code searchDomains} 응답 — 도메인 검색 위젯 한 줄(타입·자리수·검증식) 최대 8건. */
public class RuleDomainSearchResult {

    private List<Row> rows;

    public RuleDomainSearchResult() {
    }

    public RuleDomainSearchResult(List<Row> rows) {
        this.rows = rows;
    }

    public List<Row> getRows() { return rows; }
    public void setRows(List<Row> v) { this.rows = v; }

    /** 도메인 한 행. */
    public static class Row {
        private Long domainId;
        private String stdName;
        private String domainName;
        private String domainKind;
        private String dataType;
        private Integer length;
        private Integer scale;
        private String stdRule;

        public Row() {
        }

        public Row(Long domainId, String stdName, String domainName, String domainKind, String dataType,
                   Integer length, Integer scale, String stdRule) {
            this.domainId = domainId;
            this.stdName = stdName;
            this.domainName = domainName;
            this.domainKind = domainKind;
            this.dataType = dataType;
            this.length = length;
            this.scale = scale;
            this.stdRule = stdRule;
        }

        public Long getDomainId() { return domainId; }
        public String getStdName() { return stdName; }
        public String getDomainName() { return domainName; }
        public String getDomainKind() { return domainKind; }
        public String getDataType() { return dataType; }
        public Integer getLength() { return length; }
        public Integer getScale() { return scale; }
        public String getStdRule() { return stdRule; }

        public void setDomainId(Long v) { this.domainId = v; }
        public void setStdName(String v) { this.stdName = v; }
        public void setDomainName(String v) { this.domainName = v; }
        public void setDomainKind(String v) { this.domainKind = v; }
        public void setDataType(String v) { this.dataType = v; }
        public void setLength(Integer v) { this.length = v; }
        public void setScale(Integer v) { this.scale = v; }
        public void setStdRule(String v) { this.stdRule = v; }
    }
}
