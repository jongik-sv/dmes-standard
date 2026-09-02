package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.Nonnull;
import java.util.*;

/**
 * 게이트웨이, 서브 프로세스 등 Task Level 이상 데이터가 필요한 경우 불필요한 정보까지 사용자의 접근을 막기위해 제한적인 데이터 맵을 제공하여 사용하게 하기 위함.
 *
 * @author Jeongjin Kim
 * @since 2021-04-09
 */
public final class ContextAccessor implements Map<String, Object> {
    private static final Logger log = LoggerFactory.getLogger(ContextAccessor.class);
    private final Map<String, Object> database = new HashMap<>();

    /**
     * @param executableContext 컨텍스트
     */
    public ContextAccessor(ExecutableContext executableContext) {
        addDate(executableContext.serviceContext().serviceInputs());
        addDate(executableContext.processContext().elementOutputs());
    }

    private void addDate(Map<String, TypedObject> data) {
        if (data != null) {
            for (Entry<String, TypedObject> datum : data.entrySet()) {
                if (database.containsKey(datum.getKey()))
                    log.warn("Key [{}] already exists. Overwriting the existing value.", datum.getKey());
                database.put(datum.getKey(), vail(datum.getValue().getObject()));
            }
        }
    }

    private Object vail(Object object) {
        if (object instanceof List) {
            List<Object> listData = new ArrayList<>();
            for (Object o : ((List<?>) object)) {
                listData.add(vail(o));
            }
            return listData;
        } else if (object instanceof Map) {
            Map<Object, Object> mapData = new HashMap<>();
            for (Entry<?, ?> entry : ((Map<?, ?>) object).entrySet()) {
                mapData.put(entry.getKey(), vail(entry.getValue()));
            }
            return mapData;
        } else if (object instanceof TypedObject)
            return vail(((TypedObject) object).getObject());
        return object;
    }

    @Override
    public int size() {
        return database.size();
    }

    @Override
    public boolean isEmpty() {
        return database.isEmpty();
    }

    @Override
    public boolean containsKey(Object key) {
        return database.containsKey(key);
    }

    @Override
    public boolean containsValue(Object value) {
        return database.containsValue(value);
    }

    @Override
    public Object get(Object key) {
        return database.get(key);
    }

    @Override
    public Object put(String key, Object value) {
        throw new UnsupportedOperationException();
    }

    @Override
    public Object remove(Object key) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void putAll(@Nonnull Map<? extends String, ?> m) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void clear() {
        throw new UnsupportedOperationException();
    }

    @Override
    @Nonnull
    public Set<String> keySet() {
        return database.keySet();
    }

    @Override
    @Nonnull
    public Collection<Object> values() {
        return database.values();
    }

    @Override
    @Nonnull
    public Set<Entry<String, Object>> entrySet() {
        return database.entrySet();
    }
}
