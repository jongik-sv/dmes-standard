package com.dongkuk.caravan.console.topic;

import java.io.Serializable;
import java.util.Objects;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * {@link ConsoleTopicInfoEntity} 복합 PK 클래스. caravan 의 TopicInfoId 와 동일 PK 구조.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ConsoleTopicInfoId implements Serializable {

    private String topicId;
    private String bizSystem;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ConsoleTopicInfoId that)) return false;
        return Objects.equals(topicId, that.topicId)
                && Objects.equals(bizSystem, that.bizSystem);
    }

    @Override
    public int hashCode() {
        return Objects.hash(topicId, bizSystem);
    }
}
