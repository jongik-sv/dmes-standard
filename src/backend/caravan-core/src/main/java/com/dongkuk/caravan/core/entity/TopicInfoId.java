package com.dongkuk.caravan.core.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * TB_CARAVAN_TOPICS 복합키 (TOPIC_ID + BIZ_SYSTEM)
 */
public class TopicInfoId implements Serializable {

    private String topicId;
    private String bizSystem;

    public TopicInfoId() {}

    public TopicInfoId(String topicId, String bizSystem) {
        this.topicId = topicId;
        this.bizSystem = bizSystem;
    }

    public String getTopicId() { return topicId; }

    public String getBizSystem() { return bizSystem; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        TopicInfoId that = (TopicInfoId) o;
        return Objects.equals(topicId, that.topicId) &&
               Objects.equals(bizSystem, that.bizSystem);
    }

    @Override
    public int hashCode() {
        return Objects.hash(topicId, bizSystem);
    }
}
