package com.dongkuk.oasis.execution;

/**
 * Marks work that is currently running on a parallel worker thread.
 */
public final class ParallelExecutionScope {
    private static final ThreadLocal<Integer> depth = ThreadLocal.withInitial(() -> 0);

    private ParallelExecutionScope() {
    }

    /**
     * Enters a parallel execution scope for the current thread.
     *
     * @return scope handle that should be closed when the work finishes
     */
    public static Scope enter() {
        depth.set(depth.get() + 1);
        return new Scope();
    }

    /**
     * Returns whether the current thread is inside a parallel execution scope.
     *
     * @return true when parallel execution tracking is active on this thread
     */
    public static boolean isActive() {
        return depth.get() > 0;
    }

    public static final class Scope implements AutoCloseable {
        private boolean closed;

        private Scope() {
        }

        @Override
        public void close() {
            if (closed) {
                return;
            }

            int currentDepth = depth.get();
            if (currentDepth <= 1) {
                depth.remove();
            } else {
                depth.set(currentDepth - 1);
            }
            closed = true;
        }
    }
}
