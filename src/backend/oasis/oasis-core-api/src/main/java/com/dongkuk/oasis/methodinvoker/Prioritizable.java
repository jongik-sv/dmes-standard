package com.dongkuk.oasis.methodinvoker;

/**
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
interface Prioritizable {
    /**
     * Lowest priority value.
     */
    int PRIORITY_LOWEST = Integer.MAX_VALUE;

    /**
     * Highest priority value.
     */
    int PRIORITY_HIGHEST = 0;

    /**
     * Priority of method.
     * <p>
     * 0(Zero) is Highest priority.
     *
     * @return priority
     */
    int priority();
}
