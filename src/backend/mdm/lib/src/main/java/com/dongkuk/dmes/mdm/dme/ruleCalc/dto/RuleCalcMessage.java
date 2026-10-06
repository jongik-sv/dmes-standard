package com.dongkuk.dmes.mdm.dme.ruleCalc.dto;

/** {@code ruleCalc} 응답 메시지 한 건 {@code {code, text}}(문서 §3.1 코드표). */
public class RuleCalcMessage {

    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String NO_RELEASED = "NO_RELEASED";
    public static final String RULE_DEPRECATED = "RULE_DEPRECATED";
    public static final String INPUT_MISSING = "INPUT_MISSING";
    public static final String INPUT_INVALID = "INPUT_INVALID";
    public static final String EVAL_ERROR = "EVAL_ERROR";

    private String code;
    private String text;

    public RuleCalcMessage() {
    }

    public RuleCalcMessage(String code, String text) {
        this.code = code;
        this.text = text;
    }

    public String getCode() { return code; }
    public String getText() { return text; }

    public void setCode(String v) { this.code = v; }
    public void setText(String v) { this.text = v; }
}
