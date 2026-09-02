package com.dongkuk.oasis.execution;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.*;

/**
 * @author Jeongjin Kim
 * @since 2021-05-13
 */
public class UnmodifiableExecutionResult implements ExecutionResult {
    private final Map<String, TypedObject> outputs;
    private TypedObject result;
    private boolean useObject;

    /**
     * 담을 개체를 변경할 수 없도록 변경 후 초기화 한다.
     *
     * @param object    담을 개체
     * @param outputs   출력값
     * @param useObject 오브젝트 여부
     */
    public UnmodifiableExecutionResult(TypedObject object,
                                       Map<String, TypedObject> outputs,
                                       boolean useObject) {
        setResult(object);
        this.outputs = outputs;
        this.useObject = useObject;
    }

    /**
     * 담을 개체를 변경할 수 없도록 변경 후 초기화 한다.
     *
     * @param object  담을 개체
     * @param outputs 출력값
     */
    public UnmodifiableExecutionResult(TypedObject object, Map<String, TypedObject> outputs) {
        this(object, outputs, false);
    }

    /**
     * 담을 개체를 변경할 수 없도록 변경 후 초기화 한다.
     *
     * @param object 담을 개체
     */
    public UnmodifiableExecutionResult(TypedObject object) {
        this(object, new HashMap<>());
    }

    /**
     * 담을 개체를 변경할 수 없도록 변경 후 초기화 한다.
     *
     * @param object 담을 개체
     */
    public UnmodifiableExecutionResult(Object object) {
        this(object, new HashMap<>());
    }

    /**
     * 담을 개체를 변경할 수 없도록 변경 후 초기화 한다.
     *
     * @param object  담을 개체
     * @param outputs 출력값
     */
    public UnmodifiableExecutionResult(Object object, Map<String, TypedObject> outputs) {
        if (object instanceof TypeDescribableObject)
            setResult(new TypedObject(object));
        else if (object instanceof TypedObject)
            setResult((TypedObject) object);
        else
            setResult(new TypedObject(object));

        this.outputs = outputs;
    }

    @Override
    public String toString() {
        return "UnmodifiableExecutionResult{" +
                "outputs=" + outputs +
                ", result=" + result +
                '}';
    }

    @Override
    public TypedObject result() {
        return result;
    }

    @Override
    public Map<String, TypedObject> outputs() {
        return outputs;
    }

    @Override
    public boolean useObject() {
        return this.useObject;
    }

    private void setResult(TypedObject result) {
        Type type = result.getType();
        if (type instanceof ParameterizedType) {
            Type rawType = ((ParameterizedType) type).getRawType();
            if (((ParameterizedType) type).getRawType() instanceof Class<?>) {
                Class<?> classType = (Class<?>) rawType;
                makeUnmodifiable(result, type, classType);
            }
        } else {
            this.result = result;
        }
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private void makeUnmodifiable(TypedObject result, Type type, Class<?> classType) {
        TypedObject newResult = result;
        if (List.class.isAssignableFrom(classType)) {
            // list 내부 요소가 ParameterizedType 인지 확인 후 ParameterizedType 이면 unmodifiable 로 변환한다.
            Type[] actualTypeArguments = ((ParameterizedType) type).getActualTypeArguments();
            // list 의 TypeParameter 는 1개만 존재한다.
            if (actualTypeArguments[0] instanceof ParameterizedType) {
                // list 의 요소의 TypeParameter 타입을 가져온다.
                Type rawType = ((ParameterizedType) actualTypeArguments[0]).getRawType();
                // TypeParameter T, K 같이 TypeVariable 일 수 있기 때문에 Class 타입인지 확인한다.
                if (rawType instanceof Class<?>) {
                    Class<?> innerClassType = (Class<?>) rawType;
                    // List 의 요소 타입이 Map 인지 검사한다.
                    if (Map.class.isAssignableFrom(innerClassType)) {
                        // 결과에서 리스트를 가져온다.
                        List<Map> object = new ArrayList(result.getObject(List.class));
                        // 결과의 리스트 요소에 하나씩 접근해서 모든 오브젝트를 unmodifiableMap 으로 변환한다.
                        for (int i = 0; i < object.size(); i++) {
                            object.set(i, Collections.unmodifiableMap(object.get(i)));
                        }
                        newResult = new TypedObject(object, result.getType());
                    }
                }
            }
            this.result = new TypedObject(
                    Collections.unmodifiableList(newResult.getObject(List.class)),
                    type);
        } else if (Map.class.isAssignableFrom(classType)) {
            this.result = new TypedObject(
                    Collections.unmodifiableMap(result.getObject(Map.class)),
                    type);
        } else if (Set.class.isAssignableFrom(classType)) {
            this.result = new TypedObject(
                    Collections.unmodifiableSet(result.getObject(Set.class)),
                    type);
        }
    }
}
