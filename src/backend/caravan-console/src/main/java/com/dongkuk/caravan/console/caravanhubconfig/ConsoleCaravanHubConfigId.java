package com.dongkuk.caravan.console.caravanhubconfig;

import java.io.Serializable;
import java.util.Objects;

/**
 * ConsoleCaravanHubConfigEntity 의 복합키 (TOPIC_ID, DIRECTION).
 */
public class ConsoleCaravanHubConfigId implements Serializable {

    private String topicId;
    private String direction;

    public ConsoleCaravanHubConfigId() {}

    public ConsoleCaravanHubConfigId(String topicId, String direction) {
        this.topicId = topicId;
        this.direction = direction;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ConsoleCaravanHubConfigId that = (ConsoleCaravanHubConfigId) o;
        return Objects.equals(topicId, that.topicId) && Objects.equals(direction, that.direction);
    }

    @Override
    public int hashCode() {
        return Objects.hash(topicId, direction);
    }
}
