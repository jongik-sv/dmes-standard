package com.dongkuk.oasis.execution;

/**
 * {@link Executable}를 실행시켜주는 요소 실행기이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
public interface ElementExecutorFactory {
    /**
     * @return ElementExecutor
     */
    ElementExecutor generateElementExecutor();

}
