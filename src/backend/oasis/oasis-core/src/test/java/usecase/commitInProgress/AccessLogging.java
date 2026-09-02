package usecase.commitInProgress;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
@SuppressWarnings("unused")
public class AccessLogging {
    private static final Logger log = LoggerFactory.getLogger(AccessLogging.class);
    private final LoggerRepository loggerRepository;

    public AccessLogging(LoggerRepository loggerRepository) {
        this.loggerRepository = loggerRepository;
    }

    public void log(String id) {
        loggerRepository.log(id);
    }
}
