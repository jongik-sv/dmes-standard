package usecase.transactionalSubService;

import com.dongkuk.oasis.message.Topic;
import com.dongkuk.oasis.message.TopicLoader;

public class TestTopicLoader implements TopicLoader {
    @Override
    public Topic topic(String topicId) {
        return () -> topicId;
    }
}
