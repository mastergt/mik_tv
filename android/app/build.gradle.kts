val releaseStorePath = System.getenv("MIKTV_RELEASE_KEYSTORE_PATH")
val releaseStorePassword = System.getenv("MIKTV_RELEASE_STORE_PASSWORD")
val releaseAlias = System.getenv("MIKTV_RELEASE_KEY_ALIAS")
val releaseKeyPassword = System.getenv("MIKTV_RELEASE_KEY_PASSWORD")
val canSignRelease = listOf(releaseStorePath, releaseStorePassword, releaseAlias, releaseKeyPassword)
    .all { !it.isNullOrBlank() }

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ru.miktv.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "ru.miktv.android"
        minSdk = 23
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
    }

    signingConfigs {
        if (canSignRelease) {
            create("releaseCi") {
                storeFile = file(releaseStorePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (canSignRelease) signingConfig = signingConfigs.getByName("releaseCi")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    val media3 = "1.11.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-exoplayer-hls:$media3")
    implementation("androidx.media3:media3-exoplayer-rtsp:$media3")
    implementation("androidx.media3:media3-ui:$media3")
    testImplementation("junit:junit:4.13.2")
}
