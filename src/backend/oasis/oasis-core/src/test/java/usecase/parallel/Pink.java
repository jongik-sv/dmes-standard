package usecase.parallel;

/**
 * @author Jeongjin Kim
 * @since 2021-07-26
 */
public class Pink {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(Pink.class);

    public String color(String name) {
        log.info(name + "-pink");
        return name + "-pink";
    }

    public String color() {
        log.info("pink");
        return "pink";
    }
}
