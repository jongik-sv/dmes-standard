package com.dongkuk.caravan.core.repository;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.jpa.TopicInfoJpaRepository;
import com.dongkuk.caravan.core.model.TopicInfo;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.data.jpa.domain.Specification;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * TC-REPO-007 ~ TC-REPO-011: KafkaTopicRepository 단위 테스트
 */
@RunWith(MockitoJUnitRunner.class)
public class KafkaTopicRepositoryTest {

    @Mock
    private TopicInfoJpaRepository topicInfoJpaRepository;

    @Mock
    private CaravanProperties properties;

    private KafkaTopicRepository repository;

    @Before
    public void setUp() {
        repository = new KafkaTopicRepository(topicInfoJpaRepository, properties);
        when(properties.getBizSystem()).thenReturn("DMES");
    }

    // TC-REPO-007: getTopics() - bizSystem 자동 전달
    @Test
    public void TC_REPO_007_getTopics_passesBizSystem() {
        TopicInfoEntity entity = createEntity("T1", "G1");
        when(topicInfoJpaRepository.findByBizSystemAndUseTp("DMES", "Y"))
            .thenReturn(Arrays.asList(entity));

        List<TopicInfo> topics = repository.getTopics();

        verify(topicInfoJpaRepository, times(1)).findByBizSystemAndUseTp("DMES", "Y");
        assertEquals(1, topics.size());
        assertEquals("T1", topics.get(0).getTopicId());
    }

    // TC-REPO-008: getTopicById() - 존재하는 토픽
    @Test
    public void TC_REPO_008_getTopicById_exists() {
        TopicInfoEntity entity = createEntity("MMPPMERPTT01", "G1");
        when(topicInfoJpaRepository.findByTopicIdAndBizSystemAndUseTp("MMPPMERPTT01", "DMES", "Y"))
            .thenReturn(Optional.of(entity));

        Optional<TopicInfo> result = repository.getTopicById("MMPPMERPTT01");

        assertTrue(result.isPresent());
        assertEquals("MMPPMERPTT01", result.get().getTopicId());
    }

    // TC-REPO-009: getTopicById() - 미존재 토픽
    @Test
    public void TC_REPO_009_getTopicById_notExists() {
        when(topicInfoJpaRepository.findByTopicIdAndBizSystemAndUseTp("UNKNOWN", "DMES", "Y"))
            .thenReturn(Optional.empty());

        Optional<TopicInfo> result = repository.getTopicById("UNKNOWN");

        assertFalse(result.isPresent());
    }

    // TC-REPO-010: getTopicsInfo() - 필터 파라미터 전달
    @SuppressWarnings("unchecked")
    @Test
    public void TC_REPO_010_getTopicsInfo_withFilters() {
        when(topicInfoJpaRepository.findAll(any(Specification.class)))
            .thenReturn(Arrays.asList(createEntity("MMP_TOPIC", "G1")));

        List<TopicInfo> result = repository.getTopicsInfo("MMP", "SEND01", "RECV01");

        verify(topicInfoJpaRepository, times(1)).findAll(any(Specification.class));
        assertEquals(1, result.size());
    }

    // TC-REPO-011: getTopicsInfo() - null 필터
    @SuppressWarnings("unchecked")
    @Test
    public void TC_REPO_011_getTopicsInfo_nullFilters() {
        when(topicInfoJpaRepository.findAll(any(Specification.class)))
            .thenReturn(Arrays.asList());

        repository.getTopicsInfo(null, null, null);

        verify(topicInfoJpaRepository, times(1)).findAll(any(Specification.class));
    }

    private TopicInfoEntity createEntity(String topicId, String groupId) {
        try {
            java.lang.reflect.Constructor<TopicInfoEntity> constructor =
                TopicInfoEntity.class.getDeclaredConstructor();
            constructor.setAccessible(true);
            TopicInfoEntity entity = constructor.newInstance();

            setField(entity, "topicId", topicId);
            setField(entity, "groupId", groupId);
            setField(entity, "bizSystem", "DMES");
            return entity;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        java.lang.reflect.Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
