package com.dongkuk.oasis.model;

import java.util.Collection;

/**
 * @author Jeongjin Kim
 * @since 2021-07-23
 */
public interface ParallelGatewayFork {
    /**
     * @return 대상 요소
     */
    Collection<String> targetElementIds();
}
