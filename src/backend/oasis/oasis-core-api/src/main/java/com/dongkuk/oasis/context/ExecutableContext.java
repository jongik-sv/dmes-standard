package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.event.EventPublisher;

import java.lang.reflect.Type;
import java.util.List;

/**
 * 단위 요소를 실행하기 위한 컨텍스트이다.
 * <p>
 * 요소 프로퍼티에 {@code input} 이 지정되어 있으면 상위 컨텍스트(프로세스 컨텍스트, 서비스 컨텍스트)에서
 * 해당 키 값을 가진 요소를 찾아 1순위로 입력값에 사용한다.
 * <p>
 *
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public interface ExecutableContext extends EventPublisher {
    /**
     * 컨텍스트에서 데이터를 반환한다.
     * 만약 해당하는 키의 값이 없으면 {@code null}을 반환한다.
     *
     * @param key key, {@code null}일 수 없다.
     * @return object
     */
    TypedObject get(String key);

    /**
     * 컨텍스트에서 타입과 일치하는 데이터를 반환한다.
     * 만약 해당하는 키의 값이 없으면 빈 데이터 리스트를 반환한다.
     *
     * @param type 타입, {@code null}일 수 없다.
     * @return 타입과 호환되는 개체
     */
    List<TypedObject> get(Type type);

    /**
     * @return 서비스 컨텍스트
     */
    ServiceContext serviceContext();

    /**
     * @return 프로세스 컨텍스트
     */
    ProcessContext processContext();

    /**
     * 등록된 오브젝트를 반환한다.
     *
     * @param condition 반환할 오브젝트 검색 조건
     * @return 인스턴스
     */
    Object getObject(ObjectSearchCondition condition);

    /**
     * 오브젝트를 레지스트리에 등록한다.
     *
     * @param object 등록할 오브젝트
     * @param info   등록할 오브젝트 정보
     */
    void registerObject(Object object, ObjectRegisterInfo info);
}
