using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Windows.Interop;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;
namespace MidiHud.Windows;
internal static class Program
{
    [STAThread] public static void Main(){var app=new Application{ShutdownMode=ShutdownMode.OnMainWindowClose};app.Run(new HudWindow());}
}
internal sealed class HudWindow : Window
{
    const string Origin="https://midihud.local",Prefix="/windows-qa/";
    private readonly WebView2 web=new();
    private readonly string dataDir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MIDI HUD","WindowsQA");
    private readonly string assets=Path.Combine(AppContext.BaseDirectory,"Web");
    private MidiInput? midi;
    private ControllerMonitor? monitor;
    private CoreWebView2? core;
    private long page;
    private bool closed;
    private TcpListener? oauthListener;
    private CancellationTokenSource? oauthTimeout;
    private string? oauthPath;
    private bool oauthWaiting;
    private Process? oauthBrowser;
    private static bool Local(string? raw)=>Uri.TryCreate(raw,UriKind.Absolute,out var u)&&u.Scheme=="https"&&u.Host=="midihud.local"&&u.IsDefaultPort&&u.UserInfo.Length==0&&u.AbsolutePath.StartsWith(Prefix,StringComparison.Ordinal)&&!Uri.UnescapeDataString(u.AbsolutePath).Contains('\\')&&!Uri.UnescapeDataString(u.AbsolutePath).Split('/').Any(x=>x is "." or "..");
    public HudWindow()
    {
        Title="MIDI HUD";Width=1200;Height=820;MinWidth=500;MinHeight=440;
        var iconPath=Path.Combine(assets,"windows-qa","core","brand","apple-touch-icon.png");
        try{
            if(File.Exists(iconPath)) Icon=System.Windows.Media.Imaging.BitmapFrame.Create(new Uri(iconPath));
        }catch(System.IO.FileFormatException e){Trace.TraceWarning("MIDI HUD window icon: "+e.Message);}
        catch(IOException e){Trace.TraceWarning("MIDI HUD window icon: "+e.Message);}
        catch(NotSupportedException e){Trace.TraceWarning("MIDI HUD window icon: "+e.Message);}
        var panel=new DockPanel();var menu=new Menu();
        var manager=new MenuItem{Header="Controller Manager"};
        manager.Click+=(_,_)=>OpenController();
        var about=new MenuItem{Header="Acerca de"};
        about.Click+=(_,_)=>MessageBox.Show(this,"MIDI HUD — Windows Alpha 0.1\nEntorno de pruebas.","MIDI HUD");
        menu.Items.Add(manager);menu.Items.Add(about);DockPanel.SetDock(menu,Dock.Top);
        panel.Children.Add(menu);panel.Children.Add(web);Content=panel;
        Loaded+=async(_,_)=>await InitializeAsync();
        Closed+=(_,_)=>{closed=true;StopOAuth();RequestOAuthBrowserClose();midi?.Dispose();web.Dispose();};
    }
    private async Task InitializeAsync()
    {
        try{
            Directory.CreateDirectory(dataDir);
            var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dataDir,"WebView"));
            await web.EnsureCoreWebView2Async(environment);core=web.CoreWebView2;
            core.Settings.AreHostObjectsAllowed=false;
            core.Settings.AreDevToolsEnabled=false;
            core.SetVirtualHostNameToFolderMapping("midihud.local",assets,CoreWebView2HostResourceAccessKind.DenyCors);
            core.NavigationStarting+=(_,a)=>{
                if(!Local(a.Uri)){a.Cancel=true;return;}
                var uri=new Uri(a.Uri);
                if(uri.AbsolutePath.EndsWith('/')){
                    a.Cancel=true;var to=new UriBuilder(uri){Path=uri.AbsolutePath+"index.html"};
                    Dispatcher.BeginInvoke(new Action(()=>core.Navigate(to.Uri.AbsoluteUri)));return;
                }
                page++;
            };
            core.FrameNavigationStarting+=(_,a)=>a.Cancel=true;
            core.NewWindowRequested+=(_,a)=>a.Handled=true;
            core.PermissionRequested+=(_,a)=>a.State=CoreWebView2PermissionState.Deny;
            core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
            core.WebResourceRequested+=(_,a)=>{
                var uri=a.Request.Uri;
                if(Local(uri)){
                    var path=Uri.UnescapeDataString(new Uri(uri).AbsolutePath).TrimStart('/');
                    if(path.EndsWith(".mjs",StringComparison.OrdinalIgnoreCase)){
                        var file=Path.GetFullPath(Path.Combine(assets,path));
                        if(file.StartsWith(Path.GetFullPath(assets)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)&&File.Exists(file))
                            a.Response=core.Environment.CreateWebResourceResponse(new MemoryStream(File.ReadAllBytes(file)),200,"OK","Content-Type: application/javascript; charset=utf-8");
                    }
                    return;
                }
                if(uri.StartsWith("blob:"+Origin+"/",StringComparison.Ordinal)||uri.StartsWith("data:",StringComparison.Ordinal))return;
                a.Response=core.Environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes("Blocked")),403,"Blocked","Content-Type: text/plain");
            };
            core.WebMessageReceived+=Received;
            var source=File.ReadAllText(Path.Combine(assets,"windows-qa","core","native-bridge.js"));
            await core.AddScriptToExecuteOnDocumentCreatedAsync("if(window===window.top && location.origin==='https://midihud.local' && location.pathname.startsWith('/windows-qa/')){\n"+source+"\n}");
            core.Navigate(Origin+Prefix+"index.html");
        }catch(Exception e){MessageBox.Show(this,"No se pudo iniciar MIDI HUD. Comprueba WebView2 Runtime.\n"+e.Message,"MIDI HUD");Close();}
    }
    private void StopOAuth()
    {
        oauthTimeout?.Cancel();oauthTimeout?.Dispose();oauthTimeout=null;
        oauthListener?.Stop();oauthListener=null;oauthPath=null;
    }
    private string PrepareOAuth()
    {
        if(oauthWaiting)throw new InvalidOperationException("Ya hay una autorización en curso.");
        StopOAuth();
        var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();
        oauthListener=listener;oauthTimeout=new CancellationTokenSource(TimeSpan.FromMinutes(10));
        oauthTimeout.Token.Register(()=>listener.Stop());
        oauthPath="/oauth/"+Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        return $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}{oauthPath}";
    }
    // Use an installed external browser, never WebView2 for Google credentials.
    // A unique profile ensures the process belongs exclusively to this authorization.
    private static string OAuthBrowserExecutable()
    {
        var roots=new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)};
        foreach(var name in new[]{"msedge.exe","chrome.exe"}){
            foreach(var hive in new[]{Registry.CurrentUser,Registry.LocalMachine}){
                using var key=hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\"+name);
                if(key?.GetValue(null) is string location && File.Exists(location))return location;
            }
            var relative=name=="msedge.exe"?@"Microsoft\Edge\Application\msedge.exe":@"Google\Chrome\Application\chrome.exe";
            foreach(var root in roots){
                var location=Path.Combine(root,relative);
                if(File.Exists(location))return location;
            }
        }
        throw new InvalidOperationException("Para conectar Google instala Microsoft Edge o Google Chrome.");
    }
    private static Process StartOAuthBrowser(Uri url,string profile)
    {
        var info=new ProcessStartInfo(OAuthBrowserExecutable()){UseShellExecute=false};
        foreach(var argument in new[]{"--user-data-dir="+profile,"--no-first-run","--no-default-browser-check",
            "--disable-background-mode","--new-window",url.AbsoluteUri})info.ArgumentList.Add(argument);
        return Process.Start(info)??throw new InvalidOperationException("No se pudo abrir la ventana de Google.");
    }
    private void RequestOAuthBrowserClose()
    {
        try{if(oauthBrowser is {HasExited:false})oauthBrowser.CloseMainWindow();}
        catch(InvalidOperationException){}
    }
    private static async Task CloseOAuthBrowser(Process browser)
    {
        // Only the process launched with the unique OAuth profile is owned by HUD.
        try{
            if(!browser.HasExited){
                browser.Refresh();
                browser.CloseMainWindow();
                using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(2));
                try{await browser.WaitForExitAsync(timeout.Token);}
                catch(OperationCanceledException){
                    if(!browser.HasExited)browser.Kill(entireProcessTree:true);
                    await browser.WaitForExitAsync();
                }
            }
        }catch(InvalidOperationException){}
        catch(System.ComponentModel.Win32Exception e){Trace.TraceWarning("MIDI HUD OAuth browser: "+e.Message);}
    }
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr handle);
    private async Task RestoreOAuthWindow()
    {
        if(closed)return;
        if(WindowState==WindowState.Minimized)WindowState=WindowState.Normal;
        var wasTopmost=Topmost;
        try{
            Topmost=true;Activate();
            SetForegroundWindow(new WindowInteropHelper(this).Handle);
            Focus();
            // Let the browser close and WPF process its activation before releasing Topmost.
            await Task.Delay(250);
        }finally{if(!closed)Topmost=wasTopmost;}
    }
    private async Task<bool> OpenOAuth(Uri url)
    {
        var listener=oauthListener??throw new InvalidOperationException("No se preparó el retorno de Google.");
        var path=oauthPath!;var token=oauthTimeout!.Token;
        if(oauthWaiting)throw new InvalidOperationException("Ya hay una autorización en curso.");
        oauthWaiting=true;
        var profile=Path.Combine(Path.GetTempPath(),"MIDI-HUD-OAuth-"+Guid.NewGuid().ToString("N"));
        Process? browser=null;
        try{
            Directory.CreateDirectory(profile);
            browser=StartOAuthBrowser(url,profile);oauthBrowser=browser;
            // Closing the dedicated browser is also a cancellation action.
            var browserExited=browser.WaitForExitAsync(token);
            while(!token.IsCancellationRequested){
                var incoming=listener.AcceptTcpClientAsync(token).AsTask();
                if(await Task.WhenAny(incoming,browserExited)==browserExited&&!incoming.IsCompleted){
                    // Cancel/observe the outstanding accept before disposing the listener.
                    oauthTimeout?.Cancel();
                    try{using var abandoned=await incoming;}catch(Exception) when(token.IsCancellationRequested){}
                    return false;
                }
                using var client=await incoming;
                using var requestTimeout=CancellationTokenSource.CreateLinkedTokenSource(token);
                requestTimeout.CancelAfter(TimeSpan.FromSeconds(3));
                using var stream=client.GetStream();
                var bytes=new List<byte>();var one=new byte[1];
                try{
                    while(bytes.Count<2048&&await stream.ReadAsync(one.AsMemory(),requestTimeout.Token)>0){
                        if(one[0]==10)break;bytes.Add(one[0]);
                    }
                    var parts=Encoding.ASCII.GetString(bytes.ToArray()).TrimEnd('\r').Split(' ');
                    var ok=parts.Length==3&&parts[0]=="GET"&&parts[1]==path+"?status=ok";
                    var cancelled=parts.Length==3&&parts[0]=="GET"&&parts[1]==path+"?status=cancelled";
                    if(!ok&&!cancelled)continue;
                    var html="<!doctype html><meta charset=utf-8><title>MIDI HUD</title><body style='background:#101820;color:#eee;font:16px system-ui;padding:24px'>Regresando a MIDI HUD…</body>";
                    var response="HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: "+Encoding.UTF8.GetByteCount(html)+"\r\n\r\n"+html;
                    try{await stream.WriteAsync(Encoding.UTF8.GetBytes(response).AsMemory(),requestTimeout.Token);}catch(IOException){}
                    return ok;
                }catch(OperationCanceledException) when(!token.IsCancellationRequested){}
                catch(IOException) when(!token.IsCancellationRequested){}
            }
            return false;
        }catch(Exception) when(token.IsCancellationRequested){return false;}
        finally{
            StopOAuth();
            try{
                if(browser!=null){
                    await CloseOAuthBrowser(browser);
                    browser.Dispose();
                }
            }finally{
                oauthBrowser=null;
                try{if(Directory.Exists(profile))Directory.Delete(profile,true);}
                catch(IOException){}catch(UnauthorizedAccessException){}
                try{await RestoreOAuthWindow();}finally{oauthWaiting=false;}
            }
        }
    }
    private void OpenController()
    {
        if(monitor!=null){monitor.Activate();return;}
        monitor=new ControllerMonitor{Owner=this};
        monitor.Closed+=(_,_)=>monitor=null;
        monitor.Show();
    }
    private MidiInput Midi()=>midi??=new MidiInput(Dispatcher,ev=>Post(new{kind="event",@event=ev}),(source,data)=>monitor?.Observe(source,data));
    private void Post(object body)
    {
        if(!closed&&core!=null&&Local(core.Source))
            try{core.PostWebMessageAsString(JsonSerializer.Serialize(body));}catch(InvalidOperationException){}
    }
    private static readonly HttpClient Broker = new(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(20)};
    private static async Task<object> BrokerRequest(JsonElement payload)
    {
        var path=payload.GetProperty("path").GetString()??"";
        var method=payload.GetProperty("method").GetString()??"";
        bool allowed=method=="GET"&&new[]{"/health","/session","/session/devices"}.Contains(path)||
            method=="POST"&&new[]{"/auth/native/start","/auth/native/poll","/session/revoke","/session/devices/revoke","/drive/request"}.Contains(path);
        if(!allowed)throw new InvalidOperationException("Ruta de sincronización no permitida.");
        using var request=new HttpRequestMessage(new HttpMethod(method),"https://midihudaut.midihudapp.workers.dev"+path);
        request.Headers.TryAddWithoutValidation("Origin",Origin);
        if(payload.TryGetProperty("token",out var tokenElement)&&tokenElement.ValueKind==JsonValueKind.String){
            var token=tokenElement.GetString()??"";if(!Regex.IsMatch(token,"^[A-Za-z0-9_-]{64}$"))throw new InvalidOperationException("Sesión inválida.");
            request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",token);
        }
        if(method=="POST"){
            var body=payload.TryGetProperty("body",out var value)?value.GetRawText():"{}";
            if(Encoding.UTF8.GetByteCount(body)>3_200_000)throw new InvalidOperationException("Petición demasiado grande.");
            request.Content=new StringContent(body,Encoding.UTF8,"application/json");
        }
        using var response=await Broker.SendAsync(request,HttpCompletionOption.ResponseHeadersRead);
        await using var input=await response.Content.ReadAsStreamAsync();
        using var buffer=new MemoryStream();var bytes=new byte[8192];
        int n;while((n=await input.ReadAsync(bytes.AsMemory()))>0){if(buffer.Length+n>3_200_000)throw new InvalidOperationException("Respuesta demasiado grande.");buffer.Write(bytes,0,n);}
        using var json=JsonDocument.Parse(buffer.ToArray());
        return new{status=(int)response.StatusCode,data=json.RootElement.Clone()};
    }
    private async void Received(object? sender,CoreWebView2WebMessageReceivedEventArgs args)
    {
        if(core==null||!Local(args.Source)||!Local(core.Source)||args.Source!=core.Source)return;
        string? id=null;var generation=page;
        try{
            var raw=args.TryGetWebMessageAsString();if(raw.Length>3_100_000)return;
            using var json=JsonDocument.Parse(raw);var root=json.RootElement;
            id=root.GetProperty("id").GetString();if(id==null||id.Length>32)return;
            var command=root.GetProperty("command").GetString();var payload=root.GetProperty("payload");
            object? result;
            switch(command){
                case "midi.open":case "midi.list": result=await Midi().RefreshAsync();break;
                case "midi.select": result=await Midi().SelectAsync(payload.GetProperty("id").GetString()??"");break;
                case "midi.bluetooth":
                    Process.Start(new ProcessStartInfo("ms-settings:bluetooth"){UseShellExecute=true});result=new{opened=true};break;
                case "controller.open": OpenController();result=true;break;
                case "broker.request":result=await BrokerRequest(payload);break;
                case "broker.prepare": result=PrepareOAuth();break;
                case "broker.open":
                    var authUrl=new Uri(payload.GetProperty("url").GetString()??"");
                    if(authUrl.Scheme!="https"||authUrl.Host!="accounts.google.com"||!authUrl.IsDefaultPort||authUrl.UserInfo.Length!=0||authUrl.AbsolutePath!="/o/oauth2/v2/auth")throw new InvalidOperationException("URL no autorizada.");
                    result=await OpenOAuth(authUrl);break;
                case "cloud.config":result=new{configured=false};break;
                case "cloud.restore":case "cloud.disconnect":result=null;break;
                case "cloud.connect":case "cloud.request":throw new InvalidOperationException("Google Drive aún no está configurado para Windows.");
                case "share.text":
                    var text=payload.GetProperty("text").GetString()??"";if(text.Length>3_000_000)throw new InvalidOperationException("Archivo demasiado grande.");
                    var name=Regex.Replace(Path.GetFileName(payload.GetProperty("name").GetString()??"MIDI-HUD.json"),"[^a-zA-Z0-9._-]","_");
                    var dialog=new SaveFileDialog{FileName=string.IsNullOrEmpty(name)?"MIDI-HUD.json":name,Filter="JSON|*.json|Todos los archivos|*.*"};
                    if(dialog.ShowDialog(this)!=true)throw new InvalidOperationException("Exportación cancelada.");
                    File.WriteAllText(dialog.FileName,text,new UTF8Encoding(false));result=new{saved=true};break;
                default:throw new InvalidOperationException("Acción no disponible.");
            }
            if(generation==page)Post(new{kind="reply",id,result});
        }catch(Exception e){if(id!=null&&generation==page)Post(new{kind="reply",id,error=e.Message});}
    }
}
