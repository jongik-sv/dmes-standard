package com.dongkuk.oasis.methodinvoker;

import java.util.List;

/**
 * It is an interface that returns an appropriate object according to its priority.
 * The choice of high priority or low priority depends on the implementation details.
 * If the same priority is found and the selection cannot be made, {@link PriorityPickingException} is thrown.
 *
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
interface PriorityPicker {
    /**
     * It returns an appropriate object according to its priority.
     *
     * @param candidates to pick. Not null
     * @return an appropriate object according to its priority
     * @throws PriorityPickingException If there is more than one of the highest priority
     */
    Prioritizable pick(List<? extends Prioritizable> candidates);
}
