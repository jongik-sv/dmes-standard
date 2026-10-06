package com.dongkuk.dmes.mdm.dme.ruleCalc.dto;

import java.util.ArrayList;
import java.util.List;

/** {@code ruleCalc} action=io 응답(문서 §2) — 대상 요약·입력 칸·결과 칸·세트 단계·메시지. 키는 문서와 같다. */
public class RuleCalcIoResult {

    private boolean ok;
    private Target target;
    private List<Item> inputs = new ArrayList<>();
    private List<Item> outputs = new ArrayList<>();
    private List<Step> steps = new ArrayList<>();
    private List<RuleCalcMessage> messages = new ArrayList<>();

    public boolean isOk() { return ok; }
    public Target getTarget() { return target; }
    public List<Item> getInputs() { return inputs; }
    public List<Item> getOutputs() { return outputs; }
    public List<Step> getSteps() { return steps; }
    public List<RuleCalcMessage> getMessages() { return messages; }

    public void setOk(boolean v) { this.ok = v; }
    public void setTarget(Target v) { this.target = v; }
    public void setInputs(List<Item> v) { this.inputs = v; }
    public void setOutputs(List<Item> v) { this.outputs = v; }
    public void setSteps(List<Step> v) { this.steps = v; }
    public void setMessages(List<RuleCalcMessage> v) { this.messages = v; }

    /** 대상 요약 — {@code verStatus} 는 실제로 고른 버전의 상태(RELEASED·DRAFT, 못 골랐으면 null). */
    public static class Target {
        private String tp;
        private String id;
        private String name;
        private String ver;
        private String verStatus;
        private String status;

        public String getTp() { return tp; }
        public String getId() { return id; }
        public String getName() { return name; }
        public String getVer() { return ver; }
        public String getVerStatus() { return verStatus; }
        public String getStatus() { return status; }

        public void setTp(String v) { this.tp = v; }
        public void setId(String v) { this.id = v; }
        public void setName(String v) { this.name = v; }
        public void setVer(String v) { this.ver = v; }
        public void setVerStatus(String v) { this.verStatus = v; }
        public void setStatus(String v) { this.status = v; }
    }

    /** 입력 칸·결과 칸 하나. {@code required} 는 입력만 뜻이 있다(결과는 false). */
    public static class Item {
        private String name;
        private String label;
        private String dataType;
        private Integer scale;
        private String unit;
        private boolean required;

        public String getName() { return name; }
        public String getLabel() { return label; }
        public String getDataType() { return dataType; }
        public Integer getScale() { return scale; }
        public String getUnit() { return unit; }
        public boolean isRequired() { return required; }

        public void setName(String v) { this.name = v; }
        public void setLabel(String v) { this.label = v; }
        public void setDataType(String v) { this.dataType = v; }
        public void setScale(Integer v) { this.scale = v; }
        public void setUnit(String v) { this.unit = v; }
        public void setRequired(boolean v) { this.required = v; }
    }

    /** 세트 단계 — 흐름의 RULE 노드 순서, 룰마다 만드는 결과 칸. */
    public static class Step {
        private String ruleId;
        private String name;
        private List<Item> outputs = new ArrayList<>();

        public String getRuleId() { return ruleId; }
        public String getName() { return name; }
        public List<Item> getOutputs() { return outputs; }

        public void setRuleId(String v) { this.ruleId = v; }
        public void setName(String v) { this.name = v; }
        public void setOutputs(List<Item> v) { this.outputs = v; }
    }
}
