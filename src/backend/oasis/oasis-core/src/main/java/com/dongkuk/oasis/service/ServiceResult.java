package com.dongkuk.oasis.service;

import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.message.Message;

import java.util.List;
import java.util.Map;

/**
 * 서비스 실행결과를 제공하는 인터페이스이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
public interface ServiceResult {
    /**
     * 서비스가 정상적으로 수행을 했는지, 프로세스 내에서 임의로 발생시킨 예외가 발생했는지,
     * 그 외 다른 원인으로 발생한 예외가 있는지 알 수 있는 코드를 반환한다.
     *
     * @return 서비스 결과 코드
     */
    ServiceResultCode serviceResultCode();

    /**
     * 서비스 수행 결과 메시지를 반환한다. 서비스 수행이 성공이면 {@code null} 을 반환한다.
     *
     * @return 메시지
     */
    String serviceResultMessage();

    /**
     * 서비스 수행이 실패하여 발생한 예외 정보를 반환한다. 서비스 수행이 성공이면 {@code null} 을 반환한다.
     *
     * @return 예외 객체
     */
    Throwable exception();

    /**
     * 각 태스크에서 수행한 모든 결과를 반환한다.
     * <p>
     * 반환 대상은 프로세스 컨텍스트에 등록된 모든 데이터이다.
     * 즉, 태스크에서 명시적으로 출력키를 지정하지 않으면 서비스 수행결과에도 존재하지 않는다.
     * <p>
     * 서비스 수행결과가 존재하지 않으면 빈 {@link Map} 개체를 반환한다.
     *
     * @return 서비스 수행 결과
     */
    Map<String, TypedObject> results();

    /**
     * 각 태스크에서 수행한 결과를 반환한다.
     * <p>
     * 반환 대상은 프로세스 컨텍스트에 등록된 모든 데이터이다.
     * 즉, 태스크에서 명시적으로 출력키를 지정하지 않으면 서비스 수행결과에도 존재하지 않는다.
     * <p>
     * 키에 해당하는 결과가 존재하지 않으면 {@code null} 을 반환한다.
     *
     * @param key 결과 키
     * @return 결과
     */
    TypedObject result(String key);

    /**
     * 서비스의 시작부터 종료할 때까지 거쳐간 모든 요소 정보 반환한다.
     *
     * @return 서비스 처리간 실행된 요소 목록
     */
    List<PathElement> path();

    /**
     * 서비스 수행간에 발생한 메시지들을 반환한다.
     * <p>
     * 발생한 메시지가 없으면 빈 리스트를 반환한다.
     *
     * @return 메시지 리스트
     */
    List<Message> messages();
}
