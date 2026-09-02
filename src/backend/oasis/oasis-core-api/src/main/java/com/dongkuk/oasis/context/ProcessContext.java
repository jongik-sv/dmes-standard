package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.event.EventBus;
import com.dongkuk.oasis.model.SubProcess;

import java.lang.reflect.Type;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * 프로세스 컨텍스트 정보를 관리하는 인터페이스.
 * <p>
 * thread-safe 하게 구현해야함.
 *
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
public interface ProcessContext extends EventBus {
    /**
     * @param key    키
     * @param object 개체
     */
    void add(String key, TypedObject object);

    /**
     * 프로세스 컨텍스트에서 output 으로 지정된 자료를 반환한다.
     *
     * @return ProcessLevel 결과값
     */
    Map<String, TypedObject> elementOutputs();

    /**
     * 서비스 컨텍스트.
     *
     * @return 서비스 컨텍스트
     */
    ServiceContext serviceContext();

    /**
     * 결과 값을 반환한다.
     * <p>
     * 해당하는 키의 결과값을 찾을 수 없으면 {@code null}을 반환한다.
     *
     * @param key output key
     * @return 태스크의 결과값
     */
    TypedObject elementOutput(String key);

    /**
     * 결과 값을 반환한다.
     * <p>
     * 해당하는 키의 결과값을 찾을 수 없으면 빈 리스트를 반환한다.
     *
     * @param type 타입
     * @return 태스크의 결과값
     */
    List<TypedObject> elementOutput(Type type);

    /**
     * 결과 값을 반환한다. 해당 컨텍스트에 없으면 상위 컨텍스트에서 찾아온다.
     * <p>
     * 해당하는 키의 결과값을 찾을 수 없으면 {@code null}을 반환한다.
     *
     * @param key output key
     * @return 태스크의 결과값
     */
    TypedObject get(String key);

    /**
     * 결과 값을 반환한다.
     * <p>
     * 해당하는 키의 결과값을 찾을 수 없으면 빈 리스트를 반환한다.
     *
     * @param type 타입
     * @return 태스크의 결과값
     */
    List<TypedObject> get(Type type);

    /**
     * @return 병렬 실행 대상이 되는 서브 프로세스 목록, 없으면 빈 컬렉션을 반환한다.
     */
    Collection<? extends SubProcess> parallelSubProcesses();

    /**
     * @param subProcesses 병렬 실행 대상 서비스 프로세스 목록
     */
    void setParallelSubProcesses(Collection<? extends SubProcess> subProcesses);

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
     * @param object     등록할 오브젝트
     * @param objectInfo 등록할 오브젝트 정보
     */
    void registerObject(Object object, ObjectRegisterInfo objectInfo);
}
