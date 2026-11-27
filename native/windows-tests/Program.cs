using System.Diagnostics;
using MidiHud.Windows;

var chrome=OAuthBrowserWindow.ChromeExecutable()??throw new Exception("Chrome is missing from the Windows test runner.");
var directory=Path.Combine(Path.GetTempPath(),"hud-oauth-ci-"+Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);
var profile=Path.Combine(directory,"test-profile");
var marker="MIDI HUD OAuth "+Guid.NewGuid().ToString("N");
var file=Path.Combine(directory,"callback.html");
await File.WriteAllTextAsync(file,"<!doctype html><title>"+marker+"</title>");
Process Launch(){
    var start=new ProcessStartInfo(chrome){UseShellExecute=false};
    // Isolate the CI test only; this is not used by the application.
    foreach(var arg in new[]{"--user-data-dir="+profile,"--no-first-run","--no-default-browser-check","--new-window",new Uri(file).AbsoluteUri})start.ArgumentList.Add(arg);
    return Process.Start(start)??throw new Exception("Chrome did not start.");
}
async Task<IntPtr> WaitForWindow(HashSet<IntPtr> previous){
    for(var i=0;i<200;i++){
        var found=OAuthBrowserWindow.MatchingWindows(previous,marker,"chrome");
        if(found.Count==1)return found[0];
        await Task.Delay(100);
    }
    throw new Exception("Chrome test window not found on runner desktop.");
}
Process? original=null;
try{
    var initial=OAuthBrowserWindow.CaptureHandles();
    original=Launch();
    var baseline=await WaitForWindow(initial);
    var before=OAuthBrowserWindow.CaptureHandles();
    if(!before.Contains(baseline))throw new Exception("Baseline window not captured.");
    using var second=Launch();
    var callback=await WaitForWindow(before);
    if(callback==baseline)throw new Exception("Callback reused baseline window.");
    if(!await OAuthBrowserWindow.CloseCallbackWindowAsync(before,marker,"chrome"))throw new Exception("Callback window did not close.");
    if(OAuthBrowserWindow.IsWindow(callback))throw new Exception("Callback window is still open.");
    if(!OAuthBrowserWindow.IsWindow(baseline))throw new Exception("The existing Chrome window was closed.");
    Console.WriteLine("OAuth Chrome window smoke: callback closed and existing window preserved.");
}finally{
    // Only the dedicated CI browser profile/process is cleaned up.
    if(original!=null){
        try{if(!original.HasExited){original.Kill(entireProcessTree:true);await original.WaitForExitAsync();}}catch(InvalidOperationException){}
        original.Dispose();
    }
    try{Directory.Delete(directory,true);}catch(IOException){}catch(UnauthorizedAccessException){}
}
