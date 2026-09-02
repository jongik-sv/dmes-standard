package com.dongkuk.oasis.model.flow;

import com.dongkuk.oasis.model.Element;

/**
 * 요소와 요소간 연관관계를 정의하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface Flow extends Element {
    /**
     * @return 출발지 요소 객체 식별자
     */
    String sourceElementId();

    /**
     * @return 도착지 요소 객체 식별자
     */
    String targetElementId();

}
