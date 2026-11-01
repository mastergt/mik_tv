package ru.miktv.android

import android.app.Application
import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class MikTvApp : Application() {
    lateinit var session: AppSession
        private set
    val api = ApiClient()

    override fun onCreate() {
        super.onCreate()
        session = AppSession(this)
    }
}

class AppSession(private val context: Context) {
    private val prefs = context.getSharedPreferences("mik_tv", Context.MODE_PRIVATE)
    var baseUrl: String = prefs.getString("api_url", "") ?: ""
        private set
    var provider: String = prefs.getString("provider", "") ?: ""
        private set
    var token: String? = null
        private set
    var authenticated = false
    val channels = mutableListOf<Channel>()
    val favorites = mutableSetOf<String>()
    var uiPreference: String = prefs.getString("ui_mode", "auto") ?: "auto"
        private set

    init { restoreToken() }

    private fun identityKey(): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest("$baseUrl|$provider".toByteArray(Charsets.UTF_8))
        return bytes.take(12).joinToString("") { "%02x".format(it) }
    }

    fun configure(url: String, slug: String) {
        val validated = ApiUrl.normalize(url)
        require(slug.isNotBlank() && slug.length <= 100) { "Выберите провайдера" }
        val changed = validated != baseUrl || slug != provider
        baseUrl = validated
        provider = slug
        prefs.edit().putString("api_url", baseUrl).putString("provider", provider).apply()
        if (changed) {
            channels.clear()
            favorites.clear()
            authenticated = false
            restoreToken()
        }
    }

    fun setUiPreference(mode: String) {
        require(mode in listOf("auto", "tv", "mobile"))
        uiPreference = mode
        prefs.edit().putString("ui_mode", mode).apply()
    }

    fun isTv(): Boolean {
        if (uiPreference == "tv") return true
        if (uiPreference == "mobile") return false
        val manager = context.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        return manager.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    fun deviceUuid(): String {
        val key = "uuid_" + identityKey()
        val saved = prefs.getString(key, null)
        if (!saved.isNullOrBlank()) return saved
        val generated = UUID.randomUUID().toString()
        prefs.edit().putString(key, generated).apply()
        return generated
    }

    fun deviceSecret(): String? = Vault.read(prefs.getString("secret_" + identityKey(), null))
    fun saveDeviceSecret(secret: String) {
        prefs.edit().putString("secret_" + identityKey(), Vault.encrypt(secret)).apply()
    }

    fun updateToken(value: String?, isAuthenticated: Boolean) {
        token = value
        authenticated = isAuthenticated
        val editor = prefs.edit()
        if (value == null) editor.remove("token_" + identityKey())
        else editor.putString("token_" + identityKey(), Vault.encrypt(value))
        editor.apply()
    }

    fun markAuthenticated(value: Boolean) { authenticated = value }

    fun clearToken() = updateToken(null, false)

    private fun restoreToken() {
        token = try { Vault.read(prefs.getString("token_" + identityKey(), null)) } catch (_: Exception) { null }
        authenticated = false // /client/me is the authority
    }
}

data class Channel(val id: String, val number: String, val name: String, val logo: String?, val genres: List<String>) {
    companion object {
        fun fromJson(item: JSONObject): Channel {
            val genresJson = item.optJSONArray("genres") ?: JSONArray()
            val genres = (0 until genresJson.length()).mapNotNull {
                genresJson.optJSONObject(it)?.optString("name")?.takeIf(String::isNotBlank)
            }
            return Channel(
                item.getString("id"),
                item.optString("number", ""),
                item.optString("name", "Без названия"),
                item.optString("logo_url").takeIf { it.startsWith("http://") || it.startsWith("https://") || it.startsWith("/") },
                genres
            )
        }
    }
}

/** Tokens and device secrets are encrypted at rest; unavailable keystore is surfaced as an error. */
private object Vault {
    private const val ALIAS = "mik_tv_aes_v1"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build()
        )
        return generator.generateKey()
    }

    fun encrypt(text: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val combined = cipher.iv + cipher.doFinal(text.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    fun read(encoded: String?): String? {
        if (encoded.isNullOrBlank()) return null
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        require(bytes.size > 12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    }
}
