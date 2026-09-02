package com.dongkuk.oasis.message;

import com.dongkuk.oasis.TypedObject;

/**
 * 메시지 오브젝트가 포함된 메시지를 생성하는 빌더.
 */
public class SerializedMessageObjectMessageBuilder implements MessageObjectMessageBuilder {
    @Override
    public MessageObjectMessage build(Topic topic, TypedObject object) {
        return new SerializedMessageObjectMessage(topic, object);
    }
}
