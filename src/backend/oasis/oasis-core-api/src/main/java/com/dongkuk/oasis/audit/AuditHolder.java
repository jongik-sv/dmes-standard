package com.dongkuk.oasis.audit;

/**
 * Audit Object holder.
 *
 * @author Jeongjin Kim
 * @since 2022-03-03
 */
public class AuditHolder {
    private static final ThreadLocal<? super Audit> audit = new ThreadLocal<>();

    /**
     * Return {@link Audit}.
     *
     * @param <T> Subtype of {@link Audit}
     * @return {@link Audit}
     */
    public static <T extends Audit> T getAudit() {
        @SuppressWarnings("unchecked")
        T t = (T) audit.get();
        return t;
    }

    /**
     * Set {@link Audit} Object.
     *
     * @param audit object.
     */
    public static void setAudit(Audit audit) {
        AuditHolder.audit.set(audit);
    }

    /**
     * Remove data.
     */
    public static void remove() {
        audit.remove();
    }
}
