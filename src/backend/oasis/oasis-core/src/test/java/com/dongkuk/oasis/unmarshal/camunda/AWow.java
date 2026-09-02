package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.WowContext;
import com.dongkuk.oasis.wow.Wow;

/**
 * @author Jeongjin Kim
 * @since 2021-02-08
 */
public class AWow implements Wow {
    @Override
    public TypedObject run(WowContext wowContext) {
        return new TypedObject("삼");
    }
}
