#!/usr/bin/env python3
"""Genera un proyecto Xcode sin XcodeGen ni dependencias de terceros."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parent
objects = {}


def uid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()


def add(object_name, isa, **fields):
    key = uid(object_name)
    objects[key] = dict(isa=isa, **fields)
    return key


def quote(value):
    if isinstance(value, dict):
        return "{ " + " ".join(f"{quote(k)} = {quote(v)};" for k, v in value.items()) + " }"
    if isinstance(value, list):
        return "(" + ", ".join(map(quote, value)) + ")"
    return json.dumps(str(value), ensure_ascii=False)


sources, test_sources, children = [], [], []
for path in sorted((ROOT / "App").glob("*.swift")):
    ref = add("file:" + path.name, "PBXFileReference", lastKnownFileType="sourcecode.swift", path="App/" + path.name, sourceTree="<group>")
    children.append(ref)
    sources.append(add("build:" + path.name, "PBXBuildFile", fileRef=ref))
for path in sorted((ROOT / "Tests").glob("*.swift")):
    ref = add("testfile:" + path.name, "PBXFileReference", lastKnownFileType="sourcecode.swift", path="Tests/" + path.name, sourceTree="<group>")
    children.append(ref)
    test_sources.append(add("testbuild:" + path.name, "PBXBuildFile", fileRef=ref))
config = add("config", "PBXFileReference", lastKnownFileType="text.xcconfig", path="Config/App.xcconfig", sourceTree="<group>")
web = add("web", "PBXFileReference", lastKnownFileType="folder", path="Web", sourceTree="<group>")
web_build = add("web-build", "PBXBuildFile", fileRef=web)
app = add("product", "PBXFileReference", explicitFileType="wrapper.application", path="MIDIHUD.app", sourceTree="BUILT_PRODUCTS_DIR")
test_app = add("test-product", "PBXFileReference", explicitFileType="wrapper.cfbundle", path="MIDIHUDTests.xctest", sourceTree="BUILT_PRODUCTS_DIR")
products = add("products", "PBXGroup", children=[app, test_app], name="Products", sourceTree="<group>")
group = add("group", "PBXGroup", children=children + [config, web, products], sourceTree="<group>")
package = add("google-package", "XCRemoteSwiftPackageReference", repositoryURL="https://github.com/google/GoogleSignIn-iOS", requirement={"kind":"exactVersion", "version":"10.0.0"})
google = add("google-product", "XCSwiftPackageProductDependency", package=package, productName="GoogleSignIn")
google_build = add("google-framework", "PBXBuildFile", productRef=google)
prepare = add("prepare", "PBXShellScriptBuildPhase", buildActionMask="2147483647", files=[], inputPaths=[], outputPaths=[], runOnlyForDeploymentPostprocessing="0", shellPath="/bin/sh", shellScript='set -eu\n/usr/bin/python3 "$SRCROOT/prepare_web.py"\n', name="Bundle offline web application", alwaysOutOfDate="1")
source_phase = add("sources", "PBXSourcesBuildPhase", buildActionMask="2147483647", files=sources, runOnlyForDeploymentPostprocessing="0")
framework_phase = add("frameworks", "PBXFrameworksBuildPhase", buildActionMask="2147483647", files=[google_build], runOnlyForDeploymentPostprocessing="0")
resources = add("resources", "PBXResourcesBuildPhase", buildActionMask="2147483647", files=[web_build], runOnlyForDeploymentPostprocessing="0")
test_source_phase = add("test-sources", "PBXSourcesBuildPhase", buildActionMask="2147483647", files=test_sources, runOnlyForDeploymentPostprocessing="0")
test_frameworks = add("test-frameworks", "PBXFrameworksBuildPhase", buildActionMask="2147483647", files=[], runOnlyForDeploymentPostprocessing="0")
project_configs, app_configs, test_configs = [], [], []
for name in ("Debug", "Release"):
    common = {"SDKROOT":"iphoneos", "CLANG_ENABLE_MODULES":"YES", "SWIFT_VERSION":"5.0", "IPHONEOS_DEPLOYMENT_TARGET":"16.0", "ENABLE_USER_SCRIPT_SANDBOXING":"NO", "SWIFT_OPTIMIZATION_LEVEL":"-Onone" if name == "Debug" else "-O", "DEBUG_INFORMATION_FORMAT":"dwarf" if name == "Debug" else "dwarf-with-dsym"}
    project_configs.append(add("project-config-" + name, "XCBuildConfiguration", name=name, buildSettings=common))
    app_configs.append(add("app-config-" + name, "XCBuildConfiguration", name=name, baseConfigurationReference=config, buildSettings={"PRODUCT_NAME":"MIDIHUD", "PRODUCT_MODULE_NAME":"MIDIHUD", "INFOPLIST_FILE":"App/Info.plist", "CODE_SIGN_STYLE":"Automatic", "GENERATE_INFOPLIST_FILE":"NO", "ENABLE_TESTABILITY":"YES" if name == "Debug" else "NO", "SUPPORTED_PLATFORMS":"iphoneos iphonesimulator", "SWIFT_ACTIVE_COMPILATION_CONDITIONS":"DEBUG" if name == "Debug" else ""}))
    test_configs.append(add("test-config-" + name, "XCBuildConfiguration", name=name, baseConfigurationReference=config, buildSettings={"PRODUCT_NAME":"$(TARGET_NAME)", "PRODUCT_BUNDLE_IDENTIFIER":"io.midihud.app.tests", "GENERATE_INFOPLIST_FILE":"YES", "BUNDLE_LOADER":"$(TEST_HOST)", "TEST_HOST":"$(BUILT_PRODUCTS_DIR)/MIDIHUD.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/MIDIHUD", "SUPPORTED_PLATFORMS":"iphoneos iphonesimulator"}))
def configs(name, values):
    return add(name, "XCConfigurationList", buildConfigurations=values, defaultConfigurationIsVisible="0", defaultConfigurationName="Release")
app_target = add("app-target", "PBXNativeTarget", buildConfigurationList=configs("app-configs", app_configs), buildPhases=[prepare, source_phase, framework_phase, resources], buildRules=[], dependencies=[], name="MIDIHUD", packageProductDependencies=[google], productName="MIDIHUD", productReference=app, productType="com.apple.product-type.application")
proxy = add("test-proxy", "PBXContainerItemProxy", containerPortal=uid("project"), proxyType="1", remoteGlobalIDString=app_target, remoteInfo="MIDIHUD")
dependency = add("test-dependency", "PBXTargetDependency", target=app_target, targetProxy=proxy)
tests = add("test-target", "PBXNativeTarget", buildConfigurationList=configs("test-configs", test_configs), buildPhases=[test_source_phase, test_frameworks], buildRules=[], dependencies=[dependency], name="MIDIHUDTests", productName="MIDIHUDTests", productReference=test_app, productType="com.apple.product-type.bundle.unit-test")
project = add("project", "PBXProject", attributes={"BuildIndependentTargetsInParallel":"YES", "LastUpgradeCheck":"1600", "TargetAttributes":{app_target:{"CreatedOnToolsVersion":"16.0"}, tests:{"CreatedOnToolsVersion":"16.0", "TestTargetID":app_target}}}, buildConfigurationList=configs("project-configs", project_configs), compatibilityVersion="Xcode 14.0", developmentRegion="es", hasScannedForEncodings="0", knownRegions=["es", "en", "Base"], mainGroup=group, productRefGroup=products, projectDirPath="", projectRoot="", targets=[app_target, tests], packageReferences=[package])
folder = ROOT / "MIDIHUD.xcodeproj"
folder.mkdir(exist_ok=True)
(folder / "project.pbxproj").write_text("// !$*UTF8*$!\n" + quote({"archiveVersion":"1", "classes":{}, "objectVersion":"56", "objects":objects, "rootObject":project}) + "\n")
schemes = folder / "xcshareddata" / "xcschemes"
schemes.mkdir(parents=True, exist_ok=True)
def reference(target, name):
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="{name}" BlueprintName="{name.split(".")[0]}" ReferencedContainer="container:MIDIHUD.xcodeproj"/>'
app_ref = reference(app_target, "MIDIHUD.app")
test_ref = reference(tests, "MIDIHUDTests.xctest")
(schemes / "MIDIHUD.xcscheme").write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{app_ref}</BuildActionEntry></BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{test_ref}</TestableReference></Testables></TestAction>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{app_ref}</BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{app_ref}</BuildableProductRunnable></ProfileAction>
 <AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''')
print("Proyecto Xcode generado.")
