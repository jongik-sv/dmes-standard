package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.audit.Audit;
import com.dongkuk.oasis.event.EventBus;

import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;

/**
 * 서비스 컨텍스트 정보를 관리하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public interface ServiceContext extends EventBus {
    /**
     * 저장공간이 없는 빈 {@code ServiceContext}를 생성하여 반환한다.
     *
     * @return serviceContext
     */
    static ServiceContext emptyContext() {
        return new EmptyServiceContext();
    }

    /**
     * 서비스 컨텍스트에서 입력으로 받은 자료를 반환한다.
     *
     * @return 서비스 입력값
     */
    Map<String, TypedObject> serviceInputs();

    /**
     * 입력값을 반환한다.
     * <p>
     * 해당하는 키의 결과값을 찾을 수 없으면 {@code null}을 반환한다.
     *
     * @param key input key
     * @return 서비스 입력값
     */
    TypedObject serviceInput(String key);

    /**
     * 입력값을 반환한다.
     * <p>
     * 해당하는 키의 결과값을 찾을 수 없으면 빈 리스트를 반환한다.
     *
     * @param type type
     * @return 서비스 입력값
     */
    List<TypedObject> serviceInput(Type type);

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
     * 부모 서비스 컨텍스트와 연결된 자식 서비스 컨텍스트를 생성한다.
     * <p>
     * 부모 서비스의 입력값 이외 모든 항목을 복사한다.
     *
     * @param serviceInputs 서비스 입력
     * @return 서브 서비스 컨텍스트
     */
    ServiceContext createSubServiceContext(Map<String, TypedObject> serviceInputs);

    /**
     * 부모 서비스 컨텍스트와 분리된 새 서비스 컨텍스트를 생성한다.
     * <p>
     * 단, {@link ApplicationContext} 와 {@link Audit} 은 복사한다.
     *
     * @param serviceInputs 서비스 입력
     * @return 서브 서비스 컨텍스트
     */
    ServiceContext createServiceContext(Map<String, TypedObject> serviceInputs);

    /**
     * 요청 Tag를 반환한다.
     *
     * @return 요청Tag
     */
    default String requestTag() {
        return null;
    }

    /**
     * {@link Audit}을 반환 한다.
     * <p>
     * 저장된 {@link Audit}이 없으면 {@code null}을 반환 한다.
     *
     * @return {@link Audit}
     */
    default Audit audit() {
        throw new UnsupportedOperationException();
    }

    /**
     * {@link ServiceContext}의 오브젝트 저장소에서 해당하는 클래스의 오브젝트를 반환한다.
     * <p>
     * 주로 테스트를 위해 주입된 mock을 사용하기 위해 활용한다.
     * <p>
     *
     * @param aClass 반환받을 클래스
     * @return 클래스의 오브젝트. 해당하는 클래스가 존재하지 않으면 {@code null}를 반환한다.
     */
    default Object getObject(Class<?> aClass) {
        return null;
    }
}
