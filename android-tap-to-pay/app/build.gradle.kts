plugins {
    id("com.android.application")
    kotlin("android")
}

fun quoteBuildConfig(value: String): String {
    return "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
}

val payplusBackendUrl = providers.gradleProperty("PAYPLUS_BACKEND_URL")
    .orElse("https://payplus-rweb.onrender.com")
    .get()
    .trim()
    .trimEnd('/')

val payplusTerminalLocationId = providers.gradleProperty("PAYPLUS_TERMINAL_LOCATION_ID")
    .orElse("")
    .get()
    .trim()

android {
    namespace = "com.payplus.taptopay"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.payplus.taptopay"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "PAYPLUS_BACKEND_URL", quoteBuildConfig(payplusBackendUrl))
        buildConfigField(
            "String",
            "PAYPLUS_TERMINAL_LOCATION_ID",
            quoteBuildConfig(payplusTerminalLocationId)
        )
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }

        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.constraintlayout:constraintlayout:2.2.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.stripe:stripeterminal-core:5.4.1")
    implementation("com.stripe:stripeterminal-taptopay:5.4.1")
}
