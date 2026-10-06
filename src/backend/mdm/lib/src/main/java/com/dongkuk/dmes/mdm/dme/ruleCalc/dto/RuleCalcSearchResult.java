package com.dongkuk.dmes.mdm.dme.ruleCalc.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;

/** {@code ruleCalc} action=search 응답(문서 §2) — {@code {ok, rows, messages}}. 키는 문서와 같다. */
public class RuleCalcSearchResult {

    private boolean ok;
    private List<Row> rows = new ArrayList<>();
    private List<RuleCalcMessage> messages = new ArrayList<>();

    public boolean isOk() { return ok; }
    public List<Row> getRows() { return rows; }
    public List<RuleCalcMessage> getMessages() { return messages; }

    public void setOk(boolean v) { this.ok = v; }
    public void setRows(List<Row> v) { this.rows = v; }
    public void setMessages(List<RuleCalcMessage> v) { this.messages = v; }

    /**
     * 찾은 룰·세트 한 건. {@code ver}·{@code verStatus} 는 {@code view} 가 고르는 것과 같은 버전(scale 3 글자, RELEASED 또는 preview 때의 내 DRAFT).
     * {@code desc} 는 헤더 설명이 있을 때만 나간다(없으면 키 자체가 없다).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Row {
        private String tp;
        private String id;
        private String name;
        private String ver;
        private String verStatus;
        private String desc;

        public String getTp() { return tp; }
        public String getId() { return id; }
        public String getName() { return name; }
        public String getVer() { return ver; }
        public String getVerStatus() { return verStatus; }
        public String getDesc() { return desc; }

        public void setTp(String v) { this.tp = v; }
        public void setId(String v) { this.id = v; }
        public void setName(String v) { this.name = v; }
        public void setVer(String v) { this.ver = v; }
        public void setVerStatus(String v) { this.verStatus = v; }
        public void setDesc(String v) { this.desc = v; }
    }
}
