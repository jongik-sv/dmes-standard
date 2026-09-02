package com.dongkuk.caravan.core.jpa;

import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import org.springframework.data.jpa.domain.Specification;

import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.List;

/**
 * TB_CARAVAN_TOPICS 동적 쿼리 Specification
 *
 * <p>MyBatis의 {@code <if>} 동적 조건을 대체합니다.</p>
 */
public class TopicInfoSpecification {

    private TopicInfoSpecification() {}

    public static Specification<TopicInfoEntity> withFilters(
            String bizSystem, String topicId,
            String sendModuleId, String recvModuleId) {

        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (bizSystem != null && !bizSystem.isEmpty()) {
                predicates.add(cb.equal(root.get("bizSystem"), bizSystem));
            }
            if (topicId != null && !topicId.isEmpty()) {
                predicates.add(cb.like(root.get("topicId"), "%" + topicId + "%"));
            }
            if (sendModuleId != null && !sendModuleId.isEmpty()) {
                predicates.add(cb.equal(root.get("sendModuleId"), sendModuleId));
            }
            if (recvModuleId != null && !recvModuleId.isEmpty()) {
                predicates.add(cb.equal(root.get("recvModuleId"), recvModuleId));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
