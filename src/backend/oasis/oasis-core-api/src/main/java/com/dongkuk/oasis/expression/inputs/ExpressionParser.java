package com.dongkuk.oasis.expression.inputs;

public interface ExpressionParser<T, R> {
    /**
     * 표현식을 파싱해서 결과를 반환한다.
     *
     * @param expression 표현식
     * @param objects 표현식에 바인딩할 객체들
     * @return 파싱 결과
     */
    R parse(T expression, Object... objects);

    /**
     * 파싱 가능 여부를 반환한다.
     *
     * @param expression 표현식
     * @param objects 표현식에 바인딩할 객체들
     * @return 파싱 가능 여부
     */
    boolean canParse(T expression, Object... objects);
}
