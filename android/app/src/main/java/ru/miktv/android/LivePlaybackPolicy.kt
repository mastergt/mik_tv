package ru.miktv.android

/**
 * Conservative settings for a four-segment (~10 seconds each) Astra live HLS playlist.
 * The target offset is intentionally behind the head of the rolling playlist.
 * These values may need fine-tuning on the actual network and encoder.
 */
object LivePlaybackPolicy {
    const val MIN_BUFFER_MS = 15_000
    const val MAX_BUFFER_MS = 60_000
    const val STARTUP_BUFFER_MS = 5_000
    const val REBUFFER_MS = 8_000
    const val TARGET_LIVE_OFFSET_MS = 20_000L
    const val BUFFERING_RECOVERY_MS = 60_000L

    fun hasExceededBufferingTimeout(buffering: Boolean, startedAtMs: Long, nowMs: Long): Boolean =
        buffering && startedAtMs > 0L && nowMs >= startedAtMs &&
            nowMs - startedAtMs >= BUFFERING_RECOVERY_MS
}
