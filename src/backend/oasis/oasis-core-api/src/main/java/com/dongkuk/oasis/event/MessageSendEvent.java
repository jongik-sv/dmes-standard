package com.dongkuk.oasis.event;

import com.dongkuk.oasis.message.Message;

public class MessageSendEvent implements Event {
    private final Message message;

    /**
     * 메시지 전송 이벤트를 생성한다.
     *
     * @param message 메시지
     */
    public MessageSendEvent(Message message) {
        this.message = message;
    }

    /**
     * 메시지를 반환한다.
     *
     * @return 메시지
     */
    public Message getMessage() {
        return message;
    }
}
