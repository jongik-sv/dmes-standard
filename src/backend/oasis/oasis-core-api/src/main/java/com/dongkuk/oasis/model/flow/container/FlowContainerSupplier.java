package com.dongkuk.oasis.model.flow.container;

/**
 * {@link FlowContainer} 를 반환할 수 있는 기능.
 * <p>
 * 이 인터페이스를 구현하는 구현체는 반드시 null 이 아닌  FlowContainer 를 반환 해야한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public interface FlowContainerSupplier {
    /**
     * @return {@link FlowContainer}
     */
    FlowContainer flowContainer();
}
