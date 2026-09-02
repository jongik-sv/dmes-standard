package com.dongkuk.oasis.process;

/**
 * @author Jeongjin Kim
 * @since 2021-07-12
 */
public interface ProcessStarterFactory {
    /**
     * @return return
     */
    ProcessStarter generateProcessStarter();
}
