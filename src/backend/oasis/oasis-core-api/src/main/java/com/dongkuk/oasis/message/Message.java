package com.dongkuk.oasis.message;

/**
 * 서비스 수행중 메시지 테스크에서 만들어진 메시지를 대표한다.
 */
public interface Message {
    /**
     * 토픽을 반환한다.
     *
     * @return 토픽
     */
    Topic topic();
}
