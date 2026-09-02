package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;

import java.lang.reflect.Type;
import java.util.Collections;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-05-14
 */
public class EmptyApplicationContext implements ApplicationContext {
    @Override
    public TypedObject get(String key) {
        return null;
    }

    @Override
    public List<TypedObject> get(Type type) {
        return Collections.emptyList();
    }
}
