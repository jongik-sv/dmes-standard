package usecase.transactionalSubService;

import com.dongkuk.oasis.message.TopicStructure;
import com.dongkuk.oasis.message.TopicStructureElement;
import com.dongkuk.oasis.message.TopicStructureElementType;
import com.dongkuk.oasis.message.TopicStructureLoader;

import java.util.Arrays;

public class TestTopicStructureLoader implements TopicStructureLoader {

    @Override
    public TopicStructure topicStructure(String topicId) {
        return () -> Arrays.asList(new TopicStructureElement("name", TopicStructureElementType.STRING));
    }
}
