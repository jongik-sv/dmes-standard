package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.error.Error;

/**
 * 에러 이벤트 등 에러 관련 요소를 생성하기 위해 에러 정보를 임시 저장소 역할을 한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-05
 */
public interface ErrorStore {
    /**
     * 요청한 {@link Error} 반환.
     *
     * @param errorId 에러 식별자
     * @return 에러, 없으면 {@code null} 반환
     */
    Error error(String errorId);
}
