package com.dongkuk.oasis.methodinvoker;

/**
 * @author Jeongjin Kim
 * @since 2021-03-26
 */
class ParameterBindingResult {
    private final ParameterAndArgumentHolder parameterAndArgumentHolder;
    private final boolean isOptional;
    private final String message;

    ParameterBindingResult(ParameterAndArgumentHolder parameterAndArgumentHolder, boolean isOptional) {
        this(parameterAndArgumentHolder, isOptional, null);
    }

    ParameterBindingResult(ParameterAndArgumentHolder parameterAndArgumentHolder,
                           boolean isOptional,
                           String message) {
        this.parameterAndArgumentHolder = parameterAndArgumentHolder;
        this.isOptional = isOptional;
        this.message = message == null ? "" : message;
    }

    public ParameterAndArgumentHolder getParameterAndArgumentHolder() {
        return parameterAndArgumentHolder;
    }

    public boolean isOptional() {
        return isOptional;
    }

    public String getMessage() {
        return message;
    }
}
