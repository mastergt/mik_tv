package ru.miktv.android

import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.content.Context
import android.media.AudioManager
import android.view.MotionEvent
import android.widget.Toast
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
    private lateinit var nowNext: TextView
    private lateinit var infoPanel: LinearLayout
    private var infoHide: Runnable? = null
    private var touchStartX = 0f
    private var touchStartY = 0f
    private val touchThreshold by lazy { 65f * resources.displayMetrics.density }

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
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
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
        nowNext = TextView(this).apply {
            setTextColor(Color.rgb(220, 230, 244))
            textSize = if (session.isTv()) 18f else 14f
            maxLines = 2
        }
        overlay.addView(nowNext)
        overlay.addView(state)
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val back = Button(this).apply { text = "⟵ Каналы"; isAllCaps = false; setOnClickListener { finish() } }
        val live = Button(this).apply {
            text = "● LIVE"; isAllCaps = false
            setOnClickListener { dvrStart = null; dvrEnd = null; recoveryAttempt = 0; begin() }
        }
        val retryButton = Button(this).apply {
            text = "↻ Повторить"; isAllCaps = false
            setOnClickListener { recoveryAttempt = 0; begin() }
        }
        val guideButton = Button(this).apply {
            text = "EPG"; isAllCaps = false
            setOnClickListener { showGuide() }
        }
        buttons.addView(back)
        buttons.addView(guideButton)
        buttons.addView(retryButton)
        buttons.addView(live)
        overlay.addView(buttons)
        infoPanel = overlay
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
                    session.saveLastChannel(streamId)
                    showInfo(6500L)
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
        showInfo(0L)
        val channel = session.channels.find { it.id == streamId }
        title.text = (channel?.number ?: "") + "  " + (channel?.name ?: "Канал " + streamId)
        loadGuidePreview(epoch)
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
        showInfo(0L)
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
            state.text = "Не удалось восстановить эфир: " + problem + ". Нажмите «Повторить»."
            showInfo(0L)
            return
        }
        val wait = listOf(1500L, 3000L, 6000L)[recoveryAttempt++]
        state.text = "Поток недоступен. Повтор " + recoveryAttempt + "/3 через " + wait / 1000 + " сек"
        showInfo(0L)
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

    private fun showInfo(timeoutMs: Long = 6000L) {
        infoHide?.let(handler::removeCallbacks)
        infoPanel.visibility = View.VISIBLE
        if (timeoutMs > 0L) {
            val hide = Runnable { if (active) infoPanel.visibility = View.GONE }
            infoHide = hide
            handler.postDelayed(hide, timeoutMs)
        }
    }

    private fun loadGuidePreview(expectedGeneration: Int) {
        nowNext.text = "Телепрограмма: загрузка…"
        val now = System.currentTimeMillis()
        val url = "/client/streams/" + streamId + "/epg?from=" +
            MainActivity.enc(EpgGuide.iso(now - 3600000L)) +
            "&to=" + MainActivity.enc(EpgGuide.iso(now + 12 * 3600000L))
        api.get(session.baseUrl, session.token, url) { response, error ->
            if (!active || generation != expectedGeneration) return@get
            if (error != null) { nowNext.text = "EPG недоступна"; return@get }
            val (current, next) = EpgGuide.nowNext(
                EpgGuide.programmes(response as? JSONArray ?: JSONArray()), System.currentTimeMillis()
            )
            nowNext.text = "Сейчас: " + (current?.title ?: "нет данных") +
                "\nДалее: " + (next?.title ?: "нет данных")
        }
    }

    private fun showGuide() {
        if (!active) return
        val activeStream = streamId
        val expected = generation
        val now = System.currentTimeMillis()
        val route = "/client/streams/" + activeStream + "/epg?from=" +
            MainActivity.enc(EpgGuide.iso(now - 48 * 3600000L)) + "&to=" +
            MainActivity.enc(EpgGuide.iso(now + 24 * 3600000L))
        api.get(session.baseUrl, session.token, route) { response, error ->
            if (!active || generation != expected || activeStream != streamId) return@get
            if (error != null) { Toast.makeText(this, error.message, Toast.LENGTH_LONG).show(); return@get }
            val programs = EpgGuide.programmes(response as? JSONArray ?: JSONArray())
            if (programs.isEmpty()) {
                Toast.makeText(this, "EPG отсутствует", Toast.LENGTH_SHORT).show()
                return@get
            }
            val labels = programs.map {
                (if (it.isOnAir(now)) "▶ " else if (it.isFuture(now)) "  " else "↶ ") +
                    EpgGuide.day(it.startMs) + " " + EpgGuide.time(it.startMs) + "  " + it.title
            }.toTypedArray()
            val selected = programs.indexOfFirst { it.isOnAir(now) }.coerceAtLeast(0)
            android.app.AlertDialog.Builder(this).setTitle("Программа · " + (title.text ?: ""))
                .setSingleChoiceItems(labels, selected) { dialog, position ->
                    dialog.dismiss()
                    val program = programs[position]
                    val bounds = EpgGuide.archiveBounds(program, System.currentTimeMillis())
                    val builder = android.app.AlertDialog.Builder(this)
                        .setTitle(program.title)
                        .setMessage(EpgGuide.day(program.startMs) + " " +
                            EpgGuide.time(program.startMs) + "–" + EpgGuide.time(program.endMs) +
                            "\n\n" + program.description.take(800))
                        .setNegativeButton("Назад", null)
                        .setNeutralButton("● LIVE") { _, _ ->
                            dvrStart = null; dvrEnd = null; recoveryAttempt = 0; begin()
                        }
                    if (bounds != null) builder.setPositiveButton("↶ Архив") { _, _ ->
                        dvrStart = EpgGuide.iso(bounds.first)
                        dvrEnd = EpgGuide.iso(bounds.second)
                        recoveryAttempt = 0
                        begin()
                    }
                    builder.show()
                }.setNegativeButton("Закрыть", null).show()
        }
    }

    /** Swipe horizontally to zap. Swipe vertically on left/right to adjust brightness/volume. */
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (!session.isTv() && active) {
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    touchStartX = event.x; touchStartY = event.y
                }
                MotionEvent.ACTION_UP -> {
                    val dx = event.x - touchStartX
                    val dy = event.y - touchStartY
                    if (kotlin.math.abs(dx) > touchThreshold * 1.5f &&
                        kotlin.math.abs(dx) > kotlin.math.abs(dy) * 1.5f) {
                        switchChannel(if (dx < 0) 1 else -1)
                        return true
                    }
                    if (kotlin.math.abs(dy) > touchThreshold &&
                        kotlin.math.abs(dy) > kotlin.math.abs(dx) * 1.5f) {
                        if (touchStartX < resources.displayMetrics.widthPixels / 2f) {
                            val params = window.attributes
                            val previous = if (params.screenBrightness < 0) 0.5f else params.screenBrightness
                            params.screenBrightness = (previous - dy / resources.displayMetrics.heightPixels).coerceIn(0.05f, 1f)
                            window.attributes = params
                        } else {
                            val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                            val direction = if (dy < 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
                            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, 0)
                        }
                        showInfo(1800L)
                        return true
                    }
                    if (kotlin.math.abs(dx) < touchThreshold && kotlin.math.abs(dy) < touchThreshold) {
                        showInfo(4500L)
                    }
                }
            }
        }
        return super.dispatchTouchEvent(event)
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
            KeyEvent.KEYCODE_INFO, KeyEvent.KEYCODE_GUIDE -> { showGuide(); return true }
            KeyEvent.KEYCODE_DPAD_CENTER -> { showInfo(); return true }
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
        infoHide = null
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
