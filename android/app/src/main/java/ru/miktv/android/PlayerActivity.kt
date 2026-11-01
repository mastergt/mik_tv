package ru.miktv.android

import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * One player for TV and mobile. Uses a backend playback lease for LIVE and DVR;
 * playback URLs are obtained only from the authorised client API.
 */
class PlayerActivity : Activity() {
    private val session get() = (application as MikTvApp).session
    private val api get() = (application as MikTvApp).api
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var player: ExoPlayer
    private lateinit var playerView: PlayerView
    private lateinit var title: TextView
    private lateinit var state: TextView
    private var streamId = ""
    private var dvrStart: String? = null
    private var dvrEnd: String? = null
    private var leaseToken: String? = null
    private var heartbeatInterval = 60_000L
    private var sources: List<Source> = emptyList()
    private var sourceIndex = -1
    private var recoveryAttempt = 0
    private var generation = 0
    private var active = false
    private var stalledAt = 0L
    private var lastProgress = 0L
    private var lastReadyAt = 0L
    private var retry: Runnable? = null

    private data class Source(val url: String, val protocol: String) {
        companion object {
            fun from(obj: JSONObject): Source? {
                val url = obj.optString("url")
                if (!url.startsWith("https://") && !url.startsWith("http://") && !url.startsWith("rtsp://")) return null
                return Source(url, obj.optString("protocol").lowercase())
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (session.isTv()) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
        streamId = intent.getStringExtra("stream_id") ?: ""
        dvrStart = intent.getStringExtra("dvr_start")
        dvrEnd = intent.getStringExtra("dvr_end")
        if (streamId.isBlank() || session.token.isNullOrEmpty()) { finish(); return }

        player = ExoPlayer.Builder(this).build()
        playerView = PlayerView(this).apply {
            player = this@PlayerActivity.player
            useController = true
            controllerAutoShow = !session.isTv()
        }
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        root.addView(playerView, FrameLayout.LayoutParams(-1, -1))
        val overlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.argb(180, 10, 18, 31))
            setPadding(18, 6, 18, 8)
        }
        title = TextView(this).apply {
            textSize = if (session.isTv()) 25f else 18f
            setTextColor(Color.rgb(255, 177, 26))
        }
        state = TextView(this).apply {
            textSize = if (session.isTv()) 18f else 13f
            setTextColor(Color.WHITE)
        }
        overlay.addView(title)
        overlay.addView(state)
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val back = Button(this).apply { text = "⟵ Каналы"; isAllCaps = false; setOnClickListener { finish() } }
        val live = Button(this).apply { text = "● LIVE"; isAllCaps = false; setOnClickListener { dvrStart = null; dvrEnd = null; begin() } }
        buttons.addView(back)
        if (dvrStart != null) buttons.addView(live)
        overlay.addView(buttons)
        root.addView(overlay, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
        setContentView(root)

        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                if (active) trySource("Ошибка декодера: " + error.errorCodeName)
            }
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (!active) return
                if (playbackState == Player.STATE_READY) {
                    state.text = if (dvrStart == null) "LIVE · воспроизведение" else "АРХИВ · воспроизведение"
                    lastReadyAt = System.currentTimeMillis()
                }
                if (playbackState == Player.STATE_ENDED && dvrStart == null) trySource("Поток завершён")
            }
        })
        active = true
        begin()
    }

    private fun begin() {
        if (!active) return
        val epoch = ++generation
        cancelRetry()
        sourceIndex = -1
        sources = emptyList()
        releaseLease()
        player.stop()
        val channel = session.channels.find { it.id == streamId }
        title.text = (channel?.number ?: "") + "  " + (channel?.name ?: "Канал " + streamId)
        state.text = "Запрос доступа к видеопотоку…"
        api.post(session.baseUrl, session.token, "/client/playback/start", JSONObject().put("stream_id", streamId)) { response, error ->
            if (!active || generation != epoch) return@post
            val obj = response as? JSONObject
            if (error != null || obj == null) {
                if (error == null || error.status == 0 || error.status >= 500) scheduleRecovery("Ошибка сети: " + (error?.message ?: "API"))
                else state.text = "Доступ запрещён: " + error.message
                return@post
            }
            leaseToken = obj.optString("lease_token").takeIf { it.isNotBlank() }
            heartbeatInterval = (obj.optLong("heartbeat_after_seconds", 60) * 1000L).coerceIn(30000L, 90000L)
            scheduleHeartbeat(epoch)
            val start = dvrStart
            val end = dvrEnd
            if (start != null && end != null) {
                state.text = "Загрузка архива…"
                val route = "/client/streams/" + streamId + "/dvr?start=" + MainActivity.enc(start) + "&end=" + MainActivity.enc(end)
                api.get(session.baseUrl, session.token, route) { dvr, dvrError ->
                    if (!active || generation != epoch) return@get
                    if (dvrError != null) { state.text = "Архив недоступен: " + dvrError.message; return@get }
                    selectSources((dvr as? JSONObject)?.optJSONArray("sources"))
                }
            } else {
                selectSources(obj.optJSONArray("sources"))
            }
        }
    }

    private fun selectSources(values: JSONArray?) {
        sources = (0 until (values?.length() ?: 0)).mapNotNull { index ->
            values?.optJSONObject(index)?.let(Source::from)
        }
        sourceIndex = -1
        trySource("Нет поддерживаемых источников")
    }

    private fun trySource(problem: String) {
        if (!active) return
        sourceIndex++
        if (sourceIndex >= sources.size) {
            if (dvrStart == null) scheduleRecovery(problem)
            else state.text = "Архив не воспроизводится: " + problem
            return
        }
        val source = sources[sourceIndex]
        state.text = "Подключение: источник " + (sourceIndex + 1) + " / " + sources.size
        val item = MediaItem.Builder().setUri(source.url).apply {
            if (source.protocol == "hls" || source.url.contains(".m3u8", true))
                setMimeType(MimeTypes.APPLICATION_M3U8)
        }.build()
        player.setMediaItem(item)
        player.prepare()
        player.playWhenReady = true
        stalledAt = System.currentTimeMillis()
        lastProgress = player.currentPosition
        scheduleStallCheck(generation)
    }

    private fun scheduleRecovery(problem: String) {
        if (!active || dvrStart != null) return
        cancelRetry()
        if (recoveryAttempt >= 3) {
            state.text = "Не удалось восстановить эфир: " + problem + ". Нажмите LIVE для повтора."
            return
        }
        val wait = listOf(1500L, 3000L, 6000L)[recoveryAttempt++]
        state.text = "Поток недоступен. Повтор " + recoveryAttempt + "/3 через " + wait / 1000 + " сек"
        val expected = generation
        val task = Runnable { if (active && expected == generation) begin() }
        retry = task
        handler.postDelayed(task, wait)
    }

    private fun cancelRetry() {
        retry?.let(handler::removeCallbacks)
        retry = null
    }

    private fun scheduleHeartbeat(expected: Int) {
        handler.postDelayed(object : Runnable {
            override fun run() {
                val key = leaseToken ?: return
                if (!active || generation != expected) return
                api.post(session.baseUrl, session.token, "/client/playback/heartbeat", JSONObject().put("lease_token", key)) { _, error ->
                    if (!active || generation != expected) return@post
                    if (error == null) {
                        handler.postDelayed(this, heartbeatInterval)
                    } else if (error.status == 401 || error.status == 403 || error.status == 404) {
                        player.stop()
                        state.text = "Сессия просмотра завершена: " + error.message
                    } else {
                        // The lease is finite; do not continue forever without successful heartbeats.
                        state.text = "Связь с API потеряна: " + error.message
                        player.stop()
                        scheduleRecovery("Недоступен сервер")
                    }
                }
            }
        }, heartbeatInterval)
    }

    /** Detects a truly stuck media clock, not a paused DVR or temporary buffering. */
    private fun scheduleStallCheck(expected: Int) {
        handler.postDelayed(object : Runnable {
            override fun run() {
                if (!active || expected != generation || !player.playWhenReady) return
                if (player.playbackState == Player.STATE_READY) {
                    val current = player.currentPosition
                    if (current > lastProgress) {
                        lastProgress = current
                        stalledAt = System.currentTimeMillis()
                        if (System.currentTimeMillis() - lastReadyAt > 30000L) recoveryAttempt = 0
                    }
                }
                if (System.currentTimeMillis() - stalledAt > 22000L) {
                    trySource("Видео остановилось более чем на 22 сек")
                } else handler.postDelayed(this, 5000L)
            }
        }, 5000L)
    }

    private fun releaseLease() {
        val key = leaseToken ?: return
        leaseToken = null
        api.post(session.baseUrl, session.token, "/client/playback/stop", JSONObject().put("lease_token", key)) { _, _ -> }
    }

    private fun switchChannel(direction: Int) {
        val channels = session.channels
        if (channels.size < 2) return
        val index = channels.indexOfFirst { it.id == streamId }.coerceAtLeast(0)
        streamId = channels[(index + direction + channels.size) % channels.size].id
        dvrStart = null
        dvrEnd = null
        recoveryAttempt = 0
        begin()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> { switchChannel(1); return true }
            KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> { switchChannel(-1); return true }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                if (::player.isInitialized) player.playWhenReady = !player.playWhenReady
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onStart() {
        super.onStart()
        if (!active && ::player.isInitialized) { active = true; begin() }
    }

    override fun onStop() {
        active = false
        generation++
        cancelRetry()
        handler.removeCallbacksAndMessages(null)
        if (::player.isInitialized) player.stop()
        releaseLease()
        super.onStop()
    }

    override fun onDestroy() {
        if (::player.isInitialized) {
            playerView.player = null
            player.release()
        }
        super.onDestroy()
    }
}
