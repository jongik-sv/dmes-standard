package com.dongkuk.caravan.console.topic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaBuilder.In;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.domain.Specification;

/**
 * ConsoleTopicInfoSpecification 회귀 방지 테스트.
 *
 * <p>Boot 4 strict — Specification 의 null 반환 금지. 빈 조건 시 {@link CriteriaBuilder#conjunction()} 반환.
 * (ConsoleCaravanHubConfigSpecificationTest 와 동일 패턴.)</p>
 */
class ConsoleTopicInfoSpecificationTest {

    // ───────────────────────────── topicIdLike ─────────────────────────────

    @Test
    void topicIdLike_null_returns_conjunction() {
        Specification<ConsoleTopicInfoEntity> spec = ConsoleTopicInfoSpecification.topicIdLike(null);
        Predicate p = invokeWithConjunction(spec);
        assertThat(p).isNotNull();
    }

    @Test
    void topicIdLike_blank_returns_conjunction() {
        Specification<ConsoleTopicInfoEntity> spec = ConsoleTopicInfoSpecification.topicIdLike("");
        Predicate p = invokeWithConjunction(spec);
        assertThat(p).isNotNull();
    }

    @Test
    void topicIdLike_value_returns_like_predicate() {
        Specification<ConsoleTopicInfoEntity> spec = ConsoleTopicInfoSpecification.topicIdLike("topic1");

        @SuppressWarnings("unchecked")
        Root<ConsoleTopicInfoEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        @SuppressWarnings("unchecked")
        Path<String> path = mock(Path.class);
        Predicate likePredicate = mock(Predicate.class);

        when(root.<String>get("topicId")).thenReturn(path);
        when(cb.like(path, "%topic1%")).thenReturn(likePredicate);

        Predicate result = spec.toPredicate(root, query, cb);

        assertThat(result).isSameAs(likePredicate);
        verify(cb, never()).conjunction();
    }

    // ───────────────────────────── bizSystemEquals ─────────────────────────────

    @Test
    void bizSystemEquals_null_returns_conjunction() {
        Predicate p = invokeWithConjunction(ConsoleTopicInfoSpecification.bizSystemEquals(null));
        assertThat(p).isNotNull();
    }

    @Test
    void bizSystemEquals_value_returns_equal() {
        Specification<ConsoleTopicInfoEntity> spec = ConsoleTopicInfoSpecification.bizSystemEquals("mcm");

        @SuppressWarnings("unchecked")
        Root<ConsoleTopicInfoEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        @SuppressWarnings("unchecked")
        Path<String> path = mock(Path.class);
        Predicate equalPredicate = mock(Predicate.class);

        when(root.<String>get("bizSystem")).thenReturn(path);
        when(cb.equal(path, "mcm")).thenReturn(equalPredicate);

        Predicate result = spec.toPredicate(root, query, cb);

        assertThat(result).isSameAs(equalPredicate);
    }

    // ───────────────────────────── sendModuleIdEquals / recvModuleIdEquals / useTpEquals ─────────────────────────────

    @Test
    void sendModuleIdEquals_null_returns_conjunction() {
        Predicate p = invokeWithConjunction(ConsoleTopicInfoSpecification.sendModuleIdEquals(null));
        assertThat(p).isNotNull();
    }

    @Test
    void recvModuleIdEquals_null_returns_conjunction() {
        Predicate p = invokeWithConjunction(ConsoleTopicInfoSpecification.recvModuleIdEquals(null));
        assertThat(p).isNotNull();
    }

    @Test
    void useTpEquals_null_returns_conjunction() {
        Predicate p = invokeWithConjunction(ConsoleTopicInfoSpecification.useTpEquals(null));
        assertThat(p).isNotNull();
    }

    // ───────────────────────────── *In ─────────────────────────────

    @Test
    void topicIdIn_null_returns_conjunction() {
        Predicate p = invokeWithConjunction(ConsoleTopicInfoSpecification.topicIdIn(null));
        assertThat(p).isNotNull();
    }

    @Test
    void topicIdIn_empty_returns_conjunction() {
        Predicate p = invokeWithConjunction(ConsoleTopicInfoSpecification.topicIdIn(List.of()));
        assertThat(p).isNotNull();
    }

    @Test
    void topicIdIn_value_returns_in_expression() {
        Specification<ConsoleTopicInfoEntity> spec = ConsoleTopicInfoSpecification.topicIdIn(List.of("a", "b"));

        @SuppressWarnings("unchecked")
        Root<ConsoleTopicInfoEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        @SuppressWarnings("unchecked")
        Path<Object> path = mock(Path.class);
        @SuppressWarnings("unchecked")
        In<Object> inExpression = mock(In.class);

        when(root.get("topicId")).thenReturn(path);
        when(path.in(List.of("a", "b"))).thenReturn(inExpression);

        Predicate result = spec.toPredicate(root, query, cb);

        assertThat(result).isSameAs(inExpression);
        verify(cb, never()).conjunction();
    }

    @Test
    void sendModuleIdIn_empty_returns_conjunction() {
        Predicate p = invokeWithConjunction(ConsoleTopicInfoSpecification.sendModuleIdIn(List.of()));
        assertThat(p).isNotNull();
    }

    @Test
    void recvModuleIdIn_empty_returns_conjunction() {
        Predicate p = invokeWithConjunction(ConsoleTopicInfoSpecification.recvModuleIdIn(List.of()));
        assertThat(p).isNotNull();
    }

    // ───────────────────────────── 헬퍼 ─────────────────────────────

    private Predicate invokeWithConjunction(Specification<ConsoleTopicInfoEntity> spec) {
        @SuppressWarnings("unchecked")
        Root<ConsoleTopicInfoEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        Predicate conjunction = mock(Predicate.class);
        when(cb.conjunction()).thenReturn(conjunction);
        return spec.toPredicate(root, query, cb);
    }
}
