package com.dongkuk.oasis.model;

/**
 * @author Jeongjin Kim
 * @since 2021-07-07
 */
public interface PropertyNames {
    /**
     * 요소의 입력값으로 사용할 데이터를 지정하는 속성이다. 주로 컨텍스트의 키값이나 PropertyEL을 사용한다.
     */
    String INPUT_KEY = "input";

    /**
     * 요소의 출력을 컨텍스트에 저장할 키 값을 지정하는 속성이다.
     * 단순 키값이나 PropertyEL을 사용할 수 있지만 복수 키값 또는 복수의 표현식을 사용할 수 없다.
     */
    String OUTPUT_KEY = "output";

    /**
     * 데이터 소스을 설정하는 속성이다. 단순값으로 입력한다.
     */
    String DATA_SOURCE = "ds";

    /**
     * 트랜잭션 매니저를 설정하는 속성이다. 단순값으로 입력한다.
     */
    String TRANSACTION_MANAGER_NAME = "tx";

    /**
     * 항상 커밋을 하는 트랜잭션 매니저를 설정하는 속성이다. 단순값으로 입력한다.
     */
    String ALWAYS_COMMIT_TRANSACTION_MANAGER_NAME = "commitTx";

    /**
     * 서비스 컨텍스트를 변환하는 어댑터를 설정하는 속성이다. 정규화된 클래스 이름을 지정한다.
     */
    String SERVICE_ADAPTER = "adapter";

    /**
     * 실행할 메소드를 설정하는 속성이다. 단순값으로 입력한다.
     */
    String METHOD = "method";

    /**
     * 요소의 출력값을 이용하여 로그를 남기고자 할 때 사용하는 속성이다. SpEL을 사용해서 지정한다.
     */
    String LOG_DEBUG = "log";

    /**
     * 실행할 서브프로세스Id를 설정하는 속성이다. 단순 값으로 지정한다.
     */
    String PROCESS_ID = "processId";

    /**
     * input 프로퍼티에 설정한 키만 입력값으로 사용여부를 설정하는 속성이다. true 또는 false 로 입력한다.
     */
    String INPUT_KEY_ONLY = "inputOnly";

    /**
     * 태스크를 순차실행하기 위한 컬렉션과 컬렉션 요소의 이름을 설정하는 속성이다. PropertyEL 으로 입력한다.
     */
    String ITERATOR = "iter";

    /**
     * 병렬 수행시 만들어질 최대 스레드 수를 설정하는 속성이다. 0보다 큰 양의 정수로 입력한다.
     */
    String MAX_THREAD = "thread";

    /**
     * 병렬 수행시 스레드의 최대 수행시간 초단위로 을 설정하는 속성이다. 0보다 큰 양의 정수로 입력한다.
     */
    String THREAD_TIMEOUT = "timeout";

    /**
     * 새 인스턴스 생성 여부.
     * <p>
     * true/false
     */
    String CREATE_NEW_INSTANCE = "new";

    /**
     * 새 서비스 생성 여부.
     * <p>
     * true/false
     */
    String CREATE_NEW_SERVICE = "new";

    /**
     * 서비스 시작시 {@code com.dongkuk.oasis.context.ServiceContext}를 변환할 DTO 클래스를 지정한다.
     */
    String SERVICE_DTO = "dto";

    /**
     * 프로세스 시작시 생성할 DTO 클래스를 지정한다.
     */
    String PROCESS_DTO = "dto";

    /**
     * 태스크 시작시 생성할 DTO 클래스를 지정한다.
     */
    String TASK_DTO = "dto";

    /**
     * 태스크의 반환값을 자바 서비스 태스크의 오브젝트로 사용여부를 지정한다.
     * <p>
     * true/false
     */
    String OBJECT = "object";

    /**
     * 메시지를 만들 오브젝트를 지정한다.
     */
    String MESSAGE_OBJECT = "messageObject";

    /**
     * 메시지를 만들 오브젝트를 지정한다.
     */
    String MESSAGE_OBJECT_SHORT_FORM = "msgObj";

    /**
     * 해당 태스크의 우선순위를 지정한다.
     */
    String PRIORITY = "pri";

    /**
     * 태스크의 참조 클래스 속성.
     */
    String CLASS = "class";

    /**
     * 파라미터를 바인딩시 무시할 수 있는지 여부를 지정한다.
     */
    String OPTIONAL = "opt";
}
