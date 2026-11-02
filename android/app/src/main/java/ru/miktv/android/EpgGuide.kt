package ru.miktv.android

import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class Programme(val title: String, val description: String, val startMs: Long, val endMs: Long) {
    fun isOnAir(now: Long) = startMs <= now && endMs > now
    fun isFuture(now: Long) = startMs > now
}

object EpgGuide {
    fun parseTime(text: String?): Long {
        if (text.isNullOrBlank()) return 0L
        return try {
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
                isLenient = false
            }
            fmt.parse(text.take(19))?.time ?: 0L
        } catch (_: Exception) { 0L }
    }

    fun iso(value: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(value))

    fun time(value: Long): String =
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(value))

    fun day(value: Long): String =
        SimpleDateFormat("dd.MM", Locale.getDefault()).format(Date(value))

    fun programmes(json: JSONArray): List<Programme> = (0 until json.length()).mapNotNull { index ->
        val value: JSONObject = json.optJSONObject(index) ?: return@mapNotNull null
        val start = parseTime(value.optString("starts_at"))
        val end = parseTime(value.optString("ends_at"))
        if (start <= 0L || end <= start) return@mapNotNull null
        Programme(value.optString("title", "Без названия"),
            value.optString("description", ""), start, end)
    }

    fun nowNext(events: List<Programme>, at: Long): Pair<Programme?, Programme?> {
        val now = events.firstOrNull { it.isOnAir(at) }
        val next = events.firstOrNull { it.startMs > at }
        return now to next
    }

    /** Fraction of the broadcast already aired (0..1); based on EPG timestamps, not HLS seek position. */
    fun elapsedFraction(programme: Programme, at: Long): Float {
        val duration = programme.endMs - programme.startMs
        if (duration <= 0L) return 0f
        val fraction = (at - programme.startMs).toDouble() / duration.toDouble()
        return fraction.coerceIn(0.0, 1.0).toFloat()
    }

    /** DVR requests are capped at 12 hours; a running programme ends before the current time. */
    fun archiveBounds(programme: Programme, now: Long): Pair<Long, Long>? {
        val end = minOf(programme.endMs, now - 5000L, programme.startMs + 12 * 3600000L)
        return if (programme.startMs > 0 && end - programme.startMs >= 15000L)
            programme.startMs to end else null
    }
}
