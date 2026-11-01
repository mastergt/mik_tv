package ru.miktv.android

import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class ApiFailure(val status: Int, override val message: String) : Exception(message)

object ApiUrl {
    fun normalize(raw: String): String {
        val value = raw.trim().trimEnd('/')
        val uri = java.net.URI(value)
        require(uri.scheme == "http" || uri.scheme == "https") { "Укажите http:// или https://" }
        require(!uri.host.isNullOrBlank() && uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null) {
            "Некорректный адрес API"
        }
        return if (value.endsWith("/api/v1")) value else "$value/api/v1"
    }
}

class ApiClient {
    private val worker = Executors.newFixedThreadPool(3)
    private val main = Handler(Looper.getMainLooper())

    /** Callback always runs on the Android main thread. */
    fun request(
        base: String, token: String?, method: String, route: String, body: JSONObject? = null,
        callback: (Any?, ApiFailure?) -> Unit
    ) {
        worker.execute {
            var connection: HttpURLConnection? = null
            var response: Any? = null
            var failure: ApiFailure? = null
            try {
                val normalized = ApiUrl.normalize(base)
                require(route.startsWith("/") && !route.startsWith("//")) { "Неверный маршрут API" }
                connection = (URL(normalized + route).openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 12000
                    readTimeout = 20000
                    useCaches = false
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("User-Agent", "mik_tv-android/0.2.0")
                    if (!token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $token")
                    if (body != null) {
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json; charset=utf-8")
                        outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                    }
                }
                val status = connection.responseCode
                val text = (if (status in 200..299) connection.inputStream else connection.errorStream)
                    ?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                response = if (text.isNotBlank()) JSONTokener(text).nextValue() else JSONObject()
                if (status !in 200..299) {
                    val obj = response as? JSONObject
                    val message = obj?.opt("message")
                    failure = ApiFailure(status, when (message) {
                        is JSONArray -> (0 until message.length()).joinToString("; ") { message.optString(it) }
                        is String -> message
                        else -> "HTTP $status"
                    })
                }
            } catch (e: Exception) {
                failure = ApiFailure(0, e.message ?: "Сервер недоступен")
            } finally {
                connection?.disconnect()
            }
            val result = response
            val error = failure
            main.post { callback(if (error == null) result else null, error) }
        }
    }

    fun get(base: String, token: String?, route: String, cb: (Any?, ApiFailure?) -> Unit) =
        request(base, token, "GET", route, null, cb)

    fun post(base: String, token: String?, route: String, body: JSONObject, cb: (Any?, ApiFailure?) -> Unit) =
        request(base, token, "POST", route, body, cb)

    fun delete(base: String, token: String?, route: String, cb: (Any?, ApiFailure?) -> Unit) =
        request(base, token, "DELETE", route, null, cb)
}
