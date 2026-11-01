package ru.miktv.android

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.widget.ImageView
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.Executors

/** Small, bounded image cache for channel rows. Never sends subscriber credentials to image URLs. */
class ChannelLogos {
    private val executor = Executors.newFixedThreadPool(2)
    private val cache = object : LruCache<String, Bitmap>(3 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    fun show(view: ImageView, apiBase: String, logo: String?) {
        val url = resolve(apiBase, logo)
        view.tag = url
        if (url == null) { view.setImageDrawable(null); return }
        val bitmap = cache.get(url)
        if (bitmap != null) { view.setImageBitmap(bitmap); return }
        view.setImageDrawable(null)
        executor.execute {
            val decoded = fetch(url) ?: return@execute
            cache.put(url, decoded)
            view.post { if (view.tag == url) view.setImageBitmap(decoded) }
        }
    }

    private fun resolve(base: String, path: String?): String? {
        if (path.isNullOrBlank()) return null
        return try {
            val origin = URI(ApiUrl.normalize(base)).resolve("/")
            val target = origin.resolve(path)
            // The API uses local /api/v1/epg/logos/... paths. Reject foreign hosts and protocols.
            if (target.scheme != origin.scheme || target.host != origin.host ||
                target.port != origin.port || !target.path.startsWith("/api/v1/epg/logos/")) null
            else target.toString()
        } catch (_: Exception) { null }
    }

    private fun fetch(url: String): Bitmap? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 6000
                readTimeout = 6000
                instanceFollowRedirects = false
            }
            if (conn.responseCode != 200 || conn.contentLengthLong > 1024 * 1024) return null
            conn.inputStream.use { input ->
                // Downsample logos; never allocate full-resolution image memory for each row.
                val bytes = input.readBytes()
                if (bytes.size > 1024 * 1024) return null
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth < 1 || bounds.outHeight < 1) return null
                var sample = 1
                while (bounds.outWidth / sample > 200 || bounds.outHeight / sample > 200) sample *= 2
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size,
                    BitmapFactory.Options().apply { inSampleSize = sample })
            }
        } catch (_: Exception) { null } finally { conn?.disconnect() }
    }
}
