package com.dongkuk.oasis.process;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

/**
 * @author Jeongjin Kim
 * @since 2021-05-12
 */
@SuppressFBWarnings("UWF_UNWRITTEN_FIELD")
public class ElementSpy {
    private String calledMethod;

    public String getCalledMethod() {
        return calledMethod;
    }

    public String returnParam1Method(String param1, String param2) {
        return "returnParam1Method param1, param2";
    }

    public String returnParam1Method(String param1) {
        return "returnParam1Method param1";
    }
}
