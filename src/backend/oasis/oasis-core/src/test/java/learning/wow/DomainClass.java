package learning.wow;

/**
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public class DomainClass {
    @Wow(name = "shutdownMethod")
    void shutdown(String name) {
        System.out.println(name);
    }

    @Wow(name = "shutdownMethod2")
    void startup(String name) {
        System.out.println(name);
    }
}
