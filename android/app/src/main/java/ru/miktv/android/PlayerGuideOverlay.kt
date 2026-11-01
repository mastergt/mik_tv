package ru.miktv.android

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Non-destructive TV guide overlay. Existing ExoPlayer and playback lease keep running. */
class PlayerGuideOverlay(
    private val activity: Activity,
    private val host: FrameLayout,
    private val channels: List<Channel>,
    private val playingId: () -> String,
    private val fetchEpg: (String, (List<Programme>?, String?) -> Unit) -> Unit,
    private val tune: (String) -> Unit,
    private val playArchive: (String, Programme) -> Unit,
    private val higherLevel: () -> Unit,
    private val favorites: () -> Set<String>
) {
    private val fg = Color.rgb(236, 242, 250)
    private val yellow = Color.rgb(245, 177, 44)
    private val handler = Handler(Looper.getMainLooper())
    private val layer = LinearLayout(activity)
    private val tabs = LinearLayout(activity)
    private val list = ListView(activity)
    private val epg = ListView(activity)
    private val heading = label("", 16f)
    private val clock = label("", 17f)
    private val channelRows = ChannelRows()
    private val epgRows = ProgrammeRows()
    private var genre = "Все"
    private var selected = ""
    private var filtered: List<Channel> = channels
    private var revision = 0
    private var delayed: Runnable? = null
    private var clockTask: Runnable? = null
    private var lastTapId = ""
    private var lastTapAt = 0L
    private val cache = mutableMapOf<String, Pair<Long, List<Programme>>>()
    private fun dp(n: Int) = (n * activity.resources.displayMetrics.density + .5f).toInt()
    private fun label(s: String, sp: Float) = TextView(activity).apply {
        text = s; textSize = sp; setTextColor(fg)
        setPadding(dp(7), dp(5), dp(7), dp(5))
        gravity = Gravity.CENTER_VERTICAL
    }
    private fun button(s: String, callback: () -> Unit) = label(s, 19f).apply {
        isFocusable = true; isClickable = true; setOnClickListener { callback() }
    }

    init {
        layer.orientation = LinearLayout.VERTICAL
        layer.setBackgroundColor(Color.argb(210, 0, 0, 0))
        layer.visibility = View.GONE
        layer.isClickable = true
        host.addView(layer, FrameLayout.LayoutParams(-1, -1))
        construct()
    }

    private fun construct() {
        val top = LinearLayout(activity).apply { gravity = Gravity.CENTER_VERTICAL }
        top.addView(button("↖", higherLevel).apply {
            textSize = 27f; contentDescription = "На уровень выше"; gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(dp(57), dp(48)))
        val scroller = HorizontalScrollView(activity).apply {
            isHorizontalScrollBarEnabled = false
        }
        tabs.orientation = LinearLayout.HORIZONTAL
        tabs.gravity = Gravity.CENTER_VERTICAL
        scroller.addView(tabs)
        top.addView(scroller, LinearLayout.LayoutParams(0, dp(48), 1f))
        clock.gravity = Gravity.CENTER
        top.addView(clock, LinearLayout.LayoutParams(dp(75), dp(48)))
        layer.addView(top)

        val body = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
        layer.addView(body, LinearLayout.LayoutParams(-1, 0, 1f))
        list.adapter = channelRows
        list.choiceMode = ListView.CHOICE_MODE_SINGLE
        list.dividerHeight = 0
        list.setBackgroundColor(Color.TRANSPARENT)
        body.addView(list, LinearLayout.LayoutParams(0, -1, .43f))

        val detail = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        body.addView(detail, LinearLayout.LayoutParams(0, -1, .57f))
        heading.setTextColor(yellow)
        heading.maxLines = 2
        detail.addView(heading)
        epg.adapter = epgRows
        epg.dividerHeight = 0
        epg.setBackgroundColor(Color.TRANSPARENT)
        detail.addView(epg, LinearLayout.LayoutParams(-1, 0, 1f))

        val foot = LinearLayout(activity).apply { gravity = Gravity.CENTER_VERTICAL }
        foot.addView(label("▲▼ — канал   OK — просмотр   BACK — закрыть", 12f),
            LinearLayout.LayoutParams(0, dp(35), 1f))
        foot.addView(button("✕", ::close).apply { gravity = Gravity.CENTER; contentDescription = "Закрыть" },
            LinearLayout.LayoutParams(dp(52), dp(35)))
        layer.addView(foot)

        list.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: AdapterView<*>?) {}
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                filtered.getOrNull(position)?.let { select(it) }
            }
        }
        list.setOnItemClickListener { _, _, position, _ ->
            val ch = filtered.getOrNull(position) ?: return@setOnItemClickListener
            val now = System.currentTimeMillis()
            if (ch.id == lastTapId && now - lastTapAt < 1600L) change(ch.id)
            else {
                lastTapId = ch.id; lastTapAt = now
                select(ch)
            }
        }
        epg.setOnItemClickListener { _, _, position, _ ->
            epgRows.programmeAt(position)?.let(::showProgramme)
        }
    }

    fun isOpen() = layer.visibility == View.VISIBLE
    fun open() {
        if (isOpen()) return
        genre = "Все"
        selected = ""
        layer.visibility = View.VISIBLE
        renderTabs()
        renderChannels(playingId())
        startClock()
        list.requestFocus()
    }
    fun close() {
        if (!isOpen()) return
        layer.visibility = View.GONE
        revision++
        delayed?.let(handler::removeCallbacks)
        delayed = null
        clockTask?.let(handler::removeCallbacks)
        clockTask = null
        lastTapId = ""
    }
    fun destroy() { close(); cache.clear(); host.removeView(layer) }
    fun onChannelChanged() {
        if (isOpen()) renderChannels(playingId())
    }
    fun handleKey(key: Int): Boolean {
        if (!isOpen()) return false
        when (key) {
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE, KeyEvent.KEYCODE_MENU -> {
                close(); return true
            }
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_CHANNEL_DOWN -> {
                if (filtered.isNotEmpty()) {
                    val delta = if (key == KeyEvent.KEYCODE_CHANNEL_UP) -1 else 1
                    list.setSelection((list.selectedItemPosition + delta).coerceIn(0, filtered.lastIndex))
                }
                return true
            }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                if (list.hasFocus()) {
                    filtered.getOrNull(list.selectedItemPosition)?.let { change(it.id) }
                    return true
                }
            }
        }
        return false
    }

    private fun startClock() {
        val tick = object : Runnable {
            override fun run() {
                if (!isOpen()) return
                clock.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
                handler.postDelayed(this, 15000L)
            }
        }
        clockTask = tick
        tick.run()
    }
    private fun renderTabs() {
        tabs.removeAllViews()
        val values = listOf("Все", "Избранное") + channels.flatMap { it.genres }.distinct().sorted()
        values.forEach { name ->
            tabs.addView(button(name) {
                if (name == genre) return@button
                genre = name
                renderTabs()
                renderChannels(playingId())
            }.apply {
                textSize = 16f
                setTextColor(if (genre == name) fg else Color.rgb(154, 161, 173))
                if (genre == name) typeface = Typeface.DEFAULT_BOLD
            })
        }
    }
    private fun renderChannels(preferred: String) {
        filtered = when (genre) {
            "Все" -> channels
            "Избранное" -> channels.filter { it.id in favorites() }
            else -> channels.filter { genre in it.genres }
        }
        selected = ""
        channelRows.notifyDataSetChanged()
        if (filtered.isEmpty()) {
            heading.text = "В категории «$genre» нет каналов"
            epgRows.set(emptyList())
            return
        }
        val pos = filtered.indexOfFirst { it.id == preferred }.let { if (it >= 0) it else 0 }
        list.setSelection(pos)
        filtered.getOrNull(pos)?.let(::select)
    }
    private fun select(channel: Channel) {
        if (!isOpen() || channel.id == selected) return
        selected = channel.id
        channelRows.notifyDataSetChanged()
        val requestId = ++revision
        delayed?.let(handler::removeCallbacks)
        heading.text = channel.name + " · загрузка EPG…"
        epgRows.set(emptyList())
        val cached = cache[channel.id]
        if (cached != null && System.currentTimeMillis() - cached.first < 60000L) {
            showEpg(channel, cached.second)
            return
        }
        val task = Runnable {
            delayed = null
            fetchEpg(channel.id) { programmes, error ->
                if (!isOpen() || requestId != revision || selected != channel.id) return@fetchEpg
                if (programmes == null) {
                    heading.text = channel.name + " · " + (error ?: "EPG недоступна")
                    return@fetchEpg
                }
                cache[channel.id] = System.currentTimeMillis() to programmes
                showEpg(channel, programmes)
            }
        }
        delayed = task
        handler.postDelayed(task, 230L)
    }
    private fun showEpg(channel: Channel, data: List<Programme>) {
        val now = System.currentTimeMillis()
        val (current, next) = EpgGuide.nowNext(data, now)
        heading.text = channel.name + "\nСейчас: " + (current?.title ?: "нет данных") +
            "   ·   Далее: " + (next?.title ?: "нет данных")
        epgRows.set(data)
        val index = data.indexOfFirst { it.isOnAir(now) }
        if (index >= 0) epg.setSelection(epgRows.positionFor(index))
    }
    private fun showProgramme(programme: Programme) {
        val id = selected
        val bounds = EpgGuide.archiveBounds(programme, System.currentTimeMillis())
        val info = EpgGuide.day(programme.startMs) + " " + EpgGuide.time(programme.startMs) +
            "–" + EpgGuide.time(programme.endMs) + "\n\n" + programme.description.take(900)
        val dialog = AlertDialog.Builder(activity).setTitle(programme.title)
            .setMessage(info).setNegativeButton("Закрыть", null)
        if (bounds != null) dialog.setPositiveButton("↶ Архив") { _, _ ->
            close(); playArchive(id, programme)
        }
        dialog.show()
    }
    private fun change(id: String) {
        close()
        if (id != playingId()) tune(id)
    }
    private inner class ChannelRows : BaseAdapter() {
        override fun getCount() = filtered.size
        override fun getItem(position: Int): Any = filtered[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val v = convertView as? TextView ?: label("", 19f).apply {
                minHeight = dp(43)
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            }
            val ch = filtered[position]
            v.text = ch.number + ". " + ch.name + (if (ch.id == playingId()) " ▶" else "")
            v.setTextColor(if (ch.id == selected) yellow else fg)
            v.setBackgroundColor(if (ch.id == selected) Color.argb(40, 255, 184, 46) else Color.TRANSPARENT)
            return v
        }
    }
    private data class GuideRow(val item: Programme?, val day: Long)
    private inner class ProgrammeRows : BaseAdapter() {
        private val rows = mutableListOf<GuideRow>()
        fun set(events: List<Programme>) {
            rows.clear()
            var previous = ""
            events.forEach { p ->
                val day = EpgGuide.day(p.startMs)
                if (day != previous) {
                    rows.add(GuideRow(null, p.startMs))
                    previous = day
                }
                rows.add(GuideRow(p, p.startMs))
            }
            notifyDataSetChanged()
        }
        fun programmeAt(position: Int): Programme? = rows.getOrNull(position)?.item
        fun positionFor(index: Int): Int {
            var count = 0
            rows.forEachIndexed { i, r ->
                if (r.item != null && count++ == index) return i
            }
            return 0
        }
        override fun getCount() = rows.size
        override fun getItem(position: Int): Any = rows[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val v = convertView as? TextView ?: label("", 17f).apply {
                minHeight = dp(36)
            }
            val r = rows[position]
            val p = r.item
            if (p == null) {
                v.text = "──── " + SimpleDateFormat("EEEE, d MMMM", Locale("ru", "RU"))
                    .format(Date(r.day)) + " ────"
                v.setTextColor(Color.rgb(204, 209, 220))
                v.typeface = Typeface.DEFAULT_BOLD
            } else {
                v.text = (if (p.isOnAir(System.currentTimeMillis())) "▶ " else "") +
                    EpgGuide.time(p.startMs) + "  " + p.title
                v.setTextColor(fg)
                v.typeface = Typeface.DEFAULT
            }
            return v
        }
    }
}
