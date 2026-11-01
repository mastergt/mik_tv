package ru.miktv.android

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.*
import android.text.Editable
import android.text.TextWatcher
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class MainActivity : Activity() {
    private val session get() = (application as MikTvApp).session
    private val api get() = (application as MikTvApp).api
    private val gold = Color.rgb(255, 177, 26)
    private val white = Color.rgb(238, 244, 252)
    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private var screen = "setup"
    private var providers = listOf<Pair<String, String>>()
    private var adapter: ChannelAdapter? = null
    private var channelList: ListView? = null
    private var categorySpinner: Spinner? = null
    private var loadMore: Button? = null
    private var search = ""
    private var category = "Все"
    private var favoritesOnly = false
    private var offset = 0
    private var hasMore = false
    private var loading = false
    private var epoch = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (session.baseUrl.isBlank() || session.provider.isBlank()) showSetup() else connect()
    }

    private fun dp(n: Int) = (resources.displayMetrics.density * n + 0.5f).toInt()
    private fun shape(color: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(5).toFloat() }
    private fun focusShape() = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), shape(gold))
        addState(intArrayOf(android.R.attr.state_pressed), shape(gold))
        addState(intArrayOf(), shape(Color.rgb(40, 54, 73)))
    }
    private fun label(value: String, size: Float = 18f) = TextView(this).apply {
        text = value; textSize = size; setTextColor(white)
        setPadding(dp(10), dp(9), dp(10), dp(9))
    }
    private fun button(title: String, action: () -> Unit) = Button(this).apply {
        text = title; isAllCaps = false; setTextColor(white)
        textSize = if (session.isTv()) 19f else 15f
        background = focusShape()
        setOnClickListener { action() }
    }
    private fun input(hintText: String, value: String = "") = EditText(this).apply {
        hint = hintText; setText(value); setSingleLine()
        setTextColor(white); setHintTextColor(Color.LTGRAY)
        textSize = if (session.isTv()) 20f else 17f
    }
    private fun layout(): LinearLayout {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(15, 24, 37))
            setPadding(dp(12), dp(10), dp(12), dp(8))
        }
        setContentView(root)
        return root
    }
    private fun notify(text: String) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show()
        if (::status.isInitialized) status.text = text
    }

    private fun showSetup() {
        screen = "setup"; epoch++
        val page = layout()
        val fields = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        page.addView(ScrollView(this).apply { addView(fields) }, LinearLayout.LayoutParams(-1, 0, 1f))
        fields.addView(label("mik_tv  ·  Подключение", 26f))
        fields.addView(label("URL сервера IPTV API", 15f))
        val server = input("https://tv.example.ru", session.baseUrl)
        fields.addView(server)
        fields.addView(label("HTTPS рекомендуется: при HTTP пароль и секрет терминала передаются без шифрования.", 13f))
        val providersSpinner = Spinner(this)
        fields.addView(label("Провайдер", 15f))
        fields.addView(providersSpinner)
        fields.addView(label("Тип интерфейса", 15f))
        val modes = listOf("Автоматически", "Телевизор / пульт", "Телефон / планшет")
        val modeSpinner = Spinner(this)
        val choices = ArrayAdapter(this, android.R.layout.simple_spinner_item, modes)
        choices.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        modeSpinner.adapter = choices
        modeSpinner.setSelection(listOf("auto", "tv", "mobile").indexOf(session.uiPreference).coerceAtLeast(0))
        fields.addView(modeSpinner)
        val connectButton = button("2. Подключиться") {
            if (providers.isEmpty()) { notify("Сначала проверьте сервер"); return@button }
            try {
                session.setUiPreference(listOf("auto", "tv", "mobile")[modeSpinner.selectedItemPosition])
                session.configure(server.text.toString(), providers[providersSpinner.selectedItemPosition].first)
                connect()
            } catch (e: Exception) { notify(e.message ?: "Неверные настройки") }
        }
        connectButton.isEnabled = false
        fields.addView(button("1. Проверить сервер") {
            val url = try { ApiUrl.normalize(server.text.toString()) }
            catch (e: Exception) { notify(e.message ?: "Неправильный URL"); return@button }
            status.text = "Получение списка провайдеров…"
            api.get(url, null, "/client/bootstrap") { response, error ->
                if (screen != "setup") return@get
                val array = (response as? JSONObject)?.optJSONArray("providers")
                if (error != null || array == null) { notify(error?.message ?: "Ошибка API"); return@get }
                providers = (0 until array.length()).mapNotNull { i ->
                    array.optJSONObject(i)?.let { it.optString("slug") to it.optString("name") }
                }.filter { it.first.isNotBlank() }
                val items = providers.map { it.second }
                val spinnerAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, items)
                spinnerAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                providersSpinner.adapter = spinnerAdapter
                val old = providers.indexOfFirst { it.first == session.provider }
                if (old >= 0) providersSpinner.setSelection(old)
                connectButton.isEnabled = providers.isNotEmpty()
                status.text = if (providers.isEmpty()) "Нет активных провайдеров" else "Провайдеры загружены: " + providers.size
            }
        })
        fields.addView(connectButton)
        status = label("Укажите адрес сервера и нажмите «Проверить»", 14f)
        page.addView(status)
    }

    private fun connect() {
        screen = "connecting"
        layout().apply { addView(label("mik_tv  ·  Соединение", 25f)) }
        status = label("Подключение к " + session.baseUrl)
        root.addView(status)
        val token = session.token
        if (token.isNullOrEmpty()) { register(); return }
        api.get(session.baseUrl, token, "/client/me") { response, error ->
            if (screen != "connecting") return@get
            if (error == null && response is JSONObject) {
                session.markAuthenticated(response.optBoolean("authenticated", false))
                showCatalog()
            } else if (error?.status == 401) {
                session.clearToken()
                register()
            } else {
                notify(error?.message ?: "Не удалось проверить сеанс")
                root.addView(button("Изменить настройки") { showSetup() })
            }
        }
    }

    private fun register() {
        status.text = "Регистрация устройства…"
        val request = try {
            JSONObject().put("device_uuid", session.deviceUuid())
                .put("provider_slug", session.provider)
                .put("platform", "android")
                .put("manufacturer", Build.MANUFACTURER.take(100))
                .put("model", Build.MODEL.take(100))
                .put("os_version", Build.VERSION.RELEASE.take(80))
                .put("app_version", "0.1.0")
                .put("device_name", "mik_tv Android")
                .apply { session.deviceSecret()?.let { put("device_secret", it) } }
        } catch (e: Exception) {
            notify("Ошибка защищённого хранилища: " + e.message)
            root.addView(button("Настройки") { showSetup() })
            return
        }
        api.post(session.baseUrl, null, "/client/register", request) { response, error ->
            if (screen != "connecting") return@post
            val result = response as? JSONObject
            if (error != null || result == null) {
                notify(error?.message ?: "Терминал не зарегистрирован")
                root.addView(button("Настройки / повтор") { showSetup() })
                return@post
            }
            try {
                result.optString("device_secret").takeIf { it.isNotBlank() }?.let(session::saveDeviceSecret)
                session.updateToken(result.getString("client_token"), false)
                showCatalog()
            } catch (e: Exception) {
                notify("Не удалось сохранить учётные данные: " + e.message)
                root.addView(button("Настройки") { showSetup() })
            }
        }
    }

    private fun showCatalog() {
        screen = "catalog"; epoch++
        val page = layout()
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        header.addView(label("mik_tv  ·  " + session.provider, if (session.isTv()) 24f else 18f),
            LinearLayout.LayoutParams(0, -2, 1f))
        header.addView(button(if (session.authenticated) "Выход" else "Вход") {
            if (session.authenticated) logout() else showLogin()
        })
        header.addView(button("⚙") { showSetup() })
        page.addView(header)
        val toolbar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val query = input("Название / номер / жанр")
        toolbar.addView(query, LinearLayout.LayoutParams(0, dp(55), 1f))
        toolbar.addView(button("★") { favoritesOnly = !favoritesOnly; redraw() })
        toolbar.addView(button("EPG") { currentSelection()?.let(::showEpg) ?: notify("Выберите канал") })
        page.addView(toolbar)
        categorySpinner = Spinner(this)
        page.addView(categorySpinner)
        val body = LinearLayout(this).apply {
            orientation = if (session.isTv()) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
        }
        page.addView(body, LinearLayout.LayoutParams(-1, 0, 1f))
        channelList = ListView(this).apply {
            choiceMode = ListView.CHOICE_MODE_SINGLE
            dividerHeight = dp(1)
            setBackgroundColor(Color.rgb(17, 28, 43))
        }
        adapter = ChannelAdapter()
        channelList!!.adapter = adapter
        body.addView(channelList, if (session.isTv()) LinearLayout.LayoutParams(0, -1, 1.2f)
            else LinearLayout.LayoutParams(-1, 0, 1f))
        val actions = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        if (session.isTv()) body.addView(actions, LinearLayout.LayoutParams(0, -1, .8f))
        else body.addView(actions)
        actions.addView(label("OK — смотреть · удержать — избранное", if (session.isTv()) 16f else 12f))
        actions.addView(button("▶ Смотреть") { currentSelection()?.let(::play) })
        actions.addView(button("★ Избранное") { currentSelection()?.let(::favorite) })
        actions.addView(button("Обновить") { refresh() })
        loadMore = button("Загрузить ещё") { loadPage() }
        page.addView(loadMore)
        status = label("Загрузка каналов…", 13f)
        page.addView(status)
        channelList!!.setOnItemClickListener { _, _, pos, _ -> adapter?.getChannel(pos)?.let(::play) }
        channelList!!.setOnItemLongClickListener { _, _, pos, _ ->
            adapter?.getChannel(pos)?.let(::favorite)
            true
        }
        query.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun afterTextChanged(s: Editable?) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                search = s?.toString()?.lowercase(Locale.ROOT)?.trim() ?: ""
                redraw()
            }
        })
        categorySpinner!!.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: AdapterView<*>?) {}
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, pos: Int, id: Long) {
                category = categorySpinner?.selectedItem?.toString() ?: "Все"
                redraw()
            }
        }
        refresh()
        if (session.isTv()) channelList?.requestFocus()
    }

    private fun refresh() {
        epoch++
        session.channels.clear()
        offset = 0; hasMore = true; loading = false
        redraw(); loadFavorites(); loadPage()
    }

    private fun loadPage() {
        if (screen != "catalog" || loading || !hasMore || session.token == null) return
        loading = true
        val requestEpoch = epoch
        loadMore?.isEnabled = false
        status.text = "Загрузка списка каналов…"
        api.get(session.baseUrl, session.token, "/client/streams?app_type=tv&limit=200&offset=" + offset) { response, error ->
            if (screen != "catalog" || requestEpoch != epoch) return@get
            loading = false
            val result = response as? JSONObject
            if (error != null || result == null) {
                notify(error?.message ?: "Ошибка каталога")
                loadMore?.isEnabled = true
                return@get
            }
            val items = result.optJSONArray("items") ?: JSONArray()
            for (i in 0 until items.length()) {
                items.optJSONObject(i)?.let { try { session.channels.add(Channel.fromJson(it)) } catch (_: Exception) {} }
            }
            offset += items.length()
            hasMore = result.optBoolean("has_more", false) && items.length() > 0
            loadMore?.visibility = if (hasMore) View.VISIBLE else View.GONE
            loadMore?.isEnabled = hasMore
            updateCategories()
            redraw()
            status.text = session.channels.size.toString() + " каналов загружено" +
                if (hasMore) " · Ещё страницы" else ""
        }
    }

    private fun updateCategories() {
        val names = listOf("Все") + session.channels.flatMap { it.genres }.distinct().sorted()
        val spinner = categorySpinner ?: return
        val items = ArrayAdapter(this, android.R.layout.simple_spinner_item, names)
        items.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = items
        spinner.setSelection(names.indexOf(category).coerceAtLeast(0))
    }

    private fun loadFavorites() {
        api.get(session.baseUrl, session.token, "/client/favorites") { response, _ ->
            val favorites = response as? JSONArray ?: return@get
            session.favorites.clear()
            for (i in 0 until favorites.length()) {
                favorites.optJSONObject(i)?.optString("stream_id")?.let { session.favorites.add(it) }
            }
            redraw()
        }
    }

    private fun redraw() {
        if (screen != "catalog") return
        adapter?.update(session.channels.filter {
            (!favoritesOnly || session.favorites.contains(it.id)) &&
                (category == "Все" || it.genres.contains(category)) &&
                (search.isEmpty() || (it.number + " " + it.name + " " + it.genres.joinToString(" "))
                    .lowercase(Locale.ROOT).contains(search))
        })
        if ((adapter?.count ?: 0) > 0) channelList?.setSelection(0)
    }

    private fun currentSelection(): Channel? {
        val pos = channelList?.selectedItemPosition ?: -1
        return adapter?.getChannel(if (pos >= 0) pos else 0)
    }

    private fun play(channel: Channel, dvrStart: String? = null, dvrEnd: String? = null) {
        val intent = Intent(this, PlayerActivity::class.java).putExtra("stream_id", channel.id)
        if (dvrStart != null && dvrEnd != null) {
            intent.putExtra("dvr_start", dvrStart)
            intent.putExtra("dvr_end", dvrEnd)
        }
        startActivity(intent)
    }

    private fun favorite(channel: Channel) {
        val exists = session.favorites.contains(channel.id)
        val route = "/client/favorites/" + channel.id
        val cb: (Any?, ApiFailure?) -> Unit = { _, error ->
            if (error != null) notify(error.message)
            else {
                if (exists) session.favorites.remove(channel.id) else session.favorites.add(channel.id)
                redraw()
                notify(if (exists) "Удалено из избранного" else "Добавлено в избранное")
            }
        }
        if (exists) api.delete(session.baseUrl, session.token, route, cb)
        else api.post(session.baseUrl, session.token, route, JSONObject(), cb)
    }

    private fun showEpg(channel: Channel) {
        val now = System.currentTimeMillis()
        val route = "/client/streams/" + channel.id + "/epg?from=" + enc(iso(now - 86400000L)) +
            "&to=" + enc(iso(now + 86400000L))
        status.text = "Загрузка EPG…"
        api.get(session.baseUrl, session.token, route) { response, error ->
            val data = response as? JSONArray
            if (error != null || data == null) { notify(error?.message ?: "Ошибка EPG"); return@get }
            if (data.length() == 0) { notify("Нет телепрограммы"); return@get }
            val labels = (0 until data.length()).map {
                val p = data.optJSONObject(it) ?: JSONObject()
                p.optString("starts_at").take(16).replace('T', ' ') + "  " + p.optString("title")
            }.toTypedArray()
            AlertDialog.Builder(this).setTitle("EPG · " + channel.name).setItems(labels) { _, index ->
                val event = data.optJSONObject(index) ?: return@setItems
                val begin = parseIso(event.optString("starts_at"))
                val finish = parseIso(event.optString("ends_at"))
                val end = minOf(finish, System.currentTimeMillis() - 5000, begin + 12 * 3600000L)
                if (begin <= 0 || end - begin < 15000) notify("Архив передачи недоступен")
                else play(channel, iso(begin), iso(end))
            }.setNegativeButton("Назад", null).show()
        }
    }

    private fun showLogin() {
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(20), 0, dp(20), 0)
        }
        val username = input("Логин")
        val password = input("Пароль").apply { inputType = 129 }
        panel.addView(username); panel.addView(password)
        AlertDialog.Builder(this).setTitle("Вход абонента").setView(panel)
            .setNegativeButton("Отмена", null)
            .setPositiveButton("Войти") { _, _ ->
                val payload = JSONObject().put("username", username.text.toString())
                    .put("password", password.text.toString())
                password.text.clear()
                val perform = {
                    api.post(session.baseUrl, session.token, "/client/auth/login", payload) { response, error ->
                        val obj = response as? JSONObject
                        if (error != null || obj == null) { notify(error?.message ?: "Ошибка входа"); return@post }
                        try {
                            session.updateToken(obj.getString("client_token"), true)
                            showCatalog()
                        } catch (e: Exception) { notify("Не удалось сохранить сеанс: " + e.message) }
                    }
                }
                if (session.baseUrl.startsWith("http://")) AlertDialog.Builder(this)
                    .setTitle("Незащищённое соединение")
                    .setMessage("Пароль будет передан по HTTP. Рекомендуется HTTPS.")
                    .setNegativeButton("Отмена", null)
                    .setPositiveButton("Продолжить") { _, _ -> perform() }.show()
                else perform()
            }.show()
    }

    private fun logout() {
        api.post(session.baseUrl, session.token, "/client/auth/logout", JSONObject()) { _, _ ->
            session.clearToken()
            connect()
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (screen == "catalog") {
            if (keyCode == KeyEvent.KEYCODE_GUIDE || keyCode == KeyEvent.KEYCODE_INFO) {
                currentSelection()?.let(::showEpg)
                return true
            }
            if (keyCode == KeyEvent.KEYCODE_MENU) { showSetup(); return true }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onConfigurationChanged(config: Configuration) {
        super.onConfigurationChanged(config)
        if (screen == "catalog") showCatalog()
    }

    private inner class ChannelAdapter : BaseAdapter() {
        private var items = listOf<Channel>()
        fun update(value: List<Channel>) { items = value; notifyDataSetChanged() }
        fun getChannel(index: Int) = items.getOrNull(index)
        override fun getCount() = items.size
        override fun getItem(position: Int): Any = items[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val view = (convertView as? TextView) ?: label("", if (session.isTv()) 22f else 17f).apply {
                minHeight = dp(if (session.isTv()) 66 else 54)
                background = focusShape()
            }
            val channel = items[position]
            view.text = channel.number + "    " + channel.name +
                if (session.favorites.contains(channel.id)) "   ★" else ""
            return view
        }
    }

    companion object {
        fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
        fun iso(value: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(value))
        fun parseIso(value: String): Long = try {
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.parse(value.take(19))?.time ?: 0L
        } catch (_: Exception) { 0L }
    }
}
