package com.dongkuk.oasis.expression.property;

import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-07-01
 */
interface PropertyValueParser {
    /**
     * @param value 파싱할 프로퍼티 표현식
     * @return 프로퍼티 값
     */
    List<PropertyExpression> parse(String value);
}
