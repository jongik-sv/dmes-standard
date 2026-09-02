package com.dongkuk.oasis.unmarshal;

import java.util.Set;

/**
 * 프로세스 요소 읽어 게이트웨이 레벨 {@link G} 개체로 반환하는 인터페이스.
 *
 * @param <P> 프로세스 개체 타입
 * @param <G> 게이트웨이 개체 타입
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public interface GatewayElementFromProcessElement<P, G> {
    /**
     * 프로세스 요소 읽어 게이트웨이 레벨 {@link G} 개체로 반환.
     *
     * @param processElement 프로세스 요소 개체
     * @return 게이트웨이 레벨 {@link G} 개체 집합
     */
    Set<G> gatewayElement(P processElement);
}
