package com.dongkuk.oasis.service;

import com.dongkuk.oasis.TypedObject;

/**
 * @author Jeongjin Kim
 * @since 2021-06-03
 */
public interface ServiceInput {
    /**
     * @param key   key
     * @param value value
     */
    void add(String key, TypedObject value);
}
