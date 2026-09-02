package com.dongkuk.oasis.model.flow.nodes;

/**
 * 허용되지 않은 {@link com.dongkuk.oasis.model.flow.Flow}가 존재하거나
 * <p>
 * 필요한 {@link com.dongkuk.oasis.model.flow.Flow}가 없는 경우.
 *
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public class IllegalFlowException extends RuntimeException {
    private static final long serialVersionUID = 4651086009748097391L;

    /**
     * @param message 상세 메시지
     */
    public IllegalFlowException(String message) {
        super(message);
    }
}
