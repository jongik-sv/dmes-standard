package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

/**
 * {@code ruleEdit} action={@code parseExpr} 요청(TSK-08-03) — 식 입력 칸(ExprField)이 디바운스마다 부른다.
 * 파싱은 서버 EvalEx 가 단일 진원(불변 9)이라 화면 JS 파서를 만들지 않는다.
 */
public class RuleExprParseRequest {

    /** 식 텍스트. */
    private String text;

    /** 식 칸 종류({@code FunctionSets.Slot} 이름) — 칸이 허용 함수 집합을 정한다. */
    private String slot;

    public String getText() { return text; }
    public String getSlot() { return slot; }

    public void setText(String v) { this.text = v; }
    public void setSlot(String v) { this.slot = v; }
}
