import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// Yapılandırma: local.properties (geliştirici) veya ortam değişkenleri (CI/GitHub Secrets). Repoya gerçek değer yazılmaz.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun cfg(name: String): String = (localProps.getProperty(name) ?: System.getenv(name) ?: "").trim()
fun quoted(name: String) = "\"${cfg(name).replace("\"", "")}\""

android {
    namespace = "site.kapinda.courier"
    compileSdk = 35

    defaultConfig {
        applicationId = "site.kapinda.courier"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.0.0"

        buildConfigField("String", "SUPABASE_URL", quoted("KAPINDA_SUPABASE_URL"))
        buildConfigField("String", "SUPABASE_ANON_KEY", quoted("KAPINDA_SUPABASE_ANON_KEY"))
        buildConfigField("String", "FIREBASE_API_KEY", quoted("KAPINDA_FIREBASE_API_KEY"))
        buildConfigField("String", "FIREBASE_APP_ID", quoted("KAPINDA_FIREBASE_ANDROID_APP_ID"))
        buildConfigField("String", "FIREBASE_PROJECT_ID", quoted("KAPINDA_FIREBASE_PROJECT_ID"))
        buildConfigField("String", "FIREBASE_SENDER_ID", quoted("KAPINDA_FIREBASE_SENDER_ID"))
        manifestPlaceholders["MAPS_API_KEY"] = cfg("KAPINDA_MAPS_ANDROID_KEY")
    }

    signingConfigs {
        create("release") {
            val storePath = cfg("KAPINDA_KEYSTORE_PATH")
            if (storePath.isNotEmpty()) {
                storeFile = file(storePath)
                storePassword = cfg("KAPINDA_KEYSTORE_PASSWORD")
                keyAlias = cfg("KAPINDA_KEY_ALIAS")
                keyPassword = cfg("KAPINDA_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (cfg("KAPINDA_KEYSTORE_PATH").isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    lint {
        abortOnError = true
        warningsAsErrors = false
        checkReleaseBuilds = true
        disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion", "ObsoleteSdkInt")
    }
    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/versions/9/OSGI-INF/MANIFEST.MF")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.service)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    implementation(libs.coroutines.android)
    implementation(libs.coroutines.play.services)
    implementation(libs.serialization.json)
    implementation(libs.okhttp)

    implementation(libs.play.services.location)
    implementation(libs.play.services.maps)
    implementation(libs.maps.compose)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.view)
    implementation(libs.mlkit.barcode)
    implementation(libs.security.crypto)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
