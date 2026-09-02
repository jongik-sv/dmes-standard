package com.dongkuk.oasis.model;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
public class StringExpressionCondition implements Condition<String> {
    private final String conditionExpression;

    /**
     * @param conditionExpression 조건 표현식
     */
    public StringExpressionCondition(String conditionExpression) {
        if (conditionExpression == null)
            throw new IllegalArgumentException();
        this.conditionExpression = conditionExpression;
    }

    @Override
    public String conditionExpression() {
        return conditionExpression;
    }
}
