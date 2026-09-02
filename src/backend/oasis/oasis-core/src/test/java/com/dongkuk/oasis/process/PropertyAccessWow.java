package com.dongkuk.oasis.process;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.WowContext;
import com.dongkuk.oasis.wow.Wow;

/**
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public class PropertyAccessWow implements Wow {
    @Override
    public TypedObject run(WowContext wowContext) {
        String dao = (String) wowContext.getPropertyValue("dao");
        return new TypedObject(dao);
    }
}
