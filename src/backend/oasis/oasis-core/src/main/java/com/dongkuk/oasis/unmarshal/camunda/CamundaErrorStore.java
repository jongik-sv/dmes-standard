package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.error.Error;
import com.dongkuk.oasis.unmarshal.ErrorStore;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-07-21
 */
final class CamundaErrorStore implements ErrorStore {
    private final Map<String, Error> errors = new HashMap<>();

    void put(Error error) {
        errors.put(error.errorId(), error);
    }

    @Override
    public Error error(String errorId) {
        return errors.get(errorId);
    }
}
