package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.Gateway;

/**
 * @param <T> 소스 객체 타입
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
public interface GatewayBuilder<T> {
    /**
     * @param gatewayElement 게이트웨이 요소
     * @param flows          흐름
     * @return 게이트웨이 객체
     */
    Gateway buildGateway(T gatewayElement, FlowStore flows);
}
