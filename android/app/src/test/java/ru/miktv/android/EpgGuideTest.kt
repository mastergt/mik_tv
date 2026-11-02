package ru.miktv.android

import org.junit.Assert.*
import org.junit.Test

class EpgGuideTest {
    @Test fun runningAndUpcoming() {
        val now = EpgGuide.parseTime("2026-11-01T15:00:00Z")
        val programmes = listOf(
            Programme("Было", "", now - 7200000, now - 3600000),
            Programme("Сейчас", "", now - 3600000, now + 3600000),
            Programme("Потом", "", now + 3600000, now + 7200000)
        )
        val (current, next) = EpgGuide.nowNext(programmes, now)
        assertEquals("Сейчас", current?.title)
        assertEquals("Потом", next?.title)
        assertEquals(now - 3600000, EpgGuide.archiveBounds(programmes[1], now)?.first)
        assertEquals(now - 5000, EpgGuide.archiveBounds(programmes[1], now)?.second)
        assertNull(EpgGuide.archiveBounds(programmes[2], now))
    }

    @Test fun invalidDatesAndBounds() {
        assertEquals(0L, EpgGuide.parseTime("invalid"))
        assertNull(EpgGuide.archiveBounds(Programme("soon", "", 100000, 140000), 110000))
        assertEquals(12 * 3600000L, EpgGuide.archiveBounds(
            Programme("long", "", 100000, 100000 + 25 * 3600000L),
            100000 + 26 * 3600000L
        )?.let { it.second - it.first })
    }
    @Test fun onAirProgressIsElapsedFraction() {
        val p = Programme("Новости", "", 1_000_000L, 1_300_000L)
        assertEquals(0f, EpgGuide.elapsedFraction(p, 900_000L), 0.0001f)
        assertEquals(0f, EpgGuide.elapsedFraction(p, 1_000_000L), 0.0001f)
        assertEquals(.25f, EpgGuide.elapsedFraction(p, 1_075_000L), 0.0001f)
        assertEquals(.5f, EpgGuide.elapsedFraction(p, 1_150_000L), 0.0001f)
        assertEquals(1f, EpgGuide.elapsedFraction(p, 1_300_000L), 0.0001f)
        assertEquals(1f, EpgGuide.elapsedFraction(p, 1_500_000L), 0.0001f)
        assertEquals(0f, EpgGuide.elapsedFraction(Programme("bad", "", 300L, 200L), 250L), 0.0001f)
    }

}
