package com.dongkuk.caravan.console.topic;

import java.util.List;
import org.springframework.data.jpa.domain.Specification;

/**
 * {@link ConsoleTopicInfoEntity} 동적 필터 Specification 모음.
 *
 * <p>Boot 4 strict Specification — null 시 {@code cb.conjunction()} 반환 (not null).
 * (ConsoleCaravanHubConfigSpecification 의 동일 패턴.)</p>
 */
public final class ConsoleTopicInfoSpecification {

    private ConsoleTopicInfoSpecification() {}

    public static Specification<ConsoleTopicInfoEntity> topicIdLike(String value) {
        return (root, query, cb) -> (value == null || value.isBlank())
                ? cb.conjunction()
                : cb.like(root.get("topicId"), "%" + value + "%");
    }

    public static Specification<ConsoleTopicInfoEntity> bizSystemEquals(String value) {
        return (root, query, cb) -> (value == null || value.isBlank())
                ? cb.conjunction()
                : cb.equal(root.get("bizSystem"), value);
    }

    public static Specification<ConsoleTopicInfoEntity> sendModuleIdEquals(String value) {
        return (root, query, cb) -> (value == null || value.isBlank())
                ? cb.conjunction()
                : cb.equal(root.get("sendModuleId"), value);
    }

    public static Specification<ConsoleTopicInfoEntity> recvModuleIdEquals(String value) {
        return (root, query, cb) -> (value == null || value.isBlank())
                ? cb.conjunction()
                : cb.equal(root.get("recvModuleId"), value);
    }

    public static Specification<ConsoleTopicInfoEntity> useTpEquals(String value) {
        return (root, query, cb) -> (value == null || value.isBlank())
                ? cb.conjunction()
                : cb.equal(root.get("useTp"), value);
    }

    public static Specification<ConsoleTopicInfoEntity> topicIdIn(List<String> ids) {
        return (root, query, cb) -> (ids == null || ids.isEmpty())
                ? cb.conjunction()
                : root.get("topicId").in(ids);
    }

    public static Specification<ConsoleTopicInfoEntity> sendModuleIdIn(List<String> ids) {
        return (root, query, cb) -> (ids == null || ids.isEmpty())
                ? cb.conjunction()
                : root.get("sendModuleId").in(ids);
    }

    public static Specification<ConsoleTopicInfoEntity> recvModuleIdIn(List<String> ids) {
        return (root, query, cb) -> (ids == null || ids.isEmpty())
                ? cb.conjunction()
                : root.get("recvModuleId").in(ids);
    }
}
