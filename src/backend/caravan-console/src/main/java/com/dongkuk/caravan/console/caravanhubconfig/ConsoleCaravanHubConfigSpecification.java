package com.dongkuk.caravan.console.caravanhubconfig;

import org.springframework.data.jpa.domain.Specification;

/**
 * caravan-console CaravanHubConfigSpecification 의 caravan-console 이전체.
 *
 * <p>Spring Data JPA 4.0 (Boot 4) 의 strict 검사로 인해 빈 조건 시 {@code null} 반환은 금지됨
 * ({@code IllegalArgumentException: Specification must not be null}).
 * 빈 조건 시 항상 TRUE({@code cb.conjunction()}) 를 반환하여 {@code .and(...)} 체인 안전하게 유지.</p>
 */
public class ConsoleCaravanHubConfigSpecification {

    private ConsoleCaravanHubConfigSpecification() {}

    public static Specification<ConsoleCaravanHubConfigEntity> directionEquals(String direction) {
        return (root, query, cb) -> {
            if (direction == null || direction.isEmpty()) return cb.conjunction();
            return cb.equal(root.get("direction"), direction);
        };
    }

    public static Specification<ConsoleCaravanHubConfigEntity> topicIdLike(String topicId) {
        return (root, query, cb) -> {
            if (topicId == null || topicId.isEmpty()) return cb.conjunction();
            return cb.like(root.get("topicId"), "%" + topicId + "%");
        };
    }

    public static Specification<ConsoleCaravanHubConfigEntity> useYnEquals(String useYn) {
        return (root, query, cb) -> {
            if (useYn == null || useYn.isEmpty()) return cb.conjunction();
            return cb.equal(root.get("useYn"), useYn);
        };
    }
}
