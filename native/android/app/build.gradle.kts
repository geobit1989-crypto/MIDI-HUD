plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "io.midihud.app.androidqa"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.midihud.app.androidqa"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("HUD_ANDROID_VERSION_CODE") ?: "1").toInt()
        versionName = "0.1-qa"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/hudAssets"))
}
dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
}
val prepareHud = tasks.register<Exec>("prepareHud") {
    val root = rootProject.projectDir.resolve("../..").canonicalFile
    val target = layout.buildDirectory.dir("generated/hudAssets")
    inputs.files(root.resolve("core"), root.resolve("editor"), root.resolve("live"), root.resolve("lab"), root.resolve("config"),
        root.resolve("index.html"), root.resolve("v03.html"), root.resolve("README.md"),
        root.resolve("privacy.html"), root.resolve("privacy-en.html"), root.resolve("terms.html"), root.resolve("terms-en.html"),
        rootProject.file("prepare_web.py"))
    outputs.dir(target)
    commandLine(if (System.getProperty("os.name").startsWith("Windows")) "python" else "python3",
        rootProject.file("prepare_web.py"), target.get().asFile)
}
tasks.named("preBuild").configure { dependsOn(prepareHud) }
