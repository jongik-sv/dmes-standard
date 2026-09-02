package com.dongkuk.oasis.model.flow.nodes;

/**
 * 한 노드에 {@link com.dongkuk.oasis.model.flow.SequentialFlow} 가 두 개 이상 존재.
 *
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public class TooManySequentialFlowException extends RuntimeException {
private static final long serialVersionUID = 4666824679777044823L;
}
