using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace MidiHud.Windows;

internal static class OAuthBrowserWindow
{
    private delegate bool EnumWindowsProc(IntPtr handle,IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback,IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr handle);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr handle,StringBuilder buffer,int length);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr handle,out uint process);
    [DllImport("user32.dll",SetLastError=true)] private static extern bool PostMessage(IntPtr handle,uint message,IntPtr wParam,IntPtr lParam);
    private const uint WM_CLOSE=0x0010;

    internal static HashSet<IntPtr> CaptureHandles()
    {
        var handles=new HashSet<IntPtr>();
        EnumWindows((handle,_)=>{handles.Add(handle);return true;},IntPtr.Zero);
        return handles;
    }
    internal static string? ChromeExecutable()
    {
        foreach(var hive in new[]{Registry.CurrentUser,Registry.LocalMachine}){
            using var key=hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe");
            if(key?.GetValue(null) is string location&&File.Exists(location))return location;
        }
        foreach(var folder in new[]{Environment.SpecialFolder.ProgramFiles,Environment.SpecialFolder.ProgramFilesX86,Environment.SpecialFolder.LocalApplicationData}){
            var location=Path.Combine(Environment.GetFolderPath(folder),@"Google\Chrome\Application\chrome.exe");
            if(File.Exists(location))return location;
        }
        return null;
    }
    internal static string? Open(Uri url)
    {
        var chrome=ChromeExecutable();
        if(chrome!=null){
            // Existing Chrome profile, cookies and accounts. No temporary profile,
            // browser switch, process kill, or embedded Google login.
            var info=new ProcessStartInfo(chrome){UseShellExecute=false};
            info.ArgumentList.Add("--new-window");
            info.ArgumentList.Add(url.AbsoluteUri);
            using var browser=Process.Start(info)??throw new InvalidOperationException("No se pudo abrir Google en Chrome.");
            return "chrome";
        }
        // Preserve the system browser fallback when Chrome is not installed.
        using var fallback=Process.Start(new ProcessStartInfo(url.AbsoluteUri){UseShellExecute=true});
        return null;
    }
    internal static List<IntPtr> MatchingWindows(HashSet<IntPtr> before,string marker,string? processName)
    {
        var matches=new List<IntPtr>();
        EnumWindows((handle,_)=>{
            if(before.Contains(handle)||!IsWindowVisible(handle))return true;
            var title=new StringBuilder(1024);
            if(GetWindowText(handle,title,title.Capacity)==0||!title.ToString().Contains(marker,StringComparison.Ordinal))return true;
            if(processName!=null){
                GetWindowThreadProcessId(handle,out var pid);
                try{
                    using var process=Process.GetProcessById((int)pid);
                    if(!string.Equals(process.ProcessName,processName,StringComparison.OrdinalIgnoreCase))return true;
                }catch(ArgumentException){return true;}catch(InvalidOperationException){return true;}catch(System.ComponentModel.Win32Exception){return true;}
            }
            matches.Add(handle);return true;
        },IntPtr.Zero);
        return matches;
    }
    internal static async Task<bool> CloseCallbackWindowAsync(HashSet<IntPtr> before,string marker,string? processName)
    {
        // Do not touch any window present before authorization. The callback title
        // contains the unique 256-bit route nonce, not account credentials.
        for(var attempt=0;attempt<60;attempt++){
            var matches=MatchingWindows(before,marker,processName);
            if(matches.Count>1)return false; // Ambiguous ownership: fail safely.
            if(matches.Count==1){
                var handle=matches[0];
                // Recheck identity immediately before sending the close message.
                var current=MatchingWindows(before,marker,processName);
                if(current.Count!=1||current[0]!=handle)return false;
                if(!PostMessage(handle,WM_CLOSE,IntPtr.Zero,IntPtr.Zero))return false;
                for(var wait=0;wait<50;wait++){
                    if(!IsWindow(handle))return true;
                    await Task.Delay(100);
                }
                return !IsWindow(handle);
            }
            await Task.Delay(100);
        }
        return false;
    }
}
