package ru.miktv.android

import org.junit.Assert.*
import org.junit.Test

class LivePlaybackPolicyTest {
    @Test fun doesNotRestartDuringShortHlsSegmentWait() {
        val startedAt = 100000L
        assertFalse(LivePlaybackPolicy.hasExceededBufferingTimeout(true, startedAt, startedAt + 22000))
        assertFalse(LivePlaybackPolicy.hasExceededBufferingTimeout(true, startedAt, startedAt + 59000))
        assertTrue(LivePlaybackPolicy.hasExceededBufferingTimeout(true, startedAt, startedAt + 60000))
        assertFalse(LivePlaybackPolicy.hasExceededBufferingTimeout(false, startedAt, startedAt + 99999))
        assertFalse(LivePlaybackPolicy.hasExceededBufferingTimeout(true, 0, 99999))
    }

    @Test fun conservativelyBuffersRollingLivePlaylist() {
        assertTrue(LivePlaybackPolicy.REBUFFER_MS >= 5000)
        assertTrue(LivePlaybackPolicy.TARGET_LIVE_OFFSET_MS > 10000L)
        assertTrue(LivePlaybackPolicy.TARGET_LIVE_OFFSET_MS < 40000L)
        assertTrue(LivePlaybackPolicy.MIN_BUFFER_MS >= LivePlaybackPolicy.REBUFFER_MS)
    }
}
