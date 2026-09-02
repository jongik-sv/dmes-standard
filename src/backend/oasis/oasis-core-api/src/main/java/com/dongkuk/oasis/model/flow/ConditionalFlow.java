package com.dongkuk.oasis.model.flow;

import com.dongkuk.oasis.model.Condition;

/**
 * 조건를 가지고 있는 Flow.
 *
 * @author Jeongjin Kim
 * @since 2021-01-31
 */
public interface ConditionalFlow extends Flow {
    /**
     * @return 조건
     */
    Condition<?> condition();
}
